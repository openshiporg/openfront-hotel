import { handleWebhook } from '../utils/paymentProviderAdapter';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

async function handleBookingPaymentProviderWebhook(
  root: unknown,
  {
    providerCode,
    event,
    headers,
  }: {
    providerCode: string;
    event: any;
    headers: Record<string, string>;
  },
  context: any
) {
  const sudoContext = context.sudo();

  await ensureDefaultPaymentProviders(context);

  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: providerCode },
    query: `
      id
      code
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

  const result = await handleWebhook({ provider, event, headers });

  return {
    success: true,
    providerCode,
    type: result.type,
  };
}

export default handleBookingPaymentProviderWebhook;
