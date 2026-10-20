import { resolveStorefrontBrand } from './storefront-theme';

/** Stripe Elements render in an iframe and cannot read the storefront's CSS
 * variables, so the house palette is restated here in sRGB. */
export const STRIPE_APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#2b231c',
    colorText: '#2b231c',
    colorTextSecondary: '#6b5d50',
    colorBackground: '#fffdf9',
    colorDanger: '#a3392b',
    borderRadius: '10px',
    spacingUnit: '4px',
    fontSizeBase: '16px',
  },
};

/** Card fields focus and select in the same brand primary as the Pay button. */
export function stripeAppearance(accentPreset: unknown, logo?: { icon?: unknown; color?: unknown } | null) {
  const { primary } = resolveStorefrontBrand(accentPreset, logo);
  return { ...STRIPE_APPEARANCE, variables: { ...STRIPE_APPEARANCE.variables, colorPrimary: primary } };
}
