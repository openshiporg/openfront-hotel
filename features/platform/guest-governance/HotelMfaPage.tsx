'use client';
import Link from 'next/link';
import * as React from 'react';
import { KeyRound, LogIn, RefreshCw, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActionMessage, CheckboxField, Field, FieldInput, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, CopyId, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { changeHotelMfa, loadHotelMfaStatus } from './mfaActions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const ACTIONS = [
  { value: 'enroll', label: 'Start enrollment', description: 'Generate a setup key for your authenticator app.' },
  { value: 'confirm', label: 'Confirm enrollment', description: 'Enter the first code from your app to turn MFA on.' },
  { value: 'rotate_recovery', label: 'Replace recovery codes', description: 'Invalidate old codes and issue a new set.' },
  { value: 'disable', label: 'Disable authenticator', description: 'Remove the second factor from your account.' },
];

export default function HotelMfaPage() {
  const [status, setStatus] = React.useState<any>(null);
  const [result, setResult] = React.useState<any>(null);
  const [action, setAction] = React.useState('enroll');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [recovery, setRecovery] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setFeedback(null);
    try { await fn(); } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'MFA operation failed.' }); } finally { setBusy(false); }
  }
  const refreshStatus = () => run(async () => setStatus(await loadHotelMfaStatus()));
  React.useEffect(() => { void refreshStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PlatformPage
      title="Security"
      description="Protect your own staff account with an authenticator app. Recovery codes work once each — store them privately."
      actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void refreshStatus()}><RefreshCw aria-hidden="true" />Check status</Button>}
    >
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader title="Change authenticator settings" icon={KeyRound} description="Every change requires your current password." />
            <PanelBody>
              <form className="space-y-5" onSubmit={event => { event.preventDefault(); void run(async () => { const next = unwrapAction(await changeHotelMfa(action, password, code, recovery)); setResult(next); setPassword(''); setCode(''); if (action === 'enroll') setAction('confirm'); }); }}>
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium">Action</legend>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                    {ACTIONS.map(option => (
                      <label key={option.value} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40', action === option.value && 'border-foreground/60 bg-muted/50 ring-1 ring-foreground/20')}>
                        <input type="radio" name="mfa-setting-action" value={option.value} checked={action === option.value} onChange={() => setAction(option.value)} className="mt-0.5 accent-foreground" />
                        <span><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.description}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Current password" htmlFor="mfa-current-password"><FieldInput id="mfa-current-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></Field>
                  {action !== 'enroll' ? (
                    <Field label={recovery ? 'Recovery code' : 'Authenticator code'} htmlFor="mfa-current-code"><FieldInput id="mfa-current-code" autoComplete="one-time-code" inputMode={recovery ? 'text' : 'numeric'} className="font-mono tracking-widest" value={code} onChange={event => setCode(event.target.value)} required /></Field>
                  ) : null}
                </div>
                {action !== 'enroll' && action !== 'confirm' ? <CheckboxField checked={recovery} onChange={setRecovery} label="Use an unused recovery code instead" /> : null}
                {action === 'disable' ? <Callout tone="warning">Disabling removes the second factor. Your account will be protected by password only.</Callout> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant={action === 'disable' ? 'destructive' : 'default'} disabled={busy || result?.signedOut}>{action === 'disable' ? <ShieldOff aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{ACTIONS.find(option => option.value === action)?.label}</Button>
                  <span className="text-xs text-muted-foreground">Changing security settings revokes your existing sessions.</span>
                </div>
              </form>
            </PanelBody>
          </Panel>

          <ActionMessage feedback={feedback} />

          {result ? (
            <Panel>
              <PanelHeader title="Result" />
              <PanelBody className="space-y-4">
                {result.message ? <p className="text-sm">{result.message}</p> : null}
                {result.secret ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Enter this setup key in your authenticator app</p>
                    <CopyId value={result.secret} className="max-w-full text-sm" />
                  </div>
                ) : null}
                {result.recoveryCodes?.length > 0 ? (
                  <div className="space-y-2">
                    <Callout tone="warning" title="Save these recovery codes now">They will not be displayed again. Each code works once.</Callout>
                    <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                      {result.recoveryCodes.map((value: string) => <li className="rounded bg-card px-2 py-1 text-center font-mono text-sm tracking-wider" key={value}>{value}</li>)}
                    </ul>
                    <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(result.recoveryCodes.join('\n')).catch(() => undefined)}>Copy all codes</Button>
                  </div>
                ) : null}
                {result.signedOut ? <Button size="sm" asChild><Link href="/dashboard/signin"><LogIn aria-hidden="true" />Sign in again</Link></Button> : null}
              </PanelBody>
            </Panel>
          ) : null}
        </div>

        <Panel className="lg:sticky lg:top-4">
          <PanelHeader title="Your status" icon={Smartphone} />
          <PanelBody className="space-y-4">
            {status ? (
              <>
                <div className="flex items-center gap-3">
                  <span className={cn('grid size-10 place-items-center rounded-full', status.enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
                    {status.enabled ? <ShieldCheck className="size-5" aria-hidden="true" /> : <ShieldOff className="size-5" aria-hidden="true" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{status.enabled ? 'Authenticator on' : 'Authenticator off'}</p>
                    <StatusPill tone={status.enabled ? 'success' : 'warning'} label={status.enabled ? 'Protected' : 'Password only'} />
                  </div>
                </div>
                <div className="flex items-baseline justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Recovery codes left</span>
                  <span className={cn('font-semibold tabular-nums', (status.recoveryCodesRemaining || 0) <= 2 && status.enabled && 'text-amber-700 dark:text-amber-400')}>{status.recoveryCodesRemaining || 0}</span>
                </div>
              </>
            ) : <div className="h-20 animate-pulse rounded-md bg-muted/60" role="status" aria-label="Loading security status" />}
          </PanelBody>
        </Panel>
      </div>
    </PlatformPage>
  );
}
