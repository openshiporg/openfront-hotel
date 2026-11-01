'use client';

import { useState, useSyncExternalStore } from 'react';
import { ShieldCheck, X } from 'lucide-react';

const KEY = 'hotel-cancellation-bar-dismissed';
const noop = () => () => {};
const dismissedThisSession = () => { try { return Boolean(sessionStorage.getItem(KEY)); } catch { return false; } };

/** The navy strip along the bottom of the home page with the property's flexible-rate terms. Dismissed for the session. */
export function CancellationBar({ text }: { text: string }) {
  const stored = useSyncExternalStore(noop, dismissedThisSession, () => false);
  const [closed, setClosed] = useState(false);
  if (stored || closed) return null;
  return <aside className="rg-cancelbar sf-noprint" aria-label="Cancellation">
    <p><ShieldCheck aria-hidden="true" />{text}</p>
    <button type="button" aria-label="Dismiss" onClick={() => { setClosed(true); try { sessionStorage.setItem(KEY, '1'); } catch { /* Hidden for this page only. */ } }}><X aria-hidden="true" /></button>
  </aside>;
}
