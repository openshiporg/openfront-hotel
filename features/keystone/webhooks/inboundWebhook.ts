import { keystoneContext } from '@/features/keystone/context';
import { handleChannelWebhook } from '@/features/keystone/channels/commands';
import { isOnlinePaymentProviderCode } from '@/features/keystone/lib/paymentSecurity';
import { readBoundedRequestText, RequestBodyRejectedError } from '@/features/keystone/lib/boundedRequestBody';
import { processBookingPaymentWebhook } from '@/features/keystone/mutations/handleBookingPaymentProviderWebhook';

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

/** Channel callbacks arrive as `channel-<channelId>`; the old /api/webhooks/channel/:id URL rewrites here. */
export const CHANNEL_WEBHOOK_PREFIX = 'channel-';

async function paymentWebhook(request: Request, providerCode: string) {
  let rawBody: string;
  try {
    rawBody = await readBoundedRequestText(request, MAX_WEBHOOK_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyRejectedError ? error.status : 400;
    return Response.json({ success: false, error: 'Invalid webhook body.' }, { status });
  }
  try {
    const result = await processBookingPaymentWebhook({
      providerCode,
      rawBody,
      headers: Object.fromEntries(request.headers.entries()),
      context: keystoneContext,
    });
    return Response.json(result, { headers: NO_STORE });
  } catch {
    console.warn('Payment webhook rejected', { providerCode, reason: 'Verification or durable processing failed.' });
    return Response.json({ success: false, error: 'Webhook rejected.' }, { status: 400, headers: NO_STORE });
  }
}

async function channelWebhook(request: Request, channelId: string) {
  if (!channelId) return Response.json({ error: 'Missing channelId' }, { status: 400 });
  let rawBody: string;
  try {
    rawBody = await readBoundedRequestText(request, MAX_WEBHOOK_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyRejectedError && error.status === 413) {
      return Response.json({ error: 'Webhook body too large' }, { status: 413 });
    }
    return Response.json({ error: 'Channel webhook rejected' }, { status: 400, headers: NO_STORE });
  }
  try {
    const result = await handleChannelWebhook(keystoneContext, channelId, rawBody, Object.fromEntries(request.headers.entries()));
    return Response.json(result, { status: 200 });
  } catch {
    console.error('Channel webhook rejected');
    return Response.json({ error: 'Channel webhook rejected' }, { status: 400, headers: NO_STORE });
  }
}

/**
 * Every inbound provider callback enters through /api/payment-webhooks/[providerId]:
 * online payment providers by code, and booking channels as `channel-<id>`. Each keeps its own signature check, body bound and responses.
 */
export async function handleInboundWebhook(request: Request, providerId: string) {
  if (isOnlinePaymentProviderCode(providerId)) return paymentWebhook(request, providerId);
  if (providerId.startsWith(CHANNEL_WEBHOOK_PREFIX)) return channelWebhook(request, providerId.slice(CHANNEL_WEBHOOK_PREFIX.length));
  return Response.json({ success: false, error: 'Webhook endpoint not found.' }, { status: 404 });
}
