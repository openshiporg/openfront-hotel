import { permissions } from '../access';
import { ensureReservationSnapshots as ensureSnapshots } from '../folios/reservationSnapshots';
import { ensureBookingFolio } from '../folios/bookingFolio';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';

export default async function ensureReservationSnapshots(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to manage reservation snapshots.');
  }
  return context.transaction(async (transactionContext: any) => {
    // Same lock order as amendments, so a repair never interleaves with a revision change.
    await lockHotelBusinessDate(transactionContext.prisma);
    await transactionContext.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const result = await ensureSnapshots(transactionContext, bookingId);
    await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
    return result;
  }, {
    maxWait: 5_000,
    timeout: 30_000,
    isolationLevel: 'Serializable',
  });
}
