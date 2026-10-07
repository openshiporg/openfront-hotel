import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

type Occupant = { id: string; name: string; registeredAt: string; departedAt?: string };
type Key = { reference: string; occupantId: string; roomId: string; issuedAt: string; returnedAt?: string; retiredAt?: string; retirementReason?: string };
export type StayRegister = { revision?: number; occupants: Occupant[]; keys: Key[] };

export function applyStayRegisterCommand(state: StayRegister, input: { action: string; name?: string | null; occupantId?: string | null; keyReference?: string | null }, booking: any, eventKey: string, now = new Date()): StayRegister {
  const next: StayRegister = JSON.parse(JSON.stringify(state));
  next.revision = Number(state.revision || 0) + 1;
  const at = now.toISOString();
  if (input.action === 'add_occupant') {
    const name = String(input.name || '').trim();
    if (!name || name.length > 200) throw new Error('Occupant name must contain 1–200 characters.');
    if (next.occupants.filter(item => !item.departedAt).length >= booking.numberOfGuests) throw new Error('Registered occupants cannot exceed the booked guest count.');
    next.occupants.push({ id: createHash('sha256').update(eventKey).digest('hex').slice(0, 24), name, registeredAt: at });
  } else if (input.action === 'remove_occupant') {
    const occupant = next.occupants.find(item => item.id === input.occupantId && !item.departedAt);
    if (!occupant) throw new Error('Active occupant does not belong to this stay.');
    if (next.keys.some(key => key.occupantId === occupant.id && !key.returnedAt && !key.retiredAt)) throw new Error('Return the occupant’s keys before recording departure.');
    occupant.departedAt = at;
  } else if (input.action === 'issue_key') {
    if (booking.status !== 'checked_in' || !booking.roomAssignments[0]?.roomId) throw new Error('Keys can be issued only for an assigned in-house stay.');
    if (!next.occupants.some(item => item.id === input.occupantId && !item.departedAt)) throw new Error('Key holder must be an active registered occupant of this stay.');
    const reference = String(input.keyReference || '').trim();
    if (!reference || reference.length > 80) throw new Error('Manual key reference must contain 1–80 characters; never store door codes.');
    if (next.keys.some(key => key.reference === reference && !key.returnedAt && !key.retiredAt)) throw new Error('That key is already issued.');
    next.keys.push({ reference, occupantId: input.occupantId!, roomId: booking.roomAssignments[0].roomId, issuedAt: at });
  } else if (input.action === 'retire_key') {
    const key = next.keys.find(item => item.reference === input.keyReference && !item.returnedAt && !item.retiredAt);
    if (!key) throw new Error('Outstanding key does not belong to this stay.');
    const reason = String(input.name || '').trim();
    if (!reason || reason.length > 200) throw new Error('Record a 1–200 character reason for the lost or retired key.');
    key.retiredAt = at; key.retirementReason = reason;
  } else if (input.action === 'return_key') {
    const key = next.keys.find(item => item.reference === input.keyReference && !item.returnedAt && !item.retiredAt);
    if (!key) throw new Error('Outstanding key does not belong to this stay.');
    key.returnedAt = at;
  } else throw new Error('Unsupported stay-register command.');
  return next;
}

export async function loadStayRegister(prisma: any, bookingId: string): Promise<StayRegister> {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'stay_register', aggregateId: bookingId } });
  const registers = events.map((event: any) => event.afterSnapshot?.register).filter(Boolean).sort((a: any, b: any) => Number(b.revision || 0) - Number(a.revision || 0));
  return registers[0] || { revision: 0, occupants: [], keys: [] };
}

export async function assertNoOutstandingStayKeys(prisma: any, bookingId: string) {
  const register = await loadStayRegister(prisma, bookingId);
  if (register.keys.some(key => !key.returnedAt && !key.retiredAt)) throw new Error('Record return of all issued manual keys before room move or checkout.');
}

export async function getHotelStayRegister(_root: unknown, { bookingId }: { bookingId: string }, context: any) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error('Not authorized to read stay registration.');
  const booking = await context.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
  if (!booking) throw new Error('Booking not found.');
  const events = await context.prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'booking', aggregateId: bookingId, action: 'room_assigned' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
  return JSON.stringify({ ...await loadStayRegister(context.prisma, bookingId), roomMoves: events.map((event: any) => ({ fromRoomId: event.beforeSnapshot?.roomId || null, toRoomId: event.afterSnapshot?.roomId, effectiveAt: event.afterSnapshot?.effectiveAt || event.occurredAt })) });
}

export async function updateHotelStayRegister(_root: unknown, input: { bookingId: string; action: string; name?: string | null; occupantId?: string | null; keyReference?: string | null; idempotencyKey: string }, context: any) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error('Not authorized to update stay registration.');
  const eventKey = String(input.idempotencyKey || '').trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotency key is required.');
  const identity = { request: input, aggregateType: 'stay_register', aggregateId: input.bookingId, action: input.action };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${input.bookingId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot.register);
    const booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { roomAssignments: true } });
    if (!booking || !['confirmed', 'checked_in'].includes(booking.status)) throw new Error('Registration requires a confirmed or in-house reservation.');
    const before = await loadStayRegister(p, booking.id);
    const register = applyStayRegisterCommand(before, input, booking, eventKey);
    if (input.action === 'retire_key') {
      const key = register.keys.find((item, index) => item.reference === input.keyReference && item.retiredAt && !before.keys[index]?.retiredAt);
      if (!key) throw new Error('Retired key evidence is missing.');
      await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${key.roomId}`);
      await p.maintenanceRequest.create({ data: { roomId: key.roomId, title: `Replace or rekey lock after lost key ${key.reference}`, description: key.retirementReason, category: 'other', priority: 'high', status: 'reported', reportedById: context.session.itemId, notes: `Manual key retirement ${eventKey}; physical access must be secured and inspected.` } });
      const room = await p.room.findUnique({ where: { id: key.roomId } });
      if (room && room.status !== 'occupied') await p.room.update({ where: { id: key.roomId }, data: { status: 'out_of_order' } });
    }
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { register: before }, afterSnapshot: { register }, metadata: { manualAccountabilityOnly: true } });
    return JSON.stringify(register);
  });
}
