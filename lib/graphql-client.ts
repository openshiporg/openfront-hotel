import { GraphQLClient } from 'graphql-request';
import { createBoundedGraphqlFetch } from '@/features/keystone/lib/boundedGraphqlFetch';
import { resolveInternalBaseUrl } from '@/features/keystone/lib/internal-origin';

export function getServerBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return resolveInternalBaseUrl(env);
}

export function getGraphQLEndpoint() {
  if (typeof window !== 'undefined') {
    return '/api/graphql';
  }

  return `${getServerBaseUrl()}/api/graphql`;
}

const graphqlFetch = createBoundedGraphqlFetch(8_000);

export const graphqlClient = new GraphQLClient(getGraphQLEndpoint(), {
  headers: {},
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    graphqlFetch(input, { ...init, credentials: 'include' }),
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
