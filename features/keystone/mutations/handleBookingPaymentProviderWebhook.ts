import { recordVerifiedSecurityAuthorization } from '../security/authorization';
import { recordVerifiedDispute } from '../finance/hotelDisputes';
import { handleWebhook } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import {
  assertCustomerPaymentProvider,
  classifyPaymentWebhookType,
  requireVerifiedWebhookIdentity,
} from '../lib/paymentSecurity';
import {
  finalizeBookingPayment,
  assertReplayMatches,
  hashPaymentPayload,
  recordPaymentEvent,
} from '../payments/settlement';

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
  if (!provider) throw new Error('Payment provider record not found.');

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
  // Only verified evidence can acknowledge replay. Resolve it before looking for
  // an unpaid session, because successful sessions are necessarily already paid.
  const existingEvent = await context.prisma.paymentEvent.findUnique({ where: { replayKey: replay.replayKey } });
  if (existingEvent) {
    assertReplayMatches(existingEvent, replay);
    return { success: true, duplicate: true, type: identity.eventType };
  }
  if (verified.securityAuthorization) return recordVerifiedSecurityAuthorization(context, provider, verified.securityAuthorization, replay);
  if (verified.dispute) return recordVerifiedDispute(context, provider, verified.dispute, replay);
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
  const providerPaymentId = String(settlement.providerPaymentId || '');
  const providerCaptureId = String(settlement.providerCaptureId || providerPaymentId);
  if (!providerPaymentId) throw new Error('Verified webhook is missing its provider order/payment identity.');
  // Exact durable order/intent lookup, including already-settled sessions. A
  // bounded result detects ambiguity instead of silently scanning only 10 recent sessions.
  const sessions = await context.prisma.bookingPaymentSession.findMany({
    where: { bookingId, paymentProviderId: provider.id, OR: [
      { data: { path: ['paymentIntentId'], equals: providerPaymentId } },
      { data: { path: ['orderId'], equals: providerPaymentId } },
      { data: { path: ['id'], equals: providerPaymentId } },
    ] }, include: { payment: true }, take: 2,
  });
  if (sessions.length !== 1) throw new Error('Verified webhook must map to exactly one payment session.');
  const session = sessions[0];

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
    providerCaptureId,
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
