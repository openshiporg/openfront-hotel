import { createPayment } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import {
  assertCustomerPaymentProvider,
  isPaymentProviderConfigured,
} from '../lib/paymentSecurity';

const PAYABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);

function requestHeader(context: any, name: string) {
  const headers = context?.req?.headers;
  const value = typeof headers?.get === 'function'
    ? headers.get(name)
    : headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : '';
}

function canonicalHttpOrigin(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Payment return origin is invalid.');
  }
  return url.origin;
}

export function paymentRequestOrigin(context: any, env: NodeJS.ProcessEnv = process.env) {
  const configured = String(env.NEXT_PUBLIC_SITE_URL || env.NEXTAUTH_URL || '').trim();
  if (configured) return canonicalHttpOrigin(configured);

  const browserOrigin = requestHeader(context, 'origin');
  if (browserOrigin) return canonicalHttpOrigin(browserOrigin);

  if (env.NODE_ENV !== 'production') {
    const host = requestHeader(context, 'x-forwarded-host') || requestHeader(context, 'host');
    const protocol = requestHeader(context, 'x-forwarded-proto') || 'http';
    if (host) return canonicalHttpOrigin(`${protocol}://${host}`);
  }
  throw new Error('Payment return origin could not be verified from this checkout request.');
}

export function safePaymentReturnUrl(
  value: string | null | undefined,
  context: any,
  allowedPath: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!value) throw new Error('Payment return URL is required.');
  const url = new URL(value, paymentRequestOrigin(context, env));
  if (url.origin !== paymentRequestOrigin(context, env) || url.pathname !== allowedPath || url.username || url.password || url.hash) {
    throw new Error('Payment return URL is not allowed.');
  }
  return url.toString();
}

async function initiateBookingPaymentSession(
  root: unknown,
  {
    bookingId,
    paymentProviderCode,
    returnUrl,
    cancelUrl,
  }: {
    bookingId: string;
    paymentProviderCode: string;
    returnUrl?: string | null;
    cancelUrl?: string | null;
  },
  context: any
) {
  const sudoContext = context.sudo();

  await assertGuestBookingAccess(context, bookingId);
  assertCustomerPaymentProvider(paymentProviderCode);
  await ensureDefaultPaymentProviders(context);

  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      confirmationNumber
      guestEmail
      status
      totalAmount
      balanceDue
      totalAmountMinor
      balanceDueMinor
      currencyCode
      holdExpiresAt
      paymentStatus
      paymentSessions {
        id
        amount
        idempotencyKey
        isSelected
        isInitiated
        paymentProvider {
          id
          code
        }
        payment {
          id
        }
        data
      }
    `,
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  if (!PAYABLE_BOOKING_STATUSES.has(booking.status)) {
    throw new Error(`Payments cannot be started for a ${booking.status} booking.`);
  }

  if (booking.status === 'pending' && booking.holdExpiresAt && new Date(booking.holdExpiresAt) <= new Date()) {
    throw new Error('This reservation hold has expired.');
  }
  const amountInCents = Number(booking.balanceDueMinor || 0);
  if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0 || booking.paymentStatus === 'paid') {
    throw new Error('This booking has no outstanding balance.');
  }

  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: paymentProviderCode } });

  if (!provider || !isPaymentProviderConfigured(provider)) {
    throw new Error('Payment provider is disabled or not completely configured.');
  }

  const currencyCode = String(booking.currencyCode || 'USD').toUpperCase();
  const idempotencyKey = `${booking.id}:${provider.code}:${amountInCents}:${currencyCode}`;
  const existingSession = booking.paymentSessions?.find(
    (session: any) => session.idempotencyKey === idempotencyKey
  );

  if (existingSession) {
    if (existingSession.payment?.id) {
      throw new Error('This booking balance has already been paid.');
    }

    if (existingSession.isInitiated) {
      throw new Error('This payment session is already being processed.');
    }

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
    currency: currencyCode,
    idempotencyKey,
    metadata: {
      bookingId: booking.id,
      confirmationNumber: booking.confirmationNumber,
      guestEmail: booking.guestEmail,
      returnUrl: safePaymentReturnUrl(
        returnUrl,
        context,
        paymentProviderCode === 'pp_paypal_paypal' ? '/paypal/return' : '/stripe/return',
      ),
      cancelUrl: safePaymentReturnUrl(cancelUrl, context, '/book'),
      idempotencyKey,
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

  try {
    return await sudoContext.query.BookingPaymentSession.createOne({
      data: {
        booking: { connect: { id: booking.id } },
        paymentProvider: { connect: { id: provider.id } },
        amount: amountInCents,
        isSelected: true,
        isInitiated: false,
        data: sessionData,
        idempotencyKey,
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
  } catch (error) {
    const concurrentSession = await sudoContext.query.BookingPaymentSession.findOne({
      where: { idempotencyKey },
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

    if (concurrentSession) return concurrentSession;
    throw error;
  }
}

export default initiateBookingPaymentSession;
