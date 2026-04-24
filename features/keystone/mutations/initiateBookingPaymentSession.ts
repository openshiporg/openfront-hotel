import { createPayment } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

function normalizeCurrency(currency?: string | null) {
  return (currency || 'USD').toUpperCase();
}

function normalizeAmountToCents(amount?: number | null) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('Invalid booking amount');
  }

  if (Math.abs(amount) < 1000) {
    return Math.round(amount * 100);
  }

  return Math.round(amount);
}

async function initiateBookingPaymentSession(
  root: unknown,
  {
    bookingId,
    paymentProviderCode,
    amount,
    currency,
    returnUrl,
    cancelUrl,
  }: {
    bookingId: string;
    paymentProviderCode: string;
    amount?: number | null;
    currency?: string | null;
    returnUrl?: string | null;
    cancelUrl?: string | null;
  },
  context: any
) {
  const sudoContext = context.sudo();

  await ensureDefaultPaymentProviders(context);

  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      confirmationNumber
      guestName
      guestEmail
      totalAmount
      balanceDue
      payments {
        id
        amount
        status
      }
      paymentSessions {
        id
        isSelected
        isInitiated
        paymentProvider {
          id
          code
        }
        data
      }
    `,
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderCode },
    query: `
      id
      code
      name
      isInstalled
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
      metadata
      credentials
    `,
  });

  if (!provider || !provider.isInstalled) {
    throw new Error('Payment provider not found or not installed');
  }

  const amountInCents = normalizeAmountToCents(
    typeof amount === 'number' ? amount : booking.balanceDue || booking.totalAmount || 0
  );
  const resolvedCurrency = normalizeCurrency(currency);

  const existingSession = booking.paymentSessions?.find(
    (session: any) => session.paymentProvider?.code === paymentProviderCode && !session.isInitiated
  );

  if (existingSession) {
    for (const session of booking.paymentSessions || []) {
      if (session.id !== existingSession.id && session.isSelected) {
        await sudoContext.query.BookingPaymentSession.updateOne({
          where: { id: session.id },
          data: { isSelected: false },
        });
      }
    }

    await sudoContext.query.BookingPaymentSession.updateOne({
      where: { id: existingSession.id },
      data: { isSelected: true },
    });

    return await sudoContext.query.BookingPaymentSession.findOne({
      where: { id: existingSession.id },
      query: `
        id
        amount
        isSelected
        isInitiated
        data
        paymentProvider {
          id
          code
          name
          metadata
        }
      `,
    });
  }

  const sessionData = await createPayment({
    provider,
    amount: amountInCents,
    currency: resolvedCurrency,
    metadata: {
      bookingId: booking.id,
      confirmationNumber: booking.confirmationNumber,
      guestEmail: booking.guestEmail,
      returnUrl,
      cancelUrl,
    },
  });

  for (const session of booking.paymentSessions || []) {
    if (session.isSelected) {
      await sudoContext.query.BookingPaymentSession.updateOne({
        where: { id: session.id },
        data: { isSelected: false },
      });
    }
  }

  return await sudoContext.query.BookingPaymentSession.createOne({
    data: {
      booking: { connect: { id: booking.id } },
      paymentProvider: { connect: { id: provider.id } },
      amount: amountInCents,
      isSelected: true,
      isInitiated: false,
      data: sessionData,
      idempotencyKey: `${booking.id}:${provider.code}:${amountInCents}`,
    },
    query: `
      id
      amount
      isSelected
      isInitiated
      data
      paymentProvider {
        id
        code
        name
        metadata
      }
    `,
  });
}

export default initiateBookingPaymentSession;
