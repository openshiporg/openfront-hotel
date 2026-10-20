'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, BellRing, Blocks, Building2, BadgePlus, CircleDollarSign, Gift, ImageIcon, ImageOff, Loader2, Palette, RotateCcw, Save, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Field, FieldInput, NativeSelect } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatMoneyMinor, previewMinor } from '@/features/platform/lib/format';
import { DEFAULT_STOREFRONT_ACCENT_PRESET, type StorefrontAccentPreset } from '@/features/storefront/lib/storefront-theme';
import { getPropertySettingsWorkspace, updatePropertySettingsAction } from '../actions';
import { StorefrontAccentPicker } from '../components/StorefrontAccentPicker';
import { LogoHueControl, LogoMark, LogoPicker } from '../components/LogoPicker';
import { DEFAULT_STORE_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON, effectiveStoreLogoHue } from '../lib/store-logo';
import { wordmarkFont } from '@/features/storefront/lib/wordmark-font';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const empty = {
  propertyName: '', tagline: '', contactEmail: '', contactPhone: '', addressLine1: '', addressLine2: '', frontDeskCopy: '',
  timeZone: 'UTC', checkInTime: '3:00 PM', checkOutTime: '11:00 AM',
  currencyCode: 'USD', taxRateBasisPoints: '0', serviceFeeMinor: '0',
  depositPercent: '100', securityDepositMinor: '0',
  prearrivalEmailEnabled: 'false', prearrivalDays: '1',
  loyaltyEnabled: 'false', loyaltyEarnMinorPerPoint: '100', loyaltyRedeemMinorPerPoint: '1', loyaltyMinimumRedemptionPoints: '100',
  groupsEnabled: 'false',
  refundApprovalThresholdMinor: '0', writeOffApprovalThresholdMinor: '0', cashVarianceApprovalThresholdMinor: '0', ratePublicationRequiresApproval: 'true',
  storefrontAccentPreset: DEFAULT_STOREFRONT_ACCENT_PRESET as string,
  logoIcon: '', logoColor: DEFAULT_STORE_LOGO_COLOR,
  heroImagePath: '', heroImageAltText: '', heroImageCaption: '',
  amenityImagePath: '', amenityImageAltText: '', amenityImageCaption: '',
  locationImagePath: '', locationImageAltText: '', locationImageCaption: '',
};
type Form = typeof empty;
type Key = keyof Form;

type SectionId = 'identity' | 'commercial' | 'deposits' | 'communications' | 'loyalty' | 'groups' | 'approvals' | 'logo' | 'accent' | 'media';

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }>; keys: Key[] }> = [
  { id: 'identity', label: 'Identity & front desk', icon: Building2, keys: ['propertyName', 'tagline', 'contactEmail', 'contactPhone', 'addressLine1', 'addressLine2', 'frontDeskCopy', 'timeZone', 'checkInTime', 'checkOutTime'] },
  { id: 'commercial', label: 'Commercial defaults', icon: CircleDollarSign, keys: ['currencyCode', 'taxRateBasisPoints', 'serviceFeeMinor'] },
  { id: 'deposits', label: 'Deposits & security', icon: Wallet, keys: ['depositPercent', 'securityDepositMinor'] },
  { id: 'communications', label: 'Arrival communications', icon: BellRing, keys: ['prearrivalEmailEnabled', 'prearrivalDays'] },
  { id: 'loyalty', label: 'Loyalty', icon: Gift, keys: ['loyaltyEnabled', 'loyaltyEarnMinorPerPoint', 'loyaltyRedeemMinorPerPoint', 'loyaltyMinimumRedemptionPoints'] },
  { id: 'groups', label: 'Group bookings', icon: Blocks, keys: ['groupsEnabled'] },
  { id: 'approvals', label: 'Independent approvals', icon: BadgeCheck, keys: ['refundApprovalThresholdMinor', 'writeOffApprovalThresholdMinor', 'cashVarianceApprovalThresholdMinor', 'ratePublicationRequiresApproval'] },
  { id: 'logo', label: 'Logo', icon: BadgePlus, keys: ['logoIcon', 'logoColor'] },
  { id: 'accent', label: 'Storefront accent', icon: Palette, keys: ['storefrontAccentPreset'] },
  { id: 'media', label: 'Storefront media', icon: ImageIcon, keys: ['heroImagePath', 'heroImageAltText', 'heroImageCaption', 'amenityImagePath', 'amenityImageAltText', 'amenityImageCaption', 'locationImagePath', 'locationImageAltText', 'locationImageCaption'] },
];

