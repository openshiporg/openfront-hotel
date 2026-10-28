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
    fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    colorTextPlaceholder: '#807972',
    colorIcon: '#595149',
  },
  // Stripe derives a yellow-tinted border from the cream background; use the storefront rule tone.
  rules: {
    '.Input': { borderColor: '#c0b9b0', boxShadow: 'none' },
    '.Input:focus': { borderColor: 'var(--colorPrimary)', boxShadow: '0 0 0 3px rgba(117, 69, 29, 0.18)' },
    '.Tab': { borderColor: '#c0b9b0', boxShadow: 'none' },
    '.Tab--selected': { borderColor: 'var(--colorPrimary)', boxShadow: '0 0 0 1px var(--colorPrimary)' },
    '.Label': { fontWeight: '600' },
  },
};

/** The storefront body face, loaded inside Stripe's iframe. */
export const STRIPE_FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap' }];

/** Card fields focus and select in the same brand primary as the Pay button. */
export function stripeAppearance(accentPreset: unknown, logo?: { icon?: unknown; color?: unknown } | null) {
  const { primary } = resolveStorefrontBrand(accentPreset, logo);
  const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(primary);
  const ring = rgb ? `0 0 0 3px rgba(${parseInt(rgb[1], 16)}, ${parseInt(rgb[2], 16)}, ${parseInt(rgb[3], 16)}, 0.18)` : STRIPE_APPEARANCE.rules['.Input:focus'].boxShadow;
  return {
    ...STRIPE_APPEARANCE,
    variables: { ...STRIPE_APPEARANCE.variables, colorPrimary: primary },
    rules: { ...STRIPE_APPEARANCE.rules, '.Input:focus': { ...STRIPE_APPEARANCE.rules['.Input:focus'], boxShadow: ring } },
  };
}
