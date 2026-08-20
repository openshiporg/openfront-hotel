'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { graphqlClient } from '@/lib/graphql-client';
import { COMPLETE_BOOKING_PAYMENT, GET_ACTIVE_BOOKING_PAYMENT_SESSION } from '@/lib/queries';

function PayPalReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const complete = async () => {
      const bookingId = searchParams?.get('bookingId');
      let paymentSessionId = searchParams?.get('paymentSessionId');
      const token = searchParams?.get('token') || searchParams?.get('PayerID');

      if (!bookingId || !token) {
        setError('Missing PayPal return details.');
        return;
      }

      try {
        if (!paymentSessionId) {
          const sessionResponse = (await graphqlClient.request(
            GET_ACTIVE_BOOKING_PAYMENT_SESSION,
            { bookingId }
          )) as { activeBookingPaymentSession?: { id: string } | null };
          paymentSessionId = sessionResponse.activeBookingPaymentSession?.id || null;
        }

        if (!paymentSessionId) {
          throw new Error('Missing booking payment session.');
        }

        await graphqlClient.request(COMPLETE_BOOKING_PAYMENT, {
          bookingId,
          paymentSessionId,
          providerPaymentId: token,
        });

        router.replace(`/booking/${bookingId}`);
      } catch (err: any) {
        setError(err?.message || 'Unable to complete PayPal payment.');
      }
    };

    complete();
  }, [router, searchParams]);

  return (
    <main className="lodging-page flex min-h-screen items-center justify-center">
      <div className="lodging-surface max-w-md p-10 text-center">
        {error ? (
          <div className="space-y-5">
            <p className="lodging-eyebrow text-[var(--lodging-danger)]">PayPal</p>
            <h1 className="lodging-headline">Checkout failed</h1>
            <p className="lodging-lead">{error}</p>
            <Link href="/rooms" className="lodging-button inline-flex">Browse rooms</Link>
          </div>
        ) : (
          <div className="space-y-5">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-[var(--lodging-accent-deep)]" />
            <h1 className="lodging-headline">Finalizing your payment</h1>
            <p className="lodging-lead">Please wait while we confirm your reservation.</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PayPalReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="lodging-page flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--lodging-accent-deep)]" />
        </main>
      }
    >
      <PayPalReturnContent />
    </Suspense>
  );
}
