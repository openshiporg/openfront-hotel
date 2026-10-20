import 'server-only';

import { getAuthHeaders } from '@/features/dashboard/lib/cookies';
import type { KeystoneResponse } from '@/features/dashboard/lib/keystoneClient';
import { createBoundedGraphqlFetch } from '@/features/keystone/lib/boundedGraphqlFetch';
import { resolveInternalBaseUrl } from '@/features/keystone/lib/internal-origin';

const boundedGraphqlFetch = createBoundedGraphqlFetch(30_000);
const FAILURE = 'The request could not be completed.';

/**
 * Hotel operations that carry a password or one-time code. Same staff session as the
 * shared client, but sent to the internal endpoint and never logged, because the shared
 * client's error log includes request variables.
 */
export async function secretGraphql<T = any>(query: string, variables: Record<string, unknown>): Promise<KeystoneResponse<T>> {
  try {
    const response = await boundedGraphqlFetch(`${resolveInternalBaseUrl()}/api/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => null) as { data?: T; errors?: any[] } | null;
    if (!payload?.data || payload.errors?.length) return { success: false, error: FAILURE, errors: payload?.errors || [] };
    return { success: true, data: payload.data };
  } catch {
    return { success: false, error: FAILURE };
  }
}
