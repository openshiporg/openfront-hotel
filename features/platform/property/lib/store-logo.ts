import { LOGO_ICONS } from './icon-registry';

// Unsaved tenants use the donor library without writing Property settings.
export const DEFAULT_STORE_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === 'galileo')!.lightSvg;
// Aged-brass hue rotation, independent of the storefront accent preset.
export const DEFAULT_LIBRARY_LOGO_COLOR = '159';

// Keep the persisted color contract and normalization unchanged.
export const DEFAULT_STORE_LOGO_COLOR = '0';

export function normalizeStoreLogoColor(value: unknown): string {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String(((numeric % 360) + 360) % 360);
}

/** A store that has saved its own logo or a logo colour; the defaults ('' and '0') are untouched. */
export function storeLogoIsCustomized(icon: unknown, color: unknown) {
  return Boolean(String(icon ?? '').trim()) || normalizeStoreLogoColor(color) !== DEFAULT_STORE_LOGO_COLOR;
}

/** The hue the logo is shown in: the saved colour, or the library default for an untouched store. */
export function effectiveStoreLogoHue(icon: unknown, color: unknown) {
  return storeLogoIsCustomized(icon, color) ? normalizeStoreLogoColor(color) : DEFAULT_LIBRARY_LOGO_COLOR;
}
