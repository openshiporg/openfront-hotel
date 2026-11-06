'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, BellRing, Blocks, Building2, BadgePlus, CircleDollarSign, Gift, ImageIcon, ImageOff, Loader2, Palette, RotateCcw, Save, Wallet } from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Field, FieldInput, MoneyInput, NativeSelect } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { dollarsToMinor, formatMoneyMinor, minorToDollars } from '@/features/platform/lib/format';
import { DEFAULT_STOREFRONT_ACCENT_PRESET, type StorefrontAccentPreset } from '@/features/storefront/lib/storefront-theme';
import { getPropertySettingsWorkspace, updatePropertySettingsAction } from '../actions';
import { StorefrontAccentPicker } from '../components/StorefrontAccentPicker';
import { LogoMark } from '../components/LogoMark';
import { StoreSettingsSaveBar } from '../components/StoreSettingsSaveBar';
import { HUE_PRESETS, LOGO_ICONS } from '../lib/icon-registry';
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

/** Stored in cents, edited in dollars. */
const MONEY_KEYS = ['serviceFeeMinor', 'securityDepositMinor', 'loyaltyEarnMinorPerPoint', 'loyaltyRedeemMinorPerPoint', 'refundApprovalThresholdMinor', 'writeOffApprovalThresholdMinor', 'cashVarianceApprovalThresholdMinor'] as const satisfies readonly Key[];
const isMoneyKey = (key: Key) => (MONEY_KEYS as readonly Key[]).includes(key);
const dollars = (value: string) => dollarsToMinor(value, { allowZero: true });

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
  const source: Record<string, unknown> = settings || empty;
  return Object.fromEntries(Object.keys(empty).map((key) => {
    const value = String(source[key] ?? empty[key as Key]);
    return [key, isMoneyKey(key as Key) ? minorToDollars(Number(value)) || '0' : value];
  })) as Form;
}

