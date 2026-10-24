import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

export const generateMetadata = () => storefrontPageMetadata('Book your stay', 'Review the full stay price and complete your direct reservation.', { index: false });

export { default } from '@/features/storefront/screens/BookPage';
