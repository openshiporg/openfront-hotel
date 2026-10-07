import {
  paymentIntegrationConfigured,
  paymentProviderCredentialsConfigured,
  type PersistedPaymentProvider,
} from './integrationConfig';

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

export class PaymentProviderConfigurationError extends Error {
  constructor(providerCode: string, reason: 'disabled' | 'credentials_incomplete' | 'credentials_rejected') {
    const message = reason === 'disabled'
      ? `Payment provider ${providerCode} is disabled for new checkout.`
      : reason === 'credentials_rejected'
        ? `Payment provider ${providerCode} rejected its configured credentials; reconciliation is required.`
        : `Payment provider ${providerCode} has incomplete credentials.`;
    super(message);
    this.name = 'PaymentProviderConfigurationError';
  }
}

export function isPaymentProviderConfigured(provider: PersistedPaymentProvider) {
  return paymentIntegrationConfigured(provider);
}

export function isPaymentProviderRecoveryConfigured(provider: PersistedPaymentProvider) {
  return paymentProviderCredentialsConfigured(provider);
}

export function assertPaymentIntegrationAvailable(provider: PersistedPaymentProvider) {
  const providerCode = String(provider?.code || '');
  assertCustomerPaymentProvider(providerCode);
  if (!provider?.isInstalled) throw new PaymentProviderConfigurationError(providerCode, 'disabled');
  if (!isPaymentProviderConfigured(provider)) {
    throw new PaymentProviderConfigurationError(providerCode, 'credentials_incomplete');
  }
}

/** Existing signed financial identities may reconcile while new checkout is disabled. */
export function assertPaymentRecoveryAvailable(provider: PersistedPaymentProvider) {
  const providerCode = String(provider?.code || '');
  assertCustomerPaymentProvider(providerCode);
  if (!isPaymentProviderRecoveryConfigured(provider)) {
    throw new PaymentProviderConfigurationError(providerCode, 'credentials_incomplete');
  }
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

/** Provider-normalized refund evidence; an accepted request is not settled money. */
export function validateRefundSettlement(result: any, expected: { amountMinor: number; currencyCode: string; providerRefundId?: string | null }) {
  const id = String(result?.data?.id || result?.data?.refund_id || '').trim();
  if (!id) throw new Error('Provider did not return durable refund evidence.');
  if (expected.providerRefundId && expected.providerRefundId !== id) throw new Error('Provider refund identity changed during reconciliation.');
  const amount = result?.amount;
  if (!Number.isSafeInteger(amount) || amount !== expected.amountMinor) throw new Error('Provider refund amount does not match the durable intent.');
  const currency = String(result?.currencyCode || result?.data?.currency || result?.data?.amount?.currency_code || '').toUpperCase();
  if (currency !== expected.currencyCode.toUpperCase()) throw new Error('Provider refund currency does not match the durable intent.');
  const status = String(result?.status || '').toLowerCase();
  if (!['succeeded', 'completed', 'pending', 'requires_action', 'failed', 'canceled', 'cancelled'].includes(status)) throw new Error('Provider refund status is unrecognized.');
  return { id, status, settled: status === 'succeeded' || status === 'completed', failed: ['failed', 'canceled', 'cancelled'].includes(status) };
}

export function captureRecoveryAmount(booking: any, capturedMinor: number, outstandingMinor: number, confirmationAvailable: boolean) {
  if (!Number.isSafeInteger(capturedMinor) || capturedMinor <= 0 || !Number.isSafeInteger(outstandingMinor) || outstandingMinor < 0) throw new Error('Invalid capture obligation.');
  if (!['pending', 'confirmed'].includes(booking.status) || !confirmationAvailable) return capturedMinor;
  return Math.max(0, capturedMinor - outstandingMinor);
}

/** Frozen booking terms govern the initial payment; confirmed stays collect the remainder. */
export function bookingPaymentDueNow(booking: any, collectibleMinor: number) {
  if (!Number.isSafeInteger(collectibleMinor) || collectibleMinor < 0) throw new Error('Invalid collectible obligation.');
  const percent = Number(booking.pricingSnapshot?.depositPercent ?? 100);
  if (!Number.isSafeInteger(percent) || percent < 1 || percent > 100) throw new Error('Invalid frozen booking deposit policy.');
  if (booking.status !== 'pending' || booking.billingFolioId || booking.billingFolio?.id) return collectibleMinor;
  const totalMinor = Number(booking.pricingSnapshot?.totalMinor ?? booking.totalAmountMinor);
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error('Invalid frozen booking total.');
  const requiredMinor = Math.ceil(totalMinor * percent / 100);
  const alreadySettledMinor = Math.max(0, totalMinor - collectibleMinor);
  return Math.min(collectibleMinor, Math.max(0, requiredMinor - alreadySettledMinor));
}
