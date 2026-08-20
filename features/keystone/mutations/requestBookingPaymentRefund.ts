import { permissions } from '../access';
import { requestBookingPaymentRefund as requestRefund } from '../lib/bookingRefund';

export default async function requestBookingPaymentRefund(
  _root: unknown,
  {
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
  }: {
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
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
    actorId: context.session.itemId,
  });
}
