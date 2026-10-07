'use client';
import { Suspense } from 'react';
import { PaymentReturnStatus } from '../components/PaymentReturnStatus';
export default function StripeReturnPage() {
  return <Suspense fallback={<main className="lodging-container py-16">
    <p role="status">Opening payment return…</p>
  </main>}>
    <PaymentReturnStatus provider="Stripe" />
  </Suspense>;
}
