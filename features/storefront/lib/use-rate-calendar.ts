'use client';

import { useEffect, useMemo, useState } from 'react';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_STOREFRONT_QUOTE } from '@/lib/queries';
import type { StayQuote } from './quote';
import { addDays, daysBetween, monthStart } from './calendar';

export interface RateCalendarInput {
  roomTypeId: string;
  ratePlanId: string;
  minimumStay: number;
  /** The rate's longest stay; no limit when absent. */
  maximumStay?: number | null;
  /** Furthest arrival the rate accepts, in days from today; no limit when absent. */
  advanceBookingMax?: number | null;
  maxNights: number;
  adults: number;
  children: number;
  promoCode: string;
  /** First day of the month on screen. */
  month: string;
  /** The property's calendar day. */
  today: string;
}

export interface RateCalendar {
  /** Room charge in minor units, keyed by night (`YYYY-MM-DD`). */
  prices: Record<string, number>;
  currencyCode: string;
  /** True when every selectable night in the month was priced. */
  complete: boolean;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<RateCalendar> }>();

async function quoteWindow(input: RateCalendarInput, from: string, to: string) {
  const data = await graphqlClient.request<{ storefrontQuote: StayQuote }>(GET_STOREFRONT_QUOTE, {
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    checkInDate: `${from}T00:00:00Z`,
    checkOutDate: `${to}T00:00:00Z`,
    numberOfAdults: input.adults,
    numberOfChildren: input.children,
    promoCode: input.promoCode.trim() || null,
  });
  return data.storefrontQuote;
}

async function priceMonth(input: RateCalendarInput): Promise<RateCalendar> {
  const from = input.month < input.today ? input.today : input.month;
  const monthEnd = monthStart(input.month, 1);
  const minimum = Math.max(1, input.minimumStay || 1);
  // The server refuses any stay longer than the rate allows, so each window stays inside it.
  const maximum = Math.max(minimum, Math.min(input.maxNights, input.maximumStay || input.maxNights));
  const lastArrival = input.advanceBookingMax != null ? addDays(input.today, input.advanceBookingMax) : null;

  const windows: Array<[string, string]> = [];
  for (let start = from; start < monthEnd; start = addDays(start, maximum)) {
    if (lastArrival && start > lastArrival) break;
    let end = addDays(start, maximum);
    if (end > monthEnd) end = monthEnd;
    if (daysBetween(start, end) < minimum) end = addDays(start, minimum);
    windows.push([start, end]);
  }
  if (!windows.length) return { prices: {}, currencyCode: '', complete: false };

  // One unavailable night or rate rule fails a whole window; split it once so the
  // rest of it can still show its charges.
  const quotes = (await Promise.all(windows.map(async ([start, end]) => {
    const [whole] = await Promise.allSettled([quoteWindow(input, start, end)]);
    const span = daysBetween(start, end);
    if (whole.status === 'fulfilled' || span < minimum * 2) return [whole];
    const middle = addDays(start, Math.floor(span / 2));
    return Promise.allSettled([quoteWindow(input, start, middle), quoteWindow(input, middle, end)]);
  }))).flat();
  const prices: Record<string, number> = {};
  let currencyCode = '';
  for (const result of quotes) {
    if (result.status !== 'fulfilled') continue;
    currencyCode ||= result.value.currencyCode;
    if (result.value.currencyCode !== currencyCode) continue;
    for (const night of result.value.nightlyRates || []) {
      if (Number.isSafeInteger(night.amountMinor) && night.amountMinor >= 0) prices[night.date] = night.amountMinor;
    }
  }
  return { prices, currencyCode, complete: Object.keys(prices).length >= daysBetween(from, monthEnd) };
}

/**
 * Nightly room charges for the month on screen, read from the same signed
 * `storefrontQuote` the booking uses. The server prices every night by its own
 * date, so a month-long quote carries the charge any stay would have for that
 * night. Nights it cannot price stay blank; they are never guessed or shown as
 * sold out, and the live quote for the chosen dates remains the authority.
 */
export function useRateCalendar(input: RateCalendarInput | null): RateCalendar | null {
  const key = input ? JSON.stringify(input) : '';
  const [loaded, setLoaded] = useState<{ key: string; value: RateCalendar } | null>(null);
  const request = useMemo(() => (key ? JSON.parse(key) as RateCalendarInput : null), [key]);

  useEffect(() => {
    if (!request) return;
    let current = true;
    const show = (entry: { promise: Promise<RateCalendar> }) => entry.promise
      .then(value => { if (current) setLoaded({ key, value }); })
      .catch(() => { cache.delete(key); });
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) { void show(cached); return () => { current = false; }; }
    // Settle before asking: paging months or typing a promotion code must not
    // spend the quote rate limit that the live stay price depends on.
    const timer = window.setTimeout(() => {
      const entry = { at: Date.now(), promise: priceMonth(request) };
      cache.set(key, entry);
      void show(entry);
    }, 350);
    return () => { current = false; window.clearTimeout(timer); };
  }, [key, request]);

  return loaded?.key === key ? loaded.value : null;
}
