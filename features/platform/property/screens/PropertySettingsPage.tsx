'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ImageIcon, Loader2, Palette, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { DEFAULT_STOREFRONT_ACCENT_PRESET, type StorefrontAccentPreset } from '@/features/storefront/lib/storefront-theme';
import { getPropertySettingsWorkspace, updatePropertySettingsAction } from '../actions';
import { StorefrontAccentPicker } from '../components/StorefrontAccentPicker';

const empty = { propertyName: '', tagline: '', contactEmail: '', contactPhone: '', addressLine1: '', addressLine2: '', frontDeskCopy: '', checkInTime: '3:00 PM', checkOutTime: '11:00 AM', currencyCode: 'USD', taxRateBasisPoints: '0', serviceFeeMinor: '0', storefrontAccentPreset: DEFAULT_STOREFRONT_ACCENT_PRESET as string, heroImagePath: '', heroImageAltText: '', heroImageCaption: '', amenityImagePath: '', amenityImageAltText: '', amenityImageCaption: '', locationImagePath: '', locationImageAltText: '', locationImageCaption: '' };
type Form = typeof empty;

export default function PropertySettingsPage() {
  const { toast } = useToast(); const router = useRouter();
  const [form, setForm] = React.useState<Form>(empty); const [saved, setSaved] = React.useState<Form>(empty);
  const [loading, setLoading] = React.useState(true); const [saving, setSaving] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const [settingsState, setSettingsState] = React.useState<'configured' | 'missing'>('missing');
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const load = React.useCallback(async () => { setLoading(true); setError(null); try { const workspace = await getPropertySettingsWorkspace(); const next = workspace.settings ? Object.fromEntries(Object.entries(empty).map(([key]) => [key, String(workspace.settings[key] ?? empty[key as keyof Form])])) as Form : empty; setSettingsState(workspace.state); setForm(next); setSaved(next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load launch configuration.'); } finally { setLoading(false); } }, []);
  React.useEffect(() => { void load(); }, [load]);
  const save = async () => { setSaving(true); try { await updatePropertySettingsAction({ ...form, taxRateBasisPoints: Number(form.taxRateBasisPoints), serviceFeeMinor: Number(form.serviceFeeMinor) }); setSaved(form); setSettingsState('configured'); toast({ title: 'Property settings saved', description: 'Audit evidence was recorded; pricing version advances only for pricing facts.' }); router.refresh(); } catch (cause) { toast({ title: 'Settings not saved', description: cause instanceof Error ? cause.message : 'Validation failed.', variant: 'destructive' }); } finally { setSaving(false); } };
  const field = (key: keyof Form, label: string, description?: string, type = 'text') => <div className="space-y-2"><Label htmlFor={key}>{label}</Label><Input id={key} type={type} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} aria-describedby={description ? `${key}-help` : undefined} />{description ? <p id={`${key}-help`} className="text-xs text-muted-foreground">{description}</p> : null}</div>;

  return <PageContainer title="Property settings" header={<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-lg font-semibold md:text-2xl">Property setup</h1><p className="text-muted-foreground">Single-property identity, stay policy, USD pricing inputs, and public media.</p></div><span className="text-sm text-muted-foreground" aria-live="polite">{dirty ? 'Unsaved changes' : 'Saved'}</span></div>} breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Property settings' }]}>
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Bounded authority:</strong> this form does not configure property timezone, jurisdictional tax certification, MFA, backups, or providers. Currency is limited to the launch contract; existing reservation snapshots remain immutable.</p></div>
      {error ? <WorkspaceError message={error} onRetry={load} /> : loading ? <WorkspaceLoading label="Loading property configuration" /> : <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-5">
        {settingsState === 'missing' ? <div role="status" className="flex gap-3 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950"><Building2 className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Property settings have not been initialized.</strong> Complete the required fields and save to create the single storefront-settings record. Until then, the public storefront uses neutral identity and theme fallbacks.</p></div> : null}
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Identity & front desk</CardTitle><CardDescription>Public contact and stay-time copy used by direct booking and operators.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">{field('propertyName', 'Property name')}{field('tagline', 'Tagline')}{field('contactEmail', 'Contact email', undefined, 'email')}{field('contactPhone', 'Contact phone')}{field('addressLine1', 'Address line 1')}{field('addressLine2', 'Address line 2')}{field('frontDeskCopy', 'Front desk hours copy')}{field('checkInTime', 'Check-in time', 'Use 24-hour or clear 12-hour notation.')}{field('checkOutTime', 'Check-out time', 'Use 24-hour or clear 12-hour notation.')}</CardContent></Card>
        <Card><CardHeader><CardTitle>Commercial defaults</CardTitle><CardDescription>Changes to currency, tax, or fee advance the authoritative pricing version.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-3">{field('currencyCode', 'Currency code', 'Initial release authority is USD only.')}{field('taxRateBasisPoints', 'Tax rate (basis points)', '100 basis points = 1%. Jurisdictional correctness remains an owner gate.', 'number')}{field('serviceFeeMinor', 'Per-stay fee (minor units)', 'For USD, 100 minor units = $1.00.', 'number')}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" />Storefront accent</CardTitle><CardDescription>Choose one platform-owned, accessibility-calibrated color preset.</CardDescription></CardHeader><CardContent><StorefrontAccentPicker value={form.storefrontAccentPreset as StorefrontAccentPreset} onChange={(storefrontAccentPreset) => setForm((current) => ({ ...current, storefrontAccentPreset }))} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Storefront media</CardTitle><CardDescription>Use canonical public /images/ paths. Useful alt text is required for informative images.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">{field('heroImagePath', 'Hero image path')}{field('heroImageAltText', 'Hero image alt text')}{field('heroImageCaption', 'Hero image caption')}{field('amenityImagePath', 'Amenity image path')}{field('amenityImageAltText', 'Amenity image alt text')}{field('amenityImageCaption', 'Amenity image caption')}{field('locationImagePath', 'Location image path')}{field('locationImageAltText', 'Location image alt text')}{field('locationImageCaption', 'Location image caption')}</CardContent></Card>
        <div className="sticky bottom-4 flex flex-col gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-end"><Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setForm(saved)}><RotateCcw className="mr-2 h-4 w-4" />Discard</Button><Button type="submit" disabled={!dirty || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save settings</Button></div>
      </form>}
    </div>
  </PageContainer>;
}
