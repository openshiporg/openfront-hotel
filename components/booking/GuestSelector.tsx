'use client';
import { useId } from 'react';
interface GuestCounts { adults: number; children: number }
export function GuestSelector({ guests, onGuestsChange, className = '' }: { guests: GuestCounts; onGuestsChange: (value: GuestCounts) => void; className?: string; variant?: 'card' | 'inline' }) {
  const id = useId();
  return <fieldset className={`hotel-dates ${className}`}><legend className="sr-only">Guests in one room</legend>{(['adults', 'children'] as const).map(key => <label key={key} htmlFor={`${id}-${key}`}>{key === 'adults' ? 'Adults' : 'Children'}<input className="lodging-input" id={`${id}-${key}`} type="number" min={key === 'adults' ? 1 : 0} max={20} value={Number.isFinite(guests[key]) ? guests[key] : ''} onChange={event => onGuestsChange({ ...guests, [key]: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>)}</fieldset>;
}
