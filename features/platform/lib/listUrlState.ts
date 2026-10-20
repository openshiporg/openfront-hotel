'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * List view state (search, filter, sort, page) kept in the URL, as the platform filter bar
 * does, so opening a record and coming back, reloading, or Back/Forward restores the view.
 * Values equal to their default are left out of the URL; other parameters are preserved.
 * Changing anything except `page` returns to the first page.
 */
export function useListUrlState<T extends Record<string, string>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const values = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, params?.get(key) ?? fallback]),
  ) as T;

  const update = React.useCallback((patch: Partial<T>) => {
    const next = new URLSearchParams(params?.toString() || '');
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '' || value === defaults[key]) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in patch)) next.delete('page');
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname || '', { scroll: false }));
  }, [params, pathname, router, defaults]);

  return { values, update, pending };
}

/** Search box text that is committed to the URL after the user pauses typing. */
export function useDebouncedSearch(committed: string, commit: (value: string) => void, delayMs = 300) {
  const [text, setText] = React.useState(committed);
  const commitRef = React.useRef(commit);
  const sent = React.useRef(committed);
  React.useEffect(() => { commitRef.current = commit; });
  // Follow outside changes (Back/Forward, clear filters), but not the echo of our own commit,
  // which could arrive after the user has typed more.
  React.useEffect(() => {
    if (committed !== sent.current) { sent.current = committed; setText(committed); }
  }, [committed]);
  React.useEffect(() => {
    const value = text.trim();
    if (value === sent.current) return;
    const timer = window.setTimeout(() => { sent.current = value; commitRef.current(value); }, delayMs);
    return () => window.clearTimeout(timer);
  }, [text, delayMs]);
  return [text, setText] as const;
}
