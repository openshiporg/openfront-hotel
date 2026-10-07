import { createPayment } from '../utils/paymentProviderAdapter';
import { getBookingCollectibleBalance } from '../folios/bookingFolio';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { retireBookingPaymentSession } from '../payments/settlement';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { assertGuestBookingAccess, canManageBookingRecords } from '../lib/guestBookingAccess';
import {
  bookingPaymentDueNow,
  assertCustomerPaymentProvider,
  isPaymentProviderConfigured,
} from '../lib/paymentSecurity';

const PAYABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);
const MAX_PAYMENT_SESSION_MINOR = 2_147_483_647;

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
  context: any,
  createPaymentAdapter: typeof createPayment = createPayment,
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
      pricingRevision
      pricingSnapshot
      billingFolio { id }
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

  if (booking.billingFolio?.id && !canManageBookingRecords(context)) throw new Error('The group payer manages this master folio. Contact the property for your individual balance.');

  if (!PAYABLE_BOOKING_STATUSES.has(booking.status)) {
    throw new Error(`Payments cannot be started for a ${booking.status} booking.`);
  }

  if (booking.status === 'pending' && booking.holdExpiresAt && new Date(booking.holdExpiresAt) <= new Date()) {
    throw new Error('This reservation hold has expired.');
  }
  const collectibleMinor = (await runSerializableTransaction(context, tx => getBookingCollectibleBalance(tx, bookingId))).balanceDueMinor;
  const amountInCents = bookingPaymentDueNow(booking, collectibleMinor);
  if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
    throw new Error('This booking has no outstanding balance.');
  }
  if (amountInCents > MAX_PAYMENT_SESSION_MINOR) {
    throw new Error('Payment session amount exceeds the PostgreSQL Int32 minor-unit limit.');
  }

  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: paymentProviderCode } });

  if (!provider || !isPaymentProviderConfigured(provider)) {
    throw new Error('Payment provider is disabled or not completely configured.');
  }

  const currencyCode = String(booking.currencyCode || 'USD').toUpperCase();
  const obligationKey = `${booking.id}:${provider.code}:v${booking.pricingRevision || 1}:${amountInCents}:${currencyCode}`;
  const retiredAttempts = (booking.paymentSessions || []).filter((session: any) => session.idempotencyKey?.startsWith(`${obligationKey}:attempt:`) && session.data?.retiredAt).length;
  const idempotencyKey = `${obligationKey}:attempt:${retiredAttempts}`;
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
        await retireBookingPaymentSession(context, session.id, booking.id);
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

  const sessionData = await createPaymentAdapter({
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
      await retireBookingPaymentSession(context, session.id, booking.id);
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
        data: { ...sessionData, obligation: { depositPercent: booking.pricingSnapshot?.depositPercent ?? 100, pricingRevision: booking.pricingRevision || 1, amountMinor: amountInCents, currencyCode } },
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
