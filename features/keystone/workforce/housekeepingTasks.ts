import { assertHousekeepingStaffEligible } from './housekeepingCapabilities';
import { INSPECTION_CHECKLIST_NOTE, requiresInspectionChecklist } from './inspectionChecklist';
import { safeRoomCondition } from '../operations/roomSafety';
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
    expectedStatus,
    expectedUpdatedAt,
  }: {
    taskId: string;
    status: string;
    assignedToId?: string | null;
    notes?: string | null;
    idempotencyKey: string;
    expectedStatus?: string | null;
    expectedUpdatedAt?: string | null;
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
  const request = { taskId, status, assignedToId: assignedToId || null, notes: normalizedNotes, expectedStatus: expectedStatus || null, expectedUpdatedAt: expectedUpdatedAt || null };
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
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${task.roomId}`);
    const effectiveAssigneeId = assignedToId === undefined ? task.assignedToId : assignedToId;
    if (effectiveAssigneeId) await assertHousekeepingStaffEligible(prisma, effectiveAssigneeId, task);
    else if (['in_progress', 'completed'].includes(status)) await assertHousekeepingStaffEligible(prisma, context.session.itemId, task);
    if (expectedUpdatedAt && (!task.updatedAt || new Date(expectedUpdatedAt).getTime() !== new Date(task.updatedAt).getTime())) throw new Error('Task assignment or notes changed; refresh and resolve the offline update conflict.');
    if (expectedStatus && task.status !== expectedStatus) throw new Error(`Task changed from ${expectedStatus} to ${task.status}; refresh and resolve the offline update conflict.`);
    if (task.status === status && assignedToId === undefined && !normalizedNotes) throw new Error(`Housekeeping task is already ${status}.`);
    if (task.status !== status && !TRANSITIONS[task.status]?.has(status)) {
      throw new Error(`Housekeeping status cannot transition from ${task.status} to ${status}.`);
    }

    if (requiresInspectionChecklist(task) && status === 'completed' && !normalizedNotes?.includes(INSPECTION_CHECKLIST_NOTE)) throw new Error('Confirm the inspection checklist before completing inspection.');

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
    roomStatus = await safeRoomCondition(prisma, task.roomId, task.room.status, roomStatus);
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

// Tasks staff schedule by hand. Checkout and stayover cleans, inspections and maintenance are
// created by their own lifecycle (checkout, night audit, maintenance completion).
export const SCHEDULABLE_HOUSEKEEPING_TASK_TYPES = ['deep_clean', 'turn_down'] as const;

/**
 * Schedule a deep clean or turn-down for one room. Room-locked, idempotent and audited; at
 * most one open task of the same type per room; an assignee must be active and qualified.
 */
export async function scheduleHousekeepingTask(
  _root: unknown,
  { roomId, taskType, priority, assignedToId, notes, idempotencyKey }: {
    roomId: string;
    taskType: string;
    priority?: number | null;
    assignedToId?: string | null;
    notes?: string | null;
    idempotencyKey: string;
  },
  context: any,
) {
  if (!permissions.canManageHousekeeping({ session: context.session })) {
    throw new Error('Not authorized to schedule housekeeping tasks.');
  }
  const eventKey = String(idempotencyKey || '').trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  if (!(SCHEDULABLE_HOUSEKEEPING_TASK_TYPES as readonly string[]).includes(taskType)) throw new Error('Choose a deep clean or turn-down.');
  const taskPriority = priority ?? 2;
  if (!Number.isInteger(taskPriority) || taskPriority < 1 || taskPriority > 5) throw new Error('Priority must be from 1 (highest) to 5.');
  const normalizedNotes = String(notes || '').trim();
  if (normalizedNotes.length > 2_000) throw new Error('Notes must be 2000 characters or fewer.');
  const request = { roomId, taskType, priority: taskPriority, assignedToId: assignedToId || null, notes: normalizedNotes };
  const identity = { request, aggregateType: 'housekeeping_task', aggregateId: `room:${roomId}`, action: 'scheduled' };

  let taskId = '';
  await runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${roomId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) { taskId = replay.afterSnapshot.taskId; return; }
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, floor: true } });
    if (!room) throw new Error('Room not found.');
    const open = await prisma.housekeepingTask.findFirst({ where: { roomId, taskType, status: { not: 'completed' } }, select: { id: true } });
    if (open) throw new Error('This room already has an open task of this type.');
    if (assignedToId) await assertHousekeepingStaffEligible(prisma, assignedToId, { taskType, roomId, room });
    const created = await prisma.housekeepingTask.create({
      data: {
        roomId, taskType, priority: taskPriority, status: 'pending',
        assignedToId: assignedToId || null,
        notes: normalizedNotes ? `[${new Date().toISOString()}] ${normalizedNotes}` : '',
      },
    });
    taskId = created.id;
    await recordHotelLifecycleEvent({
      prisma, eventKey, actorId: context.session.itemId, identity,
      beforeSnapshot: null,
      afterSnapshot: { taskId: created.id, roomId, taskType, priority: taskPriority, assignedToId: created.assignedToId, status: 'pending' },
    });
  });
  return context.prisma.housekeepingTask.findUnique({ where: { id: taskId } });
}
