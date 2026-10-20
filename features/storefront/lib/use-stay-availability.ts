'use client';

import { useEffect, useState } from 'react';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_STAY_CALENDAR } from '@/lib/queries';
import { daysBetween, monthStart } from './calendar';

export interface StayAvailabilityInput {
  /** One room type, or every room type when omitted. */
  roomTypeId?: string;
  /** First day of the month on screen. */
  month: string;
  /** The property's calendar day. */
  today: string;
}

const TTL_MS = 2 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<Record<string, boolean>> }>();

async function loadMonth(roomTypeId: string, month: string, today: string): Promise<Record<string, boolean>> {
  const from = month < today ? today : month;
  const to = monthStart(month, 1);
  if (daysBetween(from, to) < 1) return {};
  const data = await graphqlClient.request<{ storefrontStayCalendar: Array<{ date: string; available: boolean }> }>(GET_STAY_CALENDAR, {
    roomTypeId: roomTypeId || null,
    fromDate: `${from}T00:00:00Z`,
    toDate: `${to}T00:00:00Z`,
  });
  return Object.fromEntries((data.storefrontStayCalendar || []).map(night => [night.date, Boolean(night.available)]));
}

/**
 * Open (true) or sold out (false) for each night, from the property's live
 * inventory, gathered across every month viewed so far so a stay can span them.
 * Nights not loaded yet are absent and treated as open; the live quote is still
 * checked before anything is reserved.
 */
export function useStayAvailability(input: StayAvailabilityInput | null): Record<string, boolean> | undefined {
  const scope = input ? input.roomTypeId || '' : null;
  const month = input?.month || '';
  const today = input?.today || '';
  const [nights, setNights] = useState<{ scope: string; value: Record<string, boolean> }>({ scope: '', value: {} });

  useEffect(() => {
    if (scope === null || !month || !today) return;
    let current = true;
    const key = `${scope}:${month}:${today}`;
    // Settle before asking, so paging quickly through months stays cheap.
    const timer = window.setTimeout(() => {
      let entry = cache.get(key);
      if (!entry || Date.now() - entry.at > TTL_MS) {
        entry = { at: Date.now(), promise: loadMonth(scope, month, today) };
        cache.set(key, entry);
      }
      entry.promise
        .then(value => { if (current) setNights(previous => ({ scope, value: previous.scope === scope ? { ...previous.value, ...value } : value })); })
        .catch(() => { cache.delete(key); });
    }, 200);
    return () => { current = false; window.clearTimeout(timer); };
  }, [scope, month, today]);

  return scope !== null && nights.scope === scope ? nights.value : undefined;
}
