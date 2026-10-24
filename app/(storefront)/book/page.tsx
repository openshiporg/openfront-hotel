import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book your stay',
  robots: { index: false },
};

export { default } from '@/features/storefront/screens/BookPage';
