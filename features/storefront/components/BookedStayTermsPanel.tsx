import { CalendarClock, Utensils } from 'lucide-react';
import type { StayPriceSummary } from '@/lib/types';
import { cancellationTerms, mealPlanLabel, money } from '../lib/stay-context';

export function BookedStayTermsPanel({ terms }: { terms: StayPriceSummary | null | undefined }) {
  if (!terms) return null;

  const initialDepositMinor = Math.ceil(terms.totalAmountMinor * terms.depositPercent / 100);

  return <section aria-label="Original booked rate terms" className="sf-card sf-pad">
    <header className="sf-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
      <div>
        <p className="sf-eyebrow sf-eyebrow--plain">Original booked rate</p>
        <h3 className="sf-h3" style={{ marginTop: 6 }}>{terms.ratePlanName}</h3>
      </div>
      <span className="sf-badge">{terms.nights} {terms.nights === 1 ? 'night' : 'nights'}</span>
    </header>
    <div className="sf-bill">
      <div className="sf-bill__row"><span>Room subtotal</span><span>{money(terms.roomSubtotalMinor, terms.currencyCode)}</span></div>
      <div className="sf-bill__row"><span>Taxes</span><span>{money(terms.taxAmountMinor, terms.currencyCode)}</span></div>
      <div className="sf-bill__row"><span>Fees</span><span>{money(terms.feesAmountMinor, terms.currencyCode)}</span></div>
      <div className="sf-bill__total"><b>Original stay total<small>{terms.currencyCode}</small></b><span className="sf-amount">{money(terms.totalAmountMinor, terms.currencyCode)}</span></div>
      <div className="sf-bill__pay">
        <div><span>Initial deposit policy ({terms.depositPercent}%)</span><span>{money(initialDepositMinor, terms.currencyCode)}</span></div>
        <div><span>Separate security authorization</span><span>{money(terms.securityDepositMinor, terms.currencyCode)}</span></div>
      </div>
      <div className="sf-bill__terms">
        <p><CalendarClock aria-hidden="true" /><span>Cancellation: {cancellationTerms(terms.cancellationPolicy)}</span></p>
        <p><Utensils aria-hidden="true" /><span>Meal plan: {mealPlanLabel(terms.mealPlan) || terms.mealPlan.replaceAll('_', ' ')}.</span></p>
      </div>
    </div>
    <p className="sf-fine" style={{ marginTop: 14 }}>These are the rate terms recorded with the booking. Payment status and any current collectible balance are shown separately.</p>
  </section>;
}
