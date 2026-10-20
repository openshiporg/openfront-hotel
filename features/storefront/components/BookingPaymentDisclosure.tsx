import * as React from 'react';
import { money } from '../lib/stay-context';

/** What is collected now versus later. `paymentAmountMinor` comes from the live payment session when one exists. */
export function BookingPaymentDisclosure({ totalMinor, depositPercent = 100, securityDepositMinor = 0, paymentAmountMinor, currencyCode = 'USD' }: { totalMinor: number; depositPercent?: number; securityDepositMinor?: number; paymentAmountMinor?: number | null; currencyCode?: string }) {
  const dueNow = paymentAmountMinor ?? Math.ceil(totalMinor * depositPercent / 100);
  const remaining = Math.max(0, totalMinor - dueNow);
  return <section aria-label="Booking payment terms" className="sf-bill__pay">
    <div><span>{paymentAmountMinor != null ? 'Payment amount' : 'Due when you book'}{paymentAmountMinor == null && depositPercent < 100 ? ` (${depositPercent}% deposit)` : ''}</span><span>{money(dueNow, currencyCode)}</span></div>
    {remaining > 0 && <div><span>Balance, due at the property before departure</span><span>{money(remaining, currencyCode)}</span></div>}
    {securityDepositMinor > 0 && <p>A separate security card authorization of {money(securityDepositMinor, currencyCode)} may be requested after confirmation, through your reservation, before arrival. It is a temporary hold, not part of the booking payment; the property releases it or applies an approved charge already recorded on your folio.</p>}
  </section>;
}
