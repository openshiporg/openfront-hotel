import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { getHotelAvailability, hotelStayDates } from '../inventory/roomAvailability';
import { assertRoomNotOutOfOrder } from '../operations/roomOutages';
import { lockRoomInventory } from '../inventory/roomNightLocks';

const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in'];
const DATE_CHANGEABLE_STATUSES = ['pending', 'confirmed'];

/**
 * Date change for a stay without priced night lines (an older or unpriced reservation). It
 * keeps the same operating rules as priced changes: pre-arrival stays only, dates from the
 * current business date, the room type's sellable capacity (bookings, group holds, outages)
 * and no overlap or outage on an assigned room.
 */
export async function changeUnpricedBookingStayDatesInTransaction({
  prisma, bookingId, checkIn: requestedCheckIn, checkOut: requestedCheckOut,
}: { prisma: any; bookingId: string; checkIn: Date; checkOut: Date }) {
  const { checkIn, checkOut } = hotelStayDates(requestedCheckIn, requestedCheckOut);
  await lockHotelBusinessDate(prisma);
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, lineItems: { select: { id: true }, take: 1 } },
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status === 'checked_in') throw new Error('An in-house stay cannot change its arrival date here. Use the in-house stay controls on Front Desk.');
  if (!DATE_CHANGEABLE_STATUSES.includes(booking.status)) throw new Error('Cannot change dates for closed or cancelled bookings.');
  if (booking.lineItems.length) throw new Error('Priced reservations require a controlled amendment; immutable commercial snapshots cannot be rewritten.');

  const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { currentBusinessDate: true } });
  if (!clock) throw new Error('Property business date is not configured.');
  const businessDate = new Date(clock.currentBusinessDate);
  businessDate.setUTCHours(0, 0, 0, 0);
  if (checkIn < businessDate) throw new Error('Arrival cannot be before the current business date.');

  const roomsPerType = new Map<string, number>();
  for (const assignment of booking.roomAssignments) if (assignment.roomTypeId) roomsPerType.set(assignment.roomTypeId, (roomsPerType.get(assignment.roomTypeId) || 0) + 1);
  if (!roomsPerType.size) throw new Error('This reservation has no room type, so its new dates cannot be checked against availability.');
  for (const [roomTypeId, rooms] of [...roomsPerType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    await lockRoomInventory(prisma, roomTypeId, checkIn, checkOut);
    const [availability] = await getHotelAvailability({ prisma }, { roomTypeId, checkInDate: checkIn, checkOutDate: checkOut, excludeBookingId: bookingId });
    const soldOut = availability?.availabilityByDay.find((day: any) => day.available < rooms);
    if (!availability || soldOut) throw new Error(`Room type is sold out${soldOut ? ` on ${soldOut.date}` : ''}.`);
  }

  const roomIds = booking.roomAssignments.map((assignment: any) => assignment.roomId).filter(Boolean).sort();
  for (const roomId of roomIds) {
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${roomId}`);
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId, bookingId: { not: bookingId },
        booking: { status: { in: ACTIVE_BOOKING_STATUSES }, checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } },
      },
      include: { booking: true, room: true },
    });
    if (conflict?.booking) throw new Error(`Room ${conflict.room?.roomNumber || roomId} conflicts with ${conflict.booking.confirmationNumber} for the new stay dates.`);
    await assertRoomNotOutOfOrder(prisma, roomId, checkIn, checkOut);
  }
  const updated = await prisma.booking.update({ where: { id: bookingId }, data: { checkInDate: checkIn, checkOutDate: checkOut } });
  return { booking, updated, roomIds };
}
