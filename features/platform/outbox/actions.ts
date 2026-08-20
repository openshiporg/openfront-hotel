'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, requireActionData } from '@/features/platform/lib/actionResult';

const OUTBOX_WORKSPACE = String.raw`
  query OutboxWorkspace {
    hotelOperatorCapabilities { canManageIntegrations canManagePayments }
    hotelOutboxOperations(propertyKey: "the-alder-house") {
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
const REPLAY_OUTBOX = String.raw`mutation($id:ID!,$key:String!){replayHotelOutboxEvent(eventId:$id,idempotencyKey:$key){id eventKey status replayed}}`;
const REPLAY_REFUND = String.raw`mutation($id:ID!,$key:String!){replayRefundIntent(intentId:$id,idempotencyKey:$key){id status}}`;

export async function getOutboxWorkspace() {
  const response = await keystoneClient<any>(OUTBOX_WORKSPACE);
  return requireActionData(response);
}

export async function replayOutboxEvidence(kindValue: 'event' | 'refund', idValue: string) {
  const kind = boundedEnum(kindValue, 'Replay kind', ['event', 'refund'] as const);
  const id = boundedId(idValue, kind === 'event' ? 'Outbox event ID' : 'Refund intent ID');
  const response = await keystoneClient<any>(kind === 'event' ? REPLAY_OUTBOX : REPLAY_REFUND, {
    id,
    key: randomUUID(),
  });
  const data = requireActionData(response);
  return kind === 'event' ? data.replayHotelOutboxEvent : data.replayRefundIntent;
}
