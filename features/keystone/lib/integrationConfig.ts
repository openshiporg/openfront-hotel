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

export function paymentProviderCredentials(provider: PersistedPaymentProvider) {
  const stored = object(provider.credentials);
  return Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, decryptSensitiveText(value)]));
}

/** Persisted provider enablement and credential completeness are authoritative. */
export function paymentIntegrationConfigured(provider: PersistedPaymentProvider) {
  if (!provider?.isInstalled) return false;
  const credentials = paymentProviderCredentials(provider);
  if (provider.code === 'pp_stripe_stripe') {
    return complete(credentials.secretKey, 8) && String(credentials.secretKey).startsWith('sk_') &&
      complete(credentials.publishableKey, 8) && String(credentials.publishableKey).startsWith('pk_') &&
      complete(credentials.webhookSecret, 8) && String(credentials.webhookSecret).startsWith('whsec_');
  }
  if (provider.code === 'pp_paypal_paypal') {
    return complete(credentials.clientId) && complete(credentials.clientSecret) && complete(credentials.webhookId);
  }
  return false;
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
  const credentials = channel.credentials && typeof channel.credentials === 'object' ? channel.credentials : {};
  const configured = String(credentials.mode || '').toLowerCase();
  if (configured === 'disabled' || configured === 'demo' || configured === 'live') return configured;
  return 'invalid';
}

export function requireLiveChannelEndpoint(channel: any, operation: 'inventory' | 'reservations') {
  const mode = channelIntegrationMode(channel);
  if (mode !== 'live') throw new Error(`Channel outbound sync is ${mode}; live mode is required.`);
  const credentials = channel.credentials || {};
  const endpoint = operation === 'inventory'
    ? credentials.inventoryEndpoint || credentials.syncEndpoint || (credentials.apiBaseUrl ? `${credentials.apiBaseUrl}/inventory/sync` : '')
    : credentials.reservationEndpoint || credentials.pullReservationsEndpoint || (credentials.apiBaseUrl ? `${credentials.apiBaseUrl}/reservations/pull` : '');
  let parsed: URL;
  try { parsed = new URL(String(endpoint || '')); } catch { throw new Error(`Live channel ${operation} endpoint is required and must be valid.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`Live channel ${operation} endpoint must use HTTPS without URL credentials.`);
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
