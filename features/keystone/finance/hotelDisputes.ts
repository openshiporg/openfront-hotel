import { Prisma } from '@prisma/client';
import { permissions } from '../access';
import { assertReplayMatches, type PaymentReplayEvidence } from '../payments/settlement';
import { HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent, findHotelLifecycleReplay } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
export type VerifiedDispute = { id: string; providerPaymentId: string; amountMinor: number; currencyCode: string; status: string; reason: string; evidenceDueBy: number | null; eventCreated: number; balanceTransactions: unknown[] };
export type AnnotateHotelDisputeInput = { id: string; note: string; idempotencyKey: string };
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function parseAnnotateHotelDisputeInput(value: unknown): AnnotateHotelDisputeInput {
  const input = isRecord(value) ? value : {};
  const id = String(input.id || ''), note = String(input.note || '').trim(), idempotencyKey = String(input.idempotencyKey || '');
  if (!id || id.length > 300 || !idempotencyKey || idempotencyKey.length > 200 || !note || note.length > 4000) throw new Error('A bounded dispute ID, evidence note and idempotency key are required.');
  return { id, note, idempotencyKey };
}
async function states(prisma: any, id?: string) {
  const rows = await prisma.$queryRaw(Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent"
    WHERE "propertyKey"=${HOTEL_PROPERTY_KEY} AND "aggregateType"='payment_dispute' ${id ? Prisma.sql`AND "aggregateId"=${id}` : Prisma.empty}
    ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row: any) => row.state);
}
export async function recordVerifiedDispute(context: any, provider: any, dispute: VerifiedDispute, replay: PaymentReplayEvidence) {
  if (!dispute.id || !dispute.providerPaymentId || !Number.isSafeInteger(dispute.amountMinor) || dispute.amountMinor <= 0 || !Number.isSafeInteger(dispute.eventCreated)) throw new Error('Verified dispute identity and amount are required.');
  const id = `${provider.code}:${dispute.id}`;
  return runSerializableTransaction(context, async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, `dispute:${id}`);
    const existing = await tx.prisma.paymentEvent.findUnique({ where: { replayKey: replay.replayKey } });
    if (existing) { assertReplayMatches(existing, replay); return { success: true, duplicate: true }; }
    const payments = await tx.prisma.bookingPayment.findMany({ where: { paymentProviderId: provider.id, providerPaymentId: dispute.providerPaymentId, paymentType: { not: 'refund' }, status: 'completed' }, take: 2 });
    if (payments.length !== 1 || payments[0].currency !== dispute.currencyCode) throw new Error('Verified dispute must map to one captured payment with the same currency.');
    const payment = payments[0]; const [prior] = await states(tx.prisma, id);
    const stale = prior && (dispute.eventCreated < prior.providerEventCreated || (['won', 'lost', 'warning_closed', 'prevented'].includes(prior.status) && !['won', 'lost', 'warning_closed', 'prevented'].includes(dispute.status)));
    if (!stale) await recordHotelLifecycleEvent({ prisma: tx.prisma, eventKey: `dispute-event:${replay.replayKey}`, identity: { request: { dispute, replay }, aggregateType: 'payment_dispute', aggregateId: id, action: 'provider_updated' }, beforeSnapshot: prior || null,
      afterSnapshot: { id, sequence: (prior?.sequence || 0) + 1, paymentId: payment.id, bookingId: payment.bookingId, providerCode: provider.code,
        providerDisputeId: dispute.id, providerPaymentId: dispute.providerPaymentId, amountMinor: dispute.amountMinor, currencyCode: dispute.currencyCode,
        status: dispute.status, reason: dispute.reason, evidenceDueBy: dispute.evidenceDueBy ? new Date(dispute.evidenceDueBy * 1000).toISOString() : null,
        providerEventCreated: dispute.eventCreated, balanceTransactions: dispute.balanceTransactions, evidenceNotes: prior?.evidenceNotes || [] } });
    await tx.prisma.paymentEvent.create({ data: { ...replay, status: 'processed', processedAt: new Date(), bookingId: payment.bookingId, paymentId: payment.id, evidence: { disputeId: id, stale: Boolean(stale) } } });
    return { success: true, duplicate: false };
  });
}
export async function hotelDisputeOperations(_root: unknown, _args: unknown, context: any) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error('Dispute payment permission is required.');
  return { disputes: await states(context.prisma) };
}
export async function annotateHotelDispute(_root: unknown, args: { input: unknown }, context: any) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error('Dispute payment permission is required.');
  const { id, note, idempotencyKey: key } = parseAnnotateHotelDisputeInput(args.input);
  const eventKey = `dispute-note:${key}`; const identity = { request: { id, note, actorId: context.session.itemId }, aggregateType: 'payment_dispute', aggregateId: id, action: 'evidence_recorded' };
  return runSerializableTransaction(context, async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, `dispute:${id}`);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity); if (replay) return replay.afterSnapshot;
    const [prior] = await states(tx.prisma, id); if (!prior) throw new Error('Dispute not found.');
    const next = { ...prior, sequence: prior.sequence + 1, evidenceNotes: [...prior.evidenceNotes, { note, actorId: context.session.itemId, recordedAt: new Date().toISOString() }] };
    await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId: context.session.itemId, eventKey, identity, beforeSnapshot: prior, afterSnapshot: next });
    return next;
  });
}
