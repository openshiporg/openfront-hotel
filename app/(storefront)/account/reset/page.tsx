import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false },
};

export { default } from '@/features/storefront/screens/PasswordResetPage';
