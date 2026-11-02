import { configuredSiteOrigin } from './productionConfig';

function requestHeader(context: any, name: string): string {
  const headers = context?.req?.headers;
  const value = typeof headers?.get === 'function' ? headers.get(name) : headers?.[name];
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : '';
}

function canonicalHttpOrigin(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Payment return origin is invalid.');
  }
  return url.origin;
}

export function paymentRequestOrigin(context: any, env: NodeJS.ProcessEnv = process.env) {
  const configured = configuredSiteOrigin(env);
  const browserOrigin = requestHeader(context, 'origin');
  if (browserOrigin) {
    const origin = canonicalHttpOrigin(browserOrigin);
    const url = new URL(origin);
    // A brand domain already serving this request is a same-origin checkout, not
    // an arbitrary redirect destination. Never admit a different Origin or trust
    // caller-supplied x-forwarded-host to select the payment return destination.
    if (url.host === requestHeader(context, 'host') && (url.protocol === 'https:' || env.NODE_ENV !== 'production')) return origin;
    if (configured && origin === canonicalHttpOrigin(configured)) return origin;
    throw new Error('Payment return origin does not match this checkout request.');
  }
  if (configured) return canonicalHttpOrigin(configured);
  if (env.NODE_ENV !== 'production') {
    const host = requestHeader(context, 'host');
    if (host) return canonicalHttpOrigin(`http://${host}`);
  }
  throw new Error('Payment return origin could not be verified from this checkout request.');
}

export function safePaymentReturnUrl(value: string | null | undefined, context: any, allowedPath: string, env: NodeJS.ProcessEnv = process.env) {
  if (!value) throw new Error('Payment return URL is required.');
  const origin = paymentRequestOrigin(context, env);
  const url = new URL(value, origin);
  if (url.origin !== origin || url.pathname !== allowedPath || url.username || url.password || url.hash) {
    throw new Error('Payment return URL is not allowed.');
  }
  return url.toString();
}
