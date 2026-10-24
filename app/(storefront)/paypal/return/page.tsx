import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false },
};

export { default } from '@/features/storefront/screens/PayPalReturnPage';
