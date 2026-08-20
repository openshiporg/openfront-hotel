'use client';

import * as React from 'react';
import { CreditCard, RefreshCw, Settings2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { configurePaymentProviderAction, getPaymentProviderWorkspace } from '../actions';

type Provider = { id: string; name: string; code: string; isInstalled: boolean; configured: boolean };

type CredentialForm = {
  secretKey: string; publishableKey: string; webhookSecret: string;
  clientId: string; clientSecret: string; webhookId: string; sandbox: boolean;
};
const emptyCredentials: CredentialForm = { secretKey: '', publishableKey: '', webhookSecret: '', clientId: '', clientSecret: '', webhookId: '', sandbox: true };

export function PaymentProvidersPage() {
  const { toast } = useToast();
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [editing, setEditing] = React.useState<Provider | null>(null);
  const [credentials, setCredentials] = React.useState<CredentialForm>(emptyCredentials);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setProviders(await getPaymentProviderWorkspace()); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Provider health could not be loaded.';
      setError(message);
      toast({ title: 'Provider workspace unavailable', description: 'Credentials are never returned by this workspace.', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);
  React.useEffect(() => { void load(); }, [load]);
  const visible = React.useMemo(() => applyWorkspaceView(providers, {
    search, status,
    statusOf: (provider) => provider.configured ? 'configured' : provider.isInstalled ? 'incomplete' : 'disabled',
    searchText: (provider) => [provider.name, provider.code],
    sortValue: (provider) => provider.name,
    direction: 'asc',
  }), [providers, search, status]);
  const configuredCount = providers.filter((provider) => provider.configured).length;

  const openConfiguration = (provider: Provider) => {
    setEditing(provider); setCredentials(emptyCredentials); setSaveError(null);
  };
  const disable = async (provider: Provider) => {
    setSaving(true);
    try {
      await configurePaymentProviderAction({ code: provider.code, enabled: false });
      toast({ title: `${provider.name} disabled`, description: 'Customer checkout and provider operations now fail closed.' });
      setEditing(null); await load();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Provider could not be disabled.'); }
    finally { setSaving(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing) return; setSaving(true); setSaveError(null);
    try {
      await configurePaymentProviderAction({ code: editing.code, enabled: true, credentials });
      toast({ title: `${editing.name} configured`, description: 'Credentials were persisted encrypted; certification is not implied.' });
      setEditing(null); await load();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Provider configuration is incomplete.'); }
    finally { setSaving(false); }
  };
  const field = (key: keyof CredentialForm, label: string) => typeof credentials[key] === 'boolean' ? null : (
    <div className="space-y-2"><Label htmlFor={`provider-${key}`}>{label}</Label><Input id={`provider-${key}`} type="password" autoComplete="off" value={String(credentials[key])} onChange={(event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))} required /></div>
  );

  return <PageContainer title="Payment providers" breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Payment providers' }]} header={<div><h1 className="text-lg font-semibold md:text-2xl">Payment provider configuration</h1><p className="text-muted-foreground">Persisted provider records control checkout. Secrets never return to the browser after save.</p></div>}>
    <div className="space-y-4 p-4 md:p-6">
      <div className={`rounded-lg border p-4 text-sm ${configuredCount ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`} role="status"><div className="flex gap-3">{configuredCount ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />}<div><p className="font-medium">{configuredCount ? `${configuredCount} provider${configuredCount === 1 ? '' : 's'} completely configured` : 'Online checkout is provider-blocked'}</p><p className="mt-1">Enabled records require a complete credential set. Configuration does not claim live-money, webhook, PCI, or settlement certification.</p></div></div></div>
      <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search provider name or code" resultLabel={workspaceResultLabel(visible.length, providers.length, 'providers')}><WorkspaceSelect label="Filter provider status" value={status} onChange={setStatus}><option value="all">All statuses</option><option value="configured">Configured</option><option value="incomplete">Incomplete</option><option value="disabled">Disabled</option></WorkspaceSelect><Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></WorkspaceControls>
      {error ? <WorkspaceError message={error} onRetry={load} /> : loading && providers.length === 0 ? <WorkspaceLoading label="Loading provider posture" /> : visible.length === 0 ? <WorkspaceEmpty title={providers.length ? 'No providers match this view' : 'No payment adapters registered'} description={providers.length ? 'Clear the current filters.' : 'Open this workspace after initial property setup to register the supported disabled provider records.'} onClear={providers.length ? () => { setSearch(''); setStatus('all'); } : undefined} /> : <div data-qa-layout="payment-provider-grid" className="grid min-w-0 max-w-full gap-4 lg:grid-cols-2 xl:grid-cols-3">{visible.map((provider) => <Card key={provider.id} className="min-w-0 max-w-full"><CardContent className="flex min-w-0 max-w-full flex-col items-start gap-4 pt-6"><div className="flex min-w-0 max-w-full gap-3"><div className="shrink-0 rounded-lg bg-muted p-2"><CreditCard className="h-5 w-5" /></div><div className="min-w-0 max-w-full"><p className="font-medium [overflow-wrap:anywhere]">{provider.name}</p><p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{provider.code}</p><p className="mt-2 text-xs text-muted-foreground">Credential values are intentionally omitted.</p></div></div><div className="flex w-full flex-wrap items-center justify-between gap-3"><Badge className="shrink-0" variant={provider.configured ? 'default' : 'secondary'}>{provider.configured ? 'Configured' : provider.isInstalled ? 'Incomplete' : 'Disabled'}</Badge><Button size="sm" variant="outline" onClick={() => openConfiguration(provider)}><Settings2 className="mr-2 h-4 w-4" />Configure</Button></div></CardContent></Card>)}</div>}
    </div>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Configure {editing?.name}</DialogTitle><DialogDescription>Saving replaces this provider’s encrypted credential set. Values cannot be read back. Disable the record to block all provider operations.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={save}>{editing?.code === 'pp_stripe_stripe' ? <>{field('secretKey', 'Secret key')}{field('publishableKey', 'Publishable key')}{field('webhookSecret', 'Webhook signing secret')}</> : <>{field('clientId', 'Client ID')}{field('clientSecret', 'Client secret')}{field('webhookId', 'Webhook ID')}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={credentials.sandbox} onChange={(event) => setCredentials((current) => ({ ...current, sandbox: event.target.checked }))} />Use PayPal sandbox</label></>}{saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}<DialogFooter>{editing?.isInstalled ? <Button type="button" variant="destructive" disabled={saving} onClick={() => editing && void disable(editing)}>Disable</Button> : null}<Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</Button></DialogFooter></form></DialogContent></Dialog>
  </PageContainer>;
}

export default PaymentProvidersPage;
