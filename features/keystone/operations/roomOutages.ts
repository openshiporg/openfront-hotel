import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { lockRoomInventory } from '../inventory/roomNightLocks';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';

export type RoomOutage = { revision: number; id: string; roomId: string; roomTypeId: string; startDate: string; endDate: string; reason: string; status: 'scheduled' | 'cancelled' };
export async function loadRoomOutages(prisma: any): Promise<RoomOutage[]> {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'room_outage' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
  const latest = new Map<string, RoomOutage>();
  for (const event of events) {
    const outage = event.afterSnapshot?.outage;
    if (outage && Number(outage.revision || 0) > Number(latest.get(event.aggregateId)?.revision || 0)) latest.set(event.aggregateId, outage);
  }
  return [...latest.values()];
}
export function roomOutageOverlaps(outage: RoomOutage, roomId: string, start: Date, end: Date) {
  return outage.status === 'scheduled' && outage.roomId === roomId && new Date(outage.startDate) < end && new Date(outage.endDate) > start;
}
export async function assertRoomNotOutOfOrder(prisma: any, roomId: string, start: Date, end: Date) {
  if ((await loadRoomOutages(prisma)).some(outage => roomOutageOverlaps(outage, roomId, start, end))) throw new Error('Physical room has a scheduled out-of-order interval during this stay.');
}
export async function getHotelRoomOutages(_root: unknown, _args: unknown, context: any) {
  if (!permissions.canManageRooms({ session: context.session }) && !permissions.canManageHousekeeping({ session: context.session })) throw new Error('Not authorized to read room outages.');
  return JSON.stringify(await loadRoomOutages(context.prisma));
}
export async function updateHotelRoomOutage(_root: unknown, input: { roomId: string; outageId?: string | null; startDate?: string | null; endDate?: string | null; reason: string; action: string; idempotencyKey: string }, context: any) {
  if (!permissions.canManageRooms({ session: context.session })) throw new Error('Only room managers may schedule or cancel room outages.');
  const reason = String(input.reason || '').trim();
  const eventKey = String(input.idempotencyKey || '').trim();
  if (!reason || reason.length > 1000 || !eventKey || eventKey.length > 200) throw new Error('A reason and stable idempotency key are required.');
  if (!['schedule', 'cancel'].includes(input.action)) throw new Error('Unsupported outage command.');
  const outageId = input.action === 'schedule' ? `outage_${createHash('sha256').update(eventKey).digest('hex').slice(0, 24)}` : String(input.outageId || '');
  const identity = { request: input, aggregateType: 'room_outage', aggregateId: outageId, action: input.action };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await lockHotelBusinessDate(p);
    if (await findHotelLifecycleReplay(p, eventKey, identity)) return JSON.stringify(await loadRoomOutages(p));
    const room = await p.room.findUnique({ where: { id: input.roomId } });
    if (!room?.roomTypeId) throw new Error('Physical room not found.');
    let outage: RoomOutage;
    const existing = await loadRoomOutages(p);
    if (input.action === 'schedule') {
      const start = new Date(String(input.startDate || '')), end = new Date(String(input.endDate || ''));
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || (end.getTime() - start.getTime()) / 86400000 > 366) throw new Error('Outage dates must be a valid range of at most 366 nights.');
      if (start.getUTCHours() || start.getUTCMinutes() || start.getUTCSeconds() || start.getUTCMilliseconds() || end.getUTCHours() || end.getUTCMinutes() || end.getUTCSeconds() || end.getUTCMilliseconds()) throw new Error('Outage dates must be property calendar dates at midnight UTC.');
      await lockRoomInventory(p, room.roomTypeId, start, end);
      await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${room.id}`);
      const conflicting = await p.roomAssignment.findFirst({ where: { roomId: room.id, booking: { OR: [{ status: { in: ['confirmed', 'checked_in', 'cancellation_pending'] } }, { status: 'pending', holdExpiresAt: { gt: new Date() } }], checkInDate: { lt: end }, checkOutDate: { gt: start } } } });
      if (conflicting) throw new Error('Move or amend reservations assigned to this room before scheduling an overlapping outage.');
      if (existing.some(item => roomOutageOverlaps(item, room.id, start, end))) throw new Error('This room already has an overlapping outage.');
      // Type-level bookings may be unassigned. Do not remove capacity that has
      // already been sold even when this particular room has no assignment.
      const bookings = await p.booking.findMany({ where: { OR: [{ status: { in: ['confirmed', 'checked_in', 'cancellation_pending'] } }, { status: 'pending', holdExpiresAt: { gt: new Date() } }], checkInDate: { lt: end }, checkOutDate: { gt: start }, roomAssignments: { some: { roomTypeId: room.roomTypeId } } }, include: { roomAssignments: true } });
      const rooms = await p.room.findMany({ where: { roomTypeId: room.roomTypeId } });
      const repairs = await p.maintenanceRequest.findMany({ where: { room: { roomTypeId: room.roomTypeId }, status: { notIn: ['verified', 'cancelled'] } }, select: { roomId: true } });
      const repairRoomIds = new Set(repairs.map((repair: any) => repair.roomId));
      const inventories = await p.roomInventory.findMany({ where: { roomTypeId: room.roomTypeId, date: { gte: start, lt: end } } });
      const allocations = await p.groupBlockAllocation.findMany({ where: { roomTypeId: room.roomTypeId, groupBlock: { status: { in: ['tentative', 'definite'] }, arrivalDate: { lt: end }, departureDate: { gt: start }, OR: [{ releaseDate: null }, { releaseDate: { gt: new Date() } }] } }, include: { groupBlock: true } });
      for (let day = new Date(start); day < end; day = new Date(day.getTime() + 86400000)) {
        const next = new Date(day.getTime() + 86400000);
        const capacity = rooms.filter((candidate: any) => candidate.id !== room.id && !repairRoomIds.has(candidate.id) && !['maintenance', 'out_of_order'].includes(candidate.status) && !existing.some(item => roomOutageOverlaps(item, candidate.id, day, next))).length;
        const sold = bookings.filter((booking: any) => booking.checkInDate < next && booking.checkOutDate > day).reduce((sum: number, booking: any) => sum + booking.roomAssignments.filter((a: any) => a.roomTypeId === room.roomTypeId).length, 0);
        const inventory = inventories.find((item: any) => new Date(item.date).toISOString().slice(0, 10) === day.toISOString().slice(0, 10));
        const contracted = allocations.filter((item: any) => item.groupBlock.arrivalDate < next && item.groupBlock.departureDate > day).reduce((sum: number, item: any) => sum + Math.max(0, item.roomsHeld - item.roomsPickedUp), 0);
        const inventoryCapacity = inventory ? Math.max(0, Math.min(rooms.length, inventory.totalRooms) - Math.max(inventory.blockedRooms, rooms.length - capacity)) : capacity;
        if (Math.max(sold, Number(inventory?.bookedRooms || 0)) + contracted > inventoryCapacity) throw new Error(`Outage would remove sold room capacity on ${day.toISOString().slice(0, 10)}.`);
      }
      outage = { revision: 1, id: outageId, roomId: room.id, roomTypeId: room.roomTypeId, startDate: start.toISOString(), endDate: end.toISOString(), reason, status: 'scheduled' };
    } else {
      const found = existing.find(item => item.id === outageId && item.roomId === room.id);
      if (!found || found.status !== 'scheduled') throw new Error('Active outage does not belong to this room.');
      await lockRoomInventory(p, room.roomTypeId, new Date(found.startDate), new Date(found.endDate));
      await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${room.id}`);
      const [maintenance, tasks] = await Promise.all([p.maintenanceRequest.count({ where: { roomId: room.id, status: { notIn: ['verified', 'cancelled'] } } }), p.housekeepingTask.count({ where: { roomId: room.id, status: { not: 'completed' } } })]);
      if (maintenance || tasks) throw new Error('Resolve maintenance and housekeeping before returning outage capacity.');
      outage = { ...found, revision: found.revision + 1, status: 'cancelled', reason };
    }
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: existing.find(item => item.id === outageId) || null, afterSnapshot: { outage } });
    return JSON.stringify((await loadRoomOutages(p)));
  });
}
