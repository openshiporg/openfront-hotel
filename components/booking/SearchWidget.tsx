'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStay } from '@/features/storefront/components/StayProvider';
import { roomSearchValidationMessage } from '@/features/storefront/lib/qa-workflows';
import { stayNights } from '@/features/storefront/lib/stay-context';
type SearchWidgetProps = { className?: string; variant?: 'default' | 'hero'; query?: string };
export function SearchWidget({ query, ...props }: SearchWidgetProps) {
  const { stay } = useStay();
  // Results own their query, even when empty; persisted choices are for browsing only.
  const initialStay = query ?? stay;
  return <SearchForm key={initialStay} initialStay={initialStay} {...props} />;
}
function SearchForm({ initialStay, className = '', variant = 'default' }: Omit<SearchWidgetProps, 'query'> & { initialStay: string }) {
  const router = useRouter();
  const { setStay } = useStay();
  const id = useId();
  const [values, setValues] = useState(() => {const p=new URLSearchParams(initialStay);return {checkIn:p.get('checkIn')||'',checkOut:p.get('checkOut')||'',adults:p.get('adults')||'2',children:p.get('children')||'0'};});
  const [error, setError] = useState('');
  const update = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const nights = stayNights(values.checkIn, values.checkOut);
  return <form className={`hotel-search ${className}`} data-variant={variant} aria-label="Find a room" onSubmit={event => {
    event.preventDefault();
    const message = roomSearchValidationMessage(values.checkIn, values.checkOut, values.adults, values.children);
    if (message || !values.checkIn || !values.checkOut) { setError(message || 'Choose arrival and departure dates.'); return; }
    setError(''); const params = new URLSearchParams(values); setStay(params.toString()); router.push(`/rooms?${params}#results`);
  }}>
    <div className="hotel-search-fields">
      <label htmlFor={`${id}-arrival`}>Arrival<input id={`${id}-arrival`} type="date" value={values.checkIn} onChange={e => update('checkIn', e.target.value)} required aria-describedby={error ? `${id}-error` : undefined} /></label>
      <label htmlFor={`${id}-departure`}>Departure<input id={`${id}-departure`} type="date" value={values.checkOut} min={values.checkIn || undefined} onChange={e => update('checkOut', e.target.value)} required /></label>
      <label htmlFor={`${id}-adults`}>Adults<input id={`${id}-adults`} type="number" min="1" max="20" value={values.adults} onChange={e => update('adults', e.target.value)} required /></label>
      <label htmlFor={`${id}-children`}>Children<input id={`${id}-children`} type="number" min="0" max="20" value={values.children} onChange={e => update('children', e.target.value)} required /></label>
      <button className="lodging-button" type="submit">Find a room <span aria-hidden="true">↗</span></button>
    </div>
    <p className="hotel-search-note">{nights > 0 ? `${nights} night${nights === 1 ? '' : 's'} · ` : ''}One room per reservation · Review the full stay price before booking</p>
    {error && <p id={`${id}-error`} role="alert" className="hotel-notice">{error}</p>}
  </form>;
}
