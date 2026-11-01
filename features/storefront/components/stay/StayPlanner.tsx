'use client';

import { forwardRef, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Search, UserRound, X } from 'lucide-react';
import { useStay } from '../StayProvider';
import { useHotelSettings } from '../HotelSettingsProvider';
import { roomSearchValidationMessage } from '../../lib/qa-workflows';
import { stayNights } from '../../lib/stay-context';
import { addDays, dayParts, daysBetween, monthStart, monthTitle, propertyToday } from '../../lib/calendar';
import { useMediaQuery } from '../../lib/use-media-query';
import { useStayAvailability } from '../../lib/use-stay-availability';
import { MAX_ONLINE_NIGHTS, StayPicker, type StayRange } from './StayCalendar';
import { GuestStepper, guestSummary, type GuestCounts } from './GuestStepper';

type Panel = 'dates' | 'guests' | null;

/** Stay search: dates and guests for one room, submitted to live room availability. */
export function StayPlanner({ query, variant = 'hero', className = '' }: { query?: string; variant?: 'hero' | 'bar'; className?: string }) {
  const { stay } = useStay();
  // Results own their query, even when empty; remembered choices are for browsing only.
  const initial = query ?? stay;
  return <PlannerForm key={initial} initial={initial} variant={variant} className={className} />;
}

