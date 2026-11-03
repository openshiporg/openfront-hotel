import { GraphQLClient } from 'graphql-request';
import { createBoundedGraphqlFetch } from '@/features/keystone/lib/boundedGraphqlFetch';
import { applyInternalIdentity, resolveInternalBaseUrl } from '@/features/keystone/lib/internal-origin';

export function getServerBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return resolveInternalBaseUrl(env);
}

export function getGraphQLEndpoint() {
  if (typeof window !== 'undefined') {
    return '/api/graphql';
  }

  return `${getServerBaseUrl()}/api/graphql`;
}

/** On the server, sign the visitor's own address onto the loopback call so rate limits count the visitor. */
function withServerIdentity(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (typeof window !== 'undefined') return inner(input, init);
    const headers = new Headers(init?.headers);
    try {
      const { headers: requestHeaders } = await import('next/headers');
      applyInternalIdentity(headers, await requestHeaders());
    } catch {
      // No request scope: send unsigned, as before.
    }
    return inner(input, { ...init, headers });
  };
}

const graphqlFetch = withServerIdentity(createBoundedGraphqlFetch(8_000));

export const graphqlClient = new GraphQLClient(getGraphQLEndpoint(), {
  headers: {},
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    graphqlFetch(input, { ...init, credentials: 'include' }),
});

// Payment settlement talks to the provider and retries serializable work, so it gets
// longer than ordinary storefront reads before the browser stops waiting.
const settlementFetch = withServerIdentity(createBoundedGraphqlFetch(45_000));

export const graphqlSettlementClient = new GraphQLClient(getGraphQLEndpoint(), {
  headers: {},
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    settlementFetch(input, { ...init, credentials: 'include' }),
});

export async function graphqlQuery<T>(query: string, variables?: any): Promise<T> {
  try {
    const client = typeof window === 'undefined'
      ? new GraphQLClient(getGraphQLEndpoint(), { headers: {}, fetch: graphqlFetch })
      : graphqlClient;
    const data = await client.request<T>(query, variables);
    return data;
  } catch (error) {
    console.error('GraphQL request failed', { kind: error instanceof Error ? error.name : 'unknown' });
    throw error;
  }
}