const MEDIA_SLOTS = [
  { prefix: 'hero', label: 'Hero image', usage: 'Home page header' },
  { prefix: 'amenity', label: 'Amenity image', usage: 'Amenities page' },
  { prefix: 'location', label: 'Location image', usage: 'Location page' },
] as const;

function timeZoneOptions() {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') || [];
  } catch {
    return [];
  }
}

function toForm(settings: Record<string, unknown> | null): Form {
  if (!settings) return empty;
  return Object.fromEntries(Object.keys(empty).map((key) => [key, String(settings[key] ?? empty[key as Key])])) as Form;
}

export default function PropertySettingsPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<Form>(empty);
  const [saved, setSaved] = React.useState<Form>(empty);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [settingsState, setSettingsState] = React.useState<'configured' | 'missing'>('missing');
  const zones = React.useMemo(timeZoneOptions, []);

  const changedKeys = React.useMemo(() => new Set((Object.keys(form) as Key[]).filter((key) => form[key] !== saved[key])), [form, saved]);
  const dirty = changedKeys.size > 0;
  const sectionDirty = (id: SectionId) => SECTIONS.find((item) => item.id === id)!.keys.some((key) => changedKeys.has(key));

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const workspace = await getPropertySettingsWorkspace();
      const next = toForm(workspace.settings);
      setSettingsState(workspace.state);
      setForm(next);
      setSaved(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Property settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      unwrapAction(await updatePropertySettingsAction({ ...form, taxRateBasisPoints: Number(form.taxRateBasisPoints), serviceFeeMinor: Number(form.serviceFeeMinor) }));
      setSaved(form);
      setSettingsState('configured');
      toast.success('Property settings saved');
      router.refresh();
    } catch (cause) {
      toast.error('Settings not saved', { description: cause instanceof Error ? cause.message : 'Validation failed.' });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: Key, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const logoHue = effectiveStoreLogoHue(form.logoIcon, form.logoColor);
  // Leaving with unsaved edits asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const enabled = (key: Key) => form[key] === 'true';
  const minor = (key: Key) => Number(form[key]) || 0;

  const field = (key: Key, label: string, options: { hint?: React.ReactNode; type?: string; optional?: boolean; placeholder?: string; list?: string; className?: string } = {}) => {
    const minorPreview = key.endsWith('Minor') ? previewMinor(form[key]) : null;
    const hint = minorPreview
      ? <>{options.hint ? <>{options.hint} </> : null}<span className="font-medium text-foreground">= {minorPreview}</span></>
      : options.hint;
    const numeric = options.type === 'number';
    return (
      <Field label={label} htmlFor={key} hint={hint} optional={options.optional} className={options.className}>
        <FieldInput
          id={key}
          type={options.type || 'text'}
          inputMode={numeric ? 'numeric' : undefined}
          min={numeric ? 0 : undefined}
          step={numeric ? 1 : undefined}
          list={options.list}
          placeholder={options.placeholder}
          value={form[key]}
          onChange={(event) => set(key, event.target.value)}
          className={cn(numeric && 'tabular-nums', changedKeys.has(key) && 'border-amber-500/50')}
        />
      </Field>
    );
  };

  const toggle = (key: Key, label: string, description: string) => (
    <div className={cn('flex items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors', enabled(key) && 'bg-muted/30', changedKeys.has(key) && 'border-amber-500/50')}>
      <div className="min-w-0">
        <label htmlFor={key} className="text-sm font-medium">{label}</label>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch id={key} checked={enabled(key)} onCheckedChange={(checked) => set(key, checked ? 'true' : 'false')} />
    </div>
  );

  const section = (id: SectionId, description: React.ReactNode, children: React.ReactNode, bodyClassName = 'grid gap-5 md:grid-cols-2') => {
    const meta = SECTIONS.find((item) => item.id === id)!;
    return (
      <Panel id={id} className="scroll-mt-20 lg:scroll-mt-6">
        <PanelHeader
          title={meta.label}
          description={description}
          icon={meta.icon}
          actions={sectionDirty(id) ? <StatusPill tone="warning" label="Edited" /> : null}
        />
        <PanelBody className={bodyClassName}>{children}</PanelBody>
      </Panel>
    );
  };

  const depositPercent = Number(form.depositPercent);
  const taxPercent = Number(form.taxRateBasisPoints) / 100;

  return (
    <PlatformPage
      title="Property Settings"
      description="Property details, stay policies, pricing and storefront branding."
      meta={!loading && !error ? (
        <StatusPill
          tone={dirty ? 'warning' : settingsState === 'configured' ? 'success' : 'neutral'}
          label={dirty ? `${changedKeys.size} unsaved ${changedKeys.size === 1 ? 'change' : 'changes'}` : settingsState === 'configured' ? 'All changes saved' : 'Not set up'}
        />
      ) : null}
      actions={!loading && !error ? <>
        <Button type="button" variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setForm(saved)}><RotateCcw aria-hidden="true" />Discard</Button>
        <Button type="submit" form="property-settings-form" size="sm" disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Save Changes</Button>
      </> : null}
    >
      {error ? <WorkspaceError message={error} onRetry={load} title="Property settings unavailable" /> : loading ? <WorkspaceLoading label="Loading property settings" rows={6} /> : (
          <form id="property-settings-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="min-w-0 max-w-5xl space-y-6">
            {settingsState === 'missing' ? (
              <Callout tone="info" icon={Building2} title="Property settings are not set up yet" role="status">
                Complete the required fields and save. Until then, the storefront shows a generic name and the default theme.
              </Callout>
            ) : null}

            {section('identity', 'Public contact and stay-time copy used by direct booking and operators.', <>
              {field('propertyName', 'Property name', { placeholder: 'The Alder House' })}
              {field('tagline', 'Tagline', { optional: true })}
              {field('contactEmail', 'Contact email', { type: 'email', placeholder: 'stay@yourhotel.com' })}
              {field('contactPhone', 'Contact phone', { type: 'tel' })}
              {field('addressLine1', 'Address line 1')}
              {field('addressLine2', 'Address line 2', { optional: true })}
              {field('frontDeskCopy', 'Front desk hours copy', { optional: true, placeholder: 'Front desk open 24 hours', className: 'md:col-span-2' })}
              {field('timeZone', 'Property time zone', { hint: 'IANA zone. Arrival and cancellation deadlines use this zone.', placeholder: 'America/New_York', list: zones.length ? 'property-time-zones' : undefined })}
              <div className="grid grid-cols-2 gap-3">
                {field('checkInTime', 'Check-in', { placeholder: '3:00 PM' })}
                {field('checkOutTime', 'Check-out', { placeholder: '11:00 AM' })}
              </div>
              {zones.length ? <datalist id="property-time-zones">{zones.map((zone) => <option key={zone} value={zone} />)}</datalist> : null}
            </>)}

            {section('commercial', 'Tax and fee changes apply to new quotes and bookings. Existing reservations keep their booked prices.', <>
              <Field label="Currency" htmlFor="currencyCode" hint="Currency: USD.">
                <NativeSelect id="currencyCode" value={form.currencyCode} onChange={(event) => set('currencyCode', event.target.value)}>
                  <option value="USD">USD — US dollar</option>
                </NativeSelect>
              </Field>
              {field('taxRateBasisPoints', 'Tax rate (basis points)', {
                type: 'number',
                hint: <>100 basis points = 1%.{Number.isFinite(taxPercent) ? <> Currently <span className="font-medium text-foreground">{taxPercent.toFixed(2)}%</span>.</> : null}</>,
              })}
              {field('serviceFeeMinor', 'Per-stay fee (cents)', { type: 'number', hint: 'Added once to each stay.' })}
            </>, 'grid gap-5 md:grid-cols-3')}

            {section('deposits', 'New reservations keep the deposit terms in force when they were booked; the balance is paid during the stay. Changing this policy requires role administration.', <>
              {field('depositPercent', 'Deposit at confirmation (%)', {
                type: 'number',
                hint: depositPercent >= 1 && depositPercent <= 100
                  ? depositPercent === 100 ? 'Guests prepay the full stay.' : `Guests pay ${depositPercent}% when booking and ${100 - depositPercent}% during the stay.`
                  : 'Enter a whole number from 1 to 100.',
              })}
              {field('securityDepositMinor', 'Refundable security hold (cents)', { type: 'number', hint: minor('securityDepositMinor') ? 'Stripe reserves funds; capture requires reviewed actual charges.' : 'Zero disables new authorizations.' })}
            </>)}

            {section('communications', 'Send one reminder email before each confirmed arrival.', <>
              {toggle('prearrivalEmailEnabled', 'Pre-arrival email', 'Send a reminder ahead of each confirmed arrival.')}
              {field('prearrivalDays', 'Days before arrival (1–14)', { type: 'number', hint: enabled('prearrivalEmailEnabled') ? `Sent ${form.prearrivalDays || '—'} day(s) before check-in.` : 'Used once the reminder is on.' })}
            </>)}

            {section('loyalty', 'Points are earned from settled eligible stays and redeemed against open folios. Changes require role administration.', <>
              <div className="md:col-span-2">{toggle('loyaltyEnabled', 'Loyalty program', 'Allow earning at checkout and redemption against in-house folios.')}</div>
              <div className={cn('contents', !enabled('loyaltyEnabled') && '[&>*]:opacity-70')}>
                {field('loyaltyEarnMinorPerPoint', 'Spend per earned point (cents)', { type: 'number', hint: minor('loyaltyEarnMinorPerPoint') ? `1 point for every ${formatMoneyMinor(minor('loyaltyEarnMinorPerPoint'))} of eligible room revenue.` : undefined })}
                {field('loyaltyRedeemMinorPerPoint', 'Credit per redeemed point (cents)', { type: 'number', hint: minor('loyaltyRedeemMinorPerPoint') ? `100 points = ${formatMoneyMinor(minor('loyaltyRedeemMinorPerPoint') * 100)} folio credit.` : undefined })}
                {field('loyaltyMinimumRedemptionPoints', 'Minimum points per redemption', { type: 'number', hint: minor('loyaltyMinimumRedemptionPoints') && minor('loyaltyRedeemMinorPerPoint') ? `Smallest credit: ${formatMoneyMinor(minor('loyaltyMinimumRedemptionPoints') * minor('loyaltyRedeemMinorPerPoint'))}.` : undefined })}
              </div>
            </>)}

            {section('groups', 'Contracted room blocks, rooming lists and master folios. Changing this policy requires role administration.', <>
              <div className="md:col-span-2">{toggle('groupsEnabled', 'Group operations', 'Enable after reviewing group contract and billing settings.')}</div>
            </>)}

            {section('approvals', 'Amounts at or above each threshold need a second authorized staff member to approve. Zero means every amount.', <>
              {field('refundApprovalThresholdMinor', 'Refund threshold (cents)', { type: 'number' })}
              {field('writeOffApprovalThresholdMinor', 'Write-off threshold (cents)', { type: 'number' })}
              {field('cashVarianceApprovalThresholdMinor', 'Cash variance threshold (cents)', { type: 'number' })}
              {toggle('ratePublicationRequiresApproval', 'Rate publication approval', 'Require an independent approval before a rate becomes public or active.')}
            </>)}

            {section('logo', 'Shown beside the property name in the storefront header, mobile menu and footer. Once you save a logo or logo color, it also sets the storefront accent: buttons, links and focus rings.', (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="logoIcon" className="text-sm font-medium">Logo</label>
                    <LogoPicker value={form.logoIcon} hue={logoHue} onChange={(logoIcon) => setForm((current) => ({ ...current, logoIcon, logoColor: logoHue }))} />
                  </div>
                  <div>
                    <LogoHueControl value={logoHue} onChange={(logoColor) => setForm((current) => ({ ...current, logoIcon: current.logoIcon || DEFAULT_STORE_LOGO_ICON, logoColor }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Storefront preview</p>
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-background px-3 py-3">
                      <LogoMark svg={form.logoIcon || DEFAULT_STORE_LOGO_ICON} hue={logoHue} className="size-8 shrink-0" />
                      <span className={`min-w-0 break-words text-base uppercase leading-tight tracking-[0.16em] ${wordmarkFont.className}`}>{form.propertyName || 'Property name'}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-stone-900 px-3 py-3 text-stone-50">
                      <LogoMark svg={form.logoIcon || DEFAULT_STORE_LOGO_ICON} hue={logoHue} className="size-8 shrink-0" />
                      <span className={`min-w-0 break-words text-base uppercase leading-tight tracking-[0.16em] ${wordmarkFont.className}`}>{form.propertyName || 'Property name'}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Header, mobile menu and footer. Galileo is the library default when no logo is saved.</p>
                </div>
              </div>
            ), '')}

            {section('accent', 'Storefront color used until a logo or logo color is saved.', (
              <StorefrontAccentPicker value={form.storefrontAccentPreset as StorefrontAccentPreset} onChange={(storefrontAccentPreset) => set('storefrontAccentPreset', storefrontAccentPreset)} />
            ), '')}

            {section('media', 'Image paths start with /images/. Add alt text that describes each image.', (
              <div className="divide-y">
                {MEDIA_SLOTS.map(({ prefix, label, usage }) => {
                  const pathKey = `${prefix}ImagePath` as Key;
                  const altKey = `${prefix}ImageAltText` as Key;
                  const missingAlt = Boolean(form[pathKey].trim()) && !form[altKey].trim();
                  return (
                    <div key={prefix} className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <MediaPreview path={form[pathKey]} alt={form[altKey]} />
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{usage}</p>
                        </div>
                      </div>
                      <div className="grid min-w-0 gap-4 md:grid-cols-2">
                        {field(pathKey, 'Path', { placeholder: `/images/${prefix}.jpg`, optional: true, className: 'md:col-span-2' })}
                        {field(altKey, 'Alt text', { hint: missingAlt ? <span className="text-amber-700 dark:text-amber-400">Add alt text so screen readers can describe this image.</span> : undefined })}
                        {field(`${prefix}ImageCaption` as Key, 'Caption', { optional: true })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ), '')}

          </form>
      )}
    </PlatformPage>
  );
}

/** Live thumbnail for a public storefront image path, with a clear broken/empty state. */
function MediaPreview({ path, alt }: { path: string; alt: string }) {
  const [broken, setBroken] = React.useState(false);
  const src = path.trim();
  React.useEffect(() => setBroken(false), [src]);
  const showable = src.startsWith('/') && !broken;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted/40">
      {showable ? (
        <img src={src} alt={alt || ''} className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <div className="grid size-full place-items-center text-center text-[11px] leading-4 text-muted-foreground">
          <span className="flex flex-col items-center gap-1 px-2">
            {src ? <ImageOff className="size-4" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}
            {src ? 'Image not found' : 'No image'}
          </span>
        </div>
      )}
    </div>
  );
}
