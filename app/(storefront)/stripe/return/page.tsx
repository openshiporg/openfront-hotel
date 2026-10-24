import type { Metadata } from 'next';
import StripeReturnPage from '@/features/storefront/screens/StripeReturnPage';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false },
};

export default StripeReturnPage;
