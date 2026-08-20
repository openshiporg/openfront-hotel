import { permissions } from '../access';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';

export default async function replayRefundIntent(_root: unknown, { intentId, idempotencyKey }: { intentId: string; idempotencyKey: string }, context: any) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error('Not authorized to replay refund intents.');
  }
  const key = String(idempotencyKey || '').trim(); if (!key || key.length > 200) throw new Error('A stable idempotency key is required.');
  const eventKey = `refund-intent-replay:${key}`;
  const identity = { request: { intentId }, aggregateType: 'refund_intent', aggregateId: intentId, action: 'replayed' };
  return context.transaction(async (tx: any) => {
    const prisma = tx.prisma; await lockHotelLifecycle(prisma, eventKey);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    const intent = await prisma.refundIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new Error('Refund intent not found.');
    if (replay) return intent;
    if (intent.status !== 'dead_letter') throw new Error('Only dead-letter refund intents can be replayed.');
    const updated = await prisma.refundIntent.update({ where: { id: intentId }, data: { status: 'pending', attempts: 0, availableAt: new Date(), deadLetteredAt: null, lastError: '' } });
    await recordHotelLifecycleEvent({ prisma, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { status: intent.status, attempts: intent.attempts }, afterSnapshot: { status: updated.status, attempts: updated.attempts } });
    return updated;
  }, { maxWait: 5_000, timeout: 15_000, isolationLevel: 'Serializable' });
}
