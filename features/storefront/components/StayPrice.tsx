'use client';

import { useState } from 'react';
import { BadgeCheck, CalendarClock, Utensils } from 'lucide-react';
import type { StayPriceSummary } from '@/lib/types';
import type { NightlyRate } from '../lib/quote';
import { cancellationTerms, mealPlanLabel, money } from '../lib/stay-context';
import { dayParts } from '../lib/calendar';
import { BookingPaymentDisclosure } from './BookingPaymentDisclosure';

const VISIBLE_NIGHTS = 8;

/** One chip per night, up to five across, as in the Oil stay bill. */
function NightStrip({ nights, currencyCode }: { nights: NightlyRate[]; currencyCode: string }) {
  const [all, setAll] = useState(false);
  if (!nights.length) return null;
  const shown = all ? nights : nights.slice(0, VISIBLE_NIGHTS);
  const more = nights.length > VISIBLE_NIGHTS;
  return <ul className="sf-nights" aria-label="Room charge per night" style={{ '--cols': Math.min(shown.length + (more ? 1 : 0), 5) } as React.CSSProperties}>
    {shown.map((night, index) => <li key={night.date} className="sf-night" style={{ '--i': index } as React.CSSProperties}>
      <span>{dayParts(night.date).weekday} {dayParts(night.date).day}</span>
      <b>{money(night.amountMinor, currencyCode)}</b>
    </li>)}
    {more && <li className="sf-night sf-night--more">
      <button type="button" onClick={() => setAll(value => !value)} aria-expanded={all}>{all ? 'Show fewer' : `+${nights.length - VISIBLE_NIGHTS} more`}</button>
    </li>}
  </ul>;
}

/** Full stay price detail. Every amount is read from a server quote or the booked terms. */
export function StayPrice({ quote, paymentAmountMinor, stale = false }: { quote: StayPriceSummary & { nightlyRates?: NightlyRate[] }; paymentAmountMinor?: number | null; stale?: boolean }) {
  const nights = quote.nightlyRates?.length === quote.nights ? quote.nightlyRates : [];
  const total = money(quote.totalAmountMinor, quote.currencyCode);
  return <section aria-label="Full stay price" className={`sf-bill ${stale ? 'sf-pending' : ''}`} aria-busy={stale || undefined}>
    <div className="sf-bill__head">
      <span><b>{quote.nights} {quote.nights === 1 ? 'night' : 'nights'}</b> · {quote.ratePlanName}</span>
      <span className="sf-num">{money(quote.roomSubtotalMinor, quote.currencyCode)}</span>
    </div>
    <NightStrip nights={nights} currencyCode={quote.currencyCode} />
    <div className="sf-bill__row"><span>Taxes</span><span>{money(quote.taxAmountMinor, quote.currencyCode)}</span></div>
    <div className="sf-bill__row"><span>Fees</span><span>{money(quote.feesAmountMinor, quote.currencyCode)}</span></div>
    <div className="sf-bill__total">
      <b>Total for your stay<small>Taxes and fees included · {quote.currencyCode}</small></b>
      <span key={total} className="sf-amount sf-updated">{total}</span>
    </div>
    <BookingPaymentDisclosure totalMinor={quote.totalAmountMinor} depositPercent={quote.depositPercent} securityDepositMinor={quote.securityDepositMinor} paymentAmountMinor={paymentAmountMinor} currencyCode={quote.currencyCode} />
    <div className="sf-bill__terms">
      <p><CalendarClock aria-hidden="true" /><span>{cancellationTerms(quote.cancellationPolicy)}</span></p>
      {quote.mealPlan && <p><Utensils aria-hidden="true" /><span>{mealPlanLabel(quote.mealPlan)}</span></p>}
      <p><BadgeCheck aria-hidden="true" /><span>Booked directly with the property.</span></p>
    </div>
  </section>;
}

/**
 * Provisional bill while a check-out is previewed in the calendar. Nights come
 * from server quotes for the month on screen; taxes, fees and availability for
 * the exact stay arrive with the live quote once the check-out is chosen.
 */
export function StayEstimate({ nights, currencyCode, checkIn, checkOut }: { nights: NightlyRate[]; currencyCode: string; checkIn: string; checkOut: string }) {
  const subtotal = money(nights.reduce((sum, night) => sum + night.amountMinor, 0), currencyCode);
  return <section aria-label="Estimated room charges" className="sf-bill sf-bill--estimate" data-provisional="true">
    <div className="sf-bill__head">
      <span><b>Estimate · {nights.length} {nights.length === 1 ? 'night' : 'nights'}</b></span>
      <span className="sf-muted">{dayParts(checkIn).short} → {dayParts(checkOut).short}</span>
    </div>
    <NightStrip nights={nights} currencyCode={currencyCode} />
    <div className="sf-bill__total">
      <b>Estimated room charges<small>Before taxes and fees · select this check-out for the live total</small></b>
      <span key={subtotal} className="sf-amount sf-updated">{subtotal}</span>
    </div>
  </section>;
}
