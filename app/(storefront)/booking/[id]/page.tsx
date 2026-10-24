import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

export const generateMetadata = () => storefrontPageMetadata('Your reservation', 'Reservation status, statement and trip tools.', { index: false });

export { default } from '@/features/storefront/screens/BookingDetailPage';
