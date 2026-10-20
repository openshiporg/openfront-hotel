'use client';
import { Suspense } from 'react';
import { PaymentReturnStatus } from '../components/PaymentReturnStatus';
export default function StripeReturnPage() {
  return <Suspense fallback={<div className="sf-wrap sf-section" role="status">Opening payment return…</div>}>
    <PaymentReturnStatus provider="Stripe" />
  </Suspense>;
}
