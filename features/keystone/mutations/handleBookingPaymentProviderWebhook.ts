import { handleWebhook } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import {
  assertCustomerPaymentProvider,
  classifyPaymentWebhookType,
  requireVerifiedWebhookIdentity,
} from '../lib/paymentSecurity';
import {
  finalizeBookingPayment,
  hashPaymentPayload,
  recordPaymentEvent,
} from '../lib/bookingPaymentSettlement';

function sessionProviderId(session: any) {
  return String(
    session?.data?.paymentIntentId || session?.data?.orderId || session?.data?.id || ''
  );
}

export async function processBookingPaymentWebhook({
  providerCode,
  rawBody,
  headers,
  context,
}: {
  providerCode: string;
  rawBody: string;
  headers: Record<string, string>;
  context: any;
}) {
  assertCustomerPaymentProvider(providerCode);

  await ensureDefaultPaymentProviders(context);
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: providerCode } });
  if (!provider?.isInstalled) throw new Error('Payment provider not found or not installed.');

  // The adapter is statically allowlisted; persisted provider state and
  // encrypted credentials are required before provider I/O.
  const verified = await handleWebhook({ provider, rawBody, headers });
  if (!verified?.isValid) throw new Error('Webhook signature verification failed.');

  const identity = requireVerifiedWebhookIdentity({
    providerCode,
    rawBody,
    eventId: verified.eventId,
    eventType: verified.type,
  });
  const replay = {
    providerCode,
    replayKey: identity.replayKey,
    providerEventId: identity.eventId,
    eventType: identity.eventType,
    payloadHash: hashPaymentPayload(rawBody),
  };
  const disposition = classifyPaymentWebhookType(identity.eventType);
  const settlement = verified.settlement || {};
  const bookingId = String(settlement.bookingId || '').trim();

  if (disposition === 'ignored') {
    const ignored = await recordPaymentEvent({
      context,
      replay,
      status: 'ignored',
      evidence: { reason: 'unsupported_event_type' },
    });
    return { success: true, duplicate: ignored.replayed, type: identity.eventType };
  }

  if (!bookingId) {
    throw new Error('Verified webhook is missing its booking identity.');
  }
  const sessions = await context.sudo().query.BookingPaymentSession.findMany({
    where: {
      booking: { id: { equals: bookingId } },
      paymentProvider: { code: { equals: providerCode } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 10,
    query: 'id amount data payment { id }',
  });
  const providerPaymentId = String(settlement.providerPaymentId || '');
  const session = sessions.find(
    (candidate: any) =>
      !candidate.payment &&
      (!sessionProviderId(candidate) || sessionProviderId(candidate) === providerPaymentId)
  );
  if (!session) throw new Error('Verified webhook does not map to an open payment session.');

  if (disposition === 'failed') {
    const failed = await recordPaymentEvent({
      context,
      replay,
      status: 'failed',
      evidence: { bookingId, paymentSessionId: session.id, providerPaymentId },
    });
    return { success: true, duplicate: failed.replayed, type: identity.eventType };
  }
  if (!settlement.isSettled) {
    throw new Error('Webhook payment settlement is incomplete.');
  }

  const finalized = await finalizeBookingPayment({
    context,
    bookingId,
    paymentSessionId: session.id,
    providerCode,
    providerPaymentId,
    providerCaptureId: providerPaymentId,
    amount: Number(settlement.amount),
    currencyCode: String(settlement.currencyCode || ''),
    providerData: verified.resource || {},
    replay,
  });
  return {
    success: true,
    duplicate: finalized.replayed,
    type: identity.eventType,
  };
}

export default processBookingPaymentWebhook;
