import { Marcellus } from 'next/font/google';

/**
 * The property name as a logo: Marcellus, an inscriptional titling serif, set in
 * spaced capitals on one line. Shared by the storefront chrome and the dashboard
 * logo preview so both show the same lockup.
 */
export const wordmarkFont = Marcellus({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  display: 'swap',
});
