import { readChannelCredentials } from './channelCredentials';
import { decryptSensitiveText } from './sensitiveData';

const PLACEHOLDER = /placeholder|changeme|your_|xxx|dummy|example/i;

function complete(value: unknown, minimum = 16) {
  const text = String(value || '').trim();
  return Boolean(text && text.length >= minimum && !PLACEHOLDER.test(text));
}

export type PersistedPaymentProvider = {
  code?: string | null;
  isInstalled?: boolean | null;
  credentials?: unknown;
  metadata?: unknown;
};

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function paymentProviderUsesEnvironment(provider: PersistedPaymentProvider) {
  return provider.code === 'pp_stripe_stripe' &&
    !Object.values(object(provider.credentials)).some(value => value !== null && value !== undefined && value !== '');
}

export type PaymentProviderCredentialValues = Record<string, string | boolean | undefined>;

export function paymentProviderCredentials(provider: PersistedPaymentProvider): PaymentProviderCredentialValues {
  if (paymentProviderUsesEnvironment(provider)) {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }
  const stored = object(provider.credentials);
  // Only secrets are stored encrypted. Typed settings such as PayPal's `sandbox: false` keep
  // their type; reading them as text would turn a live account back into sandbox mode.
  return Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, typeof value === 'boolean' ? value : decryptSensitiveText(value)]));
}

export function paymentProviderEnabled(provider: PersistedPaymentProvider) {
  return paymentProviderUsesEnvironment(provider)
    ? process.env.STRIPE_ENABLED === 'true' && object(provider.metadata).stripeEnvironmentDisabled !== true
    : Boolean(provider.isInstalled);
}

/** Credential completeness is independent from admitting new checkout. */
export function paymentProviderCredentialsConfigured(provider: PersistedPaymentProvider) {
  try {
    const credentials = paymentProviderCredentials(provider);
    if (provider.code === 'pp_stripe_stripe') {
      return complete(credentials.secretKey, 8) && String(credentials.secretKey).startsWith('sk_') &&
        complete(credentials.publishableKey, 8) && String(credentials.publishableKey).startsWith('pk_') &&
        complete(credentials.webhookSecret, 8) && String(credentials.webhookSecret).startsWith('whsec_');
    }
    if (provider.code === 'pp_paypal_paypal') {
      return complete(credentials.clientId) && complete(credentials.clientSecret) && complete(credentials.webhookId);
    }
  } catch {
    return false;
  }
  return false;
}

/** Saved credentials win; empty Stripe records may use deployment credentials. */
export function paymentIntegrationConfigured(provider: PersistedPaymentProvider) {
  return paymentProviderEnabled(provider) && paymentProviderCredentialsConfigured(provider);
}

export type OutboxDispatchConfig = {
  enabled: boolean;
  url?: string;
  secret?: string;
  credentialKeyId?: string;
};

/**
 * Optional HTTP dispatch is infrastructure wiring, enabled only by a complete
 * tuple. No capability boolean is read and partial wiring fails closed.
 */
export function getOutboxDispatchConfig(env: NodeJS.ProcessEnv = process.env): OutboxDispatchConfig {
  const url = String(env.HOTEL_OUTBOX_DISPATCH_URL || '').trim();
  const secret = String(env.HOTEL_OUTBOX_DISPATCH_SECRET || '').trim();
  const credentialKeyId = String(env.HOTEL_OUTBOX_DISPATCH_CREDENTIAL_KEY_ID || '').trim();
  if (!url && !secret && !credentialKeyId) return { enabled: false };
  if (!url) throw new Error('HOTEL_OUTBOX_DISPATCH_URL is required when HTTP outbox dispatch wiring is present.');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('HOTEL_OUTBOX_DISPATCH_URL must be a valid URL.'); }
  if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new Error('HOTEL_OUTBOX_DISPATCH_URL must use HTTPS in production.');
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('HOTEL_OUTBOX_DISPATCH_URL must use HTTP or HTTPS.');
  if (!complete(secret, 32)) throw new Error('HOTEL_OUTBOX_DISPATCH_SECRET must contain at least 32 non-placeholder characters.');
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(credentialKeyId)) throw new Error('HOTEL_OUTBOX_DISPATCH_CREDENTIAL_KEY_ID is required and invalid.');
  return { enabled: true, url, secret, credentialKeyId };
}

export type ChannelIntegrationMode = 'disabled' | 'demo' | 'live' | 'invalid';

export function channelIntegrationMode(channel: { isActive?: boolean; credentials?: any }): ChannelIntegrationMode {
  if (!channel.isActive) return 'disabled';
  let credentials: Record<string, any>;
  try { credentials = readChannelCredentials(channel); } catch { return 'invalid'; }
  const configured = String(credentials.mode || '').toLowerCase();
  if (configured === 'disabled' || configured === 'demo' || configured === 'live') return configured;
  return 'invalid';
}

function canonicalChannelOrigin(value: unknown) {
  let parsed: URL;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('Live channel origin admission is required.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Live channel origins must be canonical HTTPS origins without credentials or paths.');
  }
  return parsed.origin;
}

export function requireLiveChannelEndpoint(channel: any, operation: 'inventory' | 'reservations') {
  const mode = channelIntegrationMode(channel);
  if (mode !== 'live') throw new Error(`Channel outbound sync is ${mode}; live mode is required.`);
  const credentials = readChannelCredentials(channel);
  const endpoint = operation === 'inventory'
    ? credentials.inventoryEndpoint || credentials.syncEndpoint || (credentials.apiBaseUrl ? `${credentials.apiBaseUrl}/inventory/sync` : '')
    : credentials.reservationEndpoint || credentials.pullReservationsEndpoint || (credentials.apiBaseUrl ? `${credentials.apiBaseUrl}/reservations/pull` : '');
  let parsed: URL;
  try { parsed = new URL(String(endpoint || '')); } catch { throw new Error(`Live channel ${operation} endpoint is required and must be valid.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`Live channel ${operation} endpoint must use HTTPS without URL credentials, query, or fragment.`);
  const allowedOrigins = credentials.allowedOrigins;
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length < 1 || allowedOrigins.length > 20) throw new Error('Live channel requires an explicitly admitted HTTPS origin.');
  const admittedOrigins = new Set(allowedOrigins.map(canonicalChannelOrigin));
  if (!admittedOrigins.has(parsed.origin)) throw new Error(`Live channel ${operation} endpoint origin is not admitted.`);
  const authorization = credentials.accessToken
    ? `Bearer ${credentials.accessToken}`
    : credentials.apiKey
      ? `ApiKey ${credentials.apiKey}`
      : credentials.clientId && credentials.clientSecret
        ? `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`
        : '';
  if (!complete(authorization, 16)) throw new Error('Live channel credential material is required.');
  return { endpoint: parsed.toString(), headers: { Authorization: authorization } };
}
