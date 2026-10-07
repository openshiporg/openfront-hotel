import { permissions } from '../access';
import { calculateFolioBalance } from '../folios/ledger';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export type Relocation = { revision: number; bookingId: string; status: string; propertyName: string; contact: string; confirmation: string; costMinor: number; guestAgreement: string; followUp: string; costEvidence: string; updatedAt: string };
export type RelocationInput = { bookingId: string; status: string; expectedRevision: number; propertyName?: string | null; contact?: string | null; confirmation?: string | null; costMinor?: number | null; guestAgreement?: string | null; followUp?: string | null; costEvidence?: string | null; idempotencyKey: string };
const next: Record<string, string[]> = { requested: ['requested', 'arranged'], arranged: ['arranged', 'transferred'], transferred: ['transferred', 'completed'], completed: [] };
export function transitionRelocation(existing: Relocation | null, input: RelocationInput): Relocation {
  if (input.expectedRevision !== (existing?.revision || 0)) throw new Error('Relocation changed; refresh before recording the next step.');
  if (!existing && input.status !== 'requested') throw new Error('Start a relocation request before recording arrangements.');
  if (existing && !next[existing.status]?.includes(input.status)) throw new Error('Unsupported relocation transition; completed evidence is immutable.');
  const value: any = { ...(existing || { bookingId: input.bookingId, propertyName: '', contact: '', confirmation: '', costMinor: 0, guestAgreement: '', followUp: '', costEvidence: '' }), revision: (existing?.revision || 0) + 1, status: input.status, updatedAt: new Date().toISOString() };
  for (const field of ['propertyName', 'contact', 'confirmation', 'guestAgreement', 'followUp', 'costEvidence'] as const) { if (input[field] !== undefined && input[field] !== null) value[field] = String(input[field]).trim(); if (value[field].length > 1000) throw new Error('Relocation evidence fields are limited to 1000 characters.'); }
  if (input.costMinor !== undefined && input.costMinor !== null) value.costMinor = input.costMinor;
  if (!Number.isSafeInteger(value.costMinor) || value.costMinor < 0 || value.costMinor > 2147483647) throw new Error('Relocation cost must be a nonnegative USD minor-unit integer.');
  if (input.status !== 'requested' && ['propertyName', 'contact', 'confirmation', 'guestAgreement'].some(field => !value[field])) throw new Error('Record receiving property, contact, confirmation and guest agreement before arranging the transfer.');
  if (input.status === 'completed' && (!value.followUp || !value.costEvidence)) throw new Error('Record guest follow-up and the cost settlement reference (or no-cost explanation) before completion.');
  return value;
}
export async function loadHotelRelocation(prisma: any, bookingId: string): Promise<Relocation | null> {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'relocation', aggregateId: bookingId } });
  return events.reduce((value: Relocation | null, event: any) => Number(event.afterSnapshot?.relocation?.revision || 0) > Number(value?.revision || 0) ? event.afterSnapshot.relocation : value, null);
}
function authorize(context: any) { if (!permissions.canManageBookings({ session: context.session })) throw new Error('Only reservation managers may operate guest relocation.'); }
export async function hotelRelocation(_root: unknown, { bookingId }: { bookingId: string }, context: any) { authorize(context); if (!await context.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } })) throw new Error('Reservation not found.'); return JSON.stringify(await loadHotelRelocation(context.prisma, bookingId)); }
export async function updateHotelRelocation(_root: unknown, input: RelocationInput, context: any) {
  authorize(context); const key = String(input.idempotencyKey || '').trim(); if (!key || key.length > 200) throw new Error('A stable relocation idempotency key is required.');
  const eventKey = `hotel-relocation:${key}`, identity = { request: input, aggregateType: 'relocation', aggregateId: input.bookingId, action: input.status };
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await lockHotelLifecycle(p, eventKey); await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${input.bookingId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity); if (replay) return JSON.stringify(replay.afterSnapshot.relocation);
    const booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { folio: { include: { entries: true } } } }); if (!booking) throw new Error('Reservation not found.');
    const previous = await loadHotelRelocation(p, input.bookingId);
    if (!previous && !['confirmed', 'checked_in'].includes(booking.status)) throw new Error('Start relocation for a confirmed or in-house guest.');
    const relocation = transitionRelocation(previous, input);
    if (relocation.status === 'completed') {
      if (!['cancelled', 'checked_out'].includes(booking.status)) throw new Error('Complete local cancellation or departure through its normal workflow before closing relocation.');
      if (await p.refundIntent.count({ where: { bookingId: booking.id, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } } })) throw new Error('Resolve local guest refund obligations before closing relocation.');
      if (!booking.billingFolioId && (!booking.folio || calculateFolioBalance(booking.folio.entries).balanceMinor !== 0)) throw new Error('Settle the local guest folio before closing relocation.');
    }
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: previous ? { relocation: previous } : null, afterSnapshot: { relocation }, metadata: { mode: 'operator_external_arrangement', externalCostIsStaffAttestation: true, localInventoryUsesNormalBookingLifecycle: true } });
    return JSON.stringify(relocation);
  });
}
