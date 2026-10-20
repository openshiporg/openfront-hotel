'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Code2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldTextarea, FormNote } from '@/features/platform/components/Form';
import { cn } from '@/lib/utils';
import { HUE_PRESETS, LOGO_ICONS } from '../lib/icon-registry';
import { sanitizeStoreLogoSvg } from '../lib/sanitize-store-logo';

import { DEFAULT_STORE_LOGO_ICON } from '../lib/store-logo';
const CUSTOM = 'custom';

/** Openfront swatch formula: the library's base blue rotated by the saved hue. */
const hueSwatch = (hue: string | number) => `hsl(${(240 + Number(hue)) % 360}, 70%, 50%)`;

/**
 * Logo preview. Every value reaching this component is either a library icon,
 * sanitized custom SVG, or a saved value the model already sanitized; it is
 * sanitized again here so nothing unsafe is ever injected into the page.
 */
export function LogoMark({ svg, hue, className }: { svg: string; hue: string; className?: string }) {
  const safe = useMemo(() => sanitizeStoreLogoSvg(svg), [svg]);
  if (!safe) {
    return <span className={cn('flex items-center justify-center', className)} aria-hidden="true"><span className="size-2.5 rotate-45 rounded-[999px_999px_999px_2px] bg-amber-700" /></span>;
  }
  return (
    <span
      className={cn('flex items-center justify-center overflow-hidden [&>svg]:block [&>svg]:size-full', className)}
      style={{ filter: `hue-rotate(${hue}deg)` }}
      dangerouslySetInnerHTML={{ __html: safe }}
      aria-hidden="true"
    />
  );
}

/**
 * Openfront store-logo picker (Restaurant LogoPicker contract): choose from the
 * shared Untitled UI library or paste a custom SVG that must pass the safe
 * sanitizer before it can be previewed or applied. An empty saved value uses
 * the Galileo library default.
 */
export function LogoPicker({ value, hue, onChange }: { value: string; hue: string; onChange: (svg: string) => void }) {
  const effective = value || DEFAULT_STORE_LOGO_ICON;
  const selectedIcon = useMemo(() => LOGO_ICONS.find((icon) => icon.lightSvg === effective), [effective]);
  const isCustom = Boolean(value) && !selectedIcon;
  const [isEditingCustom, setIsEditingCustom] = useState(isCustom);
  const [draft, setDraft] = useState(value);
  const safeDraft = useMemo(() => sanitizeStoreLogoSvg(draft), [draft]);
  const hasValidDraft = safeDraft.length > 0;
  const hasDraftChanges = safeDraft !== value;

  const selectLogo = (id: string) => {
    if (id === CUSTOM) {
      setDraft(effective);
      setIsEditingCustom(true);
      return;
    }
    const icon = LOGO_ICONS.find((candidate) => candidate.id === id);
    if (!icon) return;
    onChange(icon.lightSvg);
    setDraft(icon.lightSvg);
    setIsEditingCustom(false);
  };

  return (
    <div className="min-w-0 space-y-2">
      <Select value={selectedIcon?.id || CUSTOM} onValueChange={selectLogo}>
        <SelectTrigger id="logoIcon" className="w-full sm:max-w-xs" aria-label="Choose a logo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[280px]">
          <SelectItem value={CUSTOM}>
            <span className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-md border border-dashed bg-muted/30">
                <Code2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="font-medium">Custom SVG</span>
            </span>
          </SelectItem>
          {LOGO_ICONS.map((icon) => (
            <SelectItem key={icon.id} value={icon.id}>
              <span className="flex items-center gap-3">
                <span
                  className="flex size-7 items-center justify-center overflow-hidden rounded-md border bg-background p-1 [&>svg]:block [&>svg]:size-full"
                  style={{ filter: `hue-rotate(${hue}deg)` }}
                  dangerouslySetInnerHTML={{ __html: icon.lightSvg }}
                  aria-hidden="true"
                />
                <span className="font-medium">{icon.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setDraft(effective);
            setIsEditingCustom((open) => !open);
          }}
          aria-expanded={isEditingCustom}
        >
          <Code2 className="size-3.5" aria-hidden="true" />
          {value ? 'Edit SVG' : 'Custom SVG'}
        </Button>
        {isCustom ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3" aria-hidden="true" /> Custom
          </span>
        ) : null}
      </div>

      {isEditingCustom ? (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label htmlFor="logo-svg-draft" className="text-sm font-medium">Custom SVG</label>
              <FormNote>Paste a complete SVG. Scripts, links, styles, event handlers and external assets are rejected; gradients and viewBox are kept.</FormNote>
            </div>
            <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setIsEditingCustom(false)} aria-label="Close custom SVG editor">
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>

          <FieldTextarea
            id="logo-svg-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-3 min-h-32 resize-y font-mono text-xs"
            placeholder='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">…</svg>'
            spellCheck={false}
            aria-invalid={draft.length > 0 && !hasValidDraft}
            aria-describedby="logo-svg-status"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {hasValidDraft ? <LogoMark svg={safeDraft} hue={hue} className="size-9 shrink-0 rounded-md border bg-background p-1.5" /> : null}
              <span id="logo-svg-status" role="status" className={cn('text-xs', hasValidDraft || !draft ? 'text-muted-foreground' : 'text-destructive')}>
                {hasValidDraft ? 'Safe preview' : draft ? 'Enter a valid, safe SVG document' : 'Paste SVG markup to preview it'}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!hasValidDraft || !hasDraftChanges}
              onClick={() => {
                onChange(safeDraft);
                setIsEditingCustom(false);
              }}
            >
              Apply SVG
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Logo hue rotation: Restaurant's slider with Openfront's preset swatches. */
export function LogoHueControl({ value, onChange }: { value: string; onChange: (hue: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="logoColor" className="text-sm font-medium">Logo color</label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{value}°</span>
      </div>
      <input
        id="logoColor"
        type="range"
        min="0"
        max="359"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full accent-primary"
        aria-label="Logo hue rotation"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Logo color presets">
        {HUE_PRESETS.map((preset) => {
          const selected = Number(value) === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(String(preset.value))}
              aria-pressed={selected}
              title={preset.name}
              className={cn('flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs transition-colors hover:bg-muted', selected && 'border-foreground bg-muted')}
            >
              <span className="size-3.5 rounded-full" style={{ background: hueSwatch(preset.value) }} aria-hidden="true" />
              {preset.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
