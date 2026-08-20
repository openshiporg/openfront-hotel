export const STOREFRONT_BOOKING_QUERY = `
  id
  confirmationNumber
  guestName
  guestEmail
  guestPhone
  checkInDate
  checkOutDate
  numberOfNights
  numberOfGuests
  numberOfAdults
  numberOfChildren
  roomRate
  taxAmount
  feesAmount
  totalAmount
  depositAmount
  balanceDue
  status
  paymentStatus
  specialRequests
  createdAt
  confirmedAt
  cancelledAt
  roomAssignments {
    id
    ratePerNight
    guestName
    roomType {
      id
      name
      thumbnail
      roomImages(orderBy: { order: asc }) {
        id
        image { url }
        imagePath
        altText
        caption
        order
        isPrimary
      }
    }
    room {
      roomNumber
    }
  }
`;

export async function findStorefrontBooking(context: any, bookingId: string) {
  return context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: STOREFRONT_BOOKING_QUERY,
  });
}
