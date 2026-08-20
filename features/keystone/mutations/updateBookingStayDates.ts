import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { changeUnpricedBookingStayDatesInTransaction } from '../lib/bookingStayDates';

export default async function updateBookingStayDates(
  root: unknown,
  {
    bookingId,
    checkInDate,
    checkOutDate,
    idempotencyKey,
  }: { bookingId: string; checkInDate: string; checkOutDate: string; idempotencyKey: string },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to update booking dates.');
  }
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) throw new Error('Invalid stay dates.');
  if (checkOut <= checkIn) throw new Error('Check-out must be after check-in.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  const request = { bookingId, checkInDate: checkIn.toISOString(), checkOutDate: checkOut.toISOString() };
  const identity = {
    request,
    aggregateType: 'booking',
    aggregateId: bookingId,
    action: 'stay_dates_changed',
  };

  await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const { booking, updated, roomIds } = await changeUnpricedBookingStayDatesInTransaction({ prisma, bookingId, checkIn, checkOut });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate },
      afterSnapshot: { checkInDate: updated.checkInDate, checkOutDate: updated.checkOutDate },
      metadata: { roomIds },
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });

  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}
