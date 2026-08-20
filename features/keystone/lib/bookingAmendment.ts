import { buildFolioReversalPosting } from './folioLedger';
import { ensureBookingFolio } from './bookingFolio';
import { ensureReservationSnapshots } from './reservationSnapshots';
import { lockRoomInventory } from './inventoryLock';
import { assertHotelAvailability } from './hotelAvailability';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from './hotelLifecycle';
import { queueBookingCommunication } from './hotelCommunications';

function must<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

function inventoryDayKeys(roomTypeId: string, start: Date, end: Date, delta: number, deltas: Map<string, { roomTypeId: string; date: Date; delta: number }>) {
  for (const day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const key = `${roomTypeId}:${date.toISOString().slice(0, 10)}`;
    const existing = deltas.get(key);
    deltas.set(key, { roomTypeId, date, delta: (existing?.delta || 0) + delta });
  }
}

function testFailure(stage: string) {
  if (process.env.NODE_ENV === 'test' && process.env.HOTEL_AMENDMENT_FAIL_AFTER === stage) throw new Error(`Injected amendment failure after ${stage}.`);
}

async function transferChannelInventory(prisma: any, booking: any, oldRoomTypeId: string, roomTypeId: string, checkIn: Date, checkOut: Date) {
  if (booking.source !== 'ota') return;
  const deltas = new Map<string, { roomTypeId: string; date: Date; delta: number }>();
  inventoryDayKeys(oldRoomTypeId, booking.checkInDate, booking.checkOutDate, -1, deltas);
  inventoryDayKeys(roomTypeId, checkIn, checkOut, 1, deltas);
  for (const [inventoryKey, item] of [...deltas.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (item.delta === 0) continue;
    const existing: any = must(await prisma.roomInventory.findUnique({ where: { inventoryKey } }));
    if (!existing) {
      if (item.delta < 0) continue;
      const totalRooms = must(await prisma.room.count({ where: { roomTypeId: item.roomTypeId } }));
      if (item.delta > totalRooms) throw new Error('Channel amendment exceeds physical room inventory.');
      must(await prisma.roomInventory.create({ data: { inventoryKey, roomTypeId: item.roomTypeId, date: item.date, totalRooms, bookedRooms: item.delta, blockedRooms: 0 } }));
      continue;
    }
    const bookedRooms = Math.max(0, Number(existing.bookedRooms || 0) + item.delta);
    if (bookedRooms + Number(existing.blockedRooms || 0) > Number(existing.totalRooms || 0)) throw new Error('Channel amendment exceeds available room inventory.');
    must(await prisma.roomInventory.update({ where: { id: existing.id }, data: { bookedRooms } }));
  }
}

export async function amendUnpaidBooking({
  context, bookingId, checkInDate, checkOutDate, roomTypeId, guestName, guestEmail, guestProfileId,
  numberOfGuests, totalAmountMinor, currencyCode = 'USD', idempotencyKey, source = 'channel', withinTransaction = false,
  commercialPricing, actorId = null, queueCommunication = true,
}: {
  context: any; bookingId: string; checkInDate: string; checkOutDate: string; roomTypeId: string;
  guestName: string; guestEmail: string; guestProfileId: string; numberOfGuests: number;
  totalAmountMinor: number; currencyCode?: string; idempotencyKey: string; source?: string; withinTransaction?: boolean;
  commercialPricing?: {
    ratePlanId: string; pricingVersion: string; roomSubtotalMinor: number; taxMinor: number; feesMinor: number;
    totalMinor: number; taxRateBasisPoints: number; nightlyRates: Array<{ date: string; amountMinor: number; seasonalRateId?: string | null; seasonalRateName?: string | null }>;
  };
  actorId?: string | null;
  queueCommunication?: boolean;
}) {
  const checkIn = new Date(checkInDate); const checkOut = new Date(checkOutDate);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) throw new Error('Invalid amendment stay dates.');
  if (!Number.isSafeInteger(totalAmountMinor) || totalAmountMinor < 0) throw new Error('Invalid amendment total.');
  const eventKey = String(idempotencyKey || '').trim(); if (!eventKey) throw new Error('Amendment idempotency key is required.');
  if (commercialPricing && commercialPricing.totalMinor !== totalAmountMinor) throw new Error('Amendment pricing total is inconsistent.');
  const identity = { request: { bookingId, checkInDate: checkIn.toISOString(), checkOutDate: checkOut.toISOString(), roomTypeId, guestName, guestEmail, numberOfGuests, totalAmountMinor, currencyCode, source, commercialPricing }, aggregateType: 'booking', aggregateId: bookingId, action: 'commercial_terms_amended' };
  const execute = async (tx: any) => {
    const prisma = tx.prisma; await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return prisma.booking.findUnique({ where: { id: bookingId } });
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: true, lineItems: { where: { snapshotStatus: 'active' } }, folio: { include: { entries: { include: { reversedBy: true } } } }, payments: true },
    });
    if (!booking || !['pending','confirmed'].includes(booking.status)) throw new Error('Only open, pre-arrival bookings can be amended.');
    const netPaidMinor = Math.max(0, booking.payments
      .filter((payment: any) => ['completed', 'refunded'].includes(payment.status))
      .reduce((sum: number, payment: any) => sum + (payment.paymentType === 'refund' ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
    if (totalAmountMinor < netPaidMinor) {
      throw new Error(`Refund ${netPaidMinor - totalAmountMinor} minor units through the payment workflow before applying this lower-priced amendment.`);
    }
    const currentRoomTypeId = booking.roomAssignments[0]?.roomTypeId;
    if (!currentRoomTypeId) throw new Error('Booking room type is missing.');
    await lockRoomInventory(prisma, currentRoomTypeId, booking.checkInDate, booking.checkOutDate);
    await lockRoomInventory(prisma, roomTypeId, checkIn, checkOut);
    for (const assignment of booking.roomAssignments.filter((item: any) => item.roomId).sort((a: any, b: any) => a.roomId.localeCompare(b.roomId))) {
      await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${assignment.roomId}`);
      const conflict = await prisma.roomAssignment.findFirst({
        where: {
          roomId: assignment.roomId,
          bookingId: { not: bookingId },
          booking: {
            status: { in: ['pending', 'confirmed', 'checked_in'] },
            checkInDate: { lt: checkOut },
            checkOutDate: { gt: checkIn },
          },
        },
        include: { room: true, booking: true },
      });
      if (conflict?.booking) {
        throw new Error(`Room ${conflict.room?.roomNumber || assignment.roomId} conflicts with ${conflict.booking.confirmationNumber} for the amended dates.`);
      }
    }
    await assertHotelAvailability(tx, {
      roomTypeId, checkInDate: checkIn, checkOutDate: checkOut, excludeBookingId: bookingId,
      excludeInventoryBooking: booking.source === 'ota' ? { roomTypeId: currentRoomTypeId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate } : undefined,
    });
    await transferChannelInventory(prisma, booking, currentRoomTypeId, roomTypeId, checkIn, checkOut);
    testFailure('inventory');
    const ensured = await ensureBookingFolio(tx, bookingId, { postSnapshotEntries: true });
    const folio = await prisma.folio.findUniqueOrThrow({ where: { id: ensured.folioId }, include: { entries: { include: { reversedBy: true } } } });
    const activeLineIds = new Set(booking.lineItems.map((line: any) => line.id));
    const posted = folio.entries.filter((entry: any) => entry.sourceType === 'reservation_snapshot' && activeLineIds.has(entry.sourceId) && !entry.reversedBy);
    const now = new Date();
    for (const entry of posted) {
      const reversal = buildFolioReversalPosting(entry, { postingKey: `${eventKey}:reverse:${entry.id}`, reason: `${source} commercial amendment` });
      await prisma.folioEntry.create({ data: { folioId: folio.id, ...reversal, serviceDate: now, postedAt: now, metadataSnapshot: { ...(reversal.metadataSnapshot as any), source, amendmentEventKey: eventKey } } });
    }
    testFailure('reversals');
    await prisma.reservationLineItem.updateMany({ where: { id: { in: [...activeLineIds] } }, data: { snapshotStatus: 'superseded', supersededAt: now } });
    const revision = Number(booking.pricingRevision || 1) + 1;
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
    const fallbackNightly = Array.from({ length: nights }, (_, index) => Math.floor(totalAmountMinor / nights) + (index < totalAmountMinor % nights ? 1 : 0))
      .map((amountMinor, index) => ({ date: new Date(checkIn.getTime() + index * 86_400_000).toISOString().slice(0, 10), amountMinor }));
    const roomSubtotalMinor = commercialPricing?.roomSubtotalMinor ?? totalAmountMinor;
    const taxMinor = commercialPricing?.taxMinor ?? 0;
    const feesMinor = commercialPricing?.feesMinor ?? 0;
    const nightlyRates = commercialPricing?.nightlyRates ?? fallbackNightly;
    const balanceDueMinor = Math.max(0, totalAmountMinor - netPaidMinor);
    const paymentStatus = netPaidMinor <= 0 ? 'unpaid' : balanceDueMinor === 0 ? 'paid' : 'partial';
    const updated = await prisma.booking.update({ where: { id: bookingId }, data: {
      guestName, guestEmail, guestProfileId, checkInDate: checkIn, checkOutDate: checkOut, numberOfGuests,
      roomRateMinor: roomSubtotalMinor, taxAmountMinor: taxMinor, feesAmountMinor: feesMinor, totalAmountMinor,
      balanceDueMinor, paymentStatus, currencyCode, roomRate: roomSubtotalMinor / 100, taxAmount: taxMinor / 100,
      feesAmount: feesMinor / 100, totalAmount: totalAmountMinor / 100, balanceDue: balanceDueMinor / 100,
      ratePlanId: commercialPricing?.ratePlanId ?? booking.ratePlanId,
      pricingVersion: commercialPricing?.pricingVersion ?? `${source}-amendment-v1`, pricingRevision: revision,
      pricingSnapshot: { snapshotKeyPrefix: `v${revision}`, source, nightlyRates, roomSubtotalMinor, taxMinor, feesMinor, totalMinor: totalAmountMinor, currencyCode, taxRateBasisPoints: commercialPricing?.taxRateBasisPoints ?? 0 },
    } });
    testFailure('booking');
    const assignment = booking.roomAssignments[0];
    await prisma.roomAssignment.update({ where: { id: assignment.id }, data: { roomTypeId, guestName, ratePerNightMinor: Math.round(roomSubtotalMinor / nights), ratePerNight: roomSubtotalMinor / nights / 100 } });
    await ensureReservationSnapshots(tx, bookingId);
    await ensureBookingFolio(tx, bookingId, { postSnapshotEntries: true });
    testFailure('snapshots');
    await recordHotelLifecycleEvent({ prisma, eventKey, actorId, identity,
      beforeSnapshot: { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, roomTypeId: currentRoomTypeId, totalAmountMinor: booking.totalAmountMinor },
      afterSnapshot: { checkInDate: updated.checkInDate, checkOutDate: updated.checkOutDate, roomTypeId, totalAmountMinor, pricingRevision: revision, netPaidMinor, balanceDueMinor, paymentStatus },
      metadata: { source, reversedSnapshotPostingCount: posted.length },
    });
    if (queueCommunication) {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: 'booking_updated',
        eventKey,
      });
    }
    return updated;
  };
  if (withinTransaction) return execute(context);
  return context.transaction(execute, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
}
