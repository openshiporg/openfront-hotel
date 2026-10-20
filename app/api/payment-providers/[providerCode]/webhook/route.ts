import { keystoneContext } from '@/features/keystone/context';
import { isOnlinePaymentProviderCode } from '@/features/keystone/lib/paymentSecurity';
import { processBookingPaymentWebhook } from '@/features/keystone/mutations/handleBookingPaymentProviderWebhook';
import { readBoundedRequestText, RequestBodyRejectedError } from '@/features/keystone/lib/boundedRequestBody';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ providerCode: string }> }
) {
  const { providerCode } = await params;
  if (!isOnlinePaymentProviderCode(providerCode)) {
    return Response.json({ success: false, error: 'Webhook endpoint not found.' }, { status: 404 });
  }

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
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.warn('Payment webhook rejected', {
      providerCode,
      reason: 'Verification or durable processing failed.',
    });
    return Response.json(
      { success: false, error: 'Webhook rejected.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