export default function PropertySettingsPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<Form>(() => toForm(null));
  const [saved, setSaved] = React.useState<Form>(() => toForm(null));
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
    const invalidMoney = MONEY_KEYS.find((key) => dollars(form[key]) === null);
    if (invalidMoney) { toast.error('Settings not saved', { description: 'Enter dollar amounts like 25 or 25.50.' }); document.getElementById(invalidMoney)?.focus(); return; }
    setSaving(true);
    try {
      const cents = Object.fromEntries(MONEY_KEYS.map((key) => [key, String(dollars(form[key]))]));
      unwrapAction(await updatePropertySettingsAction({ ...form, ...cents, taxRateBasisPoints: Number(form.taxRateBasisPoints), serviceFeeMinor: Number(cents.serviceFeeMinor) }));
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
  // Same names as the E-commerce logo block, over this page's form state.
  const logoIcon = form.logoIcon || DEFAULT_STORE_LOGO_ICON
  const logoColor = logoHue
  const setLogoIcon = (value: string) => setForm((current) => ({ ...current, logoIcon: value, logoColor: logoHue }))
  const setLogoColor = (value: string) => setForm((current) => ({ ...current, logoIcon: current.logoIcon || DEFAULT_STORE_LOGO_ICON, logoColor: value }))
  // Find matching preset icon, but don't default to first icon if not found
  const selectedIcon = LOGO_ICONS.find((icon) => icon.lightSvg === logoIcon)
  // Leaving with unsaved edits asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const enabled = (key: Key) => form[key] === 'true';
  const minor = (key: Key) => (isMoneyKey(key) ? dollars(form[key]) : Number(form[key])) || 0;

  const field = (key: Key, label: string, options: { hint?: React.ReactNode; type?: string; optional?: boolean; placeholder?: string; list?: string; className?: string } = {}) => {
    if (isMoneyKey(key)) {
      const invalid = dollars(form[key]) === null;
      return (
        <Field label={label} htmlFor={key} hint={invalid ? 'Enter a dollar amount, like 25 or 25.50.' : options.hint} optional={options.optional} className={options.className}>
          <MoneyInput id={key} invalid={invalid} value={form[key]} onChange={(event) => set(key, event.target.value)} className={cn(changedKeys.has(key) && 'border-amber-500/50')} />
        </Field>
      );
    }
    const hint = options.hint;
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
        <Button type="submit" form="property-settings-form" size="sm" className="hidden md:inline-flex" disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Save Changes</Button>
      </> : null}
    >
      {error ? <WorkspaceError message={error} onRetry={load} title="Property settings unavailable" /> : loading ? <WorkspaceLoading label="Loading property settings" rows={6} /> : (
          <form id="property-settings-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="min-w-0 max-w-5xl space-y-6 pb-24 md:pb-0">
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
              {field('serviceFeeMinor', 'Per-stay fee', { hint: 'Added once to each stay.' })}
            </>, 'grid gap-5 md:grid-cols-3')}

            {section('deposits', 'New reservations keep the deposit terms in force when they were booked; the balance is paid during the stay. Changing this policy requires role administration.', <>
              {field('depositPercent', 'Deposit at confirmation (%)', {
                type: 'number',
                hint: depositPercent >= 1 && depositPercent <= 100
                  ? depositPercent === 100 ? 'Guests prepay the full stay.' : `Guests pay ${depositPercent}% when booking and ${100 - depositPercent}% during the stay.`
                  : 'Enter a whole number from 1 to 100.',
              })}
              {field('securityDepositMinor', 'Refundable security hold', { hint: minor('securityDepositMinor') ? 'Stripe reserves funds; capture requires reviewed actual charges.' : 'Zero disables new authorizations.' })}
            </>)}

            {section('communications', 'Send one reminder email before each confirmed arrival.', <>
              {toggle('prearrivalEmailEnabled', 'Pre-arrival email', 'Send a reminder ahead of each confirmed arrival.')}
              {field('prearrivalDays', 'Days before arrival (1–14)', { type: 'number', hint: enabled('prearrivalEmailEnabled') ? `Sent ${form.prearrivalDays || '—'} day(s) before check-in.` : 'Used once the reminder is on.' })}
            </>)}

            {section('loyalty', 'Points are earned from settled eligible stays and redeemed against open folios. Changes require role administration.', <>
              <div className="md:col-span-2">{toggle('loyaltyEnabled', 'Loyalty program', 'Allow earning at checkout and redemption against in-house folios.')}</div>
              <div className={cn('contents', !enabled('loyaltyEnabled') && '[&>*]:opacity-70')}>
                {field('loyaltyEarnMinorPerPoint', 'Spend per earned point', { hint: minor('loyaltyEarnMinorPerPoint') ? `1 point for every ${formatMoneyMinor(minor('loyaltyEarnMinorPerPoint'))} of eligible room revenue.` : undefined })}
                {field('loyaltyRedeemMinorPerPoint', 'Credit per redeemed point', { hint: minor('loyaltyRedeemMinorPerPoint') ? `100 points = ${formatMoneyMinor(minor('loyaltyRedeemMinorPerPoint') * 100)} folio credit.` : undefined })}
                {field('loyaltyMinimumRedemptionPoints', 'Minimum points per redemption', { type: 'number', hint: minor('loyaltyMinimumRedemptionPoints') && minor('loyaltyRedeemMinorPerPoint') ? `Smallest credit: ${formatMoneyMinor(minor('loyaltyMinimumRedemptionPoints') * minor('loyaltyRedeemMinorPerPoint'))}.` : undefined })}
              </div>
            </>)}

            {section('groups', 'Contracted room blocks, rooming lists and master folios. Changing this policy requires role administration.', <>
              <div className="md:col-span-2">{toggle('groupsEnabled', 'Group operations', 'Enable after reviewing group contract and billing settings.')}</div>
            </>)}

            {section('approvals', 'Amounts at or above each threshold need a second authorized staff member to approve. Zero means every amount.', <>
              {field('refundApprovalThresholdMinor', 'Refund threshold')}
              {field('writeOffApprovalThresholdMinor', 'Write-off threshold')}
              {field('cashVarianceApprovalThresholdMinor', 'Cash variance threshold')}
              {toggle('ratePublicationRequiresApproval', 'Rate publication approval', 'Require an independent approval before a rate becomes public or active.')}
            </>)}

            {section('logo', 'Shown beside the property name in the storefront header, mobile menu and footer. Once you save a logo or logo color, it also sets the storefront accent: buttons, links and focus rings.', (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
                <div className="space-y-6">
                {/* Logo Icon Selector */}
                <div>
                  <Label>Logo Icon</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Select
                      value={selectedIcon?.id || ''}
                      onValueChange={(id) => {
                        const icon = LOGO_ICONS.find((i) => i.id === id);
                        if (icon) setLogoIcon(icon.lightSvg);
                      }}
                    >
                      <SelectPrimitive.Trigger
                        className={cn(
                          'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
                        )}
                      >
                        <div
                          dangerouslySetInnerHTML={{ __html: logoIcon }}
                          style={{ filter: `hue-rotate(${logoColor}deg)` }}
                          className="[&>svg]:w-6 [&>svg]:h-6"
                        />
                      </SelectPrimitive.Trigger>
                      <SelectContent className="border-border dark:border-blue-700">
                        {LOGO_ICONS.map((icon) => (
                          <SelectItem key={icon.id} value={icon.id}>
                            <span className="flex items-center gap-3">
                              <div
                                dangerouslySetInnerHTML={{ __html: icon.lightSvg }}
                                style={{ filter: `hue-rotate(${logoColor}deg)` }}
                                className="[&>svg]:w-6 [&>svg]:h-6"
                              />
                              <span>
                                <span className="block font-medium text-gray-900 dark:text-gray-100">
                                  {icon.name}
                                </span>
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* SVG Code Editor Popover */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 shrink-0"
                          type="button"
                        >
                          <Code className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(500px,calc(100vw-2rem))]" align="start">
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">Edit SVG Code</h4>
                            <p className="text-sm text-muted-foreground mb-4">
                              Edit the SVG code directly. Changes will be reflected in the icon preview.
                            </p>
                          </div>
                          <Textarea
                            value={logoIcon}
                            onChange={(e) => setLogoIcon(e.target.value)}
                            className="font-mono text-xs min-h-[300px]"
                            placeholder="<svg>...</svg>"
                          />
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-muted-foreground">Preview:</div>
                            <div
                              dangerouslySetInnerHTML={{ __html: logoIcon }}
                              style={{ filter: `hue-rotate(${logoColor}deg)` }}
                              className="[&>svg]:w-8 [&>svg]:h-8 flex items-center justify-center p-2 border rounded"
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Logo Color Selector */}
                <div>
                  <Label>Logo Color</Label>
                  <div className="mt-2">
                    <Select
                      value={logoColor}
                      onValueChange={(value) => setLogoColor(value)}
                    >
                      <SelectPrimitive.Trigger
                        className={cn(
                          'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
                        )}
                      >
                        <SelectValue>
                          <div
                            className="w-6 h-6 rounded-full"
                            style={{
                              background: `hsl(${(240 + parseInt(logoColor)) % 360}, 70%, 50%)`
                            }}
                          />
                        </SelectValue>
                      </SelectPrimitive.Trigger>
                      <SelectContent className="border-border dark:border-blue-700">
                        <div className="grid grid-cols-4 gap-2 p-2">
                          {HUE_PRESETS.map((preset) => (
                            <SelectItem
                              key={preset.value}
                              value={preset.value.toString()}
                              className="cursor-pointer p-0 h-12 w-12 flex items-center justify-center [&>span:first-child]:hidden"
                            >
                              <div
                                className="w-6 h-6 rounded-full"
                                style={{
                                  background: `hsl(${(240 + preset.value) % 360}, 70%, 50%)`
                                }}
                              />
                            </SelectItem>
                          ))}
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
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

            <div className="md:hidden">
              <StoreSettingsSaveBar
                isSaving={saving}
                button={<Button type="submit" disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Save Changes</Button>}
              />
            </div>
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
        <div className="grid size-full place-items-center text-center text-xs leading-4 text-muted-foreground">
          <span className="flex flex-col items-center gap-1 px-2">
            {src ? <ImageOff className="size-4" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}
            {src ? 'Image not found' : 'No image'}
          </span>
        </div>
      )}
    </div>
  );
}
