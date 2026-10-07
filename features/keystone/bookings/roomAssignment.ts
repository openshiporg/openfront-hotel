import { assertRoomNotOutOfOrder } from '../operations/roomOutages';
import { assertNoOutstandingStayKeys } from '../operations/stayRegister';
import { permissions } from '../access';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

const BLOCKED_ROOM_STATUSES = new Set(['occupied', 'cleaning', 'maintenance', 'out_of_order']);
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'checked_in']);
const ASSIGNABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'checked_in']);

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

  await runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;

    const [booking, room] = await Promise.all([
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: { roomAssignments: true },
      }),
      prisma.room.findUnique({ where: { id: roomId }, include: { roomType: true } }),
    ]);
    if (!booking) throw new Error('Booking not found.');
    if (booking.status === 'pending' && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= new Date())) throw new Error('Expired pending holds cannot receive room assignments.');
    if (!room?.roomTypeId || !room.roomType) throw new Error('Room or required room type not found.');
    if (!ASSIGNABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new Error('Only open reservations can receive a room assignment.');
    }
    const existing = booking.roomAssignments[0];
    for (const lockedRoomId of [...new Set([roomId, existing?.roomId].filter(Boolean))].sort()) {
      await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${lockedRoomId}`);
    }
    if (existing?.roomId === roomId) throw new Error('Reservation is already assigned to this room.');
    if (BLOCKED_ROOM_STATUSES.has(room.status)) {
      throw new Error(`Room ${room.roomNumber} is ${room.status.replaceAll('_', ' ')} and cannot be assigned.`);
    }
    if (!existing?.roomTypeId) throw new Error('The reservation is missing its required booked room type assignment.');
    if (existing.roomTypeId !== room.roomTypeId) {
      throw new Error(`Room ${room.roomNumber} does not match the reservation's booked room type.`);
    }
    await assertRoomNotOutOfOrder(prisma, roomId, booking.checkInDate, booking.checkOutDate);
    const [openMaintenance, openTasks] = await Promise.all([
      prisma.maintenanceRequest.count({ where: { roomId, status: { notIn: ['verified', 'cancelled'] } } }),
      prisma.housekeepingTask.count({ where: { roomId, status: { not: 'completed' } } }),
    ]);
    if (openMaintenance || openTasks) throw new Error('Resolve room maintenance and housekeeping before assignment.');
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId,
        bookingId: { not: bookingId },
        booking: {
          OR: [{ status: { in: ['confirmed', 'checked_in', 'cancellation_pending'] } }, { status: 'pending', holdExpiresAt: { gt: new Date() } }],
          checkInDate: { lt: booking.checkOutDate },
          checkOutDate: { gt: booking.checkInDate },
        },
      },
      include: { booking: true },
    });
    if (conflict?.booking) {
      throw new Error(`Room ${room.roomNumber} is already assigned to ${conflict.booking.confirmationNumber} for overlapping dates.`);
    }

    if (booking.status === 'checked_in') await assertNoOutstandingStayKeys(prisma, bookingId);
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

    const movedAt = new Date();
    if (booking.status === 'checked_in') {
      if (!existing.roomId) throw new Error('In-house reservation has no current physical room.');
      await prisma.room.update({ where: { id: roomId }, data: { status: 'occupied' } });
      const oldRoom = await prisma.room.findUnique({ where: { id: existing.roomId } });
      if (oldRoom && !['maintenance', 'out_of_order'].includes(oldRoom.status)) {
        await prisma.room.update({ where: { id: existing.roomId }, data: { status: 'cleaning' } });
      }
      await prisma.housekeepingTask.create({ data: { roomId: existing.roomId, taskType: 'checkout_clean', status: 'pending', priority: 1, notes: `Room move ${booking.confirmationNumber}; ${eventKey}; vacated ${movedAt.toISOString()}` } });
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: existing && { assignmentId: existing.id, roomId: existing.roomId, roomTypeId: existing.roomTypeId },
      afterSnapshot: { assignmentId: assignment.id, roomId, roomTypeId: room.roomTypeId, effectiveAt: movedAt, stayCheckIn: booking.checkInDate, stayCheckOut: booking.checkOutDate },
      metadata: { confirmationNumber: booking.confirmationNumber, inHouseMove: booking.status === 'checked_in', previousRoomVacatedAt: existing?.roomId ? movedAt : null, manualKeysRequireReturn: booking.status === 'checked_in' },
    });
  });

  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}
