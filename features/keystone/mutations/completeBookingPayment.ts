import { capturePayment } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

function toMajorUnit(amountInCents: number) {
  return amountInCents / 100;
}

function mapCapturedStatus(status?: string | null) {
  if (!status) return 'completed';
  if (status === 'succeeded' || status === 'captured' || status === 'COMPLETED') return 'completed';
  if (status === 'processing' || status === 'requires_capture' || status === 'APPROVED') return 'processing';
  if (status === 'failed' || status === 'canceled' || status === 'cancelled' || status === 'DENIED') return 'failed';
  return 'completed';
}

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
  const sudoContext = context.sudo();

  await ensureDefaultPaymentProviders(context);

  const session = await sudoContext.query.BookingPaymentSession.findOne({
    where: { id: paymentSessionId },
    query: `
      id
      amount
      isInitiated
      data
      booking {
        id
        confirmationNumber
        totalAmount
        balanceDue
        paymentStatus
      }
      paymentProvider {
        id
        code
        name
        createPaymentFunction
        capturePaymentFunction
        refundPaymentFunction
        getPaymentStatusFunction
        generatePaymentLinkFunction
        handleWebhookFunction
        metadata
        credentials
      }
    `,
  });

  if (!session || !session.booking || session.booking.id !== bookingId) {
    throw new Error('Payment session not found for booking');
  }

  const provider = session.paymentProvider;
  if (!provider) {
    throw new Error('Payment provider missing from session');
  }

  const paymentIdentifier =
    providerPaymentId ||
    session.data?.paymentIntentId ||
    session.data?.orderId ||
    session.data?.id;

  if (!paymentIdentifier && provider.code !== 'pp_manual_manual') {
    throw new Error('Provider payment identifier is required to complete payment');
  }

  const captureResult = await capturePayment({
    provider,
    paymentId: paymentIdentifier,
    amount: session.amount,
  });

  const normalizedStatus = mapCapturedStatus(captureResult?.status);
  const amountInCents = typeof captureResult?.amount === 'number' ? Math.round(captureResult.amount) : session.amount;

  const bookingPayment = await sudoContext.query.BookingPayment.createOne({
    data: {
      booking: { connect: { id: bookingId } },
      paymentProvider: { connect: { id: provider.id } },
      paymentSession: { connect: { id: session.id } },
      amount: toMajorUnit(amountInCents),
      currency: 'USD',
      paymentType: 'full_payment',
      paymentMethod:
        provider.code === 'pp_paypal_paypal'
          ? 'paypal'
          : provider.code === 'pp_manual_manual'
            ? 'other'
            : 'credit_card',
      status: normalizedStatus,
      providerPaymentId: paymentIdentifier || null,
      providerCaptureId: captureResult?.data?.purchase_units?.[0]?.payments?.captures?.[0]?.id || captureResult?.data?.id || null,
      providerData: captureResult?.data || {},
      stripePaymentIntentId: provider.code === 'pp_stripe_stripe' ? paymentIdentifier || null : null,
      description: `Payment for booking ${session.booking.confirmationNumber}`,
      receiptEmail: session.booking?.guestEmail,
    },
    query: `
      id
      status
      amount
      providerPaymentId
      stripePaymentIntentId
      paymentProvider {
        id
        code
        name
      }
    `,
  });

  await sudoContext.query.BookingPaymentSession.updateOne({
    where: { id: session.id },
    data: {
      isInitiated: true,
      paymentAuthorizedAt: new Date().toISOString(),
      data: {
        ...(session.data || {}),
        completionResult: captureResult?.data || {},
      },
    },
  });

  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: 'id totalAmount balanceDue payments { id amount status paymentType }',
  });

  const completedPayments = (booking?.payments || []).filter((payment: any) => payment.status === 'completed');
  const paidAmount = completedPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const totalAmount = Number(booking?.totalAmount || 0);
  const remainingBalance = Math.max(0, totalAmount - paidAmount);

  await sudoContext.query.Booking.updateOne({
    where: { id: bookingId },
    data: {
      paymentStatus: remainingBalance <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      balanceDue: remainingBalance,
      status: remainingBalance <= 0 ? 'confirmed' : undefined,
      confirmedAt: remainingBalance <= 0 ? new Date().toISOString() : undefined,
    },
  });

  return bookingPayment;
}

export default completeBookingPayment;
