'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAYS, addDays, dayParts, daysBetween, monthCells, monthStart, monthTitle } from '../../lib/calendar';
import { calendarDay } from '../../lib/stay-context';

export const MAX_ONLINE_NIGHTS = 31;
const MONTHS_AHEAD = 23;

export interface StayRange { checkIn: string; checkOut: string }
export interface StayCalendarHandle {
  /** Show the month containing `day` and move keyboard focus to it. */
  focusDay: (day: string) => void;
}

interface StayCalendarProps extends StayRange {
  onChange: (range: StayRange) => void;
  /** The property's calendar day; earlier days cannot be selected. */
  today: string;
  minNights?: number;
  maxNights?: number;
  /** Formatted nightly room charges keyed by night, from server quotes. */
  nightPrices?: Record<string, string>;
  /** Open (true) or sold out (false) per night from live inventory; nights not listed count as open. */
  availability?: Record<string, boolean>;
  /** Called when a complete range is chosen. */
  onComplete?: (range: StayRange) => void;
  /** First day of the month on screen, whenever it changes. */
  onViewChange?: (month: string) => void;
  /** The check-out being previewed by hover or focus while choosing one, or ''. */
  onPreview?: (checkOut: string) => void;
  autoFocus?: boolean;
}

/**
 * One-month stay range picker from the Oil UI "Stay" booking card: the first tap
 * is the arrival night, the second the departure morning, and the stay previews
 * under the pointer before it is committed. Each night carries its room charge
 * when a server quote has priced it, sold-out nights are struck through, and a
 * sold-out night right after an open stay can still be the check-out day.
 * Pricing and availability stay with the server; the live quote is the authority.
 */
