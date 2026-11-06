'use client';

import { useEffect, useState } from 'react';

/** Id of the section nearest the top of the viewport, for sticky section tabs. */
export function useScrollSpy(ids: string[], enabled = true) {
  const [active, setActive] = useState(ids[0] || '');
  const key = ids.join('|');
  // The section list can change after mount (e.g. phone layout adds a first section); start from its first id again.
  useEffect(() => { setActive(key.split('|')[0] || ''); }, [key]);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const sections = key.split('|').map(id => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top); else visible.delete(entry.target.id); });
      const next = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      if (next) setActive(next);
    }, { rootMargin: '-140px 0px -55% 0px' });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [key, enabled]);
  return active;
}
