import { createHash } from 'node:crypto';

import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

const CATEGORIES = new Set(['plumbing', 'electrical', 'hvac', 'furniture', 'appliance', 'structural', 'cleaning', 'other']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'emergency']);

export default async function reportRoomMaintenanceIssue(
  root: unknown,
  {
    roomId,
    title,
    description,
    category = 'other',
    priority = 'medium',
    idempotencyKey,
  }: {
    roomId: string;
    title: string;
    description?: string | null;
    category?: string;
    priority?: string;
    idempotencyKey: string;
  },
  context: any
) {
  const canReport =
    permissions.canManageHousekeeping({ session: context.session }) ||
    permissions.canManageRooms({ session: context.session });
  if (!canReport) throw new Error('Not authorized to report maintenance issues.');
  const normalizedTitle = title.trim();
  const normalizedDescription = description?.trim() || null;
  if (!normalizedTitle || normalizedTitle.length > 200) throw new Error('Title must contain between 1 and 200 characters.');
  if (!CATEGORIES.has(category)) throw new Error('Unsupported maintenance category.');
  if (!PRIORITIES.has(priority)) throw new Error('Unsupported maintenance priority.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  const requestId = `maintenance_${createHash('sha256').update(eventKey).digest('hex').slice(0, 24)}`;
  const request = { roomId, title: normalizedTitle, description: normalizedDescription, category, priority };
  const identity = {
    request,
    aggregateType: 'maintenance_request',
    aggregateId: requestId,
    action: 'reported',
  };

  await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${roomId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room?.roomTypeId) throw new Error('Room or required room type not found.');
    const now = new Date();
    const maintenance = await prisma.maintenanceRequest.create({
      data: {
        id: requestId,
        roomId,
        title: normalizedTitle,
        description: normalizedDescription || `Reported from room operations for room ${room.roomNumber}`,
        category,
        priority,
        status: 'reported',
        reportedById: context.session.itemId,
        notes: `Created from controlled room operations at ${now.toISOString()}`,
      },
    });
    const roomStatus = priority === 'emergency' ? 'out_of_order' : 'maintenance';
    await prisma.room.update({
      where: { id: roomId },
      data: {
        status: roomStatus,
        notes: [room.notes, `[${now.toISOString()}] Maintenance reported: ${normalizedTitle}`]
          .filter(Boolean)
          .join('\n'),
      },
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      afterSnapshot: {
        id: maintenance.id,
        roomId,
        status: maintenance.status,
        priority: maintenance.priority,
        roomStatus,
      },
      metadata: { roomTypeId: room.roomTypeId },
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });

  return context.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
}
