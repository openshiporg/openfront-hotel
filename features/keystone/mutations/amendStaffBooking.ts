import { amendInHouseStay } from '../bookings/inHouseStay';
import { permissions } from '../access';
import { amendUnpaidBooking } from '../bookings/amendment';
import { calculateHotelPrice } from '../rates/pricing';
import { lockHotelLifecycle } from '../lib/hotelLifecycle';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export default async function amendStaffBooking(
  _root: unknown,
  {
    bookingId,
    checkInDate,
    checkOutDate,
    roomTypeId,
    ratePlanId,
    promoCode,
    targetRoomId,
    earlyDepartureApprovalId,
    earlyDepartureReason,
    idempotencyKey,
  }: {
    bookingId: string;
    checkInDate: string;
    checkOutDate: string;
    roomTypeId?: string | null;
    ratePlanId?: string | null;
    promoCode?: string | null;
    targetRoomId?: string | null;
    earlyDepartureApprovalId?: string | null;
    earlyDepartureReason?: string | null;
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
  if (!booking || !['pending', 'confirmed', 'checked_in'].includes(booking.status)) {
    throw new Error('Only open reservations can be amended.');
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
  if (booking.status === 'checked_in') return amendInHouseStay(context, { bookingId, checkInDate, checkOutDate, roomTypeId: selectedRoomTypeId, ratePlanId: selectedRatePlanId, targetRoomId, promoCode: effectivePromoCode, earlyDepartureApprovalId, earlyDepartureReason, idempotencyKey });
  // Pre-arrival amendment: re-read the reservation and price it inside the same serializable
  // transaction and locks that commit it, so neither a concurrent rate or property change nor a
  // concurrent contact edit can be overwritten by values read earlier.
  return runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, String(idempotencyKey || '').trim());
    await lockHotelBusinessDate(prisma);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const current = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!current || !['pending', 'confirmed'].includes(current.status)) throw new Error('Only open, pre-arrival bookings can be amended.');
    const quote = await calculateHotelPrice(tx, {
      roomTypeId: selectedRoomTypeId,
      ratePlanId: selectedRatePlanId,
      checkInDate,
      checkOutDate,
      numberOfAdults: Number(current.numberOfAdults || current.numberOfGuests || 1),
      numberOfChildren: Number(current.numberOfChildren || 0),
      promoCode: effectivePromoCode,
    });
    return amendUnpaidBooking({
      context: tx,
      withinTransaction: true,
      bookingId,
      checkInDate: quote.checkIn.toISOString(),
      checkOutDate: quote.checkOut.toISOString(),
      roomTypeId: selectedRoomTypeId,
      guestName: current.guestName,
      guestEmail: current.guestEmail,
      guestProfileId: current.guestProfileId,
      numberOfGuests: quote.numberOfGuests,
      totalAmountMinor: quote.totalMinor,
      currencyCode: quote.currencyCode,
      idempotencyKey,
      source: 'staff-modification',
      actorId: context.session.itemId,
      commercialPricing: {
        arrivalInstant: quote.arrivalInstant, propertyTimeZone: quote.propertyTimeZone, cancellationPolicy: quote.ratePlan.cancellationPolicy,
        ratePlanId: quote.ratePlan.id, ratePlanName: quote.ratePlan.name, mealPlan: quote.ratePlan.mealPlan,
        pricingVersion: quote.pricingVersion,
        roomSubtotalMinor: quote.roomSubtotalMinor,
        taxMinor: quote.taxMinor,
        feesMinor: quote.feesMinor,
        totalMinor: quote.totalMinor,
        taxRateBasisPoints: quote.taxRateBasisPoints,
        nightlyRates: quote.nightlyRates,
      },
    });
  });
}
