import { permissions } from '../access';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
export const HOUSEKEEPING_TASK_TYPES = ['checkout_clean', 'stayover_clean', 'deep_clean', 'maintenance', 'inspection', 'turn_down'];
export type HousekeepingCapability = { revision: number; staffId: string; configured: boolean; allowedFloors: number[] | null; allowedRoomIds: string[] | null; taskTypes: string[]; sectionName: string };
export function validateHousekeepingCapability(value: any): Omit<HousekeepingCapability, 'revision' | 'staffId'> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['configured', 'allowedFloors', 'allowedRoomIds', 'taskTypes', 'sectionName'].includes(key))) throw new Error('Unsupported housekeeping capability fields.');
  if (typeof value.configured !== 'boolean') throw new Error('Specify whether custom dispatch restrictions apply.');
  const allowedFloors = value.allowedFloors;
  if (allowedFloors !== null && (!Array.isArray(allowedFloors) || allowedFloors.length > 500 || allowedFloors.some((floor: any) => !Number.isSafeInteger(floor) || floor < -20 || floor > 500))) throw new Error('Allowed floors must be null or a bounded list of integer floors.');
  const allowedRoomIds = value.allowedRoomIds;
  if (allowedRoomIds !== null && (!Array.isArray(allowedRoomIds) || allowedRoomIds.length > 1000 || allowedRoomIds.some((id: any) => typeof id !== 'string' || !id.trim() || id.length > 100))) throw new Error('Section rooms must be null or a bounded list of physical room IDs.');
  if (!Array.isArray(value.taskTypes) || value.taskTypes.some((type: any) => !HOUSEKEEPING_TASK_TYPES.includes(type))) throw new Error('Select supported housekeeping task skills.');
  const sectionName = String(value.sectionName || '').trim(); if (sectionName.length > 100 || (sectionName && allowedRoomIds === null)) throw new Error('A named section requires an explicit room selection.');
  return { configured: value.configured, allowedFloors: allowedFloors === null ? null : [...new Set<number>(allowedFloors)], allowedRoomIds: allowedRoomIds === null ? null : [...new Set<string>(allowedRoomIds)], taskTypes: [...new Set<string>(value.taskTypes)], sectionName };
}
export async function loadHousekeepingCapability(prisma: any, staffId: string): Promise<HousekeepingCapability | null> {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'housekeeping_staff', aggregateId: staffId } });
  return events.reduce((latest: HousekeepingCapability | null, event: any) => Number(event.afterSnapshot?.capability?.revision || 0) > Number(latest?.revision || 0) ? event.afterSnapshot.capability : latest, null);
}
export function assertHousekeepingEligibility(staff: any, capability: HousekeepingCapability | null, task: { taskType: string; roomId: string; room: { floor?: number | null } }) {
  if (!staff?.isActive || !(task.taskType === 'maintenance' ? staff.role?.canManageRooms : staff.role?.canManageHousekeeping)) throw new Error('Assign housekeeping only to active staff with the required housekeeping or room-maintenance role.');
  if (!capability?.configured) return;
  if (!capability.taskTypes.includes(task.taskType)) throw new Error('Selected staff member is not qualified for this task type.');
  if (capability.allowedFloors !== null && !capability.allowedFloors.includes(Number(task.room.floor))) throw new Error('Selected staff member is not assigned to this floor.');
  if (capability.allowedRoomIds !== null && !capability.allowedRoomIds.includes(task.roomId)) throw new Error('Selected staff member is not assigned to this room section.');
}
export async function assertHousekeepingStaffEligible(prisma: any, staffId: string, task: any) {
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-housekeeping-staff:${staffId}`);
  const staff = await prisma.user.findUnique({ where: { id: staffId }, include: { role: true } });
  assertHousekeepingEligibility(staff, await loadHousekeepingCapability(prisma, staffId), task);
}
const mayConfigure = (context: any) => permissions.canManagePeople({ session: context.session }) || permissions.canManageRoles({ session: context.session });
export async function hotelHousekeepingStaffCapabilities(_root: unknown, _args: unknown, context: any) {
  if (!mayConfigure(context) && !permissions.canManageHousekeeping({ session: context.session })) throw new Error('Not authorized to view housekeeping dispatch capabilities.');
  const staff = await context.prisma.user.findMany({ where: { isActive: true, role: { OR: [{ canManageHousekeeping: true }, { canManageRooms: true }] } }, orderBy: { name: 'asc' }, take: 500, select: { id: true, name: true } });
  const rooms = await context.prisma.room.findMany({ orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }], take: 1000, select: { id: true, roomNumber: true, floor: true } });
  const events = await context.prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'housekeeping_staff', aggregateId: { in: staff.map((person: any) => person.id) } } });
  const latest = new Map<string, HousekeepingCapability>();
  for (const event of events) { const capability = event.afterSnapshot?.capability; if (Number(capability?.revision || 0) > Number(latest.get(event.aggregateId)?.revision || 0)) latest.set(event.aggregateId, capability); }
  return JSON.stringify({ canConfigure: mayConfigure(context), staff: staff.map((person: any) => ({ ...person, capability: latest.get(person.id) || null })), rooms, taskTypes: HOUSEKEEPING_TASK_TYPES });
}
export async function updateHotelHousekeepingStaffCapability(_root: unknown, { staffId, configuration, expectedRevision, idempotencyKey }: { staffId: string; configuration: string; expectedRevision: number; idempotencyKey: string }, context: any) {
  if (!mayConfigure(context)) throw new Error('People or role management permission is required to configure staff skills and sections.');
  if (configuration.length > 100000) throw new Error('Staff capability configuration exceeds 100 KB.');
  const value = validateHousekeepingCapability(JSON.parse(configuration)); const key = String(idempotencyKey || '').trim(); if (!key || key.length > 200) throw new Error('A stable staff capability idempotency key is required.');
  const eventKey = `housekeeping-staff:${key}`, identity = { request: { staffId, value, expectedRevision }, aggregateType: 'housekeeping_staff', aggregateId: staffId, action: 'configured' };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await lockHotelLifecycle(p, eventKey); await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-housekeeping-staff:${staffId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity); if (replay) return JSON.stringify(replay.afterSnapshot.capability);
    const staff = await p.user.findUnique({ where: { id: staffId }, include: { role: true } }); if (!staff?.isActive || (!staff.role?.canManageHousekeeping && !staff.role?.canManageRooms)) throw new Error('Select active housekeeping or room-maintenance staff.');
    const previous = await loadHousekeepingCapability(p, staffId); if (expectedRevision !== (previous?.revision || 0)) throw new Error('Staff capability changed; refresh before editing.');
    if (value.allowedRoomIds && await p.room.count({ where: { id: { in: value.allowedRoomIds } } }) !== value.allowedRoomIds.length) throw new Error('A section contains an unknown physical room.');
    const capability = { ...value, staffId, revision: (previous?.revision || 0) + 1 };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: previous ? { capability: previous } : null, afterSnapshot: { capability } }); return JSON.stringify(capability);
  });
}
