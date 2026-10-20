'use client';
import Link from 'next/link';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { StatePanel } from '@/features/storefront/components/ui';
export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StatePanel role="alert" icon={TriangleAlert} eyebrow="We couldn’t open this page" title={<>Let’s try <em>that again.</em></>}
    actions={<><button type="button" className="sf-btn" onClick={reset}><RefreshCw aria-hidden="true" />Try again</button><Link href="/bookings/lookup" className="sf-btn sf-btn--ghost">Find your reservation</Link><Link href="/contact" className="sf-link">Contact the property</Link></>}>
    The page is temporarily unavailable. If you were making a payment, check your reservation before starting another payment.
  </StatePanel>;
}
