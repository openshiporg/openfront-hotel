import { permissions } from '../access';
import { calculateFolioBalance } from '../folios/ledger';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

const TERMINAL_BOOKING_STATUSES = new Set(['checked_out', 'cancelled', 'no_show']);

export default async function closeReconciledFolio(
  _root: unknown,
  {
    bookingId,
    idempotencyKey,
  }: { bookingId: string; idempotencyKey: string },
  context: any,
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error('Not authorized to close reconciled folios.');
  }
  const key = String(idempotencyKey || '').trim();
  if (!key || key.length > 200) throw new Error('A bounded idempotencyKey is required.');
  const eventKey = `folio:reconciled-close:${key}`;
  const identity = {
    request: { bookingId },
    aggregateType: 'booking',
    aggregateId: bookingId,
    action: 'folio_reconciled',
  };

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-folio-booking:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      return { ...(replay.afterSnapshot as any), replayed: true };
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { folio: { include: { entries: { select: { direction: true, amountMinor: true, currencyCode: true } } } } },
    });
    if (!booking?.folio) throw new Error('Booking folio not found.');
    if (booking.billingFolioId) throw new Error('Group master folios require group settlement.');
    if (!TERMINAL_BOOKING_STATUSES.has(booking.status)) {
      throw new Error('Only terminal booking folios can be reconciled and closed.');
    }
    if (booking.folio.status === 'voided') throw new Error('Voided folios cannot be closed.');
    if (booking.folio.status === 'closed') {
      throw new Error('Folio is already closed; replay requires the original idempotency key.');
    }
    const balance = calculateFolioBalance(booking.folio.entries as any);
    if (balance.balanceMinor !== 0) {
      throw new Error(`Folio cannot close with an outstanding balance of ${balance.balanceMinor} minor units.`);
    }

    const closedAt = new Date();
    await prisma.folio.update({
      where: { id: booking.folio.id },
      data: { status: 'closed', closedAt },
    });
    const result = {
      folioId: booking.folio.id,
      status: 'closed',
      balanceMinor: 0,
      replayed: false,
    };
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: booking.folio.status, ...balance },
      afterSnapshot: result,
      metadata: { confirmationNumber: booking.confirmationNumber, closedAt: closedAt.toISOString() },
    });
    return result;
  });
}
