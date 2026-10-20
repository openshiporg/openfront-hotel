import 'server-only';

import { headers } from 'next/headers';
import { getServerBaseUrl } from '@/lib/graphql-client';
import { createBoundedGraphqlFetch } from '@/features/keystone/lib/boundedGraphqlFetch';

export const GUEST_SESSION_COOKIE = 'keystonejs-session';
const boundedGraphqlFetch = createBoundedGraphqlFetch(8_000);

/** Replace or add one cookie in a raw Cookie header. */
function withCookie(cookieHeader: string, name: string, value: string) {
  const others = cookieHeader.split(';').map(part => part.trim()).filter(part => part && !part.startsWith(`${name}=`));
  return [...others, `${name}=${value}`].join('; ');
}

/**
 * Server-side storefront GraphQL with the visitor's own cookies (guest session and
 * device-verified stays). Callers that just signed in pass the new session token.
 */
export async function storefrontServerGraphql<T>(query: string, variables: Record<string, unknown> = {}, options: { sessionToken?: string; cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const incoming = await headers().catch(() => null);
  const request = new Headers({ 'content-type': 'application/json', ...(options.headers || {}) });
  let cookie = incoming?.get('cookie') || '';
  if (options.sessionToken) cookie = withCookie(cookie, GUEST_SESSION_COOKIE, options.sessionToken);
  for (const [name, value] of Object.entries(options.cookies || {})) cookie = withCookie(cookie, name, encodeURIComponent(value));
  if (cookie) request.set('cookie', cookie);
  const forwardedProtocol = incoming?.get('x-forwarded-proto');
  if (forwardedProtocol) request.set('x-forwarded-proto', forwardedProtocol);
  const response = await boundedGraphqlFetch(`${getServerBaseUrl()}/api/graphql`, {
    method: 'POST',
    headers: request,
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as { data?: T; errors?: Array<{ message?: string }> } | null;
  return { ok: response.ok && Boolean(payload?.data) && !payload?.errors?.length, status: response.status, data: payload?.data ?? null, errors: payload?.errors || [], response };
}
