/**
 * Production Server Actions replace thrown error messages with a generic notice,
 * so platform mutations return expected business failures as values instead.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Client side: turn a returned failure back into an Error carrying the property's own message. */
export function unwrapAction<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.data;
}
