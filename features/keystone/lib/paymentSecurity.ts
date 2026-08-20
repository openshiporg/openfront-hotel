import { paymentIntegrationConfigured, type PersistedPaymentProvider } from './integrationConfig';

export const ONLINE_PAYMENT_PROVIDER_CODES = [
  'pp_stripe_stripe',
  'pp_paypal_paypal',
] as const;

export type OnlinePaymentProviderCode = (typeof ONLINE_PAYMENT_PROVIDER_CODES)[number];
export type PaymentWebhookDisposition = 'succeeded' | 'failed' | 'ignored';

const SUCCESS_WEBHOOK_TYPES = new Set([
  'payment_intent.succeeded',
  'checkout.session.completed',
  'PAYMENT.CAPTURE.COMPLETED',
]);

const FAILED_WEBHOOK_TYPES = new Set([
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.DECLINED',
]);

export function isOnlinePaymentProviderCode(
  providerCode: string
): providerCode is OnlinePaymentProviderCode {
  return (ONLINE_PAYMENT_PROVIDER_CODES as readonly string[]).includes(providerCode);
}

export function assertCustomerPaymentProvider(
  providerCode: string
): asserts providerCode is OnlinePaymentProviderCode {
  if (providerCode === 'pp_manual_manual') {
    throw new Error(
      'Manual/offline payments cannot be used for customer checkout. An operator must record offline settlement.'
    );
  }
  if (!isOnlinePaymentProviderCode(providerCode)) {
    throw new Error('Unsupported customer payment provider.');
  }
}

export function isPaymentProviderConfigured(provider: PersistedPaymentProvider) {
  return paymentIntegrationConfigured(provider);
}

export function assertPaymentIntegrationAvailable(provider: PersistedPaymentProvider) {
  const providerCode = String(provider?.code || '');
  assertCustomerPaymentProvider(providerCode);
  if (!provider?.isInstalled) throw new Error(`Payment provider ${providerCode} is disabled.`);
  if (!isPaymentProviderConfigured(provider)) throw new Error(`Payment provider ${providerCode} is not completely configured.`);
}

export function buildPaymentReplayKey(providerCode: string, eventId: string) {
  return `${providerCode}:${eventId}`;
}

export function classifyPaymentWebhookType(
  eventType: string
): PaymentWebhookDisposition {
  if (SUCCESS_WEBHOOK_TYPES.has(eventType)) return 'succeeded';
  if (FAILED_WEBHOOK_TYPES.has(eventType)) return 'failed';
  return 'ignored';
}

export function requireVerifiedWebhookIdentity({
  providerCode,
  rawBody,
  eventId,
  eventType,
}: {
  providerCode: string;
  rawBody?: string | null;
  eventId?: string | null;
  eventType?: string | null;
}) {
  assertCustomerPaymentProvider(providerCode);
  if (!rawBody) {
    throw new Error('A raw request body is required for webhook verification.');
  }

  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId || normalizedEventId.length > 255) {
    throw new Error('A verified provider event id is required.');
  }

  const normalizedEventType = String(eventType || '').trim();
  if (!normalizedEventType || normalizedEventType.length > 255) {
    throw new Error('A verified provider event type is required.');
  }

  return {
    providerCode,
    eventId: normalizedEventId,
    eventType: normalizedEventType,
    replayKey: buildPaymentReplayKey(providerCode, normalizedEventId),
  };
}
