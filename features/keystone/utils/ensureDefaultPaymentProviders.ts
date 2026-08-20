import { ONLINE_PAYMENT_PROVIDER_CODES } from '../lib/paymentSecurity';

type ProviderRecord = {
  id: string;
  name: string;
  code: string;
  isInstalled: boolean;
  metadata?: Record<string, unknown> | null;
};

const LEGACY_FUNCTION_FIELDS = {
  createPaymentFunction: 'static-registry',
  capturePaymentFunction: 'static-registry',
  refundPaymentFunction: 'static-registry',
  getPaymentStatusFunction: 'static-registry',
  generatePaymentLinkFunction: 'static-registry',
  handleWebhookFunction: 'static-registry',
};

async function ensureProvider(context: any, code: string, data: Record<string, any>) {
  const existing = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: code } },
    query: 'id name code isInstalled metadata',
    take: 1,
  });
  if (existing[0]) return existing[0] as ProviderRecord;

  return context.sudo().query.PaymentProvider.createOne({
    data: { ...data, ...LEGACY_FUNCTION_FIELDS, credentials: {} },
    query: 'id name code isInstalled metadata',
  }) as Promise<ProviderRecord>;
}

export async function ensureDefaultPaymentProviders(context: any) {
  // Kept only for historical/operator-entered ledger records. It is deliberately
  // absent from the customer adapter allowlist and checkout provider query.
  await ensureProvider(context, 'pp_manual_manual', {
    name: 'Offline / staff-recorded',
    code: 'pp_manual_manual',
    isInstalled: true,
    metadata: { provider: 'manual', displayName: 'Recorded by hotel staff', operatorOnly: true },
  });

  const providers: ProviderRecord[] = [];
  for (const code of ONLINE_PAYMENT_PROVIDER_CODES) {
    const provider = await ensureProvider(context, code, {
      name: code === 'pp_stripe_stripe' ? 'Stripe' : 'PayPal',
      code,
      isInstalled: false,
      metadata: code === 'pp_stripe_stripe'
        ? { provider: 'stripe', displayName: 'Credit / debit card' }
        : { provider: 'paypal', displayName: 'PayPal', sandbox: true },
    });
    providers.push(provider);
  }
  return providers;
}
