import { STOREFRONT_THEME_PRIMARY } from './storefront-theme';

/** Stripe Elements render in an iframe and cannot read the storefront's CSS
 * variables, so the house palette is restated here in sRGB. */
export const STRIPE_APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: STOREFRONT_THEME_PRIMARY,
    colorText: '#1b2232',
    colorTextSecondary: '#5b6372',
    colorBackground: '#ffffff',
    colorDanger: '#a3392b',
    borderRadius: '10px',
    spacingUnit: '4px',
    fontSizeBase: '16px',
    fontFamily: 'Jost, ui-sans-serif, system-ui, sans-serif',
    colorTextPlaceholder: '#7c8391',
    colorIcon: '#4b5363',
  },
  // The storefront rule tone, so Stripe's fields match the page inputs.
  rules: {
    '.Input': { borderColor: '#cfd4dc', boxShadow: 'none' },
    '.Input:focus': { borderColor: 'var(--colorPrimary)', boxShadow: '0 0 0 3px rgba(31, 49, 80, 0.18)' },
    '.Tab': { borderColor: '#cfd4dc', boxShadow: 'none' },
    '.Tab--selected': { borderColor: 'var(--colorPrimary)', boxShadow: '0 0 0 1px var(--colorPrimary)' },
    '.Label': { fontWeight: '600' },
  },
};

/** The storefront body face, loaded inside Stripe's iframe. */
export const STRIPE_FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap' }];

/** Card fields focus and select in the same brand primary as the Pay button. */
export function stripeAppearance(accentPreset: unknown, logo?: { icon?: unknown; color?: unknown } | null) {
  // Rigel keeps one navy primary whatever the accent; the arguments stay for callers.
  void accentPreset; void logo;
  const primary = STOREFRONT_THEME_PRIMARY;
  const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(primary);
  const ring = rgb ? `0 0 0 3px rgba(${parseInt(rgb[1], 16)}, ${parseInt(rgb[2], 16)}, ${parseInt(rgb[3], 16)}, 0.18)` : STRIPE_APPEARANCE.rules['.Input:focus'].boxShadow;
  return {
    ...STRIPE_APPEARANCE,
    variables: { ...STRIPE_APPEARANCE.variables, colorPrimary: primary },
    rules: { ...STRIPE_APPEARANCE.rules, '.Input:focus': { ...STRIPE_APPEARANCE.rules['.Input:focus'], boxShadow: ring } },
  };
}
