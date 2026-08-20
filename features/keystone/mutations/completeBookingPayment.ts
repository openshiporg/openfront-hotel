import { completePayment } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { assertCustomerPaymentProvider } from '../lib/paymentSecurity';
import { finalizeBookingPayment } from '../lib/bookingPaymentSettlement';

const PAYMENT_QUERY = `
  id
  status
  amount
  providerPaymentId
  stripePaymentIntentId
  paymentProvider { id code name metadata }
`;

async function completeBookingPayment(
  root: unknown,
  {
    bookingId,
    paymentSessionId,
    providerPaymentId,
  }: {
    bookingId: string;
    paymentSessionId: string;
    providerPaymentId?: string | null;
  },
  context: any
) {
  await assertGuestBookingAccess(context, bookingId);
  await ensureDefaultPaymentProviders(context);

  const session = await context.sudo().query.BookingPaymentSession.findOne({
    where: { id: paymentSessionId },
    query: `
      id amount data
      payment { ${PAYMENT_QUERY} }
      booking { id status paymentStatus balanceDue }
      paymentProvider { id code name metadata }
    `,
  });

  if (!session || session.booking?.id !== bookingId) {
    throw new Error('Payment session not found for booking.');
  }
  if (session.payment) return session.payment;
  if (!session.paymentProvider) throw new Error('Payment provider missing from session.');

  const provider = session.paymentProvider;
  assertCustomerPaymentProvider(provider.code);
  if (!['pending', 'confirmed'].includes(session.booking.status)) {
    throw new Error(`Payments cannot be completed for a ${session.booking.status} booking.`);
  }
  if (session.booking.paymentStatus === 'paid' || Number(session.booking.balanceDue || 0) <= 0) {
    throw new Error('This booking has no outstanding balance.');
  }

  const storedPaymentId =
    session.data?.paymentIntentId || session.data?.orderId || session.data?.id || null;
  if (providerPaymentId && storedPaymentId && providerPaymentId !== storedPaymentId) {
    throw new Error('Provider payment identifier does not match this payment session.');
  }
  const paymentIdentifier = providerPaymentId || storedPaymentId;
  if (!paymentIdentifier) {
    throw new Error('Provider payment identifier is required to complete payment.');
  }

  const result = await completePayment({
    provider,
    paymentId: paymentIdentifier,
    amount: session.amount,
  });
  const settlement = result?.settlement || {};
  if (!settlement.isSettled) {
    throw new Error('The payment provider has not confirmed settlement.');
  }
  if (String(settlement.bookingId || '') !== bookingId) {
    throw new Error('Provider settlement is not linked to this booking.');
  }

  const finalized = await finalizeBookingPayment({
    context,
    bookingId,
    paymentSessionId: session.id,
    providerCode: provider.code,
    providerPaymentId: String(settlement.providerPaymentId || paymentIdentifier),
    providerCaptureId: String(settlement.providerPaymentId || paymentIdentifier),
    amount: Number(settlement.amount),
    currencyCode: String(settlement.currencyCode || ''),
    providerData: result.data || {},
  });

  return context.sudo().query.BookingPayment.findOne({
    where: { id: finalized.paymentId },
    query: PAYMENT_QUERY,
  });
}

export default completeBookingPayment;
