import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';

const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in'];

export async function changeUnpricedBookingStayDatesInTransaction({
  prisma, bookingId, checkIn, checkOut,
}: { prisma: any; bookingId: string; checkIn: Date; checkOut: Date }) {
  await lockHotelBusinessDate(prisma);
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, lineItems: { select: { id: true }, take: 1 } },
  });
  if (!booking) throw new Error('Booking not found.');
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) throw new Error('Cannot change dates for closed or cancelled bookings.');
  if (booking.lineItems.length) throw new Error('Priced reservations require a controlled amendment; immutable commercial snapshots cannot be rewritten.');

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
  }
  const updated = await prisma.booking.update({ where: { id: bookingId }, data: { checkInDate: checkIn, checkOutDate: checkOut } });
  return { booking, updated, roomIds };
}
