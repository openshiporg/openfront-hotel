import {
  assertCustomerPaymentProvider,
  assertPaymentIntegrationAvailable,
  type OnlinePaymentProviderCode,
} from '../lib/paymentSecurity';
import { paymentProviderCredentials } from '../lib/integrationConfig';

const adapterLoaders = {
  pp_stripe_stripe: () => import('../../integrations/payment/stripe'),
  pp_paypal_paypal: () => import('../../integrations/payment/paypal'),
} satisfies Record<OnlinePaymentProviderCode, () => Promise<any>>;

type AdapterFunctionName =
  | 'createPaymentFunction'
  | 'completePaymentFunction'
  | 'refundPaymentFunction'
  | 'getPaymentStatusFunction'
  | 'generatePaymentLinkFunction'
  | 'handleWebhookFunction';

async function getAdapter(provider: { code?: string | null; isInstalled?: boolean | null; credentials?: unknown }) {
  const providerCode = String(provider?.code || '');
  assertCustomerPaymentProvider(providerCode);
  assertPaymentIntegrationAvailable(provider);
  return { adapter: await adapterLoaders[providerCode](), credentials: paymentProviderCredentials(provider) };
}

export async function executeAdapterFunction({
  provider,
  functionName,
  args,
}: {
  provider: { code?: string | null; isInstalled?: boolean | null; credentials?: unknown };
  functionName: AdapterFunctionName;
  args: Record<string, unknown>;
}): Promise<any> {
  const providerCode = String(provider?.code || '');
  const { adapter, credentials } = await getAdapter(provider);
  const fn = adapter[functionName];
  if (typeof fn !== 'function') {
    throw new Error(`Payment provider ${providerCode} does not support ${functionName}.`);
  }
  return (fn as any)({ ...args, providerCredentials: credentials });
}

export async function createPayment({ provider, amount, currency, metadata, idempotencyKey }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'createPaymentFunction',
    args: { amount, currency, metadata, idempotencyKey },
  });
}

export async function completePayment({ provider, paymentId, amount }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'completePaymentFunction',
    args: { paymentId, amount },
  });
}

export async function refundPayment({ provider, paymentId, amount, currency, metadata, idempotencyKey }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'refundPaymentFunction',
    args: { paymentId, amount, currency, metadata, idempotencyKey },
  });
}

export async function getPaymentStatus({ provider, paymentId }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'getPaymentStatusFunction',
    args: { paymentId },
  });
}

export async function generatePaymentLink({ provider, paymentId }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'generatePaymentLinkFunction',
    args: { paymentId },
  });
}

export async function handleWebhook({ provider, rawBody, headers }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'handleWebhookFunction',
    args: { rawBody, headers },
  });
}