export const StayCalendar = forwardRef<StayCalendarHandle, StayCalendarProps>(function StayCalendar(
  { checkIn, checkOut, onChange, today, minNights = 1, maxNights = MAX_ONLINE_NIGHTS, nightPrices, availability, onComplete, onViewChange, onPreview, autoFocus },
  ref,
) {
  const id = useId();
  const validIn = calendarDay(checkIn) ? checkIn : '';
  const validOut = validIn && calendarDay(checkOut) && checkOut > validIn ? checkOut : '';
  const minimum = Math.max(1, Math.floor(minNights) || 1);
  const firstMonth = monthStart(today);
  const lastMonth = monthStart(today, MONTHS_AHEAD);
  const lastDay = addDays(monthStart(today, MONTHS_AHEAD + 1), -1);
  const [view, setView] = useState(() => clampMonth(monthStart(validIn || today), firstMonth, lastMonth));
  const [focusDay, setFocusDay] = useState(() => validIn && validIn >= today ? validIn : today);
  const [focusRequest, setFocusRequest] = useState(0);
  const [hover, setHover] = useState('');
  const [message, setMessage] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(Boolean(autoFocus));
  const callbacks = useRef({ onViewChange, onPreview });
  // Declared before the effects that call them, so they always see the latest props.
  useEffect(() => { callbacks.current = { onViewChange, onPreview }; });
  const choosingOut = Boolean(validIn && !validOut);

  const soldOut = (day: string) => availability?.[day] === false;
  const nightOpen = (day: string) => day >= today && day <= lastDay && !soldOut(day);
  // Every night from arrival up to, not including, departure must be open.
  function openNights(from: string, to: string) {
    for (let day = from; day < to; day = addDays(day, 1)) if (!nightOpen(day)) return false;
    return true;
  }
  function fits(from: string, to: string) {
    const nights = daysBetween(from, to);
    return nights >= minimum && nights <= maxNights && openNights(from, to);
  }
  const checkoutOnly = (day: string) => soldOut(day) && choosingOut && day > validIn && day <= lastDay && fits(validIn, day);
  const unavailable = (day: string) => day < today || day > lastDay || (soldOut(day) && !checkoutOnly(day));

  useImperativeHandle(ref, () => ({
    focusDay(day: string) {
      const target = !calendarDay(day) || day < today ? today : day > lastDay ? lastDay : day;
      shouldFocus.current = true;
      setFocusDay(target);
      setView(clampMonth(monthStart(target), firstMonth, lastMonth));
      setFocusRequest(value => value + 1);
    },
  }), [today, firstMonth, lastMonth, lastDay]);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true });
  }, [focusDay, view, focusRequest]);

  const preview = choosingOut && hover > validIn && fits(validIn, hover) ? hover : '';
  useEffect(() => { callbacks.current.onViewChange?.(view); }, [view]);
  useEffect(() => { callbacks.current.onPreview?.(preview); }, [preview]);

  const end = validOut || preview;
  const cells = useMemo(() => monthCells(view), [view]);
  // Keep one selectable day in the tab order, even after paging months with the arrow buttons.
  const tabbable = focusDay.slice(0, 7) === view.slice(0, 7) && !unavailable(focusDay) ? focusDay : cells.find(day => day && !unavailable(day)) || '';
  const priced = Boolean(nightPrices && Object.keys(nightPrices).length);

  function previewDay(day: string) {
    if (choosingOut && day > validIn && fits(validIn, day)) setHover(day);
  }

  function select(day: string) {
    if (day < today) return;
    setMessage('');
    if (choosingOut && day > validIn) {
      const nights = daysBetween(validIn, day);
      setHover('');
      if (nights < minimum) { setMessage(`This stay needs at least ${minimum} nights. Choose a later check-out.`); return; }
      if (nights > maxNights) { setMessage(maxNights < MAX_ONLINE_NIGHTS ? `This rate allows at most ${maxNights} nights. Choose an earlier check-out.` : `Online reservations cover up to ${maxNights} nights. Choose an earlier check-out, or contact the property.`); return; }
      if (!openNights(validIn, day)) { setMessage('These dates include a night that is sold out. Adjust your check-in or check-out.'); return; }
      const range = { checkIn: validIn, checkOut: day };
      onChange(range);
      onComplete?.(range);
      return;
    }
    if (!nightOpen(day)) return;
    setHover('');
    onChange({ checkIn: day, checkOut: '' });
  }

  function moveFocus(from: string, target: string) {
    const step = target > from ? 1 : -1;
    let day = target;
    // As in Oil, arrow keys pass over nights that cannot be chosen.
    for (let guard = 0; guard < 35 && day >= today && day <= lastDay && unavailable(day); guard += 1) day = addDays(day, step);
    if (day < today || day > lastDay || unavailable(day)) return;
    shouldFocus.current = true;
    setFocusDay(day);
    setView(clampMonth(monthStart(day), firstMonth, lastMonth));
    previewDay(day);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1), ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7), ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -weekday), End: () => addDays(day, 6 - weekday),
      PageUp: () => shiftMonth(day, -1), PageDown: () => shiftMonth(day, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus(day, move());
  }

  const nightsLabel = (count: number) => `${count} ${count === 1 ? 'night' : 'nights'}`;
  const status = message
    ? message
    : !validIn
      ? 'Select your check-in date.'
      : !validOut
        ? preview
          ? `${nightsLabel(daysBetween(validIn, preview))} · ${dayParts(validIn).short} → ${dayParts(preview).short}. Select to confirm check-out.`
          : `Check-in ${dayParts(validIn).weekday}, ${dayParts(validIn).short}. Now select check-out${minimum > 1 ? ` (${minimum}-night minimum)` : ''}.`
        : `${nightsLabel(daysBetween(validIn, validOut))} · ${dayParts(validIn).weekday}, ${dayParts(validIn).short} → ${dayParts(validOut).weekday}, ${dayParts(validOut).short}`;

  return <div className="sf-stay__cal">
    <div className="sf-stay__head">
      <p className="sf-stay__title" aria-live="polite">{monthTitle(view)}</p>
      <div className="sf-stay__nav">
        <button type="button" className="sf-stay__month" aria-label="Previous month" disabled={view <= firstMonth} onClick={() => setView(current => clampMonth(monthStart(current, -1), firstMonth, lastMonth))}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" className="sf-stay__month" aria-label="Next month" disabled={view >= lastMonth} onClick={() => setView(current => clampMonth(monthStart(current, 1), firstMonth, lastMonth))}><ChevronRight aria-hidden="true" /></button>
      </div>
    </div>
    <div className="sf-stay__weekdays" aria-hidden="true">{WEEKDAYS.map(day => <span key={day}>{day.slice(0, 2)}</span>)}</div>
    <div ref={grid} className="sf-stay__grid" role="group" aria-label={monthTitle(view)} aria-describedby={`${id}-status`} onMouseLeave={() => setHover('')}>
      {cells.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} className="sf-stay__blank" aria-hidden="true" />;
        const past = day < today;
        const off = soldOut(day);
        const outOnly = !past && checkoutOnly(day);
        const disabled = unavailable(day);
        const isStart = day === validIn;
        const isEnd = Boolean(validOut) && day === validOut;
        const isPreviewEnd = Boolean(preview) && day === preview;
        const inRange = Boolean(validIn && end && day > validIn && day < end);
        const inPreview = Boolean(preview && day > validIn && day <= preview);
        const nights = validIn ? daysBetween(validIn, day) : 0;
        const short = choosingOut && day > validIn && !disabled && nights < minimum;
        const price = disabled ? undefined : nightPrices?.[day];
        const parts = dayParts(day);
        const mark = disabled ? '—' : isEnd || isPreviewEnd || outOnly ? 'Out' : price || (isStart ? 'In' : '');
        const label = [
          parts.full,
          isStart ? 'check-in' : isEnd ? 'check-out' : isPreviewEnd ? `check-out, ${nightsLabel(nights)}` : inRange ? 'night of your stay' : '',
          outOnly ? 'check-out only' : past ? 'unavailable' : off ? 'sold out' : '',
          price && !isEnd && !isPreviewEnd ? `${price} room charge` : '',
          short ? `below the ${minimum}-night minimum` : '',
        ].filter(Boolean).join(', ');
        return <button
          key={day}
          type="button"
          className="sf-stay__day"
          data-day={day}
          data-edge={isStart ? 'start' : isEnd ? 'end' : undefined}
          data-range={inRange || undefined}
          data-preview={inPreview || undefined}
          data-checkout-only={outOnly || undefined}
          data-short={short || undefined}
          disabled={disabled}
          tabIndex={day === tabbable ? 0 : -1}
          aria-pressed={isStart || isEnd || inRange}
          aria-label={label}
          onClick={() => { setFocusDay(day); select(day); }}
          onKeyDown={event => onKeyDown(event, day)}
          onMouseEnter={() => previewDay(day)}
          onFocus={() => { setFocusDay(day); previewDay(day); }}
        >
          <span className="sf-stay__n">{parts.day}</span>
          <span className="sf-stay__p" aria-hidden="true">{mark || ' '}</span>
        </button>;
      })}
    </div>
    <p className="sf-stay__hint" aria-hidden="true">
      <span className="sf-stay__swatch" />
      {choosingOut ? 'Choose check-out' : priced ? 'Nightly rate, before tax' : 'Your dates'}
      <span className="sf-stay__hint-end">{choosingOut ? `Up to ${maxNights} nights` : '— Unavailable'}</span>
    </p>
    <p id={`${id}-status`} className="sf-sr" role="status" aria-live="polite">{message ? '' : status}</p>
    {message && <p className="sf-stay__error" role="alert">{message}</p>}
  </div>;
});

