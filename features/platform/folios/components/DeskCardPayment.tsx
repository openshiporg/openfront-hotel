'use client';

/**
 * Front-desk card payment: the same booking payment session and Stripe PaymentIntent the guest
 * checkout uses (initiate → confirm in Stripe Elements → completeBookingPayment), so a desk
 * payment settles the folio through the one audited settlement path. Staff key the card while
 * the guest is at the desk or on the phone; The card is charged through the property's configured Stripe account.
 */
import React from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { CreditCard, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_BOOKING_PAYMENT_PROVIDERS, INITIATE_BOOKING_PAYMENT_SESSION } from '@/lib/queries';
import { settleBookingPayment } from '@/features/storefront/lib/payment-settlement';
import { Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';

type Provider = { code: string; publicClientKey?: string | null };
type Session = { id: string; amount: number; clientSecret?: string | null };

const stripeCache = new Map<string, Promise<Stripe | null>>();
const stripeFor = (key: string) => { if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key)); return stripeCache.get(key)!; };
const money = (minor: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);

function CardForm({ bookingId, session, balanceMinor, currency, onDone }: { bookingId: string; session: Session; balanceMinor: number; currency: string; onDone: (settled: boolean) => void }) {
  const stripe = useStripe(); const elements = useElements();
  const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!stripe || !elements || busy) return;
    setBusy(true); setError('');
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/dashboard/platform/folios?bookingId=${encodeURIComponent(bookingId)}` },
        redirect: 'if_required',
      });
      if (stripeError) { setError(stripeError.message || 'The card was declined.'); return; }
      if (!paymentIntent) { setError('Stripe did not return a payment. Refresh the folio before trying again.'); return; }
      onDone((await settleBookingPayment({ bookingId, paymentSessionId: session.id, providerPaymentId: paymentIntent.id, balanceBeforeMinor: balanceMinor })) === 'settled');
    } catch { setError('The payment outcome is unknown. Refresh the folio before trying again.'); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!stripe || busy}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}{busy ? 'Charging card…' : `Charge ${money(session.amount, currency)}`}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function DeskCardPayment({ bookingId, balanceMinor, currency = 'USD', onPaid }: { bookingId: string; balanceMinor: number; currency?: string; onPaid: () => void | Promise<void> }) {
  const [state, setState] = React.useState<{ session: Session; stripe: Promise<Stripe | null> } | null>(null);
  const [starting, setStarting] = React.useState(false); const [error, setError] = React.useState('');
  React.useEffect(() => { setState(null); setError(''); }, [bookingId]);

  const start = async () => {
    setStarting(true); setError('');
    try {
      const { bookingPaymentProviders } = await graphqlClient.request<{ bookingPaymentProviders: Provider[] }>(GET_BOOKING_PAYMENT_PROVIDERS);
      const provider = (bookingPaymentProviders || []).find(item => item.code === 'pp_stripe_stripe' && item.publicClientKey);
      if (!provider?.publicClientKey) throw new Error('Card payments need Stripe set up under Payment Providers.');
      const origin = window.location.origin; const back = `${origin}/book?bookingId=${encodeURIComponent(bookingId)}`;
      const { initiateBookingPaymentSession: session } = await graphqlClient.request<{ initiateBookingPaymentSession: Session }>(INITIATE_BOOKING_PAYMENT_SESSION, {
        bookingId, paymentProviderCode: provider.code, returnUrl: `${origin}/stripe/return`, cancelUrl: back,
      });
      if (!session?.clientSecret) throw new Error('Stripe did not open a card payment for this balance.');
      setState({ session, stripe: stripeFor(provider.publicClientKey) });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(/no outstanding balance/i.test(message) ? 'Nothing is due on this folio.' : /Stripe|Payment Providers/.test(message) ? message : 'A card payment could not be started. Refresh the folio and try again.');
    } finally { setStarting(false); }
  };

  const done = async (settled: boolean) => {
    const amount = state?.session.amount; setState(null);
    if (settled) { toast.success('Card payment taken', { description: amount ? `${money(amount, currency)} charged and posted to the folio.` : undefined }); await onPaid(); }
  };

  return (
    <Panel>
      <PanelHeader title="Take card payment" description="Charge the guest's card now, at the desk or over the phone. The payment posts to this folio and reduces the balance." />
      <PanelBody className="space-y-3">
        {state ? (
          <Elements stripe={state.stripe} options={{ clientSecret: state.session.clientSecret!, appearance: { theme: 'stripe' } }}>
            <CardForm bookingId={bookingId} session={state.session} balanceMinor={balanceMinor} currency={currency} onDone={settled => void done(settled)} />
          </Elements>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={starting} onClick={() => void start()}>{starting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CreditCard aria-hidden="true" />}Charge card for the balance due</Button>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
