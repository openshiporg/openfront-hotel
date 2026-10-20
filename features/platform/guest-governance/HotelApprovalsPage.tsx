'use client';

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { ActionMessage, CheckboxField, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { CopyId, Disclosure, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatMoneyMinor, humanize, previewMinor } from '@/features/platform/lib/format';
import { applyHotelApproval, loadHotelApprovals } from './actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const ACTIONS = ['refund', 'write_off', 'rate_publish', 'cash_variance', 'security_capture', 'payout_reconcile'];
const TARGET_HINT: Record<string, string> = {
  refund: 'Payment ID',
  write_off: 'Booking or folio ID',
  rate_publish: 'Rate plan ID',
  cash_variance: 'Cashier session ID',
  security_capture: 'Security authorization ID',
  payout_reconcile: 'Payout statement ID',
};

export default function HotelApprovalsPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [action, setAction] = React.useState('refund');
  const [target, setTarget] = React.useState('');
  const [amount, setAmount] = React.useState('0');
  const [reason, setReason] = React.useState('');
  const [status, setStatus] = React.useState('active');
  const [isPublic, setIsPublic] = React.useState(true);
  const [decisionNotes, setDecisionNotes] = React.useState<Record<string, string>>({});
  const [view, setView] = React.useState('pending');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);
  const attempts = React.useRef(new Map<string, string>());
  const [offset, setOffset] = React.useState(0);
  const [nextOffset, setNextOffset] = React.useState<number | null>(null);

  async function run(operation: () => Promise<void>, pageOffset = offset) {
    setBusy(true); setFeedback(null);
    try {
      await operation();
      const page = await loadHotelApprovals(pageOffset);
      setRows(page.rows); setOffset(pageOffset); setNextOffset(page.nextOffset);
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Approval operation failed.' });
    } finally { setBusy(false); setLoaded(true); }
  }

  async function apply(payload: Record<string, unknown>) {
    const signature = JSON.stringify(payload);
    const key = attempts.current.get(signature) || crypto.randomUUID();
    attempts.current.set(signature, key);
    const result = unwrapAction(await applyHotelApproval(payload, key));
    attempts.current.delete(signature);
    setFeedback({ tone: 'success', text: `Recorded. Approval reference ${result.approvalId}` });
  }

  React.useEffect(() => { void run(async () => {}, 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requests = rows.filter(row => row.action === 'request').map(row => {
    const decision = rows.find(item => item.approvalId === row.approvalId && item.action === 'decision');
    const used = rows.some(item => item.approvalId === row.approvalId && item.action === 'used');
    const state = used ? 'used' : decision?.evidence.status || 'pending';
    return { row, decision, state };
  });
  const count = (value: string) => requests.filter(item => item.state === value).length;
  const visible = view === 'all' ? requests : requests.filter(item => item.state === view);
  const amountPreview = previewMinor(amount);

  return (
    <PlatformPage
      title="Approvals"
      description="Request approval for an exact target and amount. A different staff member with approval authority decides, and the operating action consumes the approval once."
      actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {}, 0)}><RefreshCw className={busy ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>}
    >
      <ActionMessage feedback={feedback} />
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-4">
          <PanelHeader title="New request" icon={Send} description="Copy the target ID from the folio, payment, rate or cashier screen." />
          <PanelBody>
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(() => apply({ action, aggregateId: target, amountMinor: action === 'rate_publish' ? 0 : Number(amount), reason, ...(action === 'rate_publish' ? { parameters: { status, isPublic } } : {}) })); }}>
              <Field label="Action" htmlFor="approval-action">
                <NativeSelect id="approval-action" value={action} onChange={event => setAction(event.target.value)}>
                  {ACTIONS.map(value => <option key={value} value={value}>{humanize(value)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Target ID" htmlFor="approval-target" hint={TARGET_HINT[action]}>
                <FieldInput id="approval-target" className="font-mono" value={target} onChange={event => setTarget(event.target.value)} required />
              </Field>
              {action === 'rate_publish' ? (
                <div className="space-y-3">
                  <Field label="Resulting rate status" htmlFor="approval-rate-status">
                    <NativeSelect id="approval-rate-status" value={status} onChange={event => setStatus(event.target.value)}>{['active', 'inactive', 'draft'].map(value => <option key={value} value={value}>{humanize(value)}</option>)}</NativeSelect>
                  </Field>
                  <CheckboxField checked={isPublic} onChange={setIsPublic} label="Publicly bookable" />
                </div>
              ) : (
                <Field label="Amount (minor units)" htmlFor="approval-amount" hint={amountPreview ? `= ${amountPreview} · 100 = USD 1` : '100 = USD 1'}>
                  <FieldInput id="approval-amount" type="number" min={0} step={1} value={amount} onChange={event => setAmount(event.target.value)} required />
                </Field>
              )}
              <Field label="Reason" htmlFor="approval-reason"><FieldInput id="approval-reason" value={reason} onChange={event => setReason(event.target.value)} required /></Field>
              {action === 'payout_reconcile'
                ? <FormNote>Create statement approval requests from the Payouts workspace so the statement hash and bank evidence are attached; review them here.</FormNote>
                : <Button size="sm" disabled={busy}><Send aria-hidden="true" />Request approval</Button>}
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <div className="border-b px-4 sm:px-5">
            <FilterTabs
              label="Filter approvals"
              value={view}
              onChange={setView}
              tabs={[
                { value: 'pending', label: 'Awaiting decision', count: count('pending'), tone: count('pending') ? 'warning' : undefined },
                { value: 'approved', label: 'Approved', count: count('approved') },
                { value: 'declined', label: 'Declined', count: count('declined') },
                { value: 'used', label: 'Consumed', count: count('used') },
                { value: 'all', label: 'All', count: requests.length },
              ]}
            />
          </div>
          {!loaded ? <WorkspaceLoading label="Loading approval requests" className="rounded-none border-0" rows={4} /> : visible.length === 0 ? (
            <WorkspaceEmpty compact icon={ShieldCheck} title={view === 'pending' ? 'Nothing awaiting a decision' : 'No approvals in this view'} description={view === 'pending' ? 'New requests from staff will appear here for an independent reviewer.' : 'Try another state or page.'} />
          ) : (
            <ul className="divide-y">
              {visible.map(({ row, decision, state }) => {
                const evidence = row.evidence || {};
                return (
                  <li key={row.approvalId} className="space-y-3 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{humanize(evidence.action)}</p>
                          {evidence.action !== 'rate_publish' ? <span className="text-sm font-semibold tabular-nums">{formatMoneyMinor(Number(evidence.amountMinor || 0))}</span> : null}
                          <StatusPill kind="approval" value={state} />
                        </div>
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{evidence.reason}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:justify-end">
                        <CopyId value={String(evidence.aggregateId || "—")} label="Target" className="max-w-[14rem]" />
                        <CopyId value={row.approvalId} label="Approval" className="max-w-[14rem]" />
                      </div>
                    </div>

                    {evidence.action === 'payout_reconcile' ? (
                      <div className="flex flex-wrap gap-1.5">
                        <CopyId value={String(evidence.parameters?.sourceHash || '')} label="Statement" className="max-w-[16rem]" />
                        <Tag>Bank ref {evidence.parameters?.bankReference || '—'}</Tag>
                        <Tag>Bank amount {formatMoneyMinor(Number(evidence.parameters?.bankAmountMinor || 0))}</Tag>
                      </div>
                    ) : null}
                    {evidence.action === 'rate_publish' && evidence.parameters ? (
                      <div className="flex flex-wrap gap-1.5"><Tag>Status → {humanize(evidence.parameters.status)}</Tag><Tag>{evidence.parameters.isPublic ? 'Public' : 'Private'}</Tag></div>
                    ) : null}
                    {evidence.parameters?.derivedRate ? (
                      <p className="text-xs text-muted-foreground">Derived from {evidence.parameters.derivedRate.sourcePlanId || 'no parent'} · {evidence.parameters.derivedRate.multiplierBasisPoints / 100}% · {formatMoneyMinor(Number(evidence.parameters.derivedRate.adjustmentMinor || 0))} adjustment · {evidence.parameters.derivedRate.enabled ? 'enabled' : 'disabled'}</p>
                    ) : null}
                    {evidence.economicReview ? (
                      <Disclosure title="Rate economics included in this approval" className="bg-muted/20">
                        <div className="grid gap-3 md:grid-cols-2">
                          {Object.entries(evidence.economicReview).map(([side, terms]: any) => (
                            <dl key={side} className="space-y-1 rounded-md border bg-card p-3 text-xs">
                              <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{humanize(side)}</dt>
                              {Object.entries(terms).map(([name, value]) => (
                                <div key={name} className="flex justify-between gap-3"><dt className="text-muted-foreground">{name}</dt><dd className="text-right font-mono [overflow-wrap:anywhere]">{typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'unset')}</dd></div>
                              ))}
                            </dl>
                          ))}
                        </div>
                      </Disclosure>
                    ) : null}

                    {decision?.evidence?.reason ? <p className="text-xs text-muted-foreground">Decision note: {decision.evidence.reason}</p> : null}

                    {!decision ? (
                      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
                        <FieldInput aria-label={`Decision reason for ${row.approvalId}`} placeholder="Decision reason (required)" value={decisionNotes[row.approvalId] || ''} onChange={event => setDecisionNotes(current => ({ ...current, [row.approvalId]: event.target.value }))} />
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" disabled={busy || !(decisionNotes[row.approvalId] || '').trim()} onClick={() => void run(() => apply({ approvalId: row.approvalId, status: 'approved', reason: decisionNotes[row.approvalId] }))}><Check aria-hidden="true" />Approve</Button>
                          <Button size="sm" variant="outline" disabled={busy || !(decisionNotes[row.approvalId] || '').trim()} onClick={() => void run(() => apply({ approvalId: row.approvalId, status: 'declined', reason: decisionNotes[row.approvalId] }))}><X aria-hidden="true" />Decline</Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {(offset > 0 || nextOffset !== null) ? (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 sm:px-5">
              <Button size="sm" variant="ghost" disabled={busy || offset === 0} onClick={() => void run(async () => {}, Math.max(0, offset - 100))}><ChevronLeft aria-hidden="true" />Newer</Button>
              <span className="text-xs text-muted-foreground">Page {Math.floor(offset / 100) + 1}</span>
              <Button size="sm" variant="ghost" disabled={busy || nextOffset === null} onClick={() => nextOffset !== null && void run(async () => {}, nextOffset)}>Older<ChevronRight aria-hidden="true" /></Button>
            </div>
          ) : null}
        </Panel>
      </div>
    </PlatformPage>
  );
}
