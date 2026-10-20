'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, requireActionData, toActionResult } from '@/features/platform/lib/actionResult';

const OUTBOX_WORKSPACE = String.raw`
  query OutboxWorkspace($status: String, $search: String, $eventSkip: Int, $refundSkip: Int) {
    hotelOperatorCapabilities { canManageIntegrations canManagePayments }
    hotelOutboxOperations(propertyKey: "the-alder-house", status: $status, search: $search, eventSkip: $eventSkip, refundSkip: $refundSkip) {
      eventsTotal refundIntentsTotal statusCounts
      events {
        id eventKey topic aggregateType aggregateId status attempts availableAt deliveredAt
        deadLetteredAt lastError replayedFromEventKey
        attemptsEvidence { id attemptNumber status workerId errorMessage startedAt finishedAt }
      }
      refundIntents {
        id intentKey amountMinor currencyCode reason status attempts lastError availableAt completedAt
        booking { id confirmationNumber guestName status }
      }
    }
  }
`;
const REPLAY_OUTBOX = String.raw`mutation($id:ID!,$key:String!,$ack:Boolean!){replayHotelOutboxEvent(eventId:$id,idempotencyKey:$key,acknowledgeUnknownDelivery:$ack){id eventKey status replayed}}`;
const REPLAY_REFUND = String.raw`mutation($id:ID!,$key:String!){replayRefundIntent(intentId:$id,idempotencyKey:$key){id status}}`;

/** Messages and refunds matching the status and search; each list reads its own page offset. */
export async function getOutboxWorkspace(view: { status?: string; search?: string; eventSkip?: number; refundSkip?: number } = {}) {
  const offset = (value: unknown) => Math.min(Math.max(Math.trunc(Number(value) || 0), 0), 100_000);
  const response = await keystoneClient<any>(OUTBOX_WORKSPACE, {
    status: view.status && view.status !== 'all' ? boundedEnum(view.status, 'Delivery status', ['pending', 'processing', 'failed', 'dead_letter', 'completed'] as const) : null,
    search: view.search ? String(view.search).trim().slice(0, 160) : null,
    eventSkip: offset(view.eventSkip),
    refundSkip: offset(view.refundSkip),
  });
  return requireActionData(response);
}

export async function replayOutboxEvidence(kindValue: 'event' | 'refund', idValue: string, acknowledgeUnknownDelivery = false) {
  return toActionResult(async () => {
    const kind = boundedEnum(kindValue, 'Replay kind', ['event', 'refund'] as const);
    const id = boundedId(idValue, kind === 'event' ? 'Outbox event ID' : 'Refund intent ID');
    const variables = kind === 'event'
      ? { id, key: randomUUID(), ack: acknowledgeUnknownDelivery }
      : { id, key: randomUUID() };
    const response = await keystoneClient<any>(kind === 'event' ? REPLAY_OUTBOX : REPLAY_REFUND, variables);
    const data = requireActionData(response);
    return kind === 'event' ? data.replayHotelOutboxEvent : data.replayRefundIntent;
  });
}
