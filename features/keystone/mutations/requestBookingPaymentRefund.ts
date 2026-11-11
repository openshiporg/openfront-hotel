import { permissions } from '../access';
import { requestBookingPaymentRefund as requestRefund } from '../refunds/bookingRefund';
import { dispatchRefundIntentBatch } from '../refunds/refundIntentWorker';

export default async function requestBookingPaymentRefund(
  _root: unknown,
  {
    approvalId,
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
  }: {
    approvalId?: string | null;
    paymentId: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
  },
  context: any,
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error('Not authorized to refund booking payments.');
  }
  const result = await requestRefund({
    context,
    approvalId,
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
    actorId: context.session.itemId,
  });
  // No background sender: the refund goes to the provider on this request; the Refund queue Refresh retries any that fail.
  await dispatchRefundIntentBatch(context, { workerId: 'request-refund', limit: 10 }).catch(() => undefined);
  return result;
}
