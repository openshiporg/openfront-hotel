async function createStorefrontBooking(
  root: unknown,
  { data }: { data: Record<string, unknown> },
  context: any
) {
  const sudoContext = context.sudo();

  const booking = await sudoContext.query.Booking.createOne({
    data,
    query: `
      id
      confirmationNumber
      guestName
      guestEmail
      guestPhone
      checkInDate
      checkOutDate
      numberOfGuests
      totalAmount
      balanceDue
      status
      paymentStatus
      createdAt
    `,
  });

  return booking;
}

export default createStorefrontBooking;
