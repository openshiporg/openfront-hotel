import {
  assertGuestBookingAccess,
  getGuestAccessBookingIds,
} from '../lib/guestBookingAccess';
import { STOREFRONT_BOOKING_QUERY } from '../lib/storefrontBooking';
import { bookingCommunicationStatus } from '../lib/hotelCommunications';

async function guestBookings(
  root: unknown,
  { email }: { email: string },
  context: any
) {
  const bookingIds = getGuestAccessBookingIds(context);
  if (!bookingIds.length || !email.trim()) return [];

  const verifiedIds: string[] = [];
  for (const bookingId of bookingIds) {
    try {
      const booking = await assertGuestBookingAccess(context, bookingId);
      if ((booking.guestEmail || '').trim().toLowerCase() === email.trim().toLowerCase()) {
        verifiedIds.push(bookingId);
      }
    } catch {
      // Ignore stale or invalid cookie entries.
    }
  }

  if (!verifiedIds.length) return [];

  const bookings = await context.sudo().query.Booking.findMany({
    where: {
      id: { in: verifiedIds },
      guestEmail: { equals: email.trim(), mode: 'insensitive' },
    },
    orderBy: [{ createdAt: 'desc' }],
    query: STOREFRONT_BOOKING_QUERY,
  });
  return Promise.all(bookings.map(async (booking: any) => {
    const communication = await bookingCommunicationStatus(context.prisma, booking.id);
    return {
      ...booking,
      confirmationDeliveryStatus: communication.confirmation?.status || null,
      updateDeliveryStatus: communication.modification?.status || communication.update?.status || null,
      cancellationDeliveryStatus: communication.cancellation?.status || null,
    };
  }));
}

export default guestBookings;
