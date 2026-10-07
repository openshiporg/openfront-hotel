import { propertyCalendarDate } from '../lib/hotelBusinessTime';
import { getHotelAvailability } from '../inventory/roomAvailability';
import { lockRoomInventory } from '../inventory/roomNightLocks';

/** A business refusal that payment recovery may compensate; never swallow database errors. */
export class BookingConfirmationError extends Error {
  readonly code = 'HOTEL_CONFIRMATION_UNAVAILABLE';
}

export async function assertGuestEligible(prisma: any, guestId: string) {
  if (!guestId) throw new BookingConfirmationError('A guest profile is required.');
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-guest:${guestId}`);
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest || guest.isBlacklisted) throw new BookingConfirmationError('This guest cannot be accepted; contact the property manager.');
}

/** Caller holds hotel-booking lock in a serializable transaction, shared with creation/amendment. */
export async function assertBookingConfirmationInventory(tx: any, booking: any, _now = new Date()) {
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw new BookingConfirmationError('Reservation can no longer be confirmed.');
  }
  const today = propertyCalendarDate(_now, booking.pricingSnapshot?.propertyTimeZone || 'UTC');
  if (new Date(booking.checkInDate) < today || new Date(booking.checkOutDate) <= today) throw new BookingConfirmationError('The arrival date has passed; arrange a current reservation with the property.');
  await assertGuestEligible(tx.prisma, booking.guestProfileId);
  const assignments = booking.roomAssignments ?? await tx.prisma.roomAssignment.findMany({ where: { bookingId: booking.id } });
  const quantities = new Map<string, number>();
  for (const assignment of assignments) {
    if (!assignment.roomTypeId) throw new BookingConfirmationError('Reservation has no valid room type.');
    quantities.set(assignment.roomTypeId, (quantities.get(assignment.roomTypeId) || 0) + 1);
  }
  if (!quantities.size) throw new BookingConfirmationError('Reservation has no room allocation.');
  for (const roomTypeId of [...quantities.keys()].sort()) {
    await lockRoomInventory(tx.prisma, roomTypeId, booking.checkInDate, booking.checkOutDate);
    const [available] = await getHotelAvailability(tx, {
      roomTypeId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate,
      excludeBookingId: booking.id,
    });
    if (!available || available.availableCount < quantities.get(roomTypeId)!) {
      throw new BookingConfirmationError('The room nights are no longer available. The reservation was not confirmed.');
    }
  }
}
