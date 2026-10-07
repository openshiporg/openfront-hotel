'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { graphqlClient } from '@/lib/graphql-client';
import { COMPLETE_BOOKING_PAYMENT, GET_ACTIVE_BOOKING_PAYMENT_SESSION } from '@/lib/queries';

/** Return parameters identify a verification attempt. Only the server can establish its outcome. */
export function PaymentReturnStatus({ provider }: { provider: 'Stripe' | 'PayPal'; }) {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search?.get('bookingId') || '';
  const suppliedSessionId = search?.get('paymentSessionId') || '';
  const providerPaymentId = search?.get(provider === 'Stripe' ? 'payment_intent' : 'token') || '';
  const [phase, setPhase] = React.useState<'verifying' | 'attention'>('verifying');
  const [attempt, setAttempt] = React.useState(0);
  const operation = React.useRef<{ key: string; promise: Promise<void>; } | null>(null);
  const recoveredSession = React.useRef<{ bookingId: string; id: string; } | null>(null);
  const canVerify = Boolean(bookingId && providerPaymentId);
  React.useEffect(() => {
    let current = true;
    if (!canVerify) { setPhase('attention'); return; }
    setPhase('verifying');
    const key = JSON.stringify([provider, bookingId, suppliedSessionId, providerPaymentId, attempt]);
    if (operation.current?.key !== key) {
      operation.current = {
        key, promise: (async () => {
          let paymentSessionId = suppliedSessionId || (recoveredSession.current?.bookingId === bookingId ? recoveredSession.current.id : '');
          if (!paymentSessionId) {
            const result = await graphqlClient.request<{ activeBookingPaymentSession?: { id: string; } | null; }>(GET_ACTIVE_BOOKING_PAYMENT_SESSION, { bookingId });
            paymentSessionId = result.activeBookingPaymentSession?.id || '';
            if (paymentSessionId) recoveredSession.current = { bookingId, id: paymentSessionId };
          }
          if (!paymentSessionId) throw new Error('Unresolved payment session');
          await graphqlClient.request(COMPLETE_BOOKING_PAYMENT, { bookingId, paymentSessionId, providerPaymentId });
        })()
      };
    }
    operation.current.promise.then(() => { if (current) router.replace(`/booking/${encodeURIComponent(bookingId)}`); }).catch(() => { if (current) setPhase('attention'); });
    return () => { current = false; };
  }, [provider, bookingId, suppliedSessionId, providerPaymentId, canVerify, attempt, router]);

  return <main className="lodging-container py-16 md:py-24">
    <div className="mx-auto max-w-2xl">
      <p className="lodging-eyebrow mb-4">{provider} · Return to your reservation</p>
      <h1 className="lodging-display">{phase === 'verifying' ? 'Checking your payment.' : 'Let’s check where things stand.'}</h1>
      <div role={phase === 'verifying' ? 'status' : 'alert'} aria-live="polite" className="hotel-notice mt-8">
        <p>{phase === 'verifying' ? 'The reservation service is verifying the payment with your booking. Confirmation and payment status will appear on your reservation.' : canVerify ? 'We could not establish a completed payment from this return. It may still be processing, or may need attention. Review your reservation before starting another payment.' : 'This return is missing the details needed to verify payment. Open your reservation or verify access with your confirmation number.'}</p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        {phase === 'attention' && canVerify && <button type="button" className="lodging-button" onClick={() => { setPhase('verifying'); setAttempt(value => value + 1); }}>Check payment again</button>}
        <Link className="lodging-button-ghost" href={bookingId ? `/booking/${encodeURIComponent(bookingId)}` : '/bookings/lookup'}>View reservation status</Link>
        {phase === 'attention' && <Link className="lodging-button-ghost" href="/contact?subject=billing">Get payment help</Link>}
      </div>
      <p className="mt-8 text-sm leading-6 text-[var(--lodging-ink-muted)]">Keep your existing reservation reference. A return from the payment provider does not by itself confirm a stay or a completed charge.</p>
    </div>
  </main>;
}
