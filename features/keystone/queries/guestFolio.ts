import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { calculateCollectibleBalance } from '../folios/bookingFolio';
import { calculateFolioBalance } from '../folios/ledger';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export default async function guestFolio(_root: unknown, { bookingId }: { bookingId: string }, context: any) {
  await assertGuestBookingAccess(context, bookingId);
  return runSerializableTransaction(context, async tx => {
    await assertGuestBookingAccess({ ...context, prisma: tx.prisma }, bookingId);
    const booking = await tx.prisma.booking.findUnique({ where: { id: bookingId }, include: { lineItems: true, folio: { include: { entries: { orderBy: [{ serviceDate: 'asc' }, { postedAt: 'asc' }, { id: 'asc' }] } } } } });
    if (!booking) throw new Error('Reservation not found.');
    if (booking.billingFolioId) return { managedByProperty: true, message: 'The property manages the shared group account. Contact the front desk for your individual charges.' };
    if (!booking.folio) throw new Error('The reservation statement is not available yet.');
    const entries = booking.folio.entries;
    const intents = await tx.prisma.refundIntent.findMany({ where: { bookingId, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } }, select: { amountMinor: true } });
    const collectible = calculateCollectibleBalance(entries, [booking], intents, booking.folio.currencyCode);
    const ledger = calculateFolioBalance(entries);
    const directBilled = entries.some((entry: any) => entry.entryType === 'transfer' && entry.direction === 'credit');
    return { managedByProperty: false, folioNumber: booking.folio.folioNumber, currencyCode: booking.folio.currencyCode, status: booking.folio.status,
      documentKind: booking.folio.status === 'closed' && ledger.balanceMinor === 0 && collectible.balanceDueMinor === 0 && intents.length === 0 ? directBilled ? 'Final statement — direct billed' : 'Final receipt' : 'Reservation statement',
      confirmationNumber: booking.confirmationNumber, ...collectible, pendingRefundMinor: intents.reduce((sum: number, intent: any) => sum + intent.amountMinor, 0),
      unpostedContractMinor: collectible.balanceMinor - ledger.balanceMinor - intents.reduce((sum: number, intent: any) => sum + intent.amountMinor, 0),
      entries: entries.map((entry: any) => ({ date: entry.serviceDate.toISOString().slice(0, 10), type: entry.entryType, direction: entry.direction, amountMinor: entry.amountMinor, description: entry.description })) };
  });
}
