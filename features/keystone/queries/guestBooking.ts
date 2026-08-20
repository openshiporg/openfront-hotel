import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { findStorefrontBooking } from '../lib/storefrontBooking';
import { bookingCommunicationStatus } from '../lib/hotelCommunications';

async function guestBooking(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: any
) {
  await assertGuestBookingAccess(context, bookingId);
  const [booking, communication] = await Promise.all([
    findStorefrontBooking(context, bookingId),
    bookingCommunicationStatus(context.prisma, bookingId),
  ]);
  if (!booking) return null;
  return {
    ...booking,
    confirmationDeliveryStatus: communication.confirmation?.status || null,
    updateDeliveryStatus: communication.modification?.status || communication.update?.status || null,
    cancellationDeliveryStatus: communication.cancellation?.status || null,
  };
}

export default guestBooking;
