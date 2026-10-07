import { permissions } from '../access';
import { ensureReservationSnapshots as ensureSnapshots } from '../folios/reservationSnapshots';
import { ensureBookingFolio } from '../folios/bookingFolio';

export default async function ensureReservationSnapshots(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to manage reservation snapshots.');
  }
  return context.transaction(async (transactionContext: any) => {
    const result = await ensureSnapshots(transactionContext, bookingId);
    await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
    return result;
  }, {
    maxWait: 5_000,
    timeout: 30_000,
    isolationLevel: 'Serializable',
  });
}
