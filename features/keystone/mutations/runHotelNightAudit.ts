import { ensureBookingFolio } from '../lib/bookingFolio';
import {
  HOTEL_PROPERTY_KEY,
  findHotelLifecycleReplay,
  hashLifecycleRequest,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

function utcBusinessDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Business date is invalid.');
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export default async function runHotelNightAudit(
  _root: unknown,
  { propertyKey, businessDate: value, idempotencyKey }: {
    propertyKey: string;
    businessDate: string;
    idempotencyKey: string;
  },
  context: any
) {
  if (propertyKey !== HOTEL_PROPERTY_KEY || !context.session?.data?.role?.canManagePayments) {
    throw new Error('Not authorized to run night audit for this property.');
  }
  if (!String(idempotencyKey || '').trim()) throw new Error('Idempotency key is required.');
  const businessDate = utcBusinessDate(value);
  const nextBusinessDate = new Date(businessDate);
  nextBusinessDate.setUTCDate(nextBusinessDate.getUTCDate() + 1);
  const eventKey = `night-audit:${HOTEL_PROPERTY_KEY}:${idempotencyKey.trim()}`;
  const identity = {
    request: { propertyKey, businessDate: businessDate.toISOString() },
    aggregateType: 'night_audit',
    aggregateId: businessDate.toISOString().slice(0, 10),
    action: 'completed',
  };

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-business-date:${HOTEL_PROPERTY_KEY}`
    );
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const run = await prisma.nightAuditRun.findUnique({ where: { businessDate } });
      if (!run) throw new Error('Night-audit replay evidence is incomplete.');
      return run;
    }

    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || clock.propertyKey !== HOTEL_PROPERTY_KEY) {
      throw new Error('Property business date is not configured.');
    }
    if (utcBusinessDate(clock.currentBusinessDate.toISOString()).getTime() !== businessDate.getTime()) {
      throw new Error(`Night audit must run for the current business date ${clock.currentBusinessDate.toISOString().slice(0, 10)}.`);
    }

    const departureCandidates = await prisma.booking.findMany({
      where: {
        status: { in: ['checked_in', 'checked_out'] },
        checkOutDate: { lte: nextBusinessDate },
      },
      include: {
        folio: { include: { entries: true } },
        billingFolio: { include: { entries: true } },
      },
    });
    const unsettledDepartures = departureCandidates.filter((booking: any) => {
      // Master-folio groups settle at group close, not at each guest checkout.
      if (booking.billingFolioId) return false;
      if (booking.status !== 'checked_out' || booking.folio?.status !== 'closed') return true;
      const balanceMinor = booking.folio.entries.reduce(
        (balance: number, entry: any) =>
          balance + (entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor),
        0
      );
      return balanceMinor !== 0;
    });
    if (unsettledDepartures.length) {
      throw new Error(
        `Night audit refused: ${unsettledDepartures.length} departing reservations are not checked out with settled, closed folios.`
      );
    }

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'checked_in',
        checkInDate: { lt: nextBusinessDate },
        checkOutDate: { gt: businessDate },
      },
      orderBy: { id: 'asc' },
      include: {
        lineItems: {
          where: { date: { gte: businessDate, lt: nextBusinessDate }, totalPrice: { gt: 0 } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        },
        folio: true,
        billingFolio: true,
      },
    });

    const missingSnapshots = bookings.filter((booking: any) => booking.lineItems.length === 0);
    const closedFolios = bookings.filter((booking: any) => {
      const folio = booking.billingFolio || booking.folio;
      return folio && folio.status !== 'open';
    });
    if (missingSnapshots.length || closedFolios.length) {
      throw new Error(
        `Night audit refused: ${missingSnapshots.length} reservations lack due snapshots and ${closedFolios.length} folios are not open.`
      );
    }

    const startedAt = new Date();
    let postedEntryCount = 0;
    let existingEntryCount = 0;
    let debitMinor = 0;
    for (const booking of bookings) {
      const result = await ensureBookingFolio(transactionContext, booking.id, {
        postSnapshotEntries: true,
        serviceDate: businessDate,
      });
      postedEntryCount += result.created;
      existingEntryCount += result.existing;
      debitMinor += booking.lineItems.reduce(
        (sum: number, line: any) => sum + Number(line.totalPrice),
        0
      );
    }

    const completedAt = new Date();
    const run = await prisma.nightAuditRun.create({
      data: {
        eventKey,
        requestHash: hashLifecycleRequest(identity.request),
        propertyKey: HOTEL_PROPERTY_KEY,
        businessDate,
        status: 'completed',
        dueBookingCount: bookings.length,
        postedEntryCount,
        existingEntryCount,
        exceptionCount: 0,
        debitMinor,
        startedAt,
        completedAt,
      },
    });
    await prisma.hotelBusinessDate.update({
      where: { id: clock.id },
      data: { currentBusinessDate: nextBusinessDate, updatedAt: completedAt },
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { currentBusinessDate: businessDate.toISOString() },
      afterSnapshot: {
        currentBusinessDate: nextBusinessDate.toISOString(),
        runId: run.id,
        dueBookingCount: bookings.length,
        postedEntryCount,
        existingEntryCount,
        debitMinor,
      },
    });
    return run;
  });
}
