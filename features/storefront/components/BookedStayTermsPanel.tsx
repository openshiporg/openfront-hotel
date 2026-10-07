import type { StayPriceSummary } from '@/lib/types';
import { cancellationTerms, money } from '../lib/stay-context';

export function BookedStayTermsPanel({ terms }: { terms: StayPriceSummary | null | undefined }) {
  if (!terms) return null;

  const initialDepositMinor = Math.ceil(terms.totalAmountMinor * terms.depositPercent / 100);
  const rows: Array<[string, number]> = [
    ['Room subtotal', terms.roomSubtotalMinor],
    ['Taxes', terms.taxAmountMinor],
    ['Fees', terms.feesAmountMinor],
    ['Original stay total', terms.totalAmountMinor],
    [`Initial deposit policy (${terms.depositPercent}%)`, initialDepositMinor],
    ['Separate security authorization', terms.securityDepositMinor],
  ];

  return <section aria-label="Original booked rate terms" className="lodging-surface space-y-4 p-5">
    <header>
      <p className="lodging-eyebrow">Original booked rate</p>
      <h3 className="lodging-title mt-2">{terms.ratePlanName}</h3>
      <p className="mt-1 text-sm">{terms.nights} {terms.nights === 1 ? 'night' : 'nights'}</p>
    </header>
    <dl className="space-y-2 text-sm">
      {rows.map(([label, amount], index) => <div key={label} className={`flex justify-between gap-4 ${index === 3 ? 'border-t border-[var(--lodging-rule)] pt-3 font-medium' : ''}`}>
        <dt>{label}</dt>
        <dd>{money(amount, terms.currencyCode)}</dd>
      </div>)}
    </dl>
    <p className="text-sm">Cancellation: {cancellationTerms(terms.cancellationPolicy)}</p>
    <p className="text-sm">Meal plan: {terms.mealPlan.replaceAll('_', ' ')}.</p>
    <p className="text-xs text-[var(--lodging-ink-muted)]">These are the rate terms recorded with the booking. Payment status and any current collectible balance are shown separately.</p>
  </section>;
}
