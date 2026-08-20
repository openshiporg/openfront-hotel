import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

const BLOCKED_ROOM_STATUSES = new Set(['occupied', 'cleaning', 'maintenance', 'out_of_order']);
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'checked_in']);
const ASSIGNABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);

export function datesOverlap(startA: Date | string, endA: Date | string, startB: Date | string, endB: Date | string) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

export default async function assignRoomToBooking(
  root: unknown,
  {
    bookingId,
    roomId,
    idempotencyKey,
  }: { bookingId: string; roomId: string; idempotencyKey: string },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to assign rooms.');
  }
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  const request = { bookingId, roomId };
  const identity = {
    request,
    aggregateType: 'booking',
    aggregateId: bookingId,
    action: 'room_assigned',
  };

  await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${roomId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;

    const [booking, room] = await Promise.all([
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: { roomAssignments: true },
      }),
      prisma.room.findUnique({ where: { id: roomId }, include: { roomType: true } }),
    ]);
    if (!booking) throw new Error('Booking not found.');
    if (!room?.roomTypeId || !room.roomType) throw new Error('Room or required room type not found.');
    if (!ASSIGNABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new Error('Rooms can be assigned only before check-in; in-house room moves require a separate controlled workflow.');
    }
    if (BLOCKED_ROOM_STATUSES.has(room.status)) {
      throw new Error(`Room ${room.roomNumber} is ${room.status.replaceAll('_', ' ')} and cannot be assigned.`);
    }
    const existing = booking.roomAssignments[0];
    if (!existing?.roomTypeId) throw new Error('The reservation is missing its required booked room type assignment.');
    if (existing.roomTypeId !== room.roomTypeId) {
      throw new Error(`Room ${room.roomNumber} does not match the reservation's booked room type.`);
    }
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId,
        bookingId: { not: bookingId },
        booking: {
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          checkInDate: { lt: booking.checkOutDate },
          checkOutDate: { gt: booking.checkInDate },
        },
      },
      include: { booking: true },
    });
    if (conflict?.booking) {
      throw new Error(`Room ${room.roomNumber} is already assigned to ${conflict.booking.confirmationNumber} for overlapping dates.`);
    }

    const nights = Math.max(1, Math.ceil(
      (booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 86_400_000
    ));
    const assignmentData = {
      bookingId,
      roomId,
      roomTypeId: room.roomTypeId,
      guestName: booking.guestName,
      ratePerNightMinor: Math.round(Number(booking.roomRateMinor || 0) / nights),
      ratePerNight: Number(booking.roomRateMinor || 0) / nights / 100,
    };
    const assignment = existing
      ? await prisma.roomAssignment.update({ where: { id: existing.id }, data: assignmentData })
      : await prisma.roomAssignment.create({ data: assignmentData });

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: existing && { assignmentId: existing.id, roomId: existing.roomId, roomTypeId: existing.roomTypeId },
      afterSnapshot: { assignmentId: assignment.id, roomId, roomTypeId: room.roomTypeId },
      metadata: { confirmationNumber: booking.confirmationNumber },
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });

  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}
