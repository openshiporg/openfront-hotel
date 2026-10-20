import { normalizeStoreLogoColor, storeLogoIsCustomized } from '../../platform/property/lib/store-logo';

export const DEFAULT_STOREFRONT_ACCENT_PRESET = 'brass' as const;

export const STOREFRONT_ACCENT_PRESETS = [
  {
    key: 'brass',
    primary: '#75451d',
    label: 'Aged brass',
    description: 'Warm and editorial',
    swatch: '#9a7046',
    tokens: {
      accent: 'oklch(58% 0.09 65)',
      deep: 'oklch(44% 0.085 58)',
      pale: 'oklch(92% 0.03 78)',
      focus: 'oklch(52% 0.11 62)',
    },
  },
  {
    key: 'forest',
    primary: '#23502f',
    label: 'Forest',
    description: 'Grounded and restorative',
    swatch: '#397354',
    tokens: {
      accent: 'oklch(52% 0.09 150)',
      deep: 'oklch(39% 0.075 150)',
      pale: 'oklch(92% 0.028 145)',
      focus: 'oklch(47% 0.1 150)',
    },
  },
  {
    key: 'harbor',
    primary: '#144e66',
    label: 'Harbor',
    description: 'Calm and coastal',
    swatch: '#44748b',
    tokens: {
      accent: 'oklch(54% 0.075 225)',
      deep: 'oklch(40% 0.07 230)',
      pale: 'oklch(92% 0.025 220)',
      focus: 'oklch(48% 0.095 230)',
    },
  },
  {
    key: 'claret',
    primary: '#6b3036',
    label: 'Claret',
    description: 'Rich and intimate',
    swatch: '#8a4a55',
    tokens: {
      accent: 'oklch(52% 0.1 15)',
      deep: 'oklch(39% 0.085 15)',
      pale: 'oklch(92% 0.025 15)',
      focus: 'oklch(47% 0.115 15)',
    },
  },
] as const;

export type StorefrontAccentPreset = (typeof STOREFRONT_ACCENT_PRESETS)[number]['key'];

export const STOREFRONT_ACCENT_PRESET_KEYS = STOREFRONT_ACCENT_PRESETS.map(
  (preset) => preset.key,
) as readonly StorefrontAccentPreset[];

export function parseStorefrontAccentPreset(value: unknown): StorefrontAccentPreset {
  const normalized = String(value || '').trim();
  if (!STOREFRONT_ACCENT_PRESET_KEYS.includes(normalized as StorefrontAccentPreset)) {
    throw new Error('Storefront accent preset is invalid.');
  }
  return normalized as StorefrontAccentPreset;
}

export function resolveStorefrontAccentPreset(value: unknown) {
  const key = STOREFRONT_ACCENT_PRESET_KEYS.includes(value as StorefrontAccentPreset)
    ? (value as StorefrontAccentPreset)
    : DEFAULT_STOREFRONT_ACCENT_PRESET;
  return STOREFRONT_ACCENT_PRESETS.find((preset) => preset.key === key)!;
}

// The library marks are drawn at this hue before the saved rotation (Restaurant uses the same offset).
const LOGO_BASE_HUE = 260;

/** OKLCH (L 0–1, C, hue in degrees) to an sRGB hex colour, for places that cannot read CSS variables. */
function oklchToHex(lightness: number, chroma: number, hue: number) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear.map((value) => {
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255).toString(16).padStart(2, '0');
  }).join('')}`;
}

export type StorefrontBrand = {
  tokens: { accent: string; deep: string; pale: string; focus: string };
  /** Browser theme colour. */
  swatch: string;
  /** Primary button colour in sRGB, for Stripe Elements. */
  primary: string;
};

/**
 * The storefront's brand colours. Once a store saves its own logo or logo colour, that
 * colour sets the accent, buttons and focus rings; until then the accent preset applies.
 * Lightness and chroma match the presets, so white text on the deep tone keeps its contrast.
 */
export function resolveStorefrontBrand(accentPreset: unknown, logo?: { icon?: unknown; color?: unknown } | null): StorefrontBrand {
  if (logo && storeLogoIsCustomized(logo.icon, logo.color)) {
    const hue = (LOGO_BASE_HUE + Number(normalizeStoreLogoColor(logo.color))) % 360;
    return {
      tokens: {
        accent: `oklch(54% 0.09 ${hue})`,
        deep: `oklch(40% 0.08 ${hue})`,
        pale: `oklch(92% 0.028 ${hue})`,
        focus: `oklch(48% 0.105 ${hue})`,
      },
      swatch: oklchToHex(0.54, 0.09, hue),
      primary: oklchToHex(0.4, 0.08, hue),
    };
  }
  const preset = resolveStorefrontAccentPreset(accentPreset);
  return { tokens: { ...preset.tokens }, swatch: preset.swatch, primary: preset.primary };
}

export function storefrontBrandCssVariables(brand: StorefrontBrand): Record<string, string> {
  return {
    '--lodging-accent': brand.tokens.accent,
    '--lodging-accent-deep': brand.tokens.deep,
    '--lodging-accent-pale': brand.tokens.pale,
    '--lodging-focus': brand.tokens.focus,
  };
}
