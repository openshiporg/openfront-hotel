import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

const TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(['in_progress', 'on_hold']),
  in_progress: new Set(['completed', 'inspection_needed', 'on_hold']),
  on_hold: new Set(['pending', 'in_progress']),
  inspection_needed: new Set(['in_progress', 'completed', 'on_hold']),
  completed: new Set(),
};

export default async function updateHousekeepingTaskStatus(
  root: unknown,
  {
    taskId,
    status,
    assignedToId,
    notes,
    idempotencyKey,
  }: {
    taskId: string;
    status: string;
    assignedToId?: string | null;
    notes?: string | null;
    idempotencyKey: string;
  },
  context: any
) {
  if (!permissions.canManageHousekeeping({ session: context.session })) {
    throw new Error('Not authorized to update housekeeping tasks.');
  }
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  if (!TRANSITIONS[status]) throw new Error('Unsupported housekeeping status.');
  const normalizedNotes = notes?.trim() || null;
  const request = { taskId, status, assignedToId: assignedToId || null, notes: normalizedNotes };
  const identity = {
    request,
    aggregateType: 'housekeeping_task',
    aggregateId: taskId,
    action: 'status_changed',
  };

  await runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;

    const task = await prisma.housekeepingTask.findUnique({
      where: { id: taskId },
      include: { room: true },
    });
    if (!task?.roomId || !task.room) throw new Error('Housekeeping task or room not found.');
    if (task.status === status) throw new Error(`Housekeeping task is already ${status}.`);
    if (!TRANSITIONS[task.status]?.has(status)) {
      throw new Error(`Housekeeping status cannot transition from ${task.status} to ${status}.`);
    }

    const now = new Date();
    const nextNotes = normalizedNotes
      ? [task.notes, `[${now.toISOString()}] ${normalizedNotes}`].filter(Boolean).join('\n')
      : task.notes;
    const updated = await prisma.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status,
        assignedToId: assignedToId === undefined ? task.assignedToId : assignedToId,
        notes: nextNotes,
        startedAt: status === 'in_progress' ? task.startedAt || now : task.startedAt,
        completedAt: status === 'completed' ? task.completedAt || now : task.completedAt,
      },
    });

    let roomStatus = task.room.status;
    if (status === 'in_progress') roomStatus = task.taskType === 'maintenance' ? 'maintenance' : 'cleaning';
    if (status === 'inspection_needed') roomStatus = 'cleaning';
    if (status === 'completed') {
      const [remainingTasks, openMaintenance] = await Promise.all([
        prisma.housekeepingTask.count({
          where: { roomId: task.roomId, id: { not: task.id }, status: { not: 'completed' } },
        }),
        prisma.maintenanceRequest.findMany({
          where: { roomId: task.roomId, status: { notIn: ['verified', 'cancelled'] } },
          select: { status: true },
        }),
      ]);
      const maintenanceInProgress = openMaintenance.some((item: any) => ['reported', 'assigned', 'in_progress'].includes(item.status));
      roomStatus = maintenanceInProgress ? 'maintenance' : (remainingTasks || openMaintenance.length) ? 'cleaning' : 'vacant';
    }
    if (roomStatus !== task.room.status || status === 'completed') {
      await prisma.room.update({
        where: { id: task.roomId },
        data: {
          status: roomStatus,
          ...(status === 'completed' && roomStatus === 'vacant' ? { lastCleaned: now } : {}),
        },
      });
    }

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: {
        status: task.status,
        assignedToId: task.assignedToId,
        notes: task.notes,
        roomStatus: task.room.status,
      },
      afterSnapshot: {
        status: updated.status,
        assignedToId: updated.assignedToId,
        notes: updated.notes,
        roomStatus,
      },
    });
  });

  return context.prisma.housekeepingTask.findUnique({ where: { id: taskId } });
}
