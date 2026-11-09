'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, requireActionData, toActionResult } from '@/features/platform/lib/actionResult';

const REFUND_WORKSPACE = String.raw`
  query RefundWorkspace($status: String, $search: String, $refundSkip: Int) {
    hotelOperatorCapabilities { canManageIntegrations canManagePayments }
    hotelRefundQueue(propertyKey: "the-alder-house", status: $status, search: $search, refundSkip: $refundSkip) {
      refundIntentsTotal statusCounts
      refundIntents {
        id intentKey amountMinor currencyCode reason status attempts lastError availableAt completedAt
        booking { id confirmationNumber guestName status }
      }
    }
  }
`;
const REPLAY_REFUND = String.raw`mutation($id:ID!,$key:String!){replayRefundIntent(intentId:$id,idempotencyKey:$key){id status}}`;

/** Messages and refunds matching the status and search; each list reads its own page offset. */
export async function getRefundWorkspace(view: { status?: string; search?: string; refundSkip?: number } = {}) {
  const offset = (value: unknown) => Math.min(Math.max(Math.trunc(Number(value) || 0), 0), 100_000);
  const response = await keystoneClient<any>(REFUND_WORKSPACE, {
    status: view.status && view.status !== 'all' ? boundedEnum(view.status, 'Refund status', ['pending', 'processing', 'failed', 'dead_letter', 'completed'] as const) : null,
    search: view.search ? String(view.search).trim().slice(0, 160) : null,
    refundSkip: offset(view.refundSkip),
  });
  return requireActionData(response);
}

export async function replayRefundEvidence(idValue: string) {
  return toActionResult(async () => {
    const id = boundedId(idValue, 'Refund intent ID');
    const response = await keystoneClient<any>(REPLAY_REFUND, { id, key: randomUUID() });
    return requireActionData(response).replayRefundIntent;
  });
}
