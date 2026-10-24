import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

export const generateMetadata = () => storefrontPageMetadata('Find a reservation', 'Find a reservation with its confirmation number and booking email.');

export { default } from '@/features/storefront/screens/BookingLookupPage';
