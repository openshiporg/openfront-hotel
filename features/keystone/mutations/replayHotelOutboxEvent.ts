import { permissions } from '../access';
import { replayHotelDeadLetter } from '../communications/outbox';
import {
  HOTEL_PROPERTY_KEY,
  hashLifecycleRequest,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

export default async function replayHotelOutboxEvent(
  _root: unknown,
  { eventId, idempotencyKey, acknowledgeUnknownDelivery = false }: { eventId: string; idempotencyKey: string; acknowledgeUnknownDelivery?: boolean | null },
  context: any,
) {
  if (!permissions.canManageIntegrations({ session: context.session })) {
    throw new Error('Not authorized to replay hotel outbox events.');
  }
  const key = String(idempotencyKey || '').trim();
  if (!key || key.length > 200) throw new Error('A stable replay idempotency key is required.');

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, `hotel-outbox-replay:${key}`);
    const auditEventKey = `hotel-outbox-replay:${key}`;
    const request = { eventId, idempotencyKey: key, acknowledgeUnknownDelivery: acknowledgeUnknownDelivery === true };
    const existingAudit = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: auditEventKey } });
    if (existingAudit && existingAudit.requestHash !== hashLifecycleRequest(request)) {
      throw new Error('Outbox replay key is already bound to different evidence.');
    }
    const result = await replayHotelDeadLetter(prisma, {
      propertyKey: HOTEL_PROPERTY_KEY,
      eventId,
      idempotencyKey: key,
      acknowledgeUnknownDelivery: acknowledgeUnknownDelivery === true,
    });
    if (!existingAudit) {
      await recordHotelLifecycleEvent({
        prisma,
        eventKey: auditEventKey,
        actorId: context.session.itemId,
        identity: {
          request,
          aggregateType: 'outbox_event',
          aggregateId: eventId,
          action: 'replayed',
        },
        beforeSnapshot: { sourceEventId: eventId },
        afterSnapshot: {
          replayEventId: result.event.id,
          replayEventKey: result.event.eventKey,
          replayed: result.replayed,
        },
        metadata: { acknowledgeUnknownDelivery: acknowledgeUnknownDelivery === true },
      });
    }
    return {
      id: result.event.id,
      eventKey: result.event.eventKey,
      status: result.event.status,
      replayed: result.replayed,
    };
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
}
