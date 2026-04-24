import { refundPayment } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

type CancelBookingInput = {
  bookingId: string;
  refundAmount?: number | null;
  refundReason?: string | null;
};

export default async function cancelBooking(
  root: unknown,
  { bookingId, refundAmount, refundReason }: CancelBookingInput,
  context: any
) {
  await ensureDefaultPaymentProviders(context);

  const booking = await context.db.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      confirmationNumber
      status
      paymentStatus
      totalAmount
      payments {
        id
        status
        paymentMethod
        amount
        currency
        providerPaymentId
        providerCaptureId
        providerRefundId
        stripePaymentIntentId
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
      }
    `,
  });

  if (!booking) {
    throw new Error('Booking not found.');
  }

  if (booking.status === 'cancelled') {
    return booking;
  }

  const shouldRefund = booking.paymentStatus === 'paid' || booking.paymentStatus === 'partial';
  let refundValue = 0;

  if (shouldRefund) {
    const paymentToRefund = booking.payments?.find(
      (payment: any) => !!payment?.providerPaymentId || !!payment?.providerCaptureId || !!payment?.stripePaymentIntentId
    );

    if (!paymentToRefund?.paymentProvider) {
      throw new Error('No payment provider found for this booking payment.');
    }

    const providerPaymentId =
      paymentToRefund.providerCaptureId ||
      paymentToRefund.providerPaymentId ||
      paymentToRefund.stripePaymentIntentId;

    if (!providerPaymentId) {
      throw new Error('No provider payment identifier found for this booking.');
    }

    const rawRefundAmount =
      typeof refundAmount === 'number' && Number.isFinite(refundAmount)
        ? refundAmount
        : booking.totalAmount;

    if (!rawRefundAmount || rawRefundAmount <= 0) {
      throw new Error('Invalid refund amount.');
    }

    refundValue = Math.min(rawRefundAmount, booking.totalAmount || rawRefundAmount);

    const refundResult = await refundPayment({
      provider: paymentToRefund.paymentProvider,
      paymentId: providerPaymentId,
      amount: Math.round(refundValue * 100),
      currency: paymentToRefund.currency || 'USD',
      metadata: {
        bookingId,
        reason: refundReason || 'Booking cancelled',
      },
    });

    await context.db.BookingPayment.createOne({
      data: {
        booking: { connect: { id: bookingId } },
        paymentProvider: { connect: { id: paymentToRefund.paymentProvider.id } },
        amount: -refundValue,
        currency: paymentToRefund.currency || 'USD',
        paymentType: 'refund',
        paymentMethod: paymentToRefund.paymentMethod || 'credit_card',
        status: 'refunded',
        providerPaymentId,
        providerRefundId: refundResult?.data?.id || refundResult?.data?.refund_id || null,
        providerData: refundResult?.data || {},
        stripePaymentIntentId: paymentToRefund.stripePaymentIntentId,
        stripeRefundId: paymentToRefund.paymentProvider.code === 'pp_stripe_stripe' ? refundResult?.data?.id || null : null,
        description: `Refund for booking ${booking.confirmationNumber}`,
      },
    });

    await context.db.BookingPayment.updateMany({
      where: {
        booking: { id: { equals: bookingId } },
        status: { equals: 'completed' },
      },
      data: { status: 'refunded' },
    });
  }

  const updatedBooking = await context.db.Booking.updateOne({
    where: { id: bookingId },
    data: {
      status: 'cancelled',
      paymentStatus: shouldRefund ? 'refunded' : booking.paymentStatus,
      balanceDue: 0,
    },
    query: `id status paymentStatus totalAmount cancelledAt`,
  });

  return updatedBooking;
}
