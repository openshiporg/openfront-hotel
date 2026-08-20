import { keystoneContext } from '@/features/keystone/context';
import { isOnlinePaymentProviderCode } from '@/features/keystone/lib/paymentSecurity';
import { processBookingPaymentWebhook } from '@/features/keystone/mutations/handleBookingPaymentProviderWebhook';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ providerCode: string }> }
) {
  const { providerCode } = await params;
  if (!isOnlinePaymentProviderCode(providerCode)) {
    return Response.json({ success: false, error: 'Webhook endpoint not found.' }, { status: 404 });
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ success: false, error: 'Invalid webhook body.' }, { status: 413 });
  }
  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return Response.json({ success: false, error: 'Invalid webhook body.' }, { status: 400 });
  }

  try {
    const result = await processBookingPaymentWebhook({
      providerCode,
      rawBody,
      headers: Object.fromEntries(request.headers.entries()),
      context: keystoneContext,
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('Payment webhook rejected', {
      providerCode,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return Response.json(
      { success: false, error: 'Webhook rejected.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
