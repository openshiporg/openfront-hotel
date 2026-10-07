import { assertNoOutstandingStayKeys } from '../operations/stayRegister';
import { requireHotelApproval } from '../guest-governance/commands';
import { assertRoomNotOutOfOrder } from '../operations/roomOutages';
import { calculateHotelPrice } from '../rates/pricing';
import { buildReservationSnapshotLines } from '../folios/reservationSnapshots';
import { buildFolioReversalPosting } from '../folios/ledger';
import { ensureBookingFolio, getBookingCollectibleBalance } from '../folios/bookingFolio';
import { lockRoomInventory } from '../inventory/roomNightLocks';
import { assertHotelAvailability } from '../inventory/roomAvailability';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { queueBookingCommunication } from '../communications/commands';

export function assertInHouseDateChange(booking: any, checkIn: Date, checkOut: Date, businessDate: Date, roomTypeId: string, ratePlanId: string, allowCommercialMove = false) {
  if (booking.status !== 'checked_in') throw new Error('Only an in-house stay can use this amendment.');
  if (checkIn.getTime() !== new Date(booking.checkInDate).getTime()) throw new Error('An in-house arrival date is immutable.');
  if (checkOut < businessDate || checkOut <= checkIn) throw new Error('Departure cannot precede the open business date or arrival.');
  if (!allowCommercialMove && (roomTypeId !== booking.roomAssignments[0]?.roomTypeId || ratePlanId !== booking.ratePlanId)) throw new Error('In-house amendments preserve the booked room type and rate plan; use a room move for physical-room changes.');
}

export function planInHouseSnapshotAmendment(booking: any, quote: any, openDay: Date, revision: number) {
  const proposed = buildReservationSnapshotLines({ bookingId: booking.id, checkInDate: quote.commercialMove ? quote.checkIn : booking.checkInDate, checkOutDate: quote.checkOut, roomTotalCents: quote.roomSubtotalMinor, taxTotalCents: quote.taxMinor, feesTotalCents: quote.commercialMove ? 0 : quote.feesMinor, currencyCode: quote.currencyCode, roomType: quote.roomType || booking.roomAssignments[0].roomType, ratePlan: { ...(quote.ratePlan || booking.ratePlan), cancellationPolicy: booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy }, taxRateBasisPoints: quote.taxRateBasisPoints, nightlyRoomAmounts: quote.nightlyRates.map((n: any) => n.amountMinor), snapshotKeyPrefix: `v${revision}`, pricingSource: 'in-house-amendment' }).filter(line => new Date(line.date) >= openDay && (!quote.commercialMove || line.type !== 'service_fee'));
  const historical = booking.lineItems.filter((line: any) => new Date(line.date) < openDay || (quote.commercialMove && line.type === 'service_fee'));
  const replaced = booking.lineItems.filter((line: any) => new Date(line.date) >= openDay && (!quote.commercialMove || line.type !== 'service_fee'));
  return { proposed, historical, replaced };
}

/** Reprice only open/future service days; historical snapshots and folio entries
 * remain immutable. A lower total can leave a visible guest credit for refund. */
