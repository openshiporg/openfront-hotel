import { permissions } from '../access';
import { recordOperatorBookingPayment } from '../folios/commands';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

export default async function recordBookingPayment(
  root: unknown,
  {
    bookingId,
    postingKey,
    amountMinor,
    currencyCode,
    paymentMethod,
    description,
  }: {
    bookingId: string;
    postingKey: string;
    amountMinor: number;
    currencyCode: string;
    paymentMethod: string;
    description: string;
  },
  context: any
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error('Not authorized to record booking payments.');
  }
  await ensureDefaultPaymentProviders(context);
  return recordOperatorBookingPayment({
    context,
    bookingId,
    postingKey,
    amountMinor,
    currencyCode,
    paymentMethod,
    description,
  });
}
