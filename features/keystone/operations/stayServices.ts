import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export type StayService = { revision: number; id: string; bookingId: string | null; roomId: string | null; category: string; title: string; description: string; status: string; priority: string; dueAt: string | null; assignedToId: string | null; resolution: string | null; openedAt: string; updatedAt: string; closedAt: string | null };
const CATEGORIES = ['guest_request', 'incident', 'lost_found', 'wake_up', 'housekeeping_discrepancy'];
const TRANSITIONS: Record<string, string[]> = { open: ['assigned', 'in_progress', 'resolved'], assigned: ['in_progress', 'resolved'], in_progress: ['resolved'], resolved: ['in_progress', 'closed'], closed: [] };
function mayOperate(context: any) { return permissions.canManageBookings({ session: context.session }) || permissions.canManageHousekeeping({ session: context.session }); }
export async function loadStayServices(prisma: any): Promise<StayService[]> {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'stay_service' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
  const state = new Map<string, StayService>();
  for (const event of events) {
    const service = event.afterSnapshot?.service;
    if (service && Number(service.revision || 0) > Number(state.get(event.aggregateId)?.revision || 0)) state.set(event.aggregateId, service);
  }
  return [...state.values()];
}
export function transitionStayService(service: StayService, input: { status: string; expectedStatus?: string | null; resolution?: string | null; assignedToId?: string | null }, now = new Date()): StayService {
  if (input.expectedStatus && service.status !== input.expectedStatus) throw new Error('Service case changed; refresh before updating.');
  if (input.status !== service.status && !TRANSITIONS[service.status]?.includes(input.status)) throw new Error('Unsupported service case transition.');
  if (service.status === 'closed') throw new Error('Closed service history is immutable; create a follow-up case.');
  const assignedToId = input.assignedToId === undefined ? service.assignedToId : input.assignedToId;
  if (input.status === 'assigned' && !assignedToId) throw new Error('Assigned service cases require an active staff member.');
  if (String(input.resolution || '').length > 4000) throw new Error('Resolution evidence is limited to 4000 characters.');
  const resolution = String(input.resolution || service.resolution || '').trim() || null;
  if (['resolved', 'closed'].includes(input.status) && (!resolution || resolution.length < 3)) throw new Error('Record how the request was fulfilled, incident resolved or item handed over before resolution.');
  return { ...service, revision: service.revision + 1, status: input.status, assignedToId, resolution, updatedAt: now.toISOString(), closedAt: input.status === 'closed' ? now.toISOString() : null };
}
export async function getHotelStayServices(_root: unknown, { bookingId, roomId }: { bookingId?: string | null; roomId?: string | null }, context: any) {
  if (!mayOperate(context)) throw new Error('Not authorized to read hotel service cases.');
  return JSON.stringify((await loadStayServices(context.prisma)).filter(item => (!bookingId || item.bookingId === bookingId) && (!roomId || item.roomId === roomId)));
}
export async function updateHotelStayService(_root: unknown, input: { serviceId?: string | null; bookingId?: string | null; roomId?: string | null; category?: string | null; title?: string | null; description?: string | null; priority?: string | null; dueAt?: string | null; status: string; expectedStatus?: string | null; assignedToId?: string | null; resolution?: string | null; idempotencyKey: string }, context: any) {
  if (!mayOperate(context)) throw new Error('Not authorized to operate hotel service cases.');
  const eventKey = String(input.idempotencyKey || '').trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotency key is required.');
  const serviceId = input.serviceId || `service_${createHash('sha256').update(eventKey).digest('hex').slice(0, 24)}`;
  const identity = { request: input, aggregateType: 'stay_service', aggregateId: serviceId, action: input.serviceId ? 'updated' : 'opened' };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-service:${serviceId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot.service);
    if (input.assignedToId) {
      const staff = await p.user.findUnique({ where: { id: input.assignedToId }, include: { role: true } });
      if (!staff?.isActive || (!staff.role?.canManageBookings && !staff.role?.canManageHousekeeping)) throw new Error('Service assignee must be active hotel operations staff.');
    }
    const existing = (await loadStayServices(p)).find(item => item.id === serviceId);
    let service: StayService;
    const now = new Date();
    if (input.serviceId) {
      if (!existing || (input.bookingId && input.bookingId !== existing.bookingId) || (input.roomId && input.roomId !== existing.roomId)) throw new Error('Service case does not belong to the selected reservation or room.');
      service = transitionStayService(existing, input, now);
    } else {
      if (input.status !== 'open') throw new Error('New service cases must start open.');
      if (!CATEGORIES.includes(String(input.category))) throw new Error('Unsupported service category.');
      const title = String(input.title || '').trim(), description = String(input.description || '').trim(), priority = String(input.priority || 'normal');
      if (!title || title.length > 200 || description.length > 4000 || !['low', 'normal', 'urgent'].includes(priority)) throw new Error('Provide a short service title, bounded description and valid priority.');
      if (!input.bookingId && !input.roomId) throw new Error('A reservation or physical room is required.');
      let booking: any = null;
      if (input.bookingId) {
        await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${input.bookingId}`);
        booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { roomAssignments: true } });
        if (!booking) throw new Error('Reservation not found.');
        if (input.roomId && !booking.roomAssignments.some((assignment: any) => assignment.roomId === input.roomId)) throw new Error('Room does not belong to this reservation.');
      }
      const roomId = input.roomId || booking?.roomAssignments[0]?.roomId || null;
      if (roomId) {
        await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${roomId}`);
        const room = await p.room.findUnique({ where: { id: roomId } }); if (!room) throw new Error('Room not found.');
        if (input.category === 'housekeeping_discrepancy' && room.status === 'vacant') {
          await p.room.update({ where: { id: roomId }, data: { status: 'out_of_order', notes: `${room.notes || ''}\n[${now.toISOString()}] Availability withheld pending discrepancy case ${serviceId}: ${title}`.trim() } });
        }
      }
      const due = input.dueAt ? new Date(input.dueAt) : null;
      if (due && !Number.isFinite(due.getTime())) throw new Error('Service due time is invalid.');
      if (input.category === 'wake_up' && (!due || due <= now || booking?.status !== 'checked_in')) throw new Error('Wake-up requests require an in-house guest and a future due time.');
      service = { revision: 1, id: serviceId, bookingId: booking?.id || null, roomId, category: input.category!, title, description, priority, dueAt: due?.toISOString() || null, assignedToId: input.assignedToId || null, status: 'open', resolution: null, openedAt: now.toISOString(), updatedAt: now.toISOString(), closedAt: null };
    }
    if (service.category === 'incident' && ['resolved', 'closed'].includes(service.status) && !permissions.canManageBookings({ session: context.session })) throw new Error('Front-desk management must resolve incident cases.');
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: existing ? { service: existing } : null, afterSnapshot: { service }, metadata: { fulfillmentMode: 'staff_recorded', discrepancyRequiresExplicitRoomReturn: service.category === 'housekeeping_discrepancy' } });
    return JSON.stringify(service);
  });
}

export async function assertNoOpenRoomDiscrepancy(prisma: any, roomId: string) {
  if ((await loadStayServices(prisma)).some(item => item.roomId === roomId && item.category === 'housekeeping_discrepancy' && !['resolved', 'closed'].includes(item.status))) throw new Error('Resolve the housekeeping discrepancy before returning room availability.');
}