function PlannerForm({ initial, variant, className }: { initial: string; variant: 'hero' | 'bar'; className: string }) {
  const router = useRouter();
  const { setStay } = useStay();
  const identity = useHotelSettings();
  const desktop = useMediaQuery('(min-width: 768px)');
  const planner = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(() => {
    const params = new URLSearchParams(initial);
    // The home search opens on tonight, one night, so the fastest search is a single tap.
    const tonight = variant === 'hero' && !params.get('checkIn') ? propertyToday(identity.timeZone) : '';
    return { checkIn: params.get('checkIn') || tonight, checkOut: params.get('checkOut') || (tonight ? addDays(tonight, 1) : ''), adults: Number(params.get('adults') || 2), children: Number(params.get('children') || 0) };
  });
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const today = useMemo(() => propertyToday(identity.timeZone), [identity.timeZone]);
  // Before a room is chosen, a night is open when any room type has a room for it.
  const availability = useStayAvailability(panel && month ? { month, today } : null);
  const nights = stayNights(values.checkIn, values.checkOut);
  const range = { checkIn: values.checkIn, checkOut: values.checkOut };

  const setRange = (next: StayRange) => { setError(''); setValues(current => ({ ...current, ...next })); };
  const setGuests = (next: GuestCounts) => { setError(''); setValues(current => ({ ...current, ...next })); };
  const toggle = (next: Exclude<Panel, null>) => setPanel(current => current === next ? null : next);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!values.checkIn || !values.checkOut) { setError('Choose check-in and check-out dates to see live availability.'); setPanel('dates'); return; }
    const message = roomSearchValidationMessage(values.checkIn, values.checkOut, String(values.adults), String(values.children));
    if (message) { setError(message); return; }
    if (values.checkIn < today) { setError('Choose a check-in date from today onward.'); setPanel('dates'); return; }
    setError(''); setPanel(null);
    const params = new URLSearchParams({ checkIn: values.checkIn, checkOut: values.checkOut, adults: String(values.adults), children: String(values.children) });
    setStay(params.toString());
    router.push(`/rooms?${params}#results`);
  }

  const dayLabel = (day: string, fallback: string) => day ? `${dayParts(day).weekday}, ${dayParts(day).short}` : fallback;
  const guestsLabel = `${values.adults} ${values.adults === 1 ? 'Adult' : 'Adults'}, ${values.children} ${values.children === 1 ? 'Child' : 'Children'}`;
  const guestsShort = `${values.adults + values.children} ${values.adults + values.children === 1 ? 'Guest' : 'Guests'}`;

  const picker = <StayPicker {...range} today={today} availability={availability} onChange={setRange} onViewChange={setMonth} autoFocus={desktop}
    onComplete={() => { if (desktop) setPanel('guests'); }} />;

  const checkInField = <PlannerField area="in" label="Check in" open={panel === 'dates'} onClick={() => toggle('dates')} icon={<CalendarDays aria-hidden="true" />} controls="stay-dates">{dayLabel(values.checkIn, 'Add date')}</PlannerField>;
  const guestsField = <PlannerField area="guests" label="Guests" open={panel === 'guests'} onClick={() => toggle('guests')} icon={<UserRound aria-hidden="true" />} controls="stay-guests" after={<ChevronDown className="sf-planner__chev" aria-hidden="true" />}>
    <span className="sf-planner__long">{guestsLabel}</span><span className="sf-planner__short">{guestsShort}</span>
  </PlannerField>;
  const fields = (anchorGuests: boolean) => <>
    {checkInField}
    <PlannerField area="out" label="Check out" open={panel === 'dates'} onClick={() => toggle('dates')} icon={<CalendarDays aria-hidden="true" />} controls="stay-dates">{dayLabel(values.checkOut, values.checkIn ? 'Add check-out' : 'Add date')}</PlannerField>
    {anchorGuests ? <Popover.Anchor asChild>{guestsField}</Popover.Anchor> : guestsField}
    <button type="submit" className="sf-btn sf-planner__submit"><span className="sf-planner__long">Search</span><span className="sf-planner__short">Find a Room</span></button>
    {variant === 'hero' && <button type="button" className="sf-planner__nights" onClick={() => toggle('dates')} aria-label={`${nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Dates needed'}. Change dates`}>
      <span>{nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Choose your dates'}</span><ChevronDown aria-hidden="true" />
    </button>}
  </>;
  const formClass = `sf-planner sf-planner--${variant}`;

  return <div className={className}>
    {desktop ? <Popover.Root open={panel === 'dates'} onOpenChange={open => { if (!open) setPanel(current => current === 'dates' ? null : current); }}>
      <Popover.Anchor asChild>
        <form ref={planner} onSubmit={submit} className={formClass} aria-label="Find a room">
          <Popover.Root open={panel === 'guests'} onOpenChange={open => { if (!open) setPanel(current => current === 'guests' ? null : current); }}>
            {fields(true)}
            <Popover.Portal>
              <Popover.Content id="stay-guests" className="sf-pop sf-pop--guests sf-portal" align="end" sideOffset={14} collisionPadding={20} aria-label="Guests"
                onInteractOutside={event => { if (planner.current?.contains(event.target as Node)) event.preventDefault(); }}>
                <GuestStepper value={values} onChange={setGuests} />
                <button type="button" className="sf-btn sf-btn--block" onClick={() => submit()}>Check availability <ArrowRight className="sf-btn__go" aria-hidden="true" /></button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </form>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content id="stay-dates" className="sf-pop sf-pop--stay sf-portal" align="start" sideOffset={14} collisionPadding={20} aria-label="Choose your dates"
          onOpenAutoFocus={event => event.preventDefault()}
          onInteractOutside={event => { if (planner.current?.contains(event.target as Node)) event.preventDefault(); }}>
          {picker}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root> : <>
      <form ref={planner} onSubmit={submit} className={formClass} aria-label="Find a room">{fields(false)}</form>
      <Dialog.Root open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="sf-overlay" />
          <Dialog.Content className="sf-sheet sf-portal" aria-describedby={undefined}>
            <div className="sf-sheet__head">
              <Dialog.Title className="sf-h3">Plan your stay</Dialog.Title>
              <Dialog.Close className="sf-iconbtn" aria-label="Close"><X aria-hidden="true" /></Dialog.Close>
            </div>
            <section id="stay-dates" aria-label="Dates">{picker}</section>
            <section id="stay-guests" aria-label="Guests" style={{ marginTop: 18 }}>
              <h3 className="sf-h4">Who’s coming?</h3>
              <GuestStepper value={values} onChange={setGuests} />
            </section>
            {error && <p role="alert" className="sf-stay__error">{error}</p>}
            <div className="sf-sheet__foot">
              <div className="sf-small"><b>{nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Dates needed'}</b><br /><span className="sf-muted">{guestSummary(values.adults, values.children)}</span></div>
              <button type="button" className="sf-btn" onClick={() => submit()}><Search aria-hidden="true" />Search</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>}
    {variant === 'hero' && desktop && <WeekStrip range={range} today={today} onChange={setRange} />}
    {error && !(panel && !desktop) && <p role="alert" className="sf-notice sf-notice--danger sf-planner__error">{error}</p>}
  </div>;
}

const PlannerField = forwardRef<HTMLButtonElement, { area: string; label: string; open: boolean; onClick: () => void; icon: React.ReactNode; controls: string; after?: React.ReactNode; children: React.ReactNode }>(function PlannerField({ area, label, open, onClick, icon, controls, after, children }, ref) {
  return <button ref={ref} type="button" className="sf-planner__field" data-area={area} data-state={open ? 'open' : 'closed'} aria-expanded={open} aria-controls={open ? controls : undefined} onClick={onClick}>
    {icon}
    <span className="sf-planner__text"><small>{label}</small><b>{children}</b></span>
    {after}
  </button>;
});

/**
 * The week under the search bar: one tap sets a one-night stay from that day,
 * a second tap on a later day moves check-out. Sold-out nights from live
 * inventory are disabled; the full calendar stays one tap away in the fields.
 */
function WeekStrip({ range, today, onChange }: { range: StayRange; today: string; onChange: (range: StayRange) => void }) {
  // Seven days from the night before check-in, never before the property's today.
  const anchor = (day: string) => { const from = addDays(day, -1); return from < today ? today : from; };
  const [start, setStart] = useState(() => anchor(range.checkIn || today));
  const [extending, setExtending] = useState(false);
  const end = addDays(start, 6);
  const first = useStayAvailability({ month: monthStart(start), today });
  const second = useStayAvailability({ month: monthStart(end), today });
  const open = (day: string) => day >= today && first?.[day] !== false && second?.[day] !== false;
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  function pick(day: string) {
    if (extending && range.checkIn && day > range.checkIn && daysBetween(range.checkIn, day) <= MAX_ONLINE_NIGHTS) {
      for (let night = range.checkIn; night < day; night = addDays(night, 1)) if (!open(night)) return;
      onChange({ checkIn: range.checkIn, checkOut: day }); setExtending(false); return;
    }
    onChange({ checkIn: day, checkOut: addDays(day, 1) }); setExtending(true);
  }

  return <div className="sf-week" role="group" aria-label={`Week of ${dayParts(start).full}`}>
    <p className="sf-week__title" aria-live="polite">{monthTitle(start)}</p>
    <div className="sf-week__row">
      <button type="button" className="sf-week__nav" aria-label="Previous week" disabled={start <= today} onClick={() => setStart(anchor(addDays(start, -6)))}><ChevronLeft aria-hidden="true" /></button>
      {days.map(day => {
        const isIn = day === range.checkIn; const isOut = day === range.checkOut;
        const inside = Boolean(range.checkIn && range.checkOut && day > range.checkIn && day < range.checkOut);
        const disabled = !open(day) && !(extending && day > range.checkIn && isOut);
        return <button key={day} type="button" className="sf-week__day" disabled={disabled} data-edge={isIn ? 'start' : isOut ? 'end' : undefined} data-range={inside || undefined}
          aria-pressed={isIn || isOut} aria-label={`${dayParts(day).full}${isIn ? ', check-in' : isOut ? ', check-out' : ''}${disabled ? ', unavailable' : ''}`} onClick={() => pick(day)}>
          <small>{dayParts(day).weekday.slice(0, 2)}</small><b>{dayParts(day).day}</b>
        </button>;
      })}
      <button type="button" className="sf-week__nav" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight aria-hidden="true" /></button>
    </div>
    <p className="sf-sr" aria-live="polite">{extending ? 'Check-in set. Choose a later day to change check-out.' : ''}</p>
  </div>;
}
