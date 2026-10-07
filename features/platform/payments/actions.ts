'use server';


import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedId, boundedInteger, boundedText, requireActionData } from '@/features/platform/lib/actionResult';

const PAYMENTS_WORKSPACE = String.raw`
  query GetPaymentsDashboard {
    hotelPaymentOperations(propertyKey: "the-alder-house") {
      summary { capturedAmount refundedAmount completedCount refundedCount failedCount }
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

export async function getPaymentsWorkspace() {
  const response = await keystoneClient<any>(PAYMENTS_WORKSPACE);
  return requireActionData(response).hotelPaymentOperations;
}

export async function getRefundQuoteAction(paymentId: string) {
  const response = await keystoneClient<any>(REFUND_QUOTE, { paymentId: boundedId(paymentId, 'Payment ID') });
  return requireActionData(response).hotelRefundQuote;
}

export async function requestPaymentRefundAction(input: {
  approvalId?: string; idempotencyKey: string; paymentId: string; amountMinor: number; reason: string;
}) {
  const response = await keystoneClient<any>(REQUEST_REFUND, {
    paymentId: boundedId(input.paymentId, 'Payment ID'),
    amountMinor: boundedInteger(input.amountMinor, 'Refund amount', { min: 1 }),
    reason: boundedText(input.reason, 'Refund reason', 500, true),
    key: boundedText(input.idempotencyKey, 'Attempt key', 100, true),
    approvalId: input.approvalId?.trim() ? boundedId(input.approvalId, 'Approval ID') : null,
  });
  return requireActionData(response).requestBookingPaymentRefund;
}
