import StripeReturnPage from '@/features/storefront/screens/StripeReturnPage';
import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

export const generateMetadata = () => storefrontPageMetadata('Payment', 'Payment status for your reservation.', { index: false });

export default StripeReturnPage;
