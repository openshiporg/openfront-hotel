import { permissions } from '../access';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';

type Part = { id: string; description: string; quantity: number; unitCostMinor: number; status: 'ordered' | 'received' | 'used' | 'cancelled' | 'returned' };
export type MaintenanceCommercialState = { revision: number; vendorName: string; vendorReference: string; dueAt: string | null; acknowledgedAt: string | null; legacyCostMinor: number; laborCostMinor: number; parts: Part[] };
const empty = (legacyCostMinor = 0): MaintenanceCommercialState => ({ revision: 0, vendorName: '', vendorReference: '', dueAt: null, acknowledgedAt: null, legacyCostMinor, laborCostMinor: 0, parts: [] });
function text(value: unknown, label: string, max = 500) { const result = String(value || '').trim(); if (!result || result.length > max) throw new Error(`${label} is required (maximum ${max} characters).`); return result; }
function money(value: unknown, label: string) { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2_147_483_647) throw new Error(`${label} must be a nonnegative integer amount in minor units.`); return Number(value); }
export function maintenanceCommercialCost(state: MaintenanceCommercialState) {
  const total = (state.legacyCostMinor || 0) + state.laborCostMinor + state.parts.filter(part => part.status === 'used').reduce((sum, part) => sum + part.quantity * part.unitCostMinor, 0);
  return money(total, 'Total maintenance cost');
}
export function planMaintenanceCommercial(state: MaintenanceCommercialState, command: string, input: any, now = new Date()) {
  const next = structuredClone(state);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) throw new Error('Maintenance commercial details changed. Refresh before retrying.');
  text(input.reason, 'Evidence or change reason', 1000);
  if (command === 'plan') {
    next.vendorName = text(input.vendorName, 'Vendor or internal team', 200); next.vendorReference = text(input.vendorReference, 'Reviewed work-order or vendor reference', 200);
    const dueAt = new Date(input.dueAt); if (!Number.isFinite(dueAt.getTime()) || dueAt < now) throw new Error('Choose a future repair deadline with an explicit time zone.');
    if (!/(Z|[+-]\d\d:\d\d)$/.test(String(input.dueAt))) throw new Error('Repair deadline requires an explicit time zone.');
    next.dueAt = dueAt.toISOString(); next.acknowledgedAt = null;
  } else if (command === 'acknowledge') {
    if (!next.vendorName || !next.dueAt || next.acknowledgedAt) throw new Error('An unacknowledged work order is required.'); next.acknowledgedAt = now.toISOString();
  } else if (command === 'order_part') {
    const id = text(input.partId, 'Unique part line reference', 100); if (next.parts.some(part => part.id === id)) throw new Error('Part line reference already exists.');
    if (next.parts.length >= 100) throw new Error('A work order supports at most 100 parts lines.');
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 10_000) throw new Error('Part quantity must be 1–10000 whole units.');
    const part: Part = { id, description: text(input.description, 'Part description', 200), quantity: input.quantity, unitCostMinor: money(input.unitCostMinor, 'Part unit cost'), status: 'ordered' };
    money(part.quantity * part.unitCostMinor, 'Extended part cost'); next.parts.push(part);
  } else if (command === 'part_status') {
    const part = next.parts.find(part => part.id === input.partId); if (!part) throw new Error('Part line does not belong to this work order.');
    const allowed: Record<Part['status'], string[]> = { ordered: ['received', 'cancelled'], received: ['used', 'returned'], used: [], cancelled: [], returned: [] };
    if (!allowed[part.status].includes(input.status)) throw new Error(`Part cannot transition from ${part.status} to ${input.status}.`); part.status = input.status;
  } else if (command === 'labor') next.laborCostMinor = money(input.laborCostMinor, 'Total approved labor cost');
  else throw new Error('Unsupported maintenance commercial command.');
  next.revision += 1; maintenanceCommercialCost(next); return next;
}
function authorize(context: any) { if (!permissions.canManageRooms({ session: context.session })) throw new Error('Room management permission is required for maintenance commercial records.'); }
async function load(prisma: any, requestId: string, legacyCostMinor = 0) {
  const rows = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'maintenance_commercial', aggregateId: requestId }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 501 });
  if (rows.length > 500) throw new Error('Work-order commercial history requires an archival review.');
  const latest = rows.reduce((state: MaintenanceCommercialState, row: any) => Number(row.afterSnapshot?.commercial?.revision) > state.revision ? row.afterSnapshot.commercial : state, empty(money(legacyCostMinor, 'Previously recorded maintenance cost')));
  return { commercial: latest, history: rows.map((row: any) => ({ action: row.action, occurredAt: row.occurredAt, reason: row.metadataSnapshot?.reason })) };
}
async function workspace(prisma: any, requestId: string) {
  const request = await prisma.maintenanceRequest.findUnique({ where: { id: requestId }, select: { id: true, title: true, status: true, completedAt: true, cost: true } });
  if (!request) throw new Error('Maintenance request not found.'); const details = await load(prisma, requestId, request.cost || 0);
  return { request, ...details, actualCostMinor: maintenanceCommercialCost(details.commercial), overdue: Boolean(details.commercial.dueAt && !['completed', 'verified', 'cancelled'].includes(request.status) && new Date(details.commercial.dueAt) < new Date()) };
}
export async function hotelMaintenanceCommercial(_root: unknown, { requestId }: { requestId: string }, context: any) { authorize(context); return JSON.stringify(await workspace(context.prisma, text(requestId, 'Request ID', 200))); }
export async function updateHotelMaintenanceCommercial(_root: unknown, { requestId, command, payload, idempotencyKey }: { requestId: string; command: string; payload: string; idempotencyKey: string }, context: any) {
  authorize(context); const id = text(requestId, 'Request ID', 200); const eventKey = `maintenance-commercial:${text(idempotencyKey, 'Idempotency key', 150)}`;
  if (payload.length > 20_000) throw new Error('Work-order payload is too large.'); const data = JSON.parse(payload);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('A structured work-order request is required.');
  const requestHash = hashLifecycleRequest({ requestId: id, command, data, actorId: context.session.itemId });
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await lockHotelBusinessDate(p); const request = await p.maintenanceRequest.findUnique({ where: { id } }); if (!request) throw new Error('Maintenance request not found.');
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${request.roomId}`);
    const prior = await p.hotelAuditEvent.findUnique({ where: { eventKey } });
    if (prior) { if (prior.requestHash !== requestHash) throw new Error('Work-order idempotency key was reused with different evidence.'); return JSON.stringify(await workspace(p, id)); }
    if (request.status === 'cancelled') throw new Error('Cancelled work orders cannot receive commercial changes.');
    const { commercial: previous } = await load(p, id, request.cost || 0); const next = planMaintenanceCommercial(previous, command, data);
    await p.maintenanceRequest.update({ where: { id }, data: { cost: maintenanceCommercialCost(next), ...(command === 'plan' ? { scheduledFor: new Date(next.dueAt!) } : {}) } });
    await p.hotelAuditEvent.create({ data: { eventKey, requestHash, propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'maintenance_commercial', aggregateId: id, action: command, actorId: context.session.itemId, beforeSnapshot: { commercial: previous }, afterSnapshot: { commercial: next }, metadataSnapshot: { reason: data.reason }, occurredAt: new Date() } });
    return JSON.stringify(await workspace(p, id));
  });
}
export const maintenanceCommercialTypeDefs = String.raw`
  extend type Query { hotelMaintenanceCommercial(requestId:ID!):String! }
  extend type Mutation { updateHotelMaintenanceCommercial(requestId:ID!,command:String!,payload:String!,idempotencyKey:String!):String! }
`;
export const maintenanceCommercialResolvers = { Query: { hotelMaintenanceCommercial }, Mutation: { updateHotelMaintenanceCommercial } };
