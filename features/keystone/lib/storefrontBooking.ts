import type { StayPriceSummary } from '../../../lib/types';

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
  roomRateMinor
  taxAmountMinor
  feesAmountMinor
  totalAmountMinor
  depositAmountMinor
  balanceDueMinor
  currencyCode
  pricingSnapshot
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

export function guestBookedStayTerms(booking: any): StayPriceSummary | null {
  const snapshot = booking?.pricingSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  const roomSubtotalMinor = snapshot.roomSubtotalMinor;
  const taxAmountMinor = snapshot.taxMinor;
  const feesAmountMinor = snapshot.feesMinor;
  const totalAmountMinor = snapshot.totalMinor;
  const securityDepositMinor = snapshot.securityDepositMinor;
  const depositPercent = snapshot.depositPercent;
  const nights = Number(booking.numberOfNights);
  const currencyCode = String(snapshot.currencyCode || '').toUpperCase();
  const bookingCurrencyCode = String(booking.currencyCode || '').toUpperCase();
  const ratePlanName = String(snapshot.ratePlanName || '').trim();
  const cancellationPolicy = snapshot.cancellationPolicy;
  const mealPlan = snapshot.mealPlan;

  if (![roomSubtotalMinor, taxAmountMinor, feesAmountMinor, totalAmountMinor, securityDepositMinor]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  const bookingAmounts = [booking.roomRateMinor, booking.taxAmountMinor, booking.feesAmountMinor, booking.totalAmountMinor];
  if (!bookingAmounts.every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  if (
    roomSubtotalMinor !== booking.roomRateMinor ||
    taxAmountMinor !== booking.taxAmountMinor ||
    feesAmountMinor !== booking.feesAmountMinor ||
    totalAmountMinor !== booking.totalAmountMinor ||
    currencyCode !== bookingCurrencyCode
  ) return null;
  const componentTotalMinor = roomSubtotalMinor + taxAmountMinor + feesAmountMinor;
  if (!Number.isSafeInteger(componentTotalMinor) || componentTotalMinor !== totalAmountMinor) return null;
  if (!Number.isSafeInteger(nights) || nights < 1 || !Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) return null;
  if (!/^[A-Z]{3}$/.test(currencyCode) || !ratePlanName || typeof cancellationPolicy !== 'string' || typeof mealPlan !== 'string') return null;

  return {
    ratePlanName,
    nights,
    roomSubtotalMinor,
    taxAmountMinor,
    feesAmountMinor,
    totalAmountMinor,
    currencyCode,
    depositPercent,
    securityDepositMinor,
    cancellationPolicy,
    mealPlan,
  };
}

export async function findStorefrontBooking(context: any, bookingId: string) {
  return context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: STOREFRONT_BOOKING_QUERY,
  });
}
