const PLACEHOLDER = /(^|[-_.])(test|dummy|placeholder|changeme|your[_-]|example)([-_.]|$)|keystone|ethereal|localhost|127\.0\.0\.1/i;

function required(env: NodeJS.ProcessEnv, key: string) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(`${key} is required in production.`);
  return value;
}

function strongDomainSecret(env: NodeJS.ProcessEnv, key: string) {
  const value = required(env, key);
  if (value.length < 32) throw new Error(`${key} must contain at least 32 characters.`);
  if (PLACEHOLDER.test(value)) throw new Error(`${key} contains a development or placeholder value.`);
  return value;
}

function databaseUrl(env: NodeJS.ProcessEnv) {
  const value = required(env, 'DATABASE_URL');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  return value;
}

function httpsOrigin(env: NodeJS.ProcessEnv, key: string) {
  const value = required(env, key);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${key} must be a valid URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.endsWith('.local')) {
    throw new Error(`${key} must be a canonical HTTPS origin without credentials, path, query, or fragment.`);
  }
  return url.origin;
}

function complete(values: Array<string | undefined>) {
  return values.every(value => Boolean(String(value || '').trim()));
}

export type ProductionCapabilities = {
  mailInfrastructureConfigured: boolean;
  storageInfrastructureConfigured: boolean;
};

/**
 * Validates only process-level infrastructure and trust-boundary configuration.
 * Hotel capabilities are intentionally not environment switches: property,
 * PaymentProvider, and Channel records remain the durable source of truth.
 */
export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): ProductionCapabilities {
  const capabilities = {
    mailInfrastructureConfigured: complete([env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM]),
    storageInfrastructureConfigured: complete([env.S3_BUCKET_NAME, env.S3_REGION, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY, env.S3_ENDPOINT]),
  };
  if (env.NODE_ENV !== 'production') return capabilities;

  databaseUrl(env);
  strongDomainSecret(env, 'SESSION_SECRET');
  strongDomainSecret(env, 'HOTEL_DATA_ENCRYPTION_KEY');
  strongDomainSecret(env, 'HOTEL_QUOTE_SECRET');
  const site = httpsOrigin(env, 'NEXT_PUBLIC_SITE_URL');
  const auth = httpsOrigin(env, 'NEXTAUTH_URL');
  if (site !== auth) throw new Error('NEXT_PUBLIC_SITE_URL and NEXTAUTH_URL must use the same canonical origin.');
  const trustProxy = String(env.TRUST_PROXY || 'off').toLowerCase();
  if (!['off', 'railway'].includes(trustProxy)) throw new Error('TRUST_PROXY must be off or railway.');
  if (trustProxy === 'railway' && !env.RAILWAY_ENVIRONMENT) throw new Error('TRUST_PROXY=railway requires RAILWAY_ENVIRONMENT.');

  return capabilities;
}
