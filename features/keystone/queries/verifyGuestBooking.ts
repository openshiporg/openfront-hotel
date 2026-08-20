import {
  BOOKING_ACCESS_DENIED_MESSAGE,
  verifyBookingEmailOwnership,
} from '../lib/guestBookingAccess';
import { STOREFRONT_BOOKING_QUERY } from '../lib/storefrontBooking';
import { enforceAbuseLimit } from '../lib/abuseControl';

async function verifyGuestBooking(
  root: unknown,
  {
    confirmationNumber,
    email,
  }: {
    confirmationNumber: string;
    email: string;
  },
  context: any
) {
  const normalizedConfirmation = confirmationNumber.trim().toUpperCase();
  await enforceAbuseLimit(context, {
    scope: 'guest-booking-verify', identity: normalizedConfirmation, limit: 8, windowMs: 15 * 60_000,
  });
  if (!normalizedConfirmation || !email.trim()) return null;

  const bookings = await context.sudo().query.Booking.findMany({
    where: { confirmationNumber: { equals: normalizedConfirmation } },
    take: 1,
    query: STOREFRONT_BOOKING_QUERY,
  });
  const booking = bookings[0];

  if (!booking) return null;
  try {
    await verifyBookingEmailOwnership(context, booking, email);
  } catch (error) {
    if (error instanceof Error && error.message === BOOKING_ACCESS_DENIED_MESSAGE) return null;
    throw error;
  }
  return booking;
}

export default verifyGuestBooking;
