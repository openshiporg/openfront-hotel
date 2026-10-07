import { runSerializableTransaction } from '../lib/serializableTransaction';
import { assertNoOpenRoomDiscrepancy } from './stayServices';
import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

const ROOM_STATUSES = new Set(['vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order']);

export default async function updateRoomOperationalStatus(
  root: unknown,
  {
    roomId,
    status,
    notes,
    idempotencyKey,
  }: {
    roomId: string;
    status: string;
    notes?: string | null;
    idempotencyKey: string;
  },
  context: any
) {
  const canUpdate =
    permissions.canManageRooms({ session: context.session }) ||
    permissions.canManageHousekeeping({ session: context.session });
  if (!canUpdate) throw new Error('Not authorized to update room status.');
  if (!ROOM_STATUSES.has(status)) throw new Error('Unsupported room status.');
  if (status === 'occupied') throw new Error('Rooms become occupied only through reservation check-in.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  const normalizedNotes = notes?.trim() || null;
  const request = { roomId, status, notes: normalizedNotes };
  const identity = {
    request,
    aggregateType: 'room',
    aggregateId: roomId,
    action: 'operational_status_changed',
  };

  await runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-room:${roomId}`
    );
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room?.roomTypeId) throw new Error('Room or required room type not found.');
    if (room.status === status) throw new Error(`Room is already ${status}.`);

    const checkedInAssignments = await prisma.roomAssignment.count({
      where: { roomId, booking: { status: 'checked_in' } },
    });
    if (checkedInAssignments > 0) {
      throw new Error('Move or check out the in-house guest before changing this room status.');
    }
    if (status === 'vacant') {
      await assertNoOpenRoomDiscrepancy(prisma, roomId);
      const [openMaintenance, openTasks] = await Promise.all([
        prisma.maintenanceRequest.count({
          where: { roomId, status: { notIn: ['verified', 'cancelled'] } },
        }),
        prisma.housekeepingTask.count({
          where: { roomId, status: { not: 'completed' } },
        }),
      ]);
      if (openMaintenance || openTasks) {
        throw new Error('Resolve open maintenance and housekeeping work before marking the room ready.');
      }
    }

    const now = new Date();
    const nextNotes = normalizedNotes
      ? [room.notes, `[${now.toISOString()}] ${normalizedNotes}`].filter(Boolean).join('\n')
      : room.notes;
    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        status,
        notes: nextNotes,
        ...(status === 'vacant' ? { lastCleaned: now } : {}),
      },
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: room.status, notes: room.notes, lastCleaned: room.lastCleaned },
      afterSnapshot: { status: updated.status, notes: updated.notes, lastCleaned: updated.lastCleaned },
      metadata: { roomTypeId: room.roomTypeId },
    });
  });

  return context.prisma.room.findUnique({ where: { id: roomId } });
}
