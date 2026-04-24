'use client';

import * as React from 'react';
import { Suspense } from 'react';
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
    <div className="hotel-page flex min-h-screen items-center justify-center">
      <div className="hotel-surface rounded-[2rem] p-8 text-center">
        {error ? (
          <div className="space-y-3">
            <h1 className="hotel-title text-2xl font-semibold">PayPal checkout failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Loader2 className="mx-auto h-8 w-8 animate-spin" />
            <h1 className="hotel-title text-2xl font-semibold">Finalizing your PayPal payment</h1>
            <p className="text-sm text-muted-foreground">Please wait while we confirm your reservation.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PayPalReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="hotel-page flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <PayPalReturnContent />
    </Suspense>
  );
}
