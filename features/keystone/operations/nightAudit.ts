import { calculateFolioBalance } from '../folios/ledger';
import { isPastPropertyCalendarDate } from '../lib/hotelBusinessTime';
import { permissions } from '../access';
import { captureHotelReportingDay } from '../reporting/reporting';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { ensureBookingFolio } from '../folios/bookingFolio';
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
  if (propertyKey !== HOTEL_PROPERTY_KEY || !permissions.canManagePayments({ session: context.session })) {
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
    await lockHotelBusinessDate(prisma);
    // A SERIALIZABLE waiter must retry rather than audit against a pre-close snapshot.
    await prisma.$queryRawUnsafe(
      'SELECT "id" FROM "HotelBusinessDate" WHERE "id" = $1 FOR UPDATE',
      1,
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

    const propertySettings = await prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { timeZone: true } });
    if (!propertySettings?.timeZone) throw new Error('Property time zone is not configured.');

    const departureCandidates = await prisma.booking.findMany({
      where: {
        status: { in: ['checked_in', 'checked_out'] },
        checkOutDate: { lte: businessDate },
      },
      include: {
        folio: { include: { entries: true } },
        billingFolio: { include: { entries: true } },
      },
    });
    const unsettledDepartures = departureCandidates.filter((booking: any) => {
      // Master-folio groups settle at group close, not at each guest checkout.
      if (booking.status !== 'checked_out') return true;
      if (booking.billingFolioId) return false;
      if (booking.folio?.status !== 'closed') return true;
      const balanceMinor = calculateFolioBalance(booking.folio.entries).balanceMinor;
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
          where: { snapshotStatus: 'active', date: { gte: businessDate, lt: nextBusinessDate } },
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

    // Catch-up closes must not put already-expired service dates into the live
    // dispatch queue. Record every suppressed room task in the audit evidence.
    const suppressHistoricalHousekeeping = isPastPropertyCalendarDate(
      nextBusinessDate,
      new Date(),
      propertySettings.timeZone,
    );
    let suppressedHistoricalHousekeepingTaskCount = 0;
    for (const booking of bookings.filter((item: any) => item.checkOutDate > nextBusinessDate)) {
      const assignments = await prisma.roomAssignment.findMany({ where: { bookingId: booking.id, roomId: { not: null } } });
      if (suppressHistoricalHousekeeping) {
        suppressedHistoricalHousekeepingTaskCount += assignments.length;
        continue;
      }
      for (const assignment of assignments) {
        await prisma.housekeepingTask.create({ data: { roomId: assignment.roomId, taskType: 'stayover_clean', status: 'pending', priority: 2, notes: `Stayover ${nextBusinessDate.toISOString().slice(0, 10)}; booking ${booking.id}; night audit ${eventKey}` } });
      }
    }
    const reportingDay = await captureHotelReportingDay(prisma, businessDate);
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
    // This compare-and-swap is the final D -> D+1 guard inside the audit transaction.
    const advanced = await prisma.hotelBusinessDate.updateMany({
      where: { id: clock.id, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: clock.currentBusinessDate },
      data: { currentBusinessDate: nextBusinessDate, updatedAt: completedAt },
    });
    if (advanced.count !== 1) {
      throw new Error('Property business date changed during night audit; the date was not advanced.');
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { currentBusinessDate: businessDate.toISOString() },
      afterSnapshot: {
        currentBusinessDate: nextBusinessDate.toISOString(),
        runId: run.id,
        reportingDay,
        dueBookingCount: bookings.length,
        postedEntryCount,
        existingEntryCount,
        debitMinor,
        suppressedHistoricalHousekeepingTaskCount,
      },
    });
    return run;
  });
}
