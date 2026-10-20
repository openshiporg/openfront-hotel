import { GraphQLError } from 'graphql';

// Database, runtime and provider text can echo queries, variables, stack frames and credentials.
const UNSAFE_TEXT = /prisma|invalid `|variable "\$|\bselect\b[^.]*\bfrom\b|\binsert into\b|\bdelete from\b|unexpected token|cannot read propert|is not a function|is not defined|econnrefused|econnreset|etimedout|enotfound|fetch failed|socket hang up|\bat [\w.$<>]+ \(|sk_(live|test)_|pk_(live|test)_|rk_(live|test)_|whsec_|bearer\s|-----begin/i;

/** A deliberate, single-line business-rule message from our own code, safe to show staff. */
export function isSafeBusinessMessage(message: unknown): message is string {
  return typeof message === 'string'
    && message.length > 0
    && message.length <= 400
    && !message.includes('\n')
    && message !== 'Unexpected error.'
    && !UNSAFE_TEXT.test(message);
}

// Keystone may load its own copy of graphql, so compare by name as Yoga does.
function isGraphQLError(error: unknown): error is GraphQLError {
  return error instanceof Error && error.name === 'GraphQLError';
}

function located(error: GraphQLError, message: string, extensions: Record<string, unknown>) {
  return new GraphQLError(message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, extensions });
}

/**
 * Yoga masks every non-GraphQLError as "Unexpected error.", which hid rules such as
 * "Open a cashier shift before recording cash payment" from staff. Signed-in dashboard
 * staff now receive our own business-rule messages; everyone else keeps the default
 * masking. Keystone debug, stack and Prisma details are always removed.
 */
export function maskHotelGraphqlError(error: unknown, message: string, staff: boolean): Error {
  if (isGraphQLError(error)) {
    const original = error.originalError;
    if (!original || isGraphQLError(original)) {
      if (error.extensions?.code === 'KS_PRISMA_ERROR') return located(error, message, { unexpected: true });
      const { debug, prisma, exception, originalError, ...extensions } = (error.extensions || {}) as Record<string, unknown>;
      return debug || prisma || exception || originalError ? located(error, error.message, extensions) : error;
    }
    if (staff && original.name === 'Error' && isSafeBusinessMessage(original.message)) {
      return located(error, original.message, { code: 'HOTEL_BUSINESS_RULE' });
    }
    return located(error, message, { unexpected: true });
  }
  if (staff && error instanceof Error && error.name === 'Error' && isSafeBusinessMessage(error.message)) {
    return new GraphQLError(error.message, { extensions: { code: 'HOTEL_BUSINESS_RULE' } });
  }
  return new GraphQLError(message, { extensions: { unexpected: true } });
}
