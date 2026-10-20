'use client';

import { useSyncExternalStore } from 'react';

/** Server snapshot is `false`, so desktop-only affordances never render during SSR. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    callback => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
