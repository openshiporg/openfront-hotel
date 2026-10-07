import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { assertHotelGroupsEnabled } from '../lib/boundedLaunch';
import { ensureGuestProfile } from '../lib/guestProfiles';
import { assertGuestEligible } from '../bookings/confirmation';
import { createGuestAccessToken, hashGuestAccessToken } from '../lib/guestBookingAccess';
import { buildReservationSnapshotLines } from '../folios/reservationSnapshots';
import { ensureBookingFolio } from '../folios/bookingFolio';
import { assertFolioCanClose } from '../folios/ledger';
import { getHotelAvailability } from '../inventory/roomAvailability';
import { lockRoomInventory } from '../inventory/roomNightLocks';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { queueBookingCommunication } from '../communications/commands';

export type RoomingListRow = { rowId: string; guestName: string; guestEmail: string; numberOfGuests: number; guestPhone?: string; specialRequests?: string };
function authorize(context: any) { if (!permissions.canManageBookings({ session: context.session })) throw new Error('Not authorized to operate group reservations.'); }
function key(value: unknown) { const result = String(value || '').trim(); if (!result || result.length > 200) throw new Error('A stable bounded idempotency key is required.'); return result; }
export function validateRoomingList(value: unknown): RoomingListRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error('Provide 1–50 rooming-list rows.');
  const errors: string[] = [], ids = new Set<string>();
  const rows = value.map((item, index) => {
    const rowId = String(item?.rowId || '').trim(), guestName = String(item?.guestName || '').trim(), guestEmail = String(item?.guestEmail || '').trim().toLowerCase(), numberOfGuests = Number(item?.numberOfGuests);
    if (!rowId || rowId.length > 80 || ids.has(rowId)) errors.push(`Row ${index + 1}: unique row reference is required.`); ids.add(rowId);
    if (!guestName || guestName.length > 200) errors.push(`Row ${index + 1}: guest name must contain 1–200 characters.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) || guestEmail.length > 320) errors.push(`Row ${index + 1}: valid guest email is required.`);
    if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1 || numberOfGuests > 20) errors.push(`Row ${index + 1}: guest count must be 1–20.`);
    const guestPhone = String(item?.guestPhone || '').trim(), specialRequests = String(item?.specialRequests || '').trim();
    if (guestPhone.length > 80 || specialRequests.length > 1000) errors.push(`Row ${index + 1}: phone or requests exceed the supported length.`);
    return { rowId, guestName, guestEmail, numberOfGuests, guestPhone, specialRequests };
  });
  if (errors.length) throw new Error(errors.join('\n')); return rows;
}
export function assertGroupPickupAllowed(block: any, allocation: any, count: number, now = new Date()) {
  if (!block || !allocation || allocation.groupBlockId !== block.id) throw new Error('Allocation does not belong to this group block.');
  if (!['tentative', 'definite'].includes(block.status)) throw new Error('Group block is no longer open for pickup.');
  if (block.releaseDate && new Date(block.releaseDate) <= now) throw new Error('Group pickup cutoff has passed.');
  if (!Number.isInteger(count) || count < 1 || allocation.roomsPickedUp + count > allocation.roomsHeld) throw new Error('Rooming list exceeds the remaining group allotment.');
  if (!['guest_pays', 'master_folio'].includes(block.billingType)) throw new Error('Split payer windows are not enabled; choose guest-paid or whole-stay master billing.');
  if (block.billingType === 'master_folio' && block.masterFolio?.status !== 'open') throw new Error('An open master folio is required.');
}
/** Group pickups use the contract recorded at block creation, not a live storefront quote. */
export async function groupCommercialContract(prisma: any, groupBlockId: string) {
  const event = await prisma.hotelAuditEvent.findFirst({ where: { aggregateType: 'group_block', aggregateId: groupBlockId, action: 'created' } });
  const contract = event?.afterSnapshot?.contract;
  const hasRequiredTerms = typeof contract?.ratePlanId === 'string' && Boolean(contract.ratePlanId)
    && typeof contract.ratePlanName === 'string' && Boolean(contract.ratePlanName)
    && typeof contract.roomTypeId === 'string' && Boolean(contract.roomTypeId)
    && typeof contract.roomTypeName === 'string' && Boolean(contract.roomTypeName)
    && typeof contract.cancellationPolicy === 'string' && Boolean(contract.cancellationPolicy)
    && typeof contract.mealPlan === 'string' && Boolean(contract.mealPlan)
    && typeof contract.propertyTimeZone === 'string' && Boolean(contract.propertyTimeZone)
    && typeof contract.arrivalInstant === 'string' && Number.isFinite(new Date(contract.arrivalInstant).getTime())
    && Number.isSafeInteger(contract.maxOccupancy) && contract.maxOccupancy > 0
    && Number.isSafeInteger(contract.rateMinor) && contract.rateMinor >= 0
    && typeof contract.currencyCode === 'string' && /^[A-Z]{3}$/.test(contract.currencyCode)
    && Number.isSafeInteger(contract.depositPercent) && contract.depositPercent >= 0 && contract.depositPercent <= 100
    && Number.isSafeInteger(contract.securityDepositMinor) && contract.securityDepositMinor >= 0
    && Number.isSafeInteger(contract.taxRateBasisPoints) && contract.taxRateBasisPoints >= 0
    && Number.isSafeInteger(contract.feesMinor) && contract.feesMinor >= 0;
  if (!hasRequiredTerms) throw new Error('Group commercial contract is missing; do not pick up legacy experimental records.');
  return contract;
}

export function assertGroupAllocationMatchesContract(allocation: any, contract: any) {
  if (allocation.roomTypeId !== contract.roomTypeId || allocation.rateMinor !== contract.rateMinor || String(allocation.currencyCode || '').toUpperCase() !== String(contract.currencyCode || '').toUpperCase()) {
    throw new Error('Group allocation commercial terms do not match the recorded contract; reconcile the group block before pickup.');
  }
}

export async function createHotelGroupRoomingList(_root: unknown, { groupBlockId, allocationId, rows: rawRows, idempotencyKey }: { groupBlockId: string; allocationId: string; rows: string; idempotencyKey: string }, context: any) {
  authorize(context); if (rawRows.length > 100000) throw new Error('Rooming-list payload exceeds 100 KB.');
  const rows = validateRoomingList(JSON.parse(rawRows)); const eventKey = `group-rooming:${key(idempotencyKey)}`;
  const identity = { request: { groupBlockId, allocationId, rows }, aggregateType: 'group_block', aggregateId: groupBlockId, action: 'rooming_list_created' };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await assertHotelGroupsEnabled(p); await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${groupBlockId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot);
    const block = await p.groupBlock.findUnique({ where: { id: groupBlockId }, include: { masterFolio: true } });
    const allocation = await p.groupBlockAllocation.findUnique({ where: { id: allocationId } });
    assertGroupPickupAllowed(block, allocation, rows.length);
    await lockHotelBusinessDate(p);
    const clock = await p.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || block.arrivalDate < clock.currentBusinessDate) throw new Error('A rooming list cannot create stays in a closed business date.');
    const contract = await groupCommercialContract(p, groupBlockId);
    assertGroupAllocationMatchesContract(allocation, contract);
    if (rows.some(row => row.numberOfGuests > contract.maxOccupancy)) throw new Error(`Each room supports at most ${contract.maxOccupancy} occupants.`);
    await lockRoomInventory(p, allocation.roomTypeId, block.arrivalDate, block.departureDate);
    const [availability] = await getHotelAvailability(tx, { roomTypeId: allocation.roomTypeId, checkInDate: block.arrivalDate, checkOutDate: block.departureDate });
    if (availability && rows.some(row => row.numberOfGuests > availability.maxOccupancy)) throw new Error('Guest count exceeds current room-type safety capacity.');
    const remaining = allocation.roomsHeld - allocation.roomsPickedUp;
    if (!availability || availability.availabilityByDay.some((day: any) => day.total - day.blocked - day.booked - day.held + remaining < rows.length)) throw new Error('Physical inventory no longer supports the group commitment; resolve room outages or relocation first.');
    const nights = Math.round((block.departureDate.getTime() - block.arrivalDate.getTime()) / 86400000);
    const roomMinor = allocation.rateMinor * nights, taxMinor = Math.round(roomMinor * contract.taxRateBasisPoints / 10000), feesMinor = contract.feesMinor, totalMinor = roomMinor + taxMinor + feesMinor;
    if (!Number.isSafeInteger(totalMinor) || totalMinor > 2147483647) throw new Error('Group reservation total exceeds the supported accounting range.');
    const created: any[] = [];
    for (const row of rows) {
      const rowKey = `group-rooming-row:${groupBlockId}:${row.rowId}`;
      const existing = await p.hotelAuditEvent.findUnique({ where: { eventKey: rowKey } });
      if (existing) throw new Error(`Rooming-list row ${row.rowId} already has a reservation; use its existing record.`);
      const guest = await ensureGuestProfile(tx, { name: row.guestName, email: row.guestEmail, phone: row.guestPhone }); await assertGuestEligible(p, guest.id);
      const id = `gbk_${createHash('sha256').update(rowKey).digest('hex').slice(0, 24)}`, now = new Date();
      const booking = await p.booking.create({ data: { id, confirmationNumber: `GB-${createHash('sha256').update(rowKey).digest('hex').slice(0, 12).toUpperCase()}`, guestName: row.guestName, guestEmail: row.guestEmail, guestPhone: row.guestPhone, guestProfileId: guest.id,
        checkInDate: block.arrivalDate, checkOutDate: block.departureDate, numberOfGuests: row.numberOfGuests, numberOfAdults: row.numberOfGuests, numberOfChildren: 0,
        roomRateMinor: roomMinor, roomRate: roomMinor / 100, taxAmountMinor: taxMinor, taxAmount: taxMinor / 100, feesAmountMinor: feesMinor, feesAmount: feesMinor / 100, totalAmountMinor: totalMinor, totalAmount: totalMinor / 100, depositAmountMinor: Math.round(totalMinor * Number(contract.depositPercent ?? 100) / 100), depositAmount: Math.round(totalMinor * Number(contract.depositPercent ?? 100) / 100) / 100, balanceDueMinor: totalMinor, balanceDue: totalMinor / 100, currencyCode: allocation.currencyCode,
        ratePlanId: contract.ratePlanId, pricingVersion: 'group-contract-v1', pricingRevision: 1, pricingSnapshot: { ...contract, snapshotKeyPrefix: 'v1', source: 'group', groupBlockId, allocationId, rowId: row.rowId, nightlyRates: Array.from({ length: nights }, (_, index) => ({ date: new Date(block.arrivalDate.getTime() + index * 86400000).toISOString().slice(0, 10), amountMinor: allocation.rateMinor })), roomSubtotalMinor: roomMinor, taxMinor, feesMinor, totalMinor },
        status: 'confirmed', confirmedAt: now, paymentStatus: 'unpaid', source: 'group', holdExpiresAt: null, specialRequests: row.specialRequests, groupBlockId, groupBlockAllocationId: allocationId, ...(block.billingType === 'master_folio' ? { billingFolioId: block.masterFolio.id } : {}), guestAccessTokenHash: hashGuestAccessToken(createGuestAccessToken()), guestAccessTokenIssuedAt: now } });
      await p.roomAssignment.create({ data: { bookingId: id, roomTypeId: allocation.roomTypeId, guestName: row.guestName, ratePerNightMinor: allocation.rateMinor, ratePerNight: allocation.rateMinor / 100, specialRequests: row.specialRequests } });
      const snapshots = buildReservationSnapshotLines({ bookingId: id, checkInDate: block.arrivalDate, checkOutDate: block.departureDate, roomTotalCents: roomMinor, taxTotalCents: taxMinor, feesTotalCents: feesMinor, currencyCode: allocation.currencyCode, roomType: { id: allocation.roomTypeId, name: contract.roomTypeName }, ratePlan: { id: contract.ratePlanId, name: contract.ratePlanName, cancellationPolicy: contract.cancellationPolicy, mealPlan: contract.mealPlan }, taxRateBasisPoints: contract.taxRateBasisPoints, nightlyRoomAmounts: Array(nights).fill(allocation.rateMinor), snapshotKeyPrefix: 'v1', pricingSource: 'group-contract' });
      for (const { reservation: _, ...line } of snapshots) await p.reservationLineItem.create({ data: { ...line, date: new Date(line.date), reservationId: id, snapshotStatus: 'active' } });
      await ensureBookingFolio(tx, id);
      await recordHotelLifecycleEvent({ prisma: p, eventKey: rowKey, actorId: context.session.itemId, identity: { request: { groupBlockId, allocationId, row }, aggregateType: 'booking', aggregateId: id, action: 'group_created' }, afterSnapshot: { bookingId: id, rowId: row.rowId, groupBlockId, allocationId, totalAmountMinor: totalMinor, billingType: block.billingType } });
      await queueBookingCommunication(p, { bookingId: id, kind: 'booking_confirmation', eventKey: `booking:${id}:confirmation:v1` });
      created.push({ rowId: row.rowId, bookingId: id, confirmationNumber: booking.confirmationNumber, totalAmountMinor: totalMinor });
    }
    await p.groupBlockAllocation.update({ where: { id: allocationId }, data: { roomsPickedUp: { increment: rows.length } } });
    const result = { groupBlockId, allocationId, created };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, afterSnapshot: result });
    return JSON.stringify(result);
  });
}

/** Called in the final cancellation transaction. Historical booking/group links stay intact. */
export async function releaseCancelledGroupPickup(prisma: any, bookingId: string, cancellationKey: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking?.groupBlockId || !booking.groupBlockAllocationId || !['cancelled', 'no_show'].includes(booking.status)) return;
  const eventKey = `group-pickup-return:${bookingId}`;
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${booking.groupBlockId}`);
  if (await prisma.hotelAuditEvent.findUnique({ where: { eventKey } })) return;
  const allocation = await prisma.groupBlockAllocation.findUnique({ where: { id: booking.groupBlockAllocationId } });
  if (!allocation || allocation.groupBlockId !== booking.groupBlockId || allocation.roomsPickedUp < 1) throw new Error('Cancelled group pickup has inconsistent allocation evidence.');
  await prisma.groupBlockAllocation.update({ where: { id: allocation.id }, data: { roomsPickedUp: { decrement: 1 } } });
  await recordHotelLifecycleEvent({ prisma, eventKey, identity: { request: { bookingId, cancellationKey }, aggregateType: 'group_block', aggregateId: booking.groupBlockId, action: 'pickup_returned' }, afterSnapshot: { bookingId, allocationId: allocation.id, roomsPickedUp: allocation.roomsPickedUp - 1 } });
}

export async function releaseDueHotelGroupBlocks(context: any, renewLease?: () => Promise<boolean>) {
  const due = await context.prisma.groupBlock.findMany({ where: { status: { in: ['tentative', 'definite'] }, releaseDate: { lte: new Date() } }, take: 50, orderBy: { releaseDate: 'asc' } });
  let released = 0; let leaseLost = false;
  for (const item of due) {
    if (renewLease && !(await renewLease())) { leaseLost = true; break; }
    await runSerializableTransaction(context, async (tx: any) => {
      const p = tx.prisma; await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${item.id}`);
      const block = await p.groupBlock.findUnique({ where: { id: item.id } });
      if (!block || !['tentative', 'definite'].includes(block.status) || !block.releaseDate || new Date(block.releaseDate) > new Date()) return;
      await p.groupBlock.update({ where: { id: block.id }, data: { status: 'released' } });
      await recordHotelLifecycleEvent({ prisma: p, eventKey: `group-cutoff:${block.id}`, identity: { request: { groupBlockId: block.id, releaseDate: block.releaseDate }, aggregateType: 'group_block', aggregateId: block.id, action: 'cutoff_released' }, beforeSnapshot: { status: block.status }, afterSnapshot: { status: 'released', pickedReservationsPreserved: true } }); released++;
    });
  }
  return { released, leaseLost };
}

export async function closeHotelGroupMasterFolio(_root: unknown, { groupBlockId, idempotencyKey }: { groupBlockId: string; idempotencyKey: string }, context: any) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error('Payment permission is required to close a group master folio.');
  const eventKey = `group-master-close:${key(idempotencyKey)}`;
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await assertHotelGroupsEnabled(p); await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${groupBlockId}`);
    const identity = { request: { groupBlockId }, aggregateType: 'group_block', aggregateId: groupBlockId, action: 'master_folio_closed' };
    const replay = await findHotelLifecycleReplay(p, eventKey, identity); if (replay) return JSON.stringify(replay.afterSnapshot);
    const block = await p.groupBlock.findUnique({ where: { id: groupBlockId }, include: { masterFolio: { include: { entries: true } }, bookings: true } });
    if (!block?.masterFolio || block.masterFolio.status !== 'open') throw new Error('Open group master folio not found.');
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-folio:${block.masterFolio.id}`);
    const pendingPayments = await p.bookingPayment.count({ where: { bookingId: { in: block.bookings.map((booking: any) => booking.id) }, status: { in: ['pending', 'processing'] } } });
    if (pendingPayments) throw new Error('Resolve pending group payment attempts before master-folio close.');
    if (block.bookings.some((booking: any) => !['checked_out', 'cancelled', 'no_show'].includes(booking.status))) throw new Error('All group stays must depart or be cancelled before master-folio close.');
    const pendingRefunds = await p.refundIntent.count({ where: { bookingId: { in: block.bookings.map((booking: any) => booking.id) }, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } } });
    if (pendingRefunds) throw new Error('Resolve pending group refunds before master-folio close.');
    assertFolioCanClose(block.masterFolio.entries);
    await p.folio.update({ where: { id: block.masterFolio.id }, data: { status: 'closed', closedAt: new Date() } });
    const result = { groupBlockId, folioId: block.masterFolio.id, status: 'closed' };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, afterSnapshot: result }); return JSON.stringify(result);
  });
}

export async function hotelGroupWorkspace(_root: unknown, { after }: { after?: string | null }, context: any) {
  authorize(context);
  const [settings, groups, roomTypes] = await Promise.all([context.prisma.hotelSettings.findUnique({ where: { id: 1 } }), context.prisma.groupBlock.findMany({ ...(after ? { cursor: { id: after }, skip: 1 } : {}), orderBy: [{ arrivalDate: 'desc' }, { id: 'asc' }], take: 101, include: { allocations: { include: { roomType: true } }, bookings: { select: { id: true, confirmationNumber: true, guestName: true, status: true } }, masterFolio: { include: { entries: { select: { amountMinor: true, direction: true, currencyCode: true } } } } } }), context.prisma.roomType.findMany({ include: { ratePlans: { where: { status: 'active' } } } })]);
  const page = groups.slice(0, 100);
  return JSON.stringify({ groupsEnabled: settings?.groupsEnabled === true, groups: page, roomTypes, hasMore: groups.length > 100, nextCursor: page.at(-1)?.id || null });
}

/** Return a guest-paid pickup to its contract and reprice independently, all-or-nothing. */
export async function detachHotelGroupBooking(_root: unknown, args: { bookingId: string; checkInDate: string; checkOutDate: string; roomTypeId: string; ratePlanId: string; reason: string; idempotencyKey: string }, context: any) {
  authorize(context);
  const reason = String(args.reason || '').trim(); if (!reason || reason.length > 500) throw new Error('Record a bounded reason and guest agreement for leaving the group contract.');
  const eventKey = `group-detach:${key(args.idempotencyKey)}`, identity = { request: { ...args, reason }, aggregateType: 'booking', aggregateId: args.bookingId, action: 'group_detached' };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await lockHotelLifecycle(p, eventKey); await lockHotelBusinessDate(p); await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${args.bookingId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity); if (replay) return JSON.stringify(replay.afterSnapshot);
    await assertHotelGroupsEnabled(p);
    const booking = await p.booking.findUnique({ where: { id: args.bookingId }, include: { groupBlock: true } });
    if (!booking?.groupBlockId || !booking.groupBlockAllocationId || booking.groupBlock?.billingType !== 'guest_pays' || booking.billingFolioId) throw new Error('Only a guest-paid group pickup may detach; master billing requires a revised group agreement.');
    if (!['pending', 'confirmed'].includes(booking.status) || (booking.status === 'pending' && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= new Date()))) throw new Error('Only an unexpired pre-arrival group pickup may detach.');
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${booking.groupBlockId}`);
    const allocation = await p.groupBlockAllocation.findUnique({ where: { id: booking.groupBlockAllocationId } });
    if (!allocation || allocation.groupBlockId !== booking.groupBlockId || allocation.roomsPickedUp < 1) throw new Error('Group pickup allocation is inconsistent.');
    await lockRoomInventory(p, allocation.roomTypeId, booking.groupBlock.arrivalDate, booking.groupBlock.departureDate);
    const { calculateHotelPrice } = await import('../rates/pricing');
    const quote = await calculateHotelPrice(tx, { roomTypeId: args.roomTypeId, ratePlanId: args.ratePlanId, checkInDate: args.checkInDate, checkOutDate: args.checkOutDate, numberOfAdults: booking.numberOfAdults || booking.numberOfGuests, numberOfChildren: booking.numberOfChildren || 0 });
    await p.groupBlockAllocation.update({ where: { id: allocation.id }, data: { roomsPickedUp: { decrement: 1 } } });
    await p.booking.update({ where: { id: booking.id }, data: { groupBlockId: null, groupBlockAllocationId: null, source: 'staff' } });
    const { amendUnpaidBooking } = await import('../bookings/amendment');
    const changed = await amendUnpaidBooking({ context: tx, withinTransaction: true, bookingId: booking.id, checkInDate: quote.checkIn.toISOString(), checkOutDate: quote.checkOut.toISOString(), roomTypeId: args.roomTypeId, guestName: booking.guestName, guestEmail: booking.guestEmail, guestProfileId: booking.guestProfileId, numberOfGuests: quote.numberOfGuests, totalAmountMinor: quote.totalMinor, currencyCode: quote.currencyCode, idempotencyKey: `${eventKey}:reprice`, source: 'group-recontract', actorId: context.session.itemId, commercialPricing: { depositPercent: quote.depositPercent, securityDepositMinor: Number(quote.settings.securityDepositMinor ?? 0), arrivalInstant: quote.arrivalInstant, propertyTimeZone: quote.propertyTimeZone, cancellationPolicy: quote.ratePlan.cancellationPolicy, ratePlanId: quote.ratePlan.id, pricingVersion: quote.pricingVersion, roomSubtotalMinor: quote.roomSubtotalMinor, taxMinor: quote.taxMinor, feesMinor: quote.feesMinor, totalMinor: quote.totalMinor, taxRateBasisPoints: quote.taxRateBasisPoints, nightlyRates: quote.nightlyRates } });
    const result = { bookingId: booking.id, formerGroupBlockId: booking.groupBlockId, formerAllocationId: allocation.id, reason, checkInDate: changed.checkInDate, checkOutDate: changed.checkOutDate, totalAmountMinor: changed.totalAmountMinor };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { groupBlockId: booking.groupBlockId, allocationId: allocation.id, totalAmountMinor: booking.totalAmountMinor }, afterSnapshot: result });
    return JSON.stringify(result);
  });
}
