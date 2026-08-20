'use client';

import { Check } from 'lucide-react';

import {
  STOREFRONT_ACCENT_PRESETS,
  type StorefrontAccentPreset,
} from '@/features/storefront/lib/storefront-theme';

export function StorefrontAccentPicker({
  value,
  onChange,
}: {
  value: StorefrontAccentPreset;
  onChange: (value: StorefrontAccentPreset) => void;
}) {
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Storefront accent preset">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STOREFRONT_ACCENT_PRESETS.map((preset) => {
          const selected = value === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(preset.key)}
              className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? 'border-foreground bg-muted'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-white shadow-sm"
                style={{ backgroundColor: preset.swatch }}
                aria-hidden="true"
              >
                {selected ? <Check className="size-4" strokeWidth={3} /> : null}
              </span>
              <span>
                <span className="block text-sm font-medium">{preset.label}</span>
                <span className="block text-xs text-muted-foreground">{preset.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Presets change storefront accent surfaces and browser theme color only. Rates, availability, and payment configuration are unaffected.
      </p>
    </div>
  );
}
