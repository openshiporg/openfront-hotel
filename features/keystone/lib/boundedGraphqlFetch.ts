/** Keep GraphQL self-calls on their configured endpoint without redirects or unbounded hangs. */
export function createBoundedGraphqlFetch(
  timeoutMs = 8_000,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError('GraphQL fetch timeout must be a positive safe integer');
  }
  return (input, init = {}) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetcher(input, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  };
}
