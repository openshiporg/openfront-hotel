'use client';

import * as React from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, Lock } from 'lucide-react';

interface StripeCheckoutFormProps {
  amount: number;
  currencyCode?: string;
  bookingId: string;
  paymentSessionId: string;
  onSuccess: (paymentIntentId: string) => void | Promise<void>;
  onError: (error: string) => void;
}

export function StripeCheckoutForm({
  amount,
  currencyCode = 'USD',
  bookingId,
  paymentSessionId,
  onSuccess,
  onError,
}: StripeCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const submission = React.useRef(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || submission.current) {
      return;
    }

    submission.current = true;
    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/stripe/return?bookingId=${encodeURIComponent(bookingId)}&paymentSessionId=${encodeURIComponent(paymentSessionId)}`,
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Payment failed');
        setIsProcessing(false);
      } else if (paymentIntent) {
        await onSuccess(paymentIntent.id);
        setIsProcessing(false);
      }
      else { onError('Payment status is unavailable. Check your reservation before retrying.'); }
    } catch {
      onError('Payment status could not be checked. Open your reservation before retrying.');
    } finally { submission.current = false; setIsProcessing(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="sf-stack" style={{ '--stack': '20px' } as React.CSSProperties}>
      <PaymentElement />

      <button
        type="submit"
        className="sf-btn sf-btn--lg sf-btn--block"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="sf-spinner" aria-hidden="true" />
            Processing payment…
          </>
        ) : (
          <>
            <Lock aria-hidden="true" />
            {`Pay ${new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount)}`}
          </>
        )}
      </button>
    </form>
  );
}
