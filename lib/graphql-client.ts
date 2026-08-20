import { GraphQLClient } from 'graphql-request';

export function getServerBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const port = /^\d+$/.test(env.PORT || '') ? env.PORT : '3000';
  return `http://127.0.0.1:${port}`;
}

export function getGraphQLEndpoint() {
  if (typeof window !== 'undefined') {
    return '/api/graphql';
  }

  return `${getServerBaseUrl()}/api/graphql`;
}

export const graphqlClient = new GraphQLClient(getGraphQLEndpoint(), {
  headers: {},
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: 'include' }),
});

export async function graphqlQuery<T>(query: string, variables?: any): Promise<T> {
  try {
    const client = typeof window === 'undefined'
      ? new GraphQLClient(getGraphQLEndpoint(), { headers: {} })
      : graphqlClient;
    const data = await client.request<T>(query, variables);
    return data;
  } catch (error) {
    console.error('GraphQL request failed', { kind: error instanceof Error ? error.name : 'unknown' });
    throw error;
  }
}
