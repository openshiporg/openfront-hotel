import { createElement, type ReactNode } from 'react';
import { ViewerTime } from '@/features/dashboard/components/ViewerTime';

/**
 * Presentation helpers shared by hotel platform screens. Stay dates are
 * property calendar labels, so date-only values are always rendered in UTC.
 */

const DAY_MS = 86_400_000;

export function humanize(value?: string | null) {
  if (!value) return '—';
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatMoneyMinor(amountMinor?: number | null, currencyCode = 'USD') {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(Number(amountMinor))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(Number(amountMinor) / 100);
}

export function formatMoney(amount?: number | null, currencyCode = 'USD') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(Number(amount));
}

/**
 * Staff type dollars ("12.50"); the API takes integer cents. Exact string parse, no float rounding.
 * Null when the text is not an amount with at most 2 decimals. By default only positive amounts pass;
 * `allowZero` accepts 0 and `signed` accepts a leading minus (for debits and discounts).
 */
export function dollarsToMinor(value: string, options: { allowZero?: boolean; signed?: boolean } = {}): number | null {
  const match = /^\s*([-\u2212])?\s*\$?\s*(\d{1,9})?(?:\.(\d{0,2}))?\s*$/.exec(String(value ?? '').replace(/,/g, ''));
  if (!match || (match[2] === undefined && !match[3])) return null;
  if (match[1] && !options.signed) return null;
  const magnitude = Number(match[2] || 0) * 100 + Number((match[3] || '').padEnd(2, '0'));
  const minor = match[1] ? -magnitude : magnitude;
  if (!Number.isSafeInteger(minor)) return null;
  if (minor === 0) return options.allowZero ? 0 : null;
  return options.signed || minor > 0 ? minor : null;
}

/** Integer cents shown back in a dollar field ("1250" -> "12.50", "1200" -> "12"). Empty for null. */
export function minorToDollars(minor?: number | null): string {
  if (minor === null || minor === undefined || !Number.isFinite(Number(minor))) return '';
  const value = Math.trunc(Number(minor));
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const cents = abs % 100;
  return `${sign}${Math.floor(abs / 100)}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

function dateLabel(value?: string | Date | null) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const label = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : null;
}

export function formatStay(value?: string | Date | null, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const label = dateLabel(value);
  if (!label) return '—';
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${label}T00:00:00Z`));
}

export function formatStayRange(start?: string | null, end?: string | null) {
  const from = dateLabel(start);
  const to = dateLabel(end);
  if (!from || !to) return '—';
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  // Intl renders { day, year } without a month as "2026 (day: 20)", so same-month
  // ranges join the day and year by hand: "Oct 19–20, 2026".
  if (sameMonth) return `${formatStay(from, { month: 'short', day: 'numeric' })}–${formatStay(to, { day: 'numeric' })}, ${to.slice(0, 4)}`;
  const left = formatStay(from, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  const right = formatStay(to, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left} – ${right}`;
}

export function nightsBetween(start?: string | null, end?: string | null) {
  const from = dateLabel(start);
  const to = dateLabel(end);
  if (!from || !to) return 0;
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS));
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDateTime(value?: string | null): ReactNode {
  if (!value) return '—';
  return createElement(ViewerTime, { value, style: 'datetime', fallback: String(value) });
}

export function formatTime(value?: string | null): ReactNode {
  if (!value) return '—';
  return createElement(ViewerTime, { value, style: 'datetime', fallback: String(value) });
}

export function initials(name?: string | null) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

export function utcDayKey(value: Date | string = new Date()) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** "Eastern Time" for America/New_York; the zone id if the browser can't name it; UTC when the property has none. */
export function timeZoneLabel(timeZone?: string | null) {
  if (!timeZone) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}
