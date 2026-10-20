'use client';
import Link from 'next/link';
import * as React from 'react';
import { GitBranch, Save, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { applyHotelApproval } from '@/features/platform/guest-governance/actions';
import { ActionMessage, CheckboxField, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Disclosure } from '@/features/platform/components/Surface';
import { formatMoneyMinor } from '@/features/platform/lib/format';
import { loadDerivedRateWorkspace, saveDerivedRate } from './derivedActions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

/** Configure a rate that inherits a published parent rate with a percentage and fixed adjustment. */
export default function DerivedRatePanel() {
  const [workspace, setWorkspace] = React.useState<any>(null);
  const [targetId, setTargetId] = React.useState('');
  const [sourceId, setSourceId] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);
  const [multiplier, setMultiplier] = React.useState('10000');
  const [adjustment, setAdjustment] = React.useState('0');
  const [reason, setReason] = React.useState('');
  const [approvalId, setApprovalId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const attempts = React.useRef(new Map<string, string>());

  async function run(fn: () => Promise<void>) {
    setBusy(true); setFeedback(null);
    try { await fn(); } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Derived rate operation failed.' }); } finally { setBusy(false); }
  }
  function intent() { return { targetPlanId: targetId, sourcePlanId: sourceId, enabled, multiplierBasisPoints: Number(multiplier), adjustmentMinor: Number(adjustment), expectedRevision: workspace.configs.find((config: any) => config.targetPlanId === targetId)?.revision || 0 }; }
  function attempt(signature: string) { const key = attempts.current.get(signature) || crypto.randomUUID(); attempts.current.set(signature, key); return key; }
  async function requestApproval() {
    const target = workspace.plans.find((plan: any) => plan.id === targetId);
    if (!target || !reason.trim()) throw new Error('Select a target and record the reason.');
    const { targetPlanId: _, ...derivedRate } = intent();
    const payload = { action: 'rate_publish', aggregateId: targetId, amountMinor: 0, reason, parameters: { status: target.status, isPublic: Boolean(target.isPublic), derivedRate } };
    const signature = JSON.stringify(payload);
    const result = unwrapAction(await applyHotelApproval(payload, attempt(signature)));
    attempts.current.delete(signature); approvedProposal.current = proposal; setApprovalId(result.approvalId);
    setFeedback({ tone: 'info', text: 'Request recorded. A different authorized staff member must approve it before applying this configuration.' });
  }
  async function save() {
    const data = intent(); const signature = JSON.stringify({ data, approvalId });
    unwrapAction(await saveDerivedRate(data, approvalId, attempt(signature))); attempts.current.delete(signature);
    setWorkspace(await loadDerivedRateWorkspace()); setApprovalId('');
    setFeedback({ tone: 'success', text: 'Derived rate configuration recorded. Published rates inherit the current parent price at quote time.' });
  }
  const load = () => { if (!workspace && !busy) void run(async () => setWorkspace(await loadDerivedRateWorkspace())); };
  // Choosing a target shows its saved rule (or the defaults for a new one), never another target's values.
  function selectTarget(id: string) {
    const saved = workspace?.configs.find((config: any) => config.targetPlanId === id);
    setTargetId(id);
    setSourceId(saved?.sourcePlanId || '');
    setEnabled(saved ? Boolean(saved.enabled) : true);
    setMultiplier(String(saved?.multiplierBasisPoints ?? 10000));
    setAdjustment(String(saved?.adjustmentMinor ?? 0));
    setApprovalId('');
    setFeedback(null);
  }
  // An approval covers one exact proposal; editing the proposal needs a new one.
  const proposal = JSON.stringify({ targetId, sourceId, enabled, multiplier, adjustment });
  const approvedProposal = React.useRef('');
  React.useEffect(() => {
    if (approvalId && approvedProposal.current && approvedProposal.current !== proposal) setApprovalId('');
  }, [proposal, approvalId]);
  const planName = (id: string) => workspace?.plans.find((plan: any) => plan.id === id)?.name || id;
  const percent = Number(multiplier) / 100;

  return (
    <Disclosure
      title="Derived rates"
      description="Inherit a published parent rate for the same room type and currency, then apply a percentage and a fixed nightly adjustment."
      icon={GitBranch}
      onOpen={load}
      badge={workspace ? <span className="text-xs tabular-nums text-muted-foreground">{workspace.configs.length} configured</span> : null}
    >
      {!workspace ? (
        feedback ? <ActionMessage feedback={feedback} /> : <div className="h-24 animate-pulse rounded-md bg-muted/60" role="status" aria-label="Loading derived-rate configuration" />
      ) : (
        <div className="space-y-6">
          {workspace.configs.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {workspace.configs.map((config: any) => (
                <li key={config.targetPlanId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{planName(config.targetPlanId)}</span>
                    {config.enabled ? <span className="text-muted-foreground"> inherits {planName(config.sourcePlanId)} at {config.multiplierBasisPoints / 100}% {Number(config.adjustmentMinor) >= 0 ? '+' : '−'} {formatMoneyMinor(Math.abs(Number(config.adjustmentMinor)))}</span> : null}
                  </span>
                  <span className="flex items-center gap-2"><StatusPill tone={config.enabled ? 'success' : 'neutral'} label={config.enabled ? 'Inheriting' : 'Disabled'} /><span className="text-xs text-muted-foreground">rev {config.revision}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No derived rates configured yet.</p>}

          <div className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target plan" htmlFor="derived-target">
                <NativeSelect id="derived-target" value={targetId} onChange={event => selectTarget(event.target.value)}><option value="">Select target</option>{workspace.plans.map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.status})</option>)}</NativeSelect>
              </Field>
              <Field label="Published parent plan" htmlFor="derived-parent">
                <NativeSelect id="derived-parent" value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Select parent</option>{workspace.plans.filter((plan: any) => plan.status === 'active' && plan.isPublic && plan.id !== targetId).map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</NativeSelect>
              </Field>
              <Field label="Multiplier (basis points)" htmlFor="derived-multiplier" hint={Number.isFinite(percent) ? `= ${percent}% of the parent rate · 10000 = 100%` : '10000 = 100%'}>
                <FieldInput id="derived-multiplier" type="number" min={1} max={100000} step={1} className="tabular-nums" value={multiplier} onChange={event => setMultiplier(event.target.value)} />
              </Field>
              <Field label="Nightly adjustment (minor units, signed)" htmlFor="derived-adjustment" hint={adjustment && Number.isSafeInteger(Number(adjustment)) ? `= ${Number(adjustment) < 0 ? '−' : '+'}${formatMoneyMinor(Math.abs(Number(adjustment)))} per night` : undefined}>
                <FieldInput id="derived-adjustment" type="number" step={1} className="tabular-nums" value={adjustment} onChange={event => setAdjustment(event.target.value)} />
              </Field>
            </div>
            <CheckboxField checked={enabled} onChange={setEnabled} label="Enable inheritance for the target plan" />
            <Field label="Reason for this configuration" htmlFor="derived-reason"><FieldInput id="derived-reason" value={reason} onChange={event => setReason(event.target.value)} /></Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(requestApproval)}><Send aria-hidden="true" />Request independent approval</Button>
              <Link className="text-xs text-muted-foreground underline underline-offset-2" href="/dashboard/platform/approvals">Review approvals</Link>
            </div>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
              <Field label="Approved request ID" htmlFor="derived-approval" className="sm:max-w-xs sm:flex-1"><FieldInput id="derived-approval" className="font-mono" value={approvalId} onChange={event => setApprovalId(event.target.value)} /></Field>
              <Button size="sm" className="h-9" disabled={busy} onClick={() => void run(save)}><Save aria-hidden="true" />Apply configuration</Button>
            </div>
            <FormNote>Parent price changes affect future quotes only; existing reservation snapshots stay unchanged.</FormNote>
          </div>
          <ActionMessage feedback={feedback} />
        </div>
      )}
    </Disclosure>
  );
}
export { DerivedRatePanel };
