'use server';


import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, boundedInteger, boundedText, requireActionData, toActionResult } from '@/features/platform/lib/actionResult';

const PAYMENTS_WORKSPACE = String.raw`
  query GetPaymentsDashboard($search: String, $status: String, $sort: String, $take: Int, $skip: Int) {
    hotelPaymentOperations(propertyKey: "the-alder-house", search: $search, status: $status, sort: $sort, take: $take, skip: $skip) {
      total
      summary { capturedAmount refundedAmount completedCount refundedCount failedCount pendingCount }
      payments {
        id paymentReference amount amountMinor currency paymentType paymentMethod status createdAt
        booking { id confirmationNumber guestName }
        paymentProvider { id name code }
      }
    }
  }
`;
const REFUND_QUOTE = String.raw`query($paymentId:ID!){hotelRefundQuote(propertyKey:"the-alder-house",paymentId:$paymentId){refundableMinor currencyCode}}`;
const REQUEST_REFUND = String.raw`
  mutation($paymentId:ID!,$amountMinor:Int!,$reason:String!,$key:String!,$approvalId:ID){
    requestBookingPaymentRefund(paymentId:$paymentId,amountMinor:$amountMinor,reason:$reason,idempotencyKey:$key,approvalId:$approvalId){
      status paymentId intentId amountMinor
    }
  }
`;

/** One page of payment records for the given search, status and sort; totals cover all records. */
export async function getPaymentsWorkspace(view: { search?: string; status?: string; sort?: string; skip?: number } = {}) {
  const response = await keystoneClient<any>(PAYMENTS_WORKSPACE, {
    search: view.search ? boundedText(view.search, 'Search', 160) : null,
    status: view.status && view.status !== 'all' ? boundedEnum(view.status, 'Payment status', ['completed', 'pending', 'failed', 'refunded', 'processing', 'cancelled'] as const) : null,
    sort: view.sort === 'amount' ? 'amount' : null,
    take: 50,
    skip: Math.min(Math.max(Math.trunc(Number(view.skip) || 0), 0), 100_000),
  });
  return requireActionData(response).hotelPaymentOperations;
}

export async function getRefundQuoteAction(paymentId: string) {
  return toActionResult(async () => {
    const response = await keystoneClient<any>(REFUND_QUOTE, { paymentId: boundedId(paymentId, 'Payment ID') });
    return requireActionData(response).hotelRefundQuote;
  });
}

export async function requestPaymentRefundAction(input: {
  approvalId?: string; idempotencyKey: string; paymentId: string; amountMinor: number; reason: string;
}) {
  return toActionResult(async () => {
    const response = await keystoneClient<any>(REQUEST_REFUND, {
      paymentId: boundedId(input.paymentId, 'Payment ID'),
      amountMinor: boundedInteger(input.amountMinor, 'Refund amount', { min: 1 }),
      reason: boundedText(input.reason, 'Refund reason', 500, true),
      key: boundedText(input.idempotencyKey, 'Attempt key', 100, true),
      approvalId: input.approvalId?.trim() ? boundedId(input.approvalId, 'Approval ID') : null,
    });
    return requireActionData(response).requestBookingPaymentRefund;
  });
}
