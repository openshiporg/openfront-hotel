import { randomUUID } from 'node:crypto';
import { createPayment } from '../utils/paymentProviderAdapter';
import { configuredSiteOrigin } from '../lib/productionConfig';
import { getBookingCollectibleBalance } from '../folios/bookingFolio';
import { runSerializableTransaction } from '../lib/serializableTransaction';
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
  const configured = configuredSiteOrigin(env);
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

const SESSION_PROJECTION = `
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
`;
// A reserved attempt whose provider call never reported back may be resumed, with the same
// provider idempotency key, once this long has passed.
const RESERVATION_RESUME_MS = 2 * 60_000;

/**
 * Start or resume the guest's payment for the booking's current obligation.
 *
 * 1. Under the booking lock, the obligation (pricing revision, amount, currency, provider) is
 *    frozen and one payment attempt is reserved durably before any provider call; any other
 *    selected attempt is retired, so only one attempt is ever unresolved.
 * 2. The provider is called with the attempt's own idempotency key. If that call fails the
 *    outcome is unknown: the attempt is kept and a later start resumes it with the same key,
 *    never a new one.
 * 3. The provider result is stored only by the request that still holds the reservation.
 */
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
  const verifiedReturnUrl = safePaymentReturnUrl(returnUrl, context, paymentProviderCode === 'pp_paypal_paypal' ? '/paypal/return' : '/stripe/return');
  const verifiedCancelUrl = safePaymentReturnUrl(cancelUrl, context, '/book');
  const managesBookings = canManageBookingRecords(context);

  const reservation = await runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { paymentSessions: { include: { payment: { select: { id: true } }, paymentProvider: { select: { code: true } } } } },
    });
    if (!booking) throw new Error('Booking not found');
    if (booking.billingFolioId && !managesBookings) throw new Error('The group payer manages this master folio. Contact the property for your individual balance.');
    if (!PAYABLE_BOOKING_STATUSES.has(booking.status)) throw new Error(`Payments cannot be started for a ${booking.status} booking.`);
    if (booking.status === 'pending' && booking.holdExpiresAt && new Date(booking.holdExpiresAt) <= new Date()) {
      throw new Error('This reservation hold has expired.');
    }
    const collectibleMinor = (await getBookingCollectibleBalance(tx, bookingId)).balanceDueMinor;
    const amountInCents = bookingPaymentDueNow(booking, collectibleMinor);
    if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) throw new Error('This booking has no outstanding balance.');
    if (amountInCents > MAX_PAYMENT_SESSION_MINOR) throw new Error('Payment session amount exceeds the PostgreSQL Int32 minor-unit limit.');
    const provider = await prisma.paymentProvider.findUnique({ where: { code: paymentProviderCode } });
    if (!provider || !isPaymentProviderConfigured(provider)) throw new Error('Payment provider is disabled or not completely configured.');

    const currencyCode = String(booking.currencyCode || 'USD').toUpperCase();
    const obligationKey = `${booking.id}:${provider.code}:v${booking.pricingRevision || 1}:${amountInCents}:${currencyCode}`;
    const sessions = booking.paymentSessions || [];
    const retiredAttempts = sessions.filter((session: any) => session.idempotencyKey?.startsWith(`${obligationKey}:attempt:`) && (session.data as any)?.retiredAt).length;
    const idempotencyKey = `${obligationKey}:attempt:${retiredAttempts}`;
    const existing = sessions.find((session: any) => session.idempotencyKey === idempotencyKey);
    if (existing?.payment?.id) throw new Error('This booking balance has already been paid.');
    if (existing?.isInitiated) throw new Error('This payment session is already being processed.');

    // One unresolved attempt: every other selected attempt is retired here; the retirement
    // worker cancels it with the provider, and a late capture is still recovered.
    const now = new Date();
    for (const session of sessions) {
      if (session.id === existing?.id || !session.isSelected) continue;
      const data: any = session.data || {};
      const retirement = session.payment
        ? { status: 'captured' }
        : data.retirement || { status: session.paymentProvider?.code === 'pp_stripe_stripe' ? 'pending' : 'provider_expiry_required', attempts: 0 };
      await prisma.bookingPaymentSession.update({ where: { id: session.id }, data: {
        isSelected: false,
        data: { ...data, ...(session.payment ? {} : { retiredAt: data.retiredAt || now.toISOString() }), retirement },
      } });
    }

    const claimToken = randomUUID();
    if (existing) {
      const data: any = existing.data || {};
      const claim = data.claim;
      const providerRecorded = !claim || claim.status === 'created';
      if (providerRecorded) {
        if (!existing.isSelected) await prisma.bookingPaymentSession.update({ where: { id: existing.id }, data: { isSelected: true } });
        return { sessionId: existing.id, needsProvider: false as const };
      }
      const reservedAt = Date.parse(claim.reservedAt || '');
      if (claim.status === 'reserved' && Number.isFinite(reservedAt) && now.getTime() - reservedAt < RESERVATION_RESUME_MS) {
        throw new Error('This payment is being prepared. Try again in a moment.');
      }
      await prisma.bookingPaymentSession.update({ where: { id: existing.id }, data: {
        isSelected: true,
        data: { ...data, claim: { ...claim, status: 'reserved', token: claimToken, reservedAt: now.toISOString(), resumedFrom: claim.status } },
      } });
      return { sessionId: existing.id, needsProvider: true as const, claimToken, provider, idempotencyKey, amountInCents, currencyCode, booking };
    }
    const created = await prisma.bookingPaymentSession.create({
      data: {
        bookingId: booking.id,
        paymentProviderId: provider.id,
        amount: amountInCents,
        isSelected: true,
        isInitiated: false,
        idempotencyKey,
        data: {
          claim: { status: 'reserved', token: claimToken, reservedAt: now.toISOString() },
          obligation: { depositPercent: (booking.pricingSnapshot as any)?.depositPercent ?? 100, pricingRevision: booking.pricingRevision || 1, amountMinor: amountInCents, currencyCode },
        },
      },
    });
    return { sessionId: created.id, needsProvider: true as const, claimToken, provider, idempotencyKey, amountInCents, currencyCode, booking };
  });

  if (reservation.needsProvider) {
    // The provider return identifies this exact attempt, so it never depends on which attempt
    // happens to be unsettled when the guest comes back.
    const attemptReturnUrl = new URL(verifiedReturnUrl);
    attemptReturnUrl.searchParams.set('paymentSessionId', reservation.sessionId);
    let sessionData: any;
    try {
      sessionData = await createPaymentAdapter({
        provider: reservation.provider,
        amount: reservation.amountInCents,
        currency: reservation.currencyCode,
        idempotencyKey: reservation.idempotencyKey,
        metadata: {
          bookingId: reservation.booking.id,
          confirmationNumber: reservation.booking.confirmationNumber,
          guestEmail: reservation.booking.guestEmail,
          returnUrl: attemptReturnUrl.toString(),
          cancelUrl: verifiedCancelUrl,
          idempotencyKey: reservation.idempotencyKey,
        },
      });
    } catch (error) {
      await recordClaim(context, bookingId, reservation.sessionId, reservation.claimToken, { status: 'unknown', failedAt: new Date().toISOString() });
      throw error;
    }
    await recordClaim(context, bookingId, reservation.sessionId, reservation.claimToken, { status: 'created', createdAt: new Date().toISOString() }, sessionData);
  }

  return sudoContext.query.BookingPaymentSession.findOne({ where: { id: reservation.sessionId }, query: SESSION_PROJECTION });
}

/** Store the provider outcome only if this request still holds the attempt's reservation. */
async function recordClaim(context: any, bookingId: string, sessionId: string, token: string, claim: Record<string, unknown>, providerData?: Record<string, unknown>) {
  await runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const current = await prisma.bookingPaymentSession.findUnique({ where: { id: sessionId } });
    const data: any = current?.data || {};
    if (!current || data.claim?.token !== token) return;
    await prisma.bookingPaymentSession.update({ where: { id: sessionId }, data: { data: { ...data, ...(providerData || {}), claim: { ...data.claim, ...claim } } } });
  });
}

export default initiateBookingPaymentSession;
