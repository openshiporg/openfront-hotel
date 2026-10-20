import { isSafeBusinessMessage } from '@/features/keystone/lib/hotelGraphqlErrors';

const GENERIC_MESSAGE = 'Request could not be completed. Check the affected record and operation status before taking further action, or contact the property administrator.';

// Transport, schema and database errors can echo variables, personal data, queries and credentials.
const UNSAFE_CODES = new Set(['GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT', 'PERSISTED_QUERY_NOT_FOUND', 'KS_PRISMA_ERROR']);
// Keystone lists one rule per "  - List.field: message" line under a summary line.
const MULTI_LINE_CODES = new Set(['KS_VALIDATION_FAILURE', 'KS_EXTENSION_ERROR']);

/**
 * Deliberate business-rule errors from our resolvers ("Open a cashier shift before
 * recording cash payment or cash refund.") tell staff what to do next. Everything
 * else, including the server's own masked "Unexpected error.", stays generic.
 */
function safeBusinessMessage(raw: any): string | null {
  const code = raw?.extensions?.code;
  if (UNSAFE_CODES.has(code) || raw?.extensions?.unexpected) return null;
  const text = typeof raw?.message === 'string' ? raw.message : '';
  const lines = text.split('\n').map((line: string) => line.trim()).filter(Boolean);
  const message = MULTI_LINE_CODES.has(code) && lines.length > 1
    ? lines.slice(1, 4).map((line: string) => line.replace(/^-\s*/, '').replace(/^[\w.]+:\s*/, '')).join(' ')
    : lines[0] || '';
  return isSafeBusinessMessage(message) ? message : null;
}

/** Never copy GraphQL transport errors verbatim: only business-rule messages pass through. */
export function safeGraphQLError(error: unknown) {
  const response = (error as any)?.response;
  const raw = Array.isArray(response?.errors) ? response.errors : [];
  const errors = raw.slice(0, 20).map((item: unknown) => ({ message: safeBusinessMessage(item) || GENERIC_MESSAGE }));
  const message = errors.find((item: { message: string }) => item.message !== GENERIC_MESSAGE)?.message || GENERIC_MESSAGE;
  return { message, errors };
}
export function safeGraphQLLog(error: unknown) {
  const status = Number((error as any)?.response?.status);
  return { status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, errorCount: Array.isArray((error as any)?.response?.errors) ? (error as any).response.errors.length : 0 };
}

/** Message for an error raised inside a Server Action: our own validation text, never internals. */
export function safeActionMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || error.name !== 'Error') return fallback;
  return isSafeBusinessMessage(error.message) ? error.message : fallback;
}
