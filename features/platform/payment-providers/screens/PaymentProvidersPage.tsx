'use client';

import * as React from 'react';
import { CreditCard, RefreshCw, Settings2, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CheckboxField, Field, FieldInput } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, Panel, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { configurePaymentProviderAction, getPaymentProviderWorkspace } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type Provider = { id: string; name: string; code: string; isInstalled: boolean; configured: boolean; credentialSource?: string };

type CredentialForm = {
  secretKey: string; publishableKey: string; webhookSecret: string;
  clientId: string; clientSecret: string; webhookId: string; sandbox: boolean;
};
const emptyCredentials: CredentialForm = { secretKey: '', publishableKey: '', webhookSecret: '', clientId: '', clientSecret: '', webhookId: '', sandbox: true };

export function PaymentProvidersPage() {
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
      toast.error('Provider workspace unavailable', { description: 'Credentials are never returned by this workspace.' });
    } finally { setLoading(false); }
  }, []);
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
    if (!['pp_stripe_stripe', 'pp_paypal_paypal'].includes(provider.code)) return;
    setEditing(provider); setCredentials(emptyCredentials); setSaveError(null);
  };
  const disable = async (provider: Provider) => {
    setSaving(true);
    try {
      unwrapAction(await configurePaymentProviderAction({ code: provider.code, enabled: false }));
      toast.success(`${provider.name} disabled`, { description: 'Guests can no longer pay with it. Existing payments and refunds still reconcile.' });
      setEditing(null); await load();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Provider could not be disabled.'); }
    finally { setSaving(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing) return; setSaving(true); setSaveError(null);
    try {
      unwrapAction(await configurePaymentProviderAction({ code: editing.code, enabled: true, credentials }));
      toast.success(`${editing.name} configured`, { description: 'Credentials saved.' });
      setEditing(null); await load();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Provider configuration is incomplete.'); }
    finally { setSaving(false); }
  };
  const field = (key: keyof CredentialForm, label: string) => typeof credentials[key] === 'boolean' ? null : (
    <Field label={label} htmlFor={`provider-${key}`}><FieldInput id={`provider-${key}`} type="password" autoComplete="off" className="font-mono" value={String(credentials[key])} onChange={(event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))} required /></Field>
  );
  const providerState = (provider: Provider) => provider.code === 'pp_manual_manual' ? 'manual' : provider.configured ? 'configured' : provider.isInstalled ? 'incomplete' : 'disabled';

  return <PlatformPage
    title="Payment Providers"
    description="Payment providers for online checkout. Secret keys are encrypted and never shown again."
    actions={<Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>}
  >
    <Callout tone={configuredCount ? 'success' : 'warning'} icon={configuredCount ? ShieldCheck : ShieldAlert} title={configuredCount ? `${configuredCount} provider${configuredCount === 1 ? '' : 's'} completely configured` : 'Online checkout is blocked until a provider is configured'} role="status">
      Card payments require a complete credential set, saved here or supplied securely by the deployment. Configuration alone does not verify settlement.
    </Callout>
    {error ? <WorkspaceError message={error} onRetry={load} title="Provider workspace unavailable" /> : loading && providers.length === 0 ? <WorkspaceLoading label="Loading provider posture" rows={3} /> : (
      <Panel>
        <PanelToolbar>
          <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search provider name or code" resultLabel={workspaceResultLabel(visible.length, providers.length, 'providers')}>
            <WorkspaceSelect label="Filter provider status" value={status} onChange={setStatus}><option value="all">All statuses</option><option value="configured">Configured</option><option value="incomplete">Incomplete</option><option value="disabled">Disabled</option></WorkspaceSelect>
          </WorkspaceControls>
        </PanelToolbar>
        {visible.length === 0 ? (
          <WorkspaceEmpty icon={CreditCard} title={providers.length ? 'No providers match this view' : 'No payment adapters registered'} description={providers.length ? 'Clear the current filters.' : 'Providers appear here after property setup.'} onClear={providers.length ? () => { setSearch(''); setStatus('all'); } : undefined} />
        ) : (
          <ul data-qa-layout="payment-provider-grid" className="divide-y">
            {visible.map((provider) => {
              const state = providerState(provider);
              return (
                <li key={provider.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg border text-sm font-semibold', state === 'configured' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{provider.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="font-medium [overflow-wrap:anywhere]">{provider.name}</p>
                      <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{provider.code}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-13 sm:pl-0">
                    {state === 'manual'
                      ? <StatusPill tone="neutral" label="Operator-recorded" />
                      : <StatusPill tone={state === 'configured' ? 'success' : state === 'incomplete' ? 'warning' : 'neutral'} label={state === 'configured' ? provider.credentialSource === 'environment' ? 'Configured by environment' : 'Configured' : state === 'incomplete' ? 'Incomplete' : 'Disabled'} />}
                    {state === 'manual'
                      ? <span className="max-w-[12rem] text-xs text-muted-foreground">Never enables online checkout.</span>
                      : <Button size="sm" variant="outline" onClick={() => openConfiguration(provider)}><Settings2 aria-hidden="true" />Configure</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">Saved credentials are never shown.</div>
      </Panel>
    )}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configure {editing?.name}</DialogTitle><DialogDescription>Saving replaces this provider’s credentials. Saved values can’t be shown again. Disabling the provider stops new guest payments; existing payments and refunds still reconcile.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          {editing?.code === 'pp_stripe_stripe' ? <>{field('secretKey', 'Secret key')}{field('publishableKey', 'Publishable key')}{field('webhookSecret', 'Webhook signing secret')}</> : editing?.code === 'pp_paypal_paypal' ? <>{field('clientId', 'Client ID')}{field('clientSecret', 'Client secret')}{field('webhookId', 'Webhook ID')}<CheckboxField checked={credentials.sandbox} onChange={(checked) => setCredentials((current) => ({ ...current, sandbox: checked }))} label="Use PayPal sandbox" description="Untick only for live PayPal credentials." /></> : null}
          {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.isInstalled ? <Button type="button" variant="ghost" className="text-rose-700 dark:text-rose-400" disabled={saving} onClick={() => editing && void disable(editing)}><ShieldOff aria-hidden="true" />Disable provider</Button> : <span />}
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</Button></div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </PlatformPage>;
}

export default PaymentProvidersPage;
