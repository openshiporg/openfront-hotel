export const GROUP_OPERATIONS_DISABLED_MESSAGE =
  'Group operations are disabled for the bounded direct-booking launch.';

/**
 * Group-block and master-folio code is retained as an experimental P2 reference,
 * but the bounded launch must not expose a write path into that unsupported state.
 */
export function rejectDisabledGroupOperation(): void {
  throw new Error(GROUP_OPERATIONS_DISABLED_MESSAGE);
}
