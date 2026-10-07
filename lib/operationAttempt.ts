'use client';

/** Persist only a hash and random capability, so reload/lost response retries use the same identity. */
export async function operationAttempt(scope: string, payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const storageKey = `hotel-attempt:${scope}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(storageKey, key); }
  return { key, complete: () => sessionStorage.removeItem(storageKey) };
}
