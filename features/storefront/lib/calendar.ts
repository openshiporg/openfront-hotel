/**
 * Calendar-day arithmetic on `YYYY-MM-DD` labels. Stay dates are property
 * calendar days, never browser instants, so every helper works in UTC.
 */
import { calendarDay } from './stay-context';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const label = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, amount: number) {
  const date = utc(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return label(date);
}

export function daysBetween(from: string, to: string) {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

/** First day of the month containing `day`, offset by `months`. */
export function monthStart(day: string, months = 0) {
  const date = utc(day);
  return label(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

export function monthKey(day: string) {
  return day.slice(0, 7);
}

export function monthTitle(day: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(day));
}

/** Leading blanks (Sunday-first) followed by every day label in the month. */
export function monthCells(firstOfMonth: string): Array<string | null> {
  const first = utc(firstOfMonth);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
  for (let index = 0; index < days; index += 1) cells.push(addDays(firstOfMonth, index));
  return cells;
}

/** Today's calendar day at the property, or in this browser when no zone is published. */
export function propertyToday(timeZone?: string, now = new Date()) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
      const part = (type: string) => parts.find(item => item.type === type)?.value;
      const value = `${part('year')}-${part('month')}-${part('day')}`;
      if (calendarDay(value)) return value;
    } catch {
      // Fall through to the browser's calendar day.
    }
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dayParts(day: string) {
  const date = utc(day);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
  return {
    weekday: format({ weekday: 'short' }),
    weekdayLong: format({ weekday: 'long' }),
    month: format({ month: 'short' }),
    day: format({ day: 'numeric' }),
    short: format({ month: 'short', day: 'numeric' }),
    full: format({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

/** "Oct 20 – 23" or "Oct 30 – Nov 2" for a stay range. */
export function rangeLabel(checkIn: string, checkOut: string) {
  if (!calendarDay(checkIn) || !calendarDay(checkOut)) return '';
  const start = dayParts(checkIn); const end = dayParts(checkOut);
  return start.month === end.month && checkIn.slice(0, 4) === checkOut.slice(0, 4)
    ? `${start.short} – ${end.day}`
    : `${start.short} – ${end.short}`;
}
