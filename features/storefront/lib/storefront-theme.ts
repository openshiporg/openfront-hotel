export const DEFAULT_STOREFRONT_ACCENT_PRESET = 'brass' as const;

export const STOREFRONT_ACCENT_PRESETS = [
  {
    key: 'brass',
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

export function storefrontAccentCssVariables(value: unknown): Record<string, string> {
  const preset = resolveStorefrontAccentPreset(value);
  return {
    '--lodging-accent': preset.tokens.accent,
    '--lodging-accent-deep': preset.tokens.deep,
    '--lodging-accent-pale': preset.tokens.pale,
    '--lodging-focus': preset.tokens.focus,
  };
}
