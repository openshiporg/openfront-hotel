'use client';
import { useId } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';
export function DateRangePicker({ dateRange, onDateRangeChange, className = '' }: { dateRange: DateRange | undefined; onDateRangeChange: (range: DateRange | undefined) => void; className?: string; variant?: 'card' | 'inline' }) {
  const id = useId();
  const from = dateRange?.from && isValid(dateRange.from) ? format(dateRange.from, 'yyyy-MM-dd') : '';
  const to = dateRange?.to && isValid(dateRange.to) ? format(dateRange.to, 'yyyy-MM-dd') : '';
  return <fieldset className={`hotel-dates ${className}`}><legend className="sr-only">Stay dates</legend>
    <label htmlFor={`${id}-in`}>Arrival<input className="lodging-input" id={`${id}-in`} type="date" value={from} onChange={e => onDateRangeChange({ from: e.target.value ? parseISO(e.target.value) : undefined, to: dateRange?.to })} /></label>
    <label htmlFor={`${id}-out`}>Departure<input className="lodging-input" id={`${id}-out`} type="date" min={from || undefined} value={to} onChange={e => onDateRangeChange({ from: dateRange?.from, to: e.target.value ? parseISO(e.target.value) : undefined })} /></label>
  </fieldset>;
}
