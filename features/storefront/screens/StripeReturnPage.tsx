'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { graphqlClient } from '@/lib/graphql-client';
import { COMPLETE_BOOKING_PAYMENT, GET_ACTIVE_BOOKING_PAYMENT_SESSION } from '@/lib/queries';

function StripeReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const complete = async () => {
      const bookingId = searchParams?.get('bookingId');
      let paymentSessionId = searchParams?.get('paymentSessionId');
      const paymentIntentId = searchParams?.get('payment_intent');
      const redirectStatus = searchParams?.get('redirect_status');
      if (!bookingId || !paymentIntentId || (redirectStatus && redirectStatus !== 'succeeded')) {
        setError('Stripe did not return a successful payment confirmation.');
        return;
      }
      try {
        if (!paymentSessionId) {
          const session = await graphqlClient.request<{ activeBookingPaymentSession?: { id: string } | null }>(
            GET_ACTIVE_BOOKING_PAYMENT_SESSION,
            { bookingId },
          );
          paymentSessionId = session.activeBookingPaymentSession?.id || null;
        }
        if (!paymentSessionId) throw new Error('The booking payment session could not be recovered.');
        await graphqlClient.request(COMPLETE_BOOKING_PAYMENT, {
          bookingId,
          paymentSessionId,
          providerPaymentId: paymentIntentId,
        });
        router.replace(`/booking/${bookingId}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to finalize the Stripe payment.');
      }
    };
    void complete();
  }, [router, searchParams]);

  return (
    <main className="lodging-page flex min-h-screen items-center justify-center">
      <div className="lodging-surface max-w-md p-10 text-center">
        {error ? (
          <div className="space-y-5">
            <p className="lodging-eyebrow text-[var(--lodging-danger)]">Stripe payment</p>
            <h1 className="lodging-headline">Payment needs attention</h1>
            <p className="lodging-lead">{error}</p>
            <Link href="/bookings/lookup" className="lodging-button inline-flex">Check reservation status</Link>
          </div>
        ) : (
          <div className="space-y-5">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-[var(--lodging-accent-deep)]" />
            <h1 className="lodging-headline">Finalizing your payment</h1>
            <p className="lodging-lead">Please wait while Stripe settlement is matched to your reservation.</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function StripeReturnPage() {
  return <Suspense fallback={<main className="lodging-page flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></main>}><StripeReturnContent /></Suspense>;
}
