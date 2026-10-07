import { getBookingCollectibleBalance } from '../folios/bookingFolio';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { completePayment, getPaymentStatus } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { assertGuestBookingAccess, canManageBookingRecords } from '../lib/guestBookingAccess';
import { assertCustomerPaymentProvider, bookingPaymentDueNow } from '../lib/paymentSecurity';
import { finalizeBookingPayment } from '../payments/settlement';

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
      booking { id status paymentStatus balanceDue balanceDueMinor totalAmountMinor pricingSnapshot pricingRevision holdExpiresAt billingFolio { id } }
      paymentProvider { id code name metadata }
    `,
  });

  if (!session || session.booking?.id !== bookingId) {
    throw new Error('Payment session not found for booking.');
  }
  if (session.booking.billingFolio?.id && !canManageBookingRecords(context)) throw new Error('Only the group payer or property staff may settle a master folio.');
  if (session.payment) return session.payment;
  if (!session.paymentProvider) throw new Error('Payment provider missing from session.');

  // This privileged read follows booking ownership and nested session ownership checks.
  // Credentials never enter the public payment projection.
  const provider = await context.prisma.paymentProvider.findUnique({ where: { id: session.paymentProvider.id } });
  if (!provider) throw new Error('Payment provider missing from session.');
  assertCustomerPaymentProvider(provider.code);

  const storedPaymentId =
    session.data?.paymentIntentId || session.data?.orderId || session.data?.id || null;
  if (providerPaymentId && storedPaymentId && providerPaymentId !== storedPaymentId) {
    throw new Error('Provider payment identifier does not match this payment session.');
  }
  const paymentIdentifier = providerPaymentId || storedPaymentId;
  if (!paymentIdentifier) {
    throw new Error('Provider payment identifier is required to complete payment.');
  }

  const collectible = await runSerializableTransaction(context, tx => getBookingCollectibleBalance(tx, bookingId));
  const stale = Boolean(session.data?.retiredAt) || !['pending', 'confirmed'].includes(session.booking.status) ||
    bookingPaymentDueNow(session.booking, collectible.balanceDueMinor) !== session.amount ||
    (session.data?.obligation && session.data.obligation.pricingRevision !== (session.booking.pricingRevision || 1)) ||
    (session.booking.status === 'pending' && session.booking.holdExpiresAt && new Date(session.booking.holdExpiresAt) <= new Date());
  // A stale attempt may already have captured funds, but must not initiate a new
  // capture. Read provider evidence and let finalization reconcile received money.
  const result = await (stale ? getPaymentStatus : completePayment)({
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
    providerCaptureId: String(settlement.providerCaptureId || settlement.providerPaymentId || paymentIdentifier),
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
