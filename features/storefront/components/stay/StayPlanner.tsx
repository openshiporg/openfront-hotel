'use client';

import { forwardRef, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, CalendarDays, Search, Users, X } from 'lucide-react';
import { useStay } from '../StayProvider';
import { useHotelSettings } from '../HotelSettingsProvider';
import { roomSearchValidationMessage } from '../../lib/qa-workflows';
import { stayNights } from '../../lib/stay-context';
import { dayParts, propertyToday } from '../../lib/calendar';
import { useMediaQuery } from '../../lib/use-media-query';
import { useStayAvailability } from '../../lib/use-stay-availability';
import { StayPicker, type StayRange } from './StayCalendar';
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
    return { checkIn: params.get('checkIn') || '', checkOut: params.get('checkOut') || '', adults: Number(params.get('adults') || 2), children: Number(params.get('children') || 0) };
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

  const dateValue = values.checkIn && values.checkOut && nights > 0
    ? <>{dayParts(values.checkIn).weekday}, {dayParts(values.checkIn).short} <i>→</i> {dayParts(values.checkOut).weekday}, {dayParts(values.checkOut).short}</>
    : values.checkIn ? <>{dayParts(values.checkIn).short} <i>→ add check-out</i></> : <i>Add your dates</i>;

  const picker = <StayPicker {...range} today={today} availability={availability} onChange={setRange} onViewChange={setMonth} autoFocus={desktop}
    onComplete={() => { if (desktop) setPanel('guests'); }} />;

  const guestsField = <PlannerField label="Guests" open={panel === 'guests'} onClick={() => toggle('guests')} icon={<Users aria-hidden="true" />} controls="stay-guests">{guestSummary(values.adults, values.children)}</PlannerField>;
  const fields = (anchorGuests: boolean) => <>
    <PlannerField label="Dates" open={panel === 'dates'} onClick={() => toggle('dates')} icon={<CalendarDays aria-hidden="true" />} controls="stay-dates">{dateValue}</PlannerField>
    {anchorGuests ? <Popover.Anchor asChild>{guestsField}</Popover.Anchor> : guestsField}
    <button type="submit" className="sf-btn sf-btn--lg sf-planner__submit"><Search aria-hidden="true" />Check availability</button>
  </>;

  return <div className={className}>
    {desktop ? <Popover.Root open={panel === 'dates'} onOpenChange={open => { if (!open) setPanel(current => current === 'dates' ? null : current); }}>
      <Popover.Anchor asChild>
        <form ref={planner} onSubmit={submit} className={`sf-planner ${variant === 'bar' ? 'sf-planner--flat' : ''}`} aria-label="Find a room">
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
      <form ref={planner} onSubmit={submit} className={`sf-planner ${variant === 'bar' ? 'sf-planner--flat' : ''}`} aria-label="Find a room">{fields(false)}</form>
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
    {variant === 'hero' && <div className="sf-planner__note"><span>{nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'} · ` : ''}One room per reservation</span><span>The full stay price, with taxes and fees, is shown before you book</span></div>}
    {error && !(panel && !desktop) && <p role="alert" className="sf-notice sf-notice--danger sf-planner__error">{error}</p>}
  </div>;
}

const PlannerField = forwardRef<HTMLButtonElement, { label: string; open: boolean; onClick: () => void; icon: React.ReactNode; controls: string; children: React.ReactNode }>(function PlannerField({ label, open, onClick, icon, controls, children }, ref) {
  return <button ref={ref} type="button" className="sf-planner__field" data-state={open ? 'open' : 'closed'} aria-expanded={open} aria-controls={open ? controls : undefined} onClick={onClick}>
    <small>{label}</small>
    <span>{icon}<span>{children}</span></span>
  </button>;
});
