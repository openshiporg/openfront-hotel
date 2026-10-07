import {
  assertCustomerPaymentProvider,
  assertPaymentIntegrationAvailable,
  assertPaymentRecoveryAvailable,
  PaymentProviderConfigurationError,
  type OnlinePaymentProviderCode,
} from '../lib/paymentSecurity';
import { paymentProviderCredentials } from '../lib/integrationConfig';
import { PaymentProviderCredentialRejectedError } from '../../integrations/payment/providerErrors';

const adapterLoaders = {
  pp_stripe_stripe: () => import('../../integrations/payment/stripe'),
  pp_paypal_paypal: () => import('../../integrations/payment/paypal'),
} satisfies Record<OnlinePaymentProviderCode, () => Promise<any>>;

type AdapterFunctionName =
  | 'securityAuthorizationFunction'
  | 'createPaymentFunction'
  | 'cancelPaymentFunction'
  | 'completePaymentFunction'
  | 'refundPaymentFunction'
  | 'getPaymentStatusFunction'
  | 'getRefundStatusFunction'
  | 'generatePaymentLinkFunction'
  | 'handleWebhookFunction';

type AdapterAdmission = 'new-checkout' | 'historical-recovery';
type AdapterSelector = 'static-registry';
type PaymentProviderRecord = {
  code?: string | null;
  isInstalled?: boolean | null;
  credentials?: unknown;
  createPaymentFunction?: string | null;
  capturePaymentFunction?: string | null;
  refundPaymentFunction?: string | null;
  getPaymentStatusFunction?: string | null;
  generatePaymentLinkFunction?: string | null;
  handleWebhookFunction?: string | null;
};

// `capturePaymentFunction` is the legacy selector for Hotel's completion/capture contract.
const operationSelectorFields: Partial<Record<AdapterFunctionName, keyof PaymentProviderRecord>> = {
  createPaymentFunction: 'createPaymentFunction',
  completePaymentFunction: 'capturePaymentFunction',
  refundPaymentFunction: 'refundPaymentFunction',
  getPaymentStatusFunction: 'getPaymentStatusFunction',
  generatePaymentLinkFunction: 'generatePaymentLinkFunction',
  handleWebhookFunction: 'handleWebhookFunction',
};

// Hotel keeps a finite provider-code registry; `static-registry` selects it.
// Cancellation, refund polling and security authorization are explicit local
// operations in that registry and deliberately have no remote selector fields.
const adapterRegistries: Record<AdapterSelector, (providerCode: OnlinePaymentProviderCode) => Promise<any>> = {
  'static-registry': providerCode => adapterLoaders[providerCode](),
};

function configuredSelector(provider: PaymentProviderRecord, functionName: AdapterFunctionName): AdapterSelector {
  const field = operationSelectorFields[functionName];
  const selector = field ? provider[field] : 'static-registry';
  if (selector !== 'static-registry') {
    throw new Error(`Payment provider selector for ${functionName} is unsupported; only the bounded static registry is allowed.`);
  }
  return selector;
}

async function getAdapter(provider: PaymentProviderRecord, functionName: AdapterFunctionName, admission: AdapterAdmission) {
  const providerCode = String(provider?.code || '');
  assertCustomerPaymentProvider(providerCode);
  const selector = configuredSelector(provider, functionName);
  if (admission === 'new-checkout') assertPaymentIntegrationAvailable(provider);
  else assertPaymentRecoveryAvailable(provider);
  return { adapter: await adapterRegistries[selector](providerCode), credentials: paymentProviderCredentials(provider) };
}

export function paymentAdapterAdmission(functionName: AdapterFunctionName, args: Record<string, unknown>): AdapterAdmission {
  return functionName === 'createPaymentFunction' ||
    (functionName === 'securityAuthorizationFunction' && args.action === 'initiate')
    ? 'new-checkout'
    : 'historical-recovery';
}

function isCredentialRejection(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { statusCode?: unknown; type?: unknown };
  return candidate.statusCode === 401 || candidate.type === 'StripeAuthenticationError';
}

export async function executeAdapterFunction({
  provider,
  functionName,
  args,
}: {
  provider: PaymentProviderRecord;
  functionName: AdapterFunctionName;
  args: Record<string, unknown>;
}): Promise<any> {
  const providerCode = String(provider?.code || '');
  const supported = new Set<AdapterFunctionName>([
    'securityAuthorizationFunction', 'createPaymentFunction', 'cancelPaymentFunction',
    'completePaymentFunction', 'refundPaymentFunction', 'getPaymentStatusFunction',
    'getRefundStatusFunction', 'generatePaymentLinkFunction', 'handleWebhookFunction',
  ]);
  if (!supported.has(functionName)) throw new Error('Unknown payment adapter operation.');
  const { adapter, credentials } = await getAdapter(provider, functionName, paymentAdapterAdmission(functionName, args));
  const fn = (adapter as Partial<Record<AdapterFunctionName, unknown>>)[functionName];
  if (typeof fn !== 'function') {
    throw new Error(`Payment provider ${providerCode} does not support ${functionName}.`);
  }
  try {
    return await (fn as any)({ ...args, providerCredentials: credentials });
  } catch (error) {
    if (error instanceof PaymentProviderCredentialRejectedError || isCredentialRejection(error)) {
      throw new PaymentProviderConfigurationError(providerCode, 'credentials_rejected');
    }
    throw error;
  }
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

export async function getRefundStatus({ provider, refundId }: any) {
  return executeAdapterFunction({ provider, functionName: 'getRefundStatusFunction', args: { refundId } });
}

export async function cancelPayment({ provider, paymentId, idempotencyKey }: any) {
  return executeAdapterFunction({ provider, functionName: 'cancelPaymentFunction', args: { paymentId, idempotencyKey } });
}

export async function securityAuthorization({ provider, ...args }: any) {
  if (provider?.code !== 'pp_stripe_stripe') throw new Error('Security card authorizations currently require configured Stripe.');
  return executeAdapterFunction({ provider, functionName: 'securityAuthorizationFunction', args });
}
