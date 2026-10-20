'use client';

import * as React from 'react';

export type ListPage<T, Extra = unknown> = { items: T[]; total: number; extra?: Extra };

/**
 * A server-filtered list read in bounded pages. Whenever the filter key changes the first
 * page is read again; `loadMore` appends the next page. Every read carries a request number
 * and a response that is no longer the latest is dropped, so a slow earlier search can never
 * replace the results of a newer one.
 */
export function usePagedList<T extends { id: string }, Extra = unknown>(
  load: (skip: number) => Promise<ListPage<T, Extra>>,
  filterKey: string,
) {
  const [items, setItems] = React.useState<T[]>([]);
  const [total, setTotal] = React.useState(0);
  const [extra, setExtra] = React.useState<Extra | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const request = React.useRef(0);
  const loadRef = React.useRef(load);
  loadRef.current = load;

  const reload = React.useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError(null);
    try {
      const page = await loadRef.current(0);
      if (id !== request.current) return;
      setItems(page.items); setTotal(page.total); setExtra(page.extra);
    } catch (cause) {
      if (id !== request.current) return;
      setError(cause instanceof Error ? cause.message : 'This list could not be loaded.');
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload, filterKey]);
  React.useEffect(() => () => { request.current += 1; }, []);

  const loadMore = React.useCallback(async () => {
    const id = request.current;
    setLoadingMore(true);
    try {
      const page = await loadRef.current(items.length);
      if (id !== request.current) return;
      const known = new Set(items.map((item) => item.id));
      setItems([...items, ...page.items.filter((item) => !known.has(item.id))]);
      setTotal(page.total); setExtra(page.extra);
    } catch (cause) {
      if (id === request.current) setError(cause instanceof Error ? cause.message : 'More results could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }, [items]);

  return { items, total, extra, loading, loadingMore, error, reload, loadMore, hasMore: items.length < total };
}