export async function amendInHouseStay(context: any, input: { bookingId: string; checkInDate: string; checkOutDate: string; roomTypeId: string; ratePlanId: string; targetRoomId?: string | null; promoCode?: string | null; earlyDepartureApprovalId?: string | null; earlyDepartureReason?: string | null; idempotencyKey: string }) {
  const eventKey = input.idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable amendment idempotency key is required.');
  const identity = { request: input, aggregateType: 'booking', aggregateId: input.bookingId, action: 'in_house_dates_amended' };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await lockHotelBusinessDate(p);
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${input.bookingId}`);
    if (await findHotelLifecycleReplay(p, eventKey, identity)) return p.booking.findUnique({ where: { id: input.bookingId } });
    const booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { roomAssignments: { include: { roomType: true } }, lineItems: { where: { snapshotStatus: 'active' } }, payments: true, ratePlan: true } });
    if (!booking) throw new Error('Booking not found.');
    if (booking.groupBlockId || booking.billingFolioId) throw new Error('In-house group commercial changes require a revised group contract; group master and allocation evidence cannot be bypassed.');
    const clock = await p.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock) throw new Error('Property business date is not configured.');
    const start = new Date(input.checkInDate); const end = new Date(input.checkOutDate);
    const openDay = new Date(clock.currentBusinessDate);
    const assignment = booking.roomAssignments[0];
    if (booking.roomAssignments.length !== 1 || !assignment?.roomId) throw new Error('In-house amendment requires one assigned physical room.');
    const commercialMove = input.roomTypeId !== assignment.roomTypeId || input.ratePlanId !== booking.ratePlanId;
    if (commercialMove && (!input.targetRoomId || end.getTime() !== new Date(booking.checkOutDate).getTime() || end <= openDay)) throw new Error('Choose a target physical room for a same-date in-house commercial upgrade.');
    assertInHouseDateChange(booking, start, end, openDay, input.roomTypeId, input.ratePlanId, commercialMove && !!input.targetRoomId);
    for (const typeId of [...new Set([assignment.roomTypeId, input.roomTypeId])].sort()) await lockRoomInventory(p, typeId, start, new Date(Math.max(end.getTime(), new Date(booking.checkOutDate).getTime())));
    const remainingStart = new Date(Math.max(start.getTime(), openDay.getTime()));
    if (end > remainingStart) await assertHotelAvailability(tx, { roomTypeId: input.roomTypeId, checkInDate: remainingStart, checkOutDate: end, excludeBookingId: booking.id });
    if (booking.source === 'ota') throw new Error('Channel-origin in-house amendments require a channel acknowledgment; reconcile the channel stay before amendment.');
    const targetRoomId = input.targetRoomId || assignment.roomId, moving = targetRoomId !== assignment.roomId;
    for (const roomId of [...new Set([assignment.roomId, targetRoomId])].sort()) await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${roomId}`);
    if (moving || commercialMove) {
      const target = await p.room.findUnique({ where: { id: targetRoomId } });
      if (!target || target.roomTypeId !== input.roomTypeId || (moving && !['vacant', 'inspected'].includes(target.status))) throw new Error('Target room must match the newly quoted type and be ready for occupancy.');
      const [repairs, tasks] = await Promise.all([p.maintenanceRequest.count({ where: { roomId: targetRoomId, status: { notIn: ['verified', 'cancelled'] } } }), p.housekeepingTask.count({ where: { roomId: targetRoomId, status: { not: 'completed' } } })]);
      if (repairs || tasks) throw new Error('Resolve target room maintenance and housekeeping before upgrade.');
      if (moving) await assertNoOutstandingStayKeys(p, booking.id);
    }
    if (end > remainingStart) await assertRoomNotOutOfOrder(p, targetRoomId, remainingStart, end);
    const conflict = await p.roomAssignment.findFirst({ where: { roomId: targetRoomId, bookingId: { not: booking.id }, booking: { OR: [{ status: { in: ['confirmed', 'checked_in', 'cancellation_pending'] } }, { status: 'pending', holdExpiresAt: { gt: new Date() } }], checkInDate: { lt: end }, checkOutDate: { gt: remainingStart } } } });
    if (conflict) throw new Error('The selected physical room conflicts with another reservation on the remaining dates.');
    const quote = { ...await calculateHotelPrice(tx, { roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId, checkInDate: commercialMove ? remainingStart.toISOString() : input.checkInDate, checkOutDate: input.checkOutDate, numberOfAdults: booking.numberOfAdults || booking.numberOfGuests || 1, numberOfChildren: booking.numberOfChildren || 0, promoCode: input.promoCode }, { existingStay: true }), commercialMove };
    const revision = Number(booking.pricingRevision || 1) + 1;
    const { proposed, historical, replaced } = planInHouseSnapshotAmendment(booking, quote, openDay, revision);
    const repricedTotal = [...historical, ...proposed].reduce((sum: number, line: any) => sum + Number(line.totalPrice), 0);
    const waivedMinor = Math.max(0, Number(booking.totalAmountMinor || 0) - repricedTotal);
    if (waivedMinor > 0 && (!input.earlyDepartureReason?.trim() || input.earlyDepartureReason.trim().length > 1000)) throw new Error('An explicit reason of 1–1000 characters is required for the operator waiver of booked charges.');
    if (waivedMinor > 0 && waivedMinor >= Number(quote.settings?.writeOffApprovalThresholdMinor ?? 0)) {
      if (!input.earlyDepartureApprovalId) throw new Error(`An independent write-off approval for booking ${booking.id}, ${waivedMinor} minor units, is required to waive booked charges on early departure or a lower-priced amendment.`);
      await requireHotelApproval(p, { approvalId: input.earlyDepartureApprovalId, action: 'write_off', aggregateId: booking.id, amountMinor: waivedMinor, actorId: context.session.itemId, operationKey: eventKey });
    }
    const ensured = await ensureBookingFolio(tx, booking.id);
    const entries = await p.folioEntry.findMany({ where: { folioId: ensured.folioId, sourceType: 'reservation_snapshot', sourceId: { in: replaced.map((line: any) => line.id) } }, include: { reversedBy: true } });
    const now = new Date();
    for (const entry of entries.filter((item: any) => !item.reversedBy)) {
      await p.folioEntry.create({ data: { folioId: ensured.folioId, ...buildFolioReversalPosting(entry, { postingKey: `${eventKey}:reverse:${entry.id}`, reason: 'In-house departure amendment' }), serviceDate: openDay, postedAt: now } });
    }
    await p.reservationLineItem.updateMany({ where: { id: { in: replaced.map((line: any) => line.id) } }, data: { snapshotStatus: 'superseded', supersededAt: now } });
    for (const { reservation: _, ...line } of proposed) await p.reservationLineItem.create({ data: { ...line, reservationId: booking.id, date: new Date(line.date), snapshotStatus: 'active' } });
    const allLines = [...historical, ...proposed];
    const sum = (type: string) => allLines.filter((line: any) => line.type === type).reduce((total: number, line: any) => total + Number(line.totalPrice), 0);
    const room = sum('room'), tax = sum('tax'), fees = sum('service_fee'), total = room + tax + fees;
    const netPaid = booking.payments.filter((payment: any) => ['completed', 'refunded'].includes(payment.status)).reduce((amount: number, payment: any) => amount + (payment.paymentType === 'refund' ? -Math.abs(payment.amountMinor) : payment.amountMinor), 0);
    const balance = Math.max(0, total - netPaid);
    const updated = await p.booking.update({ where: { id: booking.id }, data: { checkOutDate: end, ratePlanId: input.ratePlanId, roomRateMinor: room, roomRate: room / 100, taxAmountMinor: tax, taxAmount: tax / 100, feesAmountMinor: fees, feesAmount: fees / 100, totalAmountMinor: total, totalAmount: total / 100, balanceDueMinor: balance, balanceDue: balance / 100, paymentStatus: netPaid <= 0 ? 'unpaid' : balance ? 'partial' : 'paid', pricingRevision: revision, pricingVersion: 'in-house-amendment-v1', pricingSnapshot: { depositPercent: booking.pricingSnapshot?.depositPercent, securityDepositMinor: booking.pricingSnapshot?.securityDepositMinor, snapshotKeyPrefix: `v${revision}`, source: 'in-house-amendment', arrivalInstant: booking.pricingSnapshot?.arrivalInstant || quote.arrivalInstant, cancellationPolicy: booking.pricingSnapshot?.cancellationPolicy || booking.lineItems.find((line: any) => line.cancellationPolicySnapshot)?.cancellationPolicySnapshot || booking.ratePlan?.cancellationPolicy, propertyTimeZone: quote.propertyTimeZone, preservesBefore: openDay.toISOString(), historicalSnapshotIds: historical.map((line: any) => line.id), roomSubtotalMinor: room, taxMinor: tax, feesMinor: fees, totalMinor: total, currencyCode: quote.currencyCode, nightlyRates: allLines.filter((line: any) => line.type === 'room').map((line: any) => ({ date: new Date(line.date).toISOString().slice(0, 10), amountMinor: line.totalPrice })) } } });
    if (moving || commercialMove) {
      await p.roomAssignment.update({ where: { id: assignment.id }, data: { roomTypeId: input.roomTypeId, roomId: targetRoomId, ratePerNightMinor: quote.nightlyRates.find((night: any) => night.date === openDay.toISOString().slice(0, 10))?.amountMinor || 0, ratePerNight: (quote.nightlyRates.find((night: any) => night.date === openDay.toISOString().slice(0, 10))?.amountMinor || 0) / 100 } });
      if (moving) {
        await p.room.update({ where: { id: targetRoomId }, data: { status: 'occupied' } });
        const oldRoom = await p.room.findUnique({ where: { id: assignment.roomId } });
        const oldRepairs = await p.maintenanceRequest.count({ where: { roomId: assignment.roomId, status: { notIn: ['verified', 'cancelled'] } } });
        if (oldRoom && !['maintenance', 'out_of_order'].includes(oldRoom.status)) await p.room.update({ where: { id: assignment.roomId }, data: { status: oldRepairs ? 'maintenance' : 'cleaning' } });
        await p.housekeepingTask.create({ data: { roomId: assignment.roomId, taskType: 'checkout_clean', status: 'pending', priority: 1, notes: `Commercial room move ${booking.confirmationNumber}; ${eventKey}; vacated ${now.toISOString()}` } });
      }
      await recordHotelLifecycleEvent({ prisma: p, eventKey: `${eventKey}:room-move`, actorId: context.session.itemId, identity: { request: { bookingId: booking.id, targetRoomId, roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId }, aggregateType: 'booking', aggregateId: booking.id, action: 'room_assigned' }, beforeSnapshot: { assignmentId: assignment.id, roomId: assignment.roomId, roomTypeId: assignment.roomTypeId }, afterSnapshot: { assignmentId: assignment.id, roomId: targetRoomId, roomTypeId: input.roomTypeId, effectiveAt: now }, metadata: { inHouseMove: moving, commercialAmendmentKey: eventKey } });
    }
    await ensureBookingFolio(tx, booking.id, { postSnapshotEntries: true, serviceDate: openDay });
    const collectible = await getBookingCollectibleBalance(tx, booking.id);
    Object.assign(updated, await p.booking.update({ where: { id: booking.id }, data: { balanceDueMinor: collectible.balanceDueMinor, balanceDue: collectible.balanceDueMinor / 100, paymentStatus: collectible.balanceDueMinor <= 0 ? 'paid' : netPaid > 0 ? 'partial' : 'unpaid' } }));
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { checkOutDate: booking.checkOutDate, totalAmountMinor: booking.totalAmountMinor }, afterSnapshot: { checkOutDate: end, totalAmountMinor: total, pricingRevision: revision, preservedHistoricalLines: historical.length, guestCreditMinor: collectible.creditMinor, waivedMinor, waiverReason: waivedMinor ? input.earlyDepartureReason?.trim() : null, waiverApprovalId: input.earlyDepartureApprovalId || null } });
    await queueBookingCommunication(p, { bookingId: booking.id, kind: 'booking_updated', eventKey });
    return updated;
  });
}
