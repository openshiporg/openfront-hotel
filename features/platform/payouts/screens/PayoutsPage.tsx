'use client';
import * as React from 'react';
import Link from 'next/link';
import { CheckCheck, ExternalLink, FileSpreadsheet, Landmark, RefreshCw, ShieldCheck, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { applyHotelApproval } from '@/features/platform/guest-governance/actions';
import { ActionMessage, Field, FieldInput, FieldTextarea, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, CopyId, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatMoneyMinor, formatStay, previewMinor } from '@/features/platform/lib/format';
import { getPayoutWorkspace, payoutAction } from '../actions';
import type { ManageHotelPayoutDraft } from '@/features/keystone/finance/hotelPayoutReconciliation';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

export function PayoutsPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [form, setForm] = React.useState({ providerCode: 'pp_stripe_stripe', payoutId: '', payoutDate: '', csv: 'providerCaptureId,grossMinor,refundMinor,feeMinor,netMinor\n' });
  const [bankReference, setBankReference] = React.useState('');
  const [bankAmount, setBankAmount] = React.useState('');
  const [approvalId, setApprovalId] = React.useState('');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => { setRows((await getPayoutWorkspace()).statements); setLoaded(true); }, []);
  React.useEffect(() => { void reload().catch(() => { setLoaded(true); setFeedback({ tone: 'error', text: 'Statement workspace could not be loaded.' }); }); }, [reload]);

  async function run(payload: ManageHotelPayoutDraft) {
    setBusy(true); setFeedback(null);
    try {
      const attempt = await operationAttempt('payout', payload);
      const command = { ...payload, idempotencyKey: attempt.key };
      unwrapAction(await payoutAction(command)); await reload(); attempt.complete();
      setFeedback({ tone: 'success', text: 'Statement evidence saved. This does not independently verify a provider or bank account.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Statement operation failed.' });
    } finally { setBusy(false); }
  }

  async function requestApproval(row: any) {
    setBusy(true); setFeedback(null);
    try {
      const payload = { action: 'payout_reconcile', aggregateId: row.id, amountMinor: Math.abs(Number(bankAmount)), reason: `Reconcile imported payout ${row.payoutId}`, parameters: { sourceHash: row.sourceHash, bankReference, bankAmountMinor: Number(bankAmount) } };
      const attempt = await operationAttempt('payout-approval', payload);
      const result = unwrapAction(await applyHotelApproval(payload, attempt.key));
      setApprovalId(result.approvalId); attempt.complete();
      setFeedback({ tone: 'info', text: 'Approval requested. A different authorized staff member must review the statement hash and bank evidence.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Approval failed.' });
    } finally { setBusy(false); }
  }

  const bankPreview = previewMinor(bankAmount);
  const bankReady = Boolean(bankReference && bankAmount);

  return (
    <PlatformPage
      title="Payouts"
      description="Import a reviewed provider statement, match it to captured and refunded hotel payments, then independently approve the exact bank deposit or debit."
      actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void reload().catch(() => setFeedback({ tone: 'error', text: 'Statement workspace could not be loaded.' }))}><RefreshCw aria-hidden="true" />Refresh</Button>}
    >
      <ol className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-3">
        {[
          ['1', 'Import statement', 'Paste the provider CSV. Fees come from the statement.'],
          ['2', 'Request approval', 'Enter bank evidence and ask a second reviewer.'],
          ['3', 'Match', 'Apply the approved ID to mark the payout matched.'],
        ].map(([step, title, body]) => (
          <li key={step} className="flex gap-3 bg-card px-4 py-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">{step}</span>
            <span><span className="block font-medium">{title}</span><span className="block text-xs text-muted-foreground">{body}</span></span>
          </li>
        ))}
      </ol>

      <ActionMessage feedback={feedback} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Import provider statement" description="USD only. All amounts are signed integer minor units." icon={FileSpreadsheet} />
          <PanelBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Provider" htmlFor="payout-provider">
                <NativeSelect id="payout-provider" value={form.providerCode} onChange={e => setForm({ ...form, providerCode: e.target.value })}><option value="pp_stripe_stripe">Stripe</option><option value="pp_paypal_paypal">PayPal</option></NativeSelect>
              </Field>
              <Field label="Payout ID" htmlFor="payout-id"><FieldInput id="payout-id" aria-label="Provider payout ID" placeholder="po_…" value={form.payoutId} onChange={e => setForm({ ...form, payoutId: e.target.value })} /></Field>
              <Field label="Payout date" htmlFor="payout-date"><FieldInput id="payout-date" aria-label="Payout date" type="date" value={form.payoutDate} onChange={e => setForm({ ...form, payoutDate: e.target.value })} /></Field>
            </div>
            <Field label="Statement CSV" htmlFor="statement-csv" hint="Columns: providerCaptureId, grossMinor, refundMinor, feeMinor, netMinor.">
              <FieldTextarea id="statement-csv" rows={7} spellCheck={false} className="font-mono text-xs leading-5" value={form.csv} onChange={e => setForm({ ...form, csv: e.target.value })} />
            </Field>
            <Button size="sm" disabled={busy} onClick={() => void run({ action: 'import', ...form, currencyCode: 'USD' })}><Upload aria-hidden="true" />Import and compare evidence</Button>
          </PanelBody>
        </Panel>

        <Panel className="h-fit">
          <PanelHeader title="Bank evidence" description="Used by the approval request and the final match on any statement below." icon={Landmark} />
          <PanelBody className="space-y-4">
            <Field label="Bank deposit / debit reference" htmlFor="payout-bank-ref"><FieldInput id="payout-bank-ref" aria-label="Bank deposit or debit reference" value={bankReference} onChange={e => setBankReference(e.target.value)} /></Field>
            <Field label="Signed bank amount (minor units)" htmlFor="payout-bank-amount" hint={bankPreview ? `= ${bankPreview}` : 'Negative for a debit.'}><FieldInput id="payout-bank-amount" aria-label="Signed bank amount in minor units" type="number" value={bankAmount} onChange={e => setBankAmount(e.target.value)} /></Field>
            <Field label="Approval ID" htmlFor="payout-approval" hint={<>Filled automatically after a request. <Link href="/dashboard/platform/approvals" target="_blank" className="underline underline-offset-2">Open approvals <ExternalLink className="inline size-3" aria-hidden="true" /></Link></>}><FieldInput id="payout-approval" aria-label="Payout approval ID" value={approvalId} onChange={e => setApprovalId(e.target.value)} /></Field>
            <FormNote>Matching records evidence only; it does not independently verify a provider or bank account.</FormNote>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Imported statements" description={`${rows.length} statement${rows.length === 1 ? '' : 's'}`} />
        {rows.length ? (
          <ul className="divide-y">
            {rows.map(row => {
              const matched = row.status === 'matched';
              const blocked = row.exceptions.length > 0;
              return (
                <li key={row.id} className="space-y-4 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold">{row.payoutId}</p>
                        <StatusPill kind="payout" value={row.status} tone={matched ? 'success' : blocked ? 'danger' : undefined} />
                      </div>
                      <p className="text-xs text-muted-foreground">Paid out {row.payoutDate ? formatStay(row.payoutDate) : '—'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <CopyId value={row.sourceHash} label="SHA-256" className="max-w-[16rem]" />
                      <CopyId value={row.id} label="Target" className="max-w-[14rem]" />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm sm:grid-cols-4">
                    {[
                      ['Gross', row.totals.grossMinor, ''],
                      ['Refunds', row.totals.refundMinor, '−'],
                      ['Fees', row.totals.feeMinor, '−'],
                      ['Net', row.totals.netMinor, '='],
                    ].map(([label, value, sign]) => (
                      <div key={label as string} className="bg-card px-3 py-2">
                        <dt className="text-xs text-muted-foreground">{sign ? <span className="mr-1 font-mono">{sign}</span> : null}{label}</dt>
                        <dd className={label === 'Net' ? 'font-semibold tabular-nums' : 'tabular-nums'}>{formatMoneyMinor(Number(value))}</dd>
                      </div>
                    ))}
                  </dl>
                  {blocked ? (
                    <Callout tone="danger" title={`${row.exceptions.length} exception${row.exceptions.length === 1 ? '' : 's'} block matching`}>
                      <ul className="list-disc space-y-0.5 pl-4">{row.exceptions.map((issue: string) => <li key={issue}>{issue}</li>)}</ul>
                    </Callout>
                  ) : null}
                  {!matched ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: 'refresh', id: row.id })}><RefreshCw aria-hidden="true" />Recheck evidence</Button>
                      <Button size="sm" variant="outline" disabled={busy || blocked || !bankReady} onClick={() => void requestApproval(row)}><ShieldCheck aria-hidden="true" />Request approval</Button>
                      <Button size="sm" disabled={busy || blocked || !approvalId || !bankReady} onClick={() => void run({ action: 'confirm', id: row.id, bankReference, bankAmountMinor: Number(bankAmount), approvalId })}><CheckCheck aria-hidden="true" />Match approved bank evidence</Button>
                      {!bankReady && !blocked ? <span className="self-center text-xs text-muted-foreground">Enter bank evidence above first.</span> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          loaded
            ? <WorkspaceEmpty icon={FileSpreadsheet} title="No statements imported" description="Import a provider payout statement above to begin reconciliation." />
            : <WorkspaceLoading label="Loading payout statements" rows={3} className="rounded-none border-0" />
        )}
      </Panel>
    </PlatformPage>
  );
}