interface StayPickerProps extends StayCalendarProps {
  labels?: { checkIn: string; checkOut: string };
}

/**
 * The Oil "Stay" card body: check-in → check-out fields above the one-month
 * calendar. Either field reopens check-out and moves focus to the day to act on next.
 */
export function StayPicker({ labels = { checkIn: 'Check-in', checkOut: 'Check-out' }, ...props }: StayPickerProps) {
  const calendar = useRef<StayCalendarHandle>(null);
  const area = useRef<HTMLDivElement>(null);
  const { checkIn, checkOut, onChange, today, minNights = 1 } = props;
  const validIn = calendarDay(checkIn) ? checkIn : '';
  const validOut = validIn && calendarDay(checkOut) && checkOut > validIn ? checkOut : '';

  function edit(field: 'checkIn' | 'checkOut') {
    if (validOut) onChange({ checkIn: validIn, checkOut: '' });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    area.current?.querySelector('.sf-stay__cal')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    calendar.current?.focusDay(field === 'checkIn' || !validIn ? validIn || today : addDays(validIn, Math.max(1, Math.floor(minNights) || 1)));
  }

  return <div ref={area} className="sf-stay">
    <div className="sf-stay__fields" role="group" aria-label="Stay dates">
      <DateField label={labels.checkIn} day={validIn} placeholder="Add date" editing={!validIn} onClick={() => edit('checkIn')} />
      <span className="sf-stay__arrow" aria-hidden="true">→</span>
      <DateField label={labels.checkOut} day={validOut} placeholder={validIn ? 'Select date' : 'Add date'} editing={Boolean(validIn && !validOut)} onClick={() => edit('checkOut')} />
    </div>
    <StayCalendar ref={calendar} {...props} />
  </div>;
}

function DateField({ label, day, placeholder, editing, onClick }: { label: string; day: string; placeholder: string; editing: boolean; onClick: () => void }) {
  const parts = day ? dayParts(day) : null;
  return <button type="button" className="sf-stay__field" data-editing={editing || undefined} onClick={onClick} aria-label={`${label}: ${parts ? parts.full : 'not chosen'}. Change ${label.toLowerCase()} date`}>
    <span>{label}</span>
    <b>{parts ? parts.short : placeholder}</b>
    <small>{parts?.weekday || ''}</small>
  </button>;
}

function shiftMonth(day: string, months: number) {
  const target = monthStart(day, months);
  const wanted = Number(day.slice(8, 10));
  const length = Number(addDays(monthStart(target, 1), -1).slice(8, 10));
  return `${target.slice(0, 8)}${String(Math.min(wanted, length)).padStart(2, '0')}`;
}

function clampMonth(value: string, min: string, max: string) {
  return value < min ? min : value > max ? max : value;
}
