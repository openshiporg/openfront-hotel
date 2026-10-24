/**
 * A booking rule a guest can act on ("This rate allows at most 14 nights."). Public resolvers
 * pass these messages through; every other error stays masked. It keeps the plain `Error`
 * name, so staff error handling treats it like any other business-rule message.
 */
export class GuestRuleError extends Error {}

export function isGuestRuleError(error: unknown): error is GuestRuleError {
  return error instanceof GuestRuleError;
}
