const SAFE_OPERATIONAL_MESSAGES = {
  refund: 'Refund processing failed; reconcile the durable intent and provider evidence before replay.',
  channel: 'Channel synchronization failed; inspect the durable sync event before retrying.',
  outbox: 'Delivery processing failed; inspect durable attempt and adapter evidence before replay.',
  worker: 'Background processing failed; inspect durable operation evidence before retrying.',
} as const;

export type SafeOperationalFailureKind = keyof typeof SAFE_OPERATIONAL_MESSAGES;

/** Convert untrusted infrastructure/provider exceptions to a stable, non-sensitive operator message. */
export function safeOperationalErrorMessage(kind: SafeOperationalFailureKind, _error?: unknown): string {
  return SAFE_OPERATIONAL_MESSAGES[kind];
}
