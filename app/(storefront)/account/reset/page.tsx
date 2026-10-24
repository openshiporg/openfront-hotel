import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

export const generateMetadata = () => storefrontPageMetadata('Reset password', 'Reset the password for your guest account.', { index: false });

export { default } from '@/features/storefront/screens/PasswordResetPage';
