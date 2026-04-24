async function activeBookingPaymentSession(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: any
) {
  const booking = await context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      paymentSessions(where: { isInitiated: { equals: false } }) {
        id
        isSelected
        isInitiated
        createdAt
        paymentProvider {
          id
          code
          name
        }
      }
    `,
  });

  if (!booking?.paymentSessions?.length) {
    return null;
  }

  return booking.paymentSessions.find((session: any) => session.isSelected) || booking.paymentSessions[0];
}

export default activeBookingPaymentSession;
