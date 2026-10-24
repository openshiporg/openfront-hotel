import { Suspense } from 'react';
import HomePage from '@/features/storefront/screens/HomePage';
import { StorefrontLoading } from '@/features/storefront/components/StorefrontLoading';

// Loading states sit on the routes that wait on the server, not on the whole storefront:
// a group-wide boundary streams every page, and a streamed not-found page can't send a 404.
export default function Page() {
  return <Suspense fallback={<StorefrontLoading />}><HomePage /></Suspense>;
}
