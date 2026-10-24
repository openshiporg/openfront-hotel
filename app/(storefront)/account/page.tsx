import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guest account',
  robots: { index: false },
};

export { default } from '@/features/storefront/screens/AccountPage';
