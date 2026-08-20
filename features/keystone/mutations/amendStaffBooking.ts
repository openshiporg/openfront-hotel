import { permissions } from '../access';
import { amendUnpaidBooking } from '../lib/bookingAmendment';
import { calculateHotelPrice } from '../lib/hotelPricing';

export default async function amendStaffBooking(
  _root: unknown,
  {
    bookingId,
    checkInDate,
    checkOutDate,
    roomTypeId,
    ratePlanId,
    promoCode,
    idempotencyKey,
  }: {
    bookingId: string;
    checkInDate: string;
    checkOutDate: string;
    roomTypeId?: string | null;
    ratePlanId?: string | null;
    promoCode?: string | null;
    idempotencyKey: string;
  },
  context: any,
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to amend staff reservations.');
  }
  const booking = await context.prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, payments: true },
  });
  if (!booking || !['pending', 'confirmed'].includes(booking.status)) {
    throw new Error('Only open, pre-arrival reservations can be amended.');
  }
  const selectedRoomTypeId = String(roomTypeId || booking.roomAssignments[0]?.roomTypeId || '');
  const selectedRatePlanId = String(ratePlanId || booking.ratePlanId || '');
  if (!selectedRoomTypeId || !selectedRatePlanId) {
    throw new Error('Reservation room type and rate plan are required for repricing.');
  }
  const selectedRatePlan = await context.prisma.ratePlan.findUnique({
    where: { id: selectedRatePlanId },
    select: { isPromotional: true, promoCode: true },
  });
  if (!selectedRatePlan) throw new Error('Selected rate plan was not found.');
  const effectivePromoCode = promoCode || (selectedRatePlan.isPromotional ? selectedRatePlan.promoCode : null);
  const quote = await calculateHotelPrice(context, {
    roomTypeId: selectedRoomTypeId,
    ratePlanId: selectedRatePlanId,
    checkInDate,
    checkOutDate,
    numberOfAdults: Number(booking.numberOfAdults || booking.numberOfGuests || 1),
    numberOfChildren: Number(booking.numberOfChildren || 0),
    promoCode: effectivePromoCode,
  });
  return amendUnpaidBooking({
    context,
    bookingId,
    checkInDate: quote.checkIn.toISOString(),
    checkOutDate: quote.checkOut.toISOString(),
    roomTypeId: selectedRoomTypeId,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestProfileId: booking.guestProfileId,
    numberOfGuests: quote.numberOfGuests,
    totalAmountMinor: quote.totalMinor,
    currencyCode: quote.currencyCode,
    idempotencyKey,
    source: 'staff-modification',
    actorId: context.session.itemId,
    commercialPricing: {
      ratePlanId: quote.ratePlan.id,
      pricingVersion: quote.pricingVersion,
      roomSubtotalMinor: quote.roomSubtotalMinor,
      taxMinor: quote.taxMinor,
      feesMinor: quote.feesMinor,
      totalMinor: quote.totalMinor,
      taxRateBasisPoints: quote.taxRateBasisPoints,
      nightlyRates: quote.nightlyRates,
    },
  });
}
