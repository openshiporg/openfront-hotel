import { GraphQLError, type GraphQLSchema } from 'graphql';
import { hotelResetActionSecret } from './hotelResetActionSecret';

function resetActionHeader(context: unknown): string {
  if (!context || typeof context !== 'object' || !('req' in context)) return '';
  const request = (context as { req?: { headers?: unknown } }).req;
  const headers = request?.headers;
  if (!headers || typeof headers !== 'object') return '';
  if ('get' in headers && typeof headers.get === 'function') {
    return String(headers.get('x-hotel-reset-action') || '');
  }
  const entry = Object.entries(headers as Record<string, unknown>)
    .find(([key]) => key.toLowerCase() === 'x-hotel-reset-action')?.[1];
  return Array.isArray(entry) ? String(entry[0] || '') : typeof entry === 'string' ? entry : '';
}

/** Override Keystone's built-in reset paths in the shared executable schema. */
export function applyHotelAuthGraphqlPolicy(schema: GraphQLSchema): GraphQLSchema {
  const fields = schema.getMutationType()?.getFields();
  const builtInRedemption = fields?.redeemUserPasswordResetToken;
  if (builtInRedemption) {
    builtInRedemption.resolve = () => {
      throw new GraphQLError('This password reset operation is unavailable.');
    };
  }

  const builtInRequest = fields?.sendUserPasswordResetLink;
  if (builtInRequest) {
    const originalResolver = builtInRequest.resolve;
    builtInRequest.resolve = (root, args, context, info) => {
      const expected = hotelResetActionSecret();
      const supplied = resetActionHeader(context);
      if (!expected || supplied !== expected) return true;
      if (typeof originalResolver !== 'function') {
        throw new GraphQLError('Password reset is currently unavailable.');
      }
      return originalResolver(root, args, context, info);
    };
  }

  return schema;
}
