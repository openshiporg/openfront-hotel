import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

export const generateMetadata = () => storefrontPageMetadata('Guest account', 'Sign in to see your stays and manage your guest details.', { index: false });

export { default } from '@/features/storefront/screens/AccountPage';
