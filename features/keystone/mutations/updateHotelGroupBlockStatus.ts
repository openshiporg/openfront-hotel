import { permissions } from '../access';
import { rejectDisabledGroupOperation } from '../lib/boundedLaunch';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

const TRANSITIONS: Record<string, Set<string>> = {
  tentative: new Set(['definite', 'released', 'cancelled']),
  definite: new Set(['released', 'cancelled']),
  released: new Set(),
  cancelled: new Set(),
};

export default async function updateHotelGroupBlockStatus(
  _root: unknown,
  { groupBlockId, status, idempotencyKey }: { groupBlockId: string; status: string; idempotencyKey: string },
  context: any,
) {
  rejectDisabledGroupOperation();
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to change group block status.');
  }
  const key = String(idempotencyKey || '').trim();
  if (!key || key.length > 200) throw new Error('A stable idempotency key is required.');
  if (!TRANSITIONS[status]) throw new Error('Unsupported group block status.');
  const eventKey = `group-block:status:${key}`;
  const identity = {
    request: { groupBlockId, status },
    aggregateType: 'group_block',
    aggregateId: groupBlockId,
    action: 'status_changed',
  };

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${groupBlockId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      return prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { allocations: { include: { roomType: true } }, masterFolio: true } });
    }
    const block = await prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { allocations: true, masterFolio: true } });
    if (!block) throw new Error('Group block not found.');
    if (!TRANSITIONS[block.status]?.has(status)) throw new Error(`Group block cannot transition from ${block.status} to ${status}.`);
    if (status === 'cancelled' && block.allocations.some((allocation: any) => allocation.roomsPickedUp > 0)) {
      throw new Error('Picked-up group rooms must be released from their reservations before cancellation.');
    }
    const updated = await prisma.groupBlock.update({
      where: { id: block.id },
      data: { status },
      include: { allocations: { include: { roomType: true } }, masterFolio: true },
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: block.status },
      afterSnapshot: { status: updated.status, releasedRooms: status === 'released' },
    });
    return updated;
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
}
