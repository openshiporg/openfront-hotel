import { permissions } from '../access';
import { requestBookingPaymentRefund as requestRefund } from '../refunds/bookingRefund';

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
  return requestRefund({
    context,
    approvalId,
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
    actorId: context.session.itemId,
  });
}
