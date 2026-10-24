import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your reservation',
  robots: { index: false },
};

export { default } from '@/features/storefront/screens/BookingDetailPage';
