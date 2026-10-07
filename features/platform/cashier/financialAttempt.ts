type AttemptStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** Store only a payload digest and operation IDs, never customer/financial form contents. */
export async function durableFinancialAttempt(store: AttemptStore, storageKey: string, payload: unknown, recordId = '') {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  let existing: any = null;
  try { existing = JSON.parse(store.getItem(storageKey) || 'null'); } catch { /* A malformed draft is not a trusted operation identity. */ }
  if (existing?.hash === hash && typeof existing.key === 'string' && typeof existing.id === 'string') return existing as { hash: string; key: string; id: string };
  const attempt = { hash, key: crypto.randomUUID(), id: recordId || crypto.randomUUID() };
  store.setItem(storageKey, JSON.stringify(attempt));
  return attempt;
}
