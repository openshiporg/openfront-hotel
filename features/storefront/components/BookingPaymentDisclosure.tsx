import * as React from 'react';
export function BookingPaymentDisclosure({ totalMinor, depositPercent = 100, securityDepositMinor = 0, paymentAmountMinor, currencyCode = 'USD' }: { totalMinor: number; depositPercent?: number; securityDepositMinor?: number; paymentAmountMinor?: number | null; currencyCode?: string }) {
  const dueNow = paymentAmountMinor ?? Math.ceil(totalMinor * depositPercent / 100);
  const remaining = Math.max(0, totalMinor - dueNow);
  const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(minor / 100);
  return <section aria-label="Booking payment terms" className="space-y-3 text-sm"><div className="flex justify-between"><span>Due now{depositPercent < 100 ? ` (${depositPercent}% booking deposit)` : ''}</span><span>{money(dueNow)}</span></div>{remaining > 0 && <p>Remaining booking balance: {money(remaining)}, due at the property before departure.</p>}{securityDepositMinor > 0 && <p>Security card authorization: {money(securityDepositMinor)}, separate from the booking payment above. After confirmation, authorize this temporary card hold through your reservation details before arrival. The property releases the hold or applies an approved charge already recorded on your folio. Card authorization availability and expiry are determined by the provider.</p>}</section>;
}
