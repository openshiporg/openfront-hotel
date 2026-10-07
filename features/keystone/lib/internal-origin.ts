/** Server-to-self GraphQL calls must never derive their recipient from request headers. */
export function resolveInternalBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawPort = env.PORT || '3000';
  if (!/^\d{1,5}$/.test(rawPort)) throw new Error('The internal application port is invalid.');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The internal application port is invalid.');
  }
  return `http://127.0.0.1:${port}`;
}
