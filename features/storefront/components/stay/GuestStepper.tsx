'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface GuestCounts { adults: number; children: number }

/** Guests in one room. `maxGuests` is the room's published occupancy when known. */
export function GuestStepper({ value, onChange, maxGuests = 20 }: { value: GuestCounts; onChange: (value: GuestCounts) => void; maxGuests?: number }) {
  const id = useId();
  const adults = Number.isInteger(value.adults) ? value.adults : 1;
  const children = Number.isInteger(value.children) ? value.children : 0;
  const full = adults + children >= maxGuests;
  const rows = [
    { key: 'adults' as const, label: 'Adults', hint: 'At least one per room', count: adults, min: 1 },
    { key: 'children' as const, label: 'Children', hint: 'Count toward room occupancy', count: children, min: 0 },
  ];
  return <div role="group" aria-label="Guests in one room">
    {rows.map(row => <div className="sf-stepper" key={row.key}>
      <div className="sf-stepper__label"><b id={`${id}-${row.key}`}>{row.label}</b><small>{row.hint}</small></div>
      <div className="sf-stepper__control">
        <button type="button" className="sf-iconbtn" aria-label={`Remove one ${row.key === 'adults' ? 'adult' : 'child'}`} disabled={row.count <= row.min} onClick={() => onChange({ adults, children, [row.key]: row.count - 1 })}><Minus aria-hidden="true" /></button>
        <output aria-labelledby={`${id}-${row.key}`} aria-live="polite">{row.count}</output>
        <button type="button" className="sf-iconbtn" aria-label={`Add one ${row.key === 'adults' ? 'adult' : 'child'}`} disabled={full} onClick={() => onChange({ adults, children, [row.key]: row.count + 1 })}><Plus aria-hidden="true" /></button>
      </div>
    </div>)}
    <p className="sf-fine" style={{ paddingBottom: 4 }}>{full && maxGuests < 20 ? `This room sleeps up to ${maxGuests}. ` : ''}One room per reservation. For several rooms, contact the property.</p>
  </div>;
}

export function guestSummary(adults: number, children: number) {
  const total = adults + children;
  return `${total} ${total === 1 ? 'guest' : 'guests'}${children ? ` · ${children} ${children === 1 ? 'child' : 'children'}` : ''}`;
}
