import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

function inspectionMarker(requestId: string) {
  return `[maintenance-request:${requestId}]`;
}

const TRANSITIONS: Record<string, Set<string>> = {
  reported: new Set(['assigned', 'in_progress', 'cancelled']),
  assigned: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['completed', 'cancelled']),
  completed: new Set(['verified']),
  verified: new Set(),
  cancelled: new Set(),
};

export default async function updateMaintenanceRequestStatus(
  root: unknown,
  {
    requestId,
    status,
    notes,
    idempotencyKey,
  }: { requestId: string; status: string; notes?: string | null; idempotencyKey: string },
  context: any
) {
  const canManage =
    permissions.canManageRooms({ session: context.session }) ||
    permissions.canManageHousekeeping({ session: context.session });
  if (!canManage) throw new Error('Not authorized to update maintenance requests.');
  if (!TRANSITIONS[status]) throw new Error('Unsupported maintenance status.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  const normalizedNotes = notes?.trim() || null;
  const requestIntent = { requestId, status, notes: normalizedNotes };
  const identity = {
    request: requestIntent,
    aggregateType: 'maintenance_request',
    aggregateId: requestId,
    action: 'status_changed',
  };

  await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const maintenance = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { room: true },
    });
    if (!maintenance?.roomId || !maintenance.room) throw new Error('Maintenance request or room not found.');
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${maintenance.roomId}`);
    if (maintenance.status === status) throw new Error(`Maintenance request is already ${status}.`);
    if (!TRANSITIONS[maintenance.status]?.has(status)) {
      throw new Error(`Maintenance status cannot transition from ${maintenance.status} to ${status}.`);
    }
    let verificationInspectionId: string | null = null;
    if (status === 'verified') {
      const marker = inspectionMarker(maintenance.id);
      let completedInspection = await prisma.housekeepingTask.findFirst({
        where: { roomId: maintenance.roomId, taskType: 'inspection', status: 'completed', notes: { contains: marker } },
      });
      if (!completedInspection) {
        const legacyInspection = await prisma.housekeepingTask.findFirst({
          where: {
            roomId: maintenance.roomId,
            taskType: 'inspection',
            status: 'completed',
            notes: { contains: `Inspect room after maintenance: ${maintenance.title}` },
            NOT: { notes: { contains: '[maintenance-request:' } },
          },
          orderBy: { completedAt: 'desc' },
        });
        if (legacyInspection) {
          completedInspection = await prisma.housekeepingTask.update({
            where: { id: legacyInspection.id },
            data: { notes: `${legacyInspection.notes || ''}\n${marker}`.trim() },
          });
        }
      }
      if (!completedInspection) throw new Error('Complete the request-linked post-maintenance inspection before verification.');
      verificationInspectionId = completedInspection.id;
    }

    const now = new Date();
    const nextNotes = [
      maintenance.notes,
      `[${now.toISOString()}] Status changed to ${status.replaceAll('_', ' ')}`,
      normalizedNotes,
    ].filter(Boolean).join('\n');
    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status,
        notes: nextNotes,
        assignedToId: ['assigned', 'in_progress'].includes(status)
          ? maintenance.assignedToId || context.session.itemId
          : maintenance.assignedToId,
        completedAt: status === 'completed' ? maintenance.completedAt || now : maintenance.completedAt,
      },
    });

    let roomStatus = maintenance.room.status;
    if (['assigned', 'in_progress'].includes(status)) roomStatus = 'maintenance';
    if (status === 'completed') roomStatus = 'cleaning';
    if (status === 'verified') {
      const [otherMaintenance, openTasks] = await Promise.all([
        prisma.maintenanceRequest.findMany({
          where: { roomId: maintenance.roomId, id: { not: maintenance.id }, status: { notIn: ['verified', 'cancelled'] } },
          select: { status: true },
        }),
        prisma.housekeepingTask.count({ where: { roomId: maintenance.roomId, status: { not: 'completed' } } }),
      ]);
      const maintenanceInProgress = otherMaintenance.some((item: any) => ['reported', 'assigned', 'in_progress'].includes(item.status));
      roomStatus = maintenanceInProgress ? 'maintenance' : (otherMaintenance.length || openTasks) ? 'cleaning' : 'vacant';
    }
    if (roomStatus !== maintenance.room.status || status === 'verified') {
      await prisma.room.update({
        where: { id: maintenance.roomId },
        data: {
          status: roomStatus,
          ...(status === 'verified' && roomStatus === 'vacant' ? { lastCleaned: now } : {}),
        },
      });
    }
    if (status === 'completed') {
      const marker = inspectionMarker(maintenance.id);
      const existingInspection = await prisma.housekeepingTask.findFirst({
        where: {
          roomId: maintenance.roomId,
          taskType: 'inspection',
          status: { in: ['pending', 'in_progress', 'inspection_needed', 'on_hold'] },
          notes: { contains: marker },
        },
      });
      if (!existingInspection) {
        await prisma.housekeepingTask.create({
          data: {
            roomId: maintenance.roomId,
            taskType: 'inspection',
            status: 'inspection_needed',
            priority: 1,
            notes: `${marker} Inspect room after maintenance: ${maintenance.title}`,
          },
        });
      }
    }

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: {
        status: maintenance.status,
        assignedToId: maintenance.assignedToId,
        notes: maintenance.notes,
        roomStatus: maintenance.room.status,
      },
      afterSnapshot: {
        status: updated.status,
        assignedToId: updated.assignedToId,
        notes: updated.notes,
        roomStatus,
        verificationInspectionId,
      },
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });

  return context.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
}
