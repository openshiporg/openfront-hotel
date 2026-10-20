import { assertGuestBookingAccess } from '../lib/guestBookingAccess';

const SESSION_QUERY = `
  id
  isSelected
  isInitiated
  createdAt
  paymentProvider {
    id
    code
    name
  }
`;

/**
 * The payment attempt a provider return belongs to. With the provider's payment id the attempt
 * is found exactly (including one a webhook already settled); without it, the selected
 * unsettled attempt is used for older return links.
 */
async function activeBookingPaymentSession(
  root: unknown,
  { bookingId, providerPaymentId }: { bookingId: string; providerPaymentId?: string | null },
  context: any
) {
  await assertGuestBookingAccess(context, bookingId);

  const providerId = String(providerPaymentId || '').trim().slice(0, 200);
  if (providerId) {
    const matches = await context.prisma.bookingPaymentSession.findMany({
      where: { bookingId, OR: [
        { data: { path: ['paymentIntentId'], equals: providerId } },
        { data: { path: ['orderId'], equals: providerId } },
      ] },
      select: { id: true },
      take: 2,
    });
    if (matches.length !== 1) return null;
    return context.sudo().query.BookingPaymentSession.findOne({ where: { id: matches[0].id }, query: SESSION_QUERY });
  }

  const booking = await context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      paymentSessions(where: { isInitiated: { equals: false } }) {
        ${SESSION_QUERY}
      }
    `,
  });

  if (!booking?.paymentSessions?.length) {
    return null;
  }

  return booking.paymentSessions.find((session: any) => session.isSelected) || booking.paymentSessions[0];
}

export default activeBookingPaymentSession;
