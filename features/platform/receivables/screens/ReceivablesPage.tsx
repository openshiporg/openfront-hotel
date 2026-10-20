'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, FileInput, Landmark, RefreshCw, Route, Split } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { durableFinancialAttempt } from '@/features/platform/cashier/financialAttempt';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { ActionMessage, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { Meter, StatStrip } from '@/features/platform/components/Stats';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Panel, PanelBody, PanelHeader, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceTabs, WorkspaceTabsContent, WorkspaceTabsList, WorkspaceTabsTrigger } from '@/features/platform/components/Tabs';
import { WorkspaceEmpty } from '@/features/platform/components/WorkspaceControls';
import { formatStay, humanize } from '@/features/platform/lib/format';
import type { StatusTone } from '@/features/platform/lib/status';
import { getReceivablesWorkspace, receivableAction, getPayerWindows } from '../actions';
import type { HotelReceivableAction, ManageHotelReceivableInput } from '@/features/keystone/receivables/contracts';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100);

function agingTone(bucket?: string | null): StatusTone {
  const value = String(bucket || '').toLowerCase();
  if (!value || value === 'current') return 'success';
  if (/90|over|120/.test(value)) return 'danger';
  return 'warning';
}

export function ReceivablesPage() {
  const [data, setData] = useState<any>({ accounts: [], invoices: [], nextAccountCursor: null, nextInvoiceCursor: null });
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [payerWindows, setPayerWindows] = useState<any>(null);
  const [chargeAmounts, setChargeAmounts] = useState<Record<string, string>>({});
  // "Bill to company account" on a folio opens this page with that folio filled in.
  const search = useSearchParams();
  const [fields, setFields] = useState(() => ({ reference: '', amount: '0.00', billingEmail: '', termsDays: '30', accountId: '', folioId: (search?.get('folioId') || '').slice(0, 200), bookingId: (search?.get('bookingId') || '').slice(0, 200), method: 'bank_transfer', approvalId: '' }));

  const reload = async () => { setData(await getReceivablesWorkspace()); setLoaded(true); };
  useEffect(() => { void reload().catch(() => { setLoaded(true); setFeedback({ tone: 'error', text: 'Receivables could not be loaded.' }); }); }, []);

  const loadNextPage = async (kind: 'accounts' | 'invoices') => {
    if (busy) return;
    const cursor = kind === 'accounts' ? data.nextAccountCursor : data.nextInvoiceCursor;
    if (!cursor) return;
    setBusy(true); setFeedback(null);
    try {
      const page = await getReceivablesWorkspace(kind === 'accounts' ? cursor : null, kind === 'invoices' ? cursor : null);
      setData((current: any) => {
        const appendUnique = (existing: any[], incoming: any[]) => [...new Map([...existing, ...incoming].map(row => [row.id, row])).values()];
        return {
          ...current,
          accounts: kind === 'accounts' ? appendUnique(current.accounts, page.accounts) : current.accounts,
          invoices: kind === 'invoices' ? appendUnique(current.invoices, page.invoices) : current.invoices,
          nextAccountCursor: kind === 'accounts' ? page.nextAccountCursor : current.nextAccountCursor,
          nextInvoiceCursor: kind === 'invoices' ? page.nextInvoiceCursor : current.nextInvoiceCursor,
        };
      });
    } catch (cause) { setFeedback({ tone: 'error', text: cause instanceof Error ? cause.message : 'More receivables could not be loaded. Refresh the workspace.' }); }
    finally { setBusy(false); }
  };

  const run = async (action: HotelReceivableAction, id = '') => {
    if (busy) return; setBusy(true); setFeedback(null);
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(fields.amount)) throw new Error('Enter a non-negative USD amount with at most two decimal places.');
      const payerAllocations = action === 'route_charges' ? Object.entries(chargeAmounts).filter(([, value]) => Number(value) > 0).map(([entryId, value]) => ({ entryId, amountMinor: Number(value) })) : [];
      const amountMinor = Math.round(Number(fields.amount) * 100);
      const termsDays = Number(fields.termsDays);
      const attemptDraft = { ...fields, payerAllocations, termsDays, amountMinor, action, id };
      const attempt = await durableFinancialAttempt(window.sessionStorage, 'hotel-receivables-attempt', attemptDraft, id);
      const commandBase = { ...fields, termsDays, amountMinor, id: attempt.id, idempotencyKey: attempt.key };
      const input: ManageHotelReceivableInput = action === 'route_charges'
        ? { ...commandBase, action, payerAllocations }
        : { ...commandBase, action };
      unwrapAction(await receivableAction(input));
      await reload(); if (payerWindows?.folioId === fields.folioId) setPayerWindows(await getPayerWindows(fields.folioId, fields.bookingId)); window.sessionStorage.removeItem('hotel-receivables-attempt');
      setFeedback({ tone: 'success', text: `${humanize(action)} recorded.` });
    } catch (cause) { setFeedback({ tone: 'error', text: cause instanceof Error ? cause.message : 'Billing action failed; retry the same attempt.' }); } finally { setBusy(false); }
  };

  const loadPayerWindows = async () => {
    setBusy(true); setFeedback(null);
    try { setPayerWindows(await getPayerWindows(fields.folioId, fields.bookingId)); setChargeAmounts({}); }
    catch (cause) { setFeedback({ tone: 'error', text: cause instanceof Error ? cause.message : 'Payer windows could not be loaded.' }); }
    finally { setBusy(false); }
  };

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields({ ...fields, [key]: event.target.value });
  const accountSelect = (
    <Field label="Company account" htmlFor="ar-account">
      <NativeSelect id="ar-account" value={fields.accountId} onChange={set('accountId')}>
        <option value="">Choose account</option>
        {data.accounts.map((account: any) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </NativeSelect>
    </Field>
  );
  const folioFields = (
    <>
      <Field label="Source folio" htmlFor="ar-folioId" hint="Filled in when you choose Bill to company account on a folio."><FieldInput id="ar-folioId" className="font-mono" value={fields.folioId} onChange={set('folioId')} /></Field>
      <Field label="Group member booking ID" htmlFor="ar-bookingId" optional hint="For shared group master folios."><FieldInput id="ar-bookingId" className="font-mono" value={fields.bookingId} onChange={set('bookingId')} /></Field>
    </>
  );
  const amountField = (label: string, id: string) => (
    <Field label={label} htmlFor={id}>
      <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><FieldInput id={id} inputMode="decimal" className="pl-6 tabular-nums" value={fields.amount} onChange={set('amount')} /></div>
    </Field>
  );

  const outstanding = data.accounts.reduce((sum: number, account: any) => sum + Number(account.outstandingMinor || 0), 0);
  const openInvoices = data.invoices.filter((invoice: any) => invoice.status === 'open');
  const agedInvoices = openInvoices.filter((invoice: any) => agingTone(invoice.agingBucket) !== 'success');

  return (
    <PlatformPage
      title="Receivables"
      description="Direct billing for approved company accounts: allocate folio balances to invoices, route charges between payers, and record collections."
      actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void reload().catch(() => setFeedback({ tone: 'error', text: 'Receivables could not be loaded.' }))}><RefreshCw aria-hidden="true" />Refresh</Button>}
    >
      <StatStrip
        loading={!loaded}
        items={[
          { label: 'Company accounts', value: data.accounts.length, hint: data.nextAccountCursor ? 'More available' : 'All loaded' },
          { label: 'Outstanding', value: money(outstanding), tone: outstanding > 0 ? 'warning' : 'success', hint: 'Across loaded accounts' },
          { label: 'Open invoices', value: openInvoices.length, tone: 'info', hint: `${data.invoices.length} loaded` },
          { label: 'Past due', value: agedInvoices.length, tone: agedInvoices.length ? 'danger' : 'neutral', hint: 'Open invoices beyond terms' },
        ]}
      />

      <ActionMessage feedback={feedback} />

      <Panel>
        <PanelHeader title="Billing desk" description="Fields are shared across tabs, so a folio or account you enter carries over." />
        <WorkspaceTabs defaultValue="allocate">
          <WorkspaceTabsList className="pt-1">
            <WorkspaceTabsTrigger value="allocate"><FileInput className="size-3.5" aria-hidden="true" />Allocate folio</WorkspaceTabsTrigger>
            <WorkspaceTabsTrigger value="route"><Split className="size-3.5" aria-hidden="true" />Route charges</WorkspaceTabsTrigger>
            <WorkspaceTabsTrigger value="account"><Building2 className="size-3.5" aria-hidden="true" />New account</WorkspaceTabsTrigger>
          </WorkspaceTabsList>

          <WorkspaceTabsContent value="allocate" className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accountSelect}
              {folioFields}
              <Field label="Invoice reference" htmlFor="ar-reference"><FieldInput id="ar-reference" value={fields.reference} onChange={set('reference')} /></Field>
              {amountField('Amount to allocate (USD)', 'ar-amount-allocate')}
            </div>
            <Button size="sm" disabled={busy} onClick={() => void run('invoice')}><FileInput aria-hidden="true" />Allocate folio to invoice</Button>
            <FormNote>Moves an open folio balance to the selected company account&apos;s invoice. Credit limits are enforced by the server.</FormNote>
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="route" className="space-y-4 p-4 sm:p-5">
            <FormNote>Route exact posted charges — or part of a charge — to a company account. The remainder stays with the guest or group master payer. Routing creates a company invoice and a folio transfer; it does not record cash received.</FormNote>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {folioFields}
              {accountSelect}
            </div>
            <Button size="sm" variant="outline" disabled={busy || !fields.folioId} onClick={() => void loadPayerWindows()}><Route aria-hidden="true" />Load payer windows</Button>
            {payerWindows ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <span>{payerWindows.remainingPayer === 'group_master' ? 'Shared master ledger balance' : 'Guest ledger balance'} after payments and credits</span>
                  <span className="font-semibold tabular-nums">{money(payerWindows.guestLedgerBalanceMinor)}</span>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <DataTable minWidth="min-w-[640px]">
                    <THead>
                      <tr><Th>Posted charge</Th><Th align="right">{payerWindows.remainingPayer === 'group_master' ? 'Master portion' : 'Guest portion'}</Th><Th align="right">Company portion</Th><Th align="right">New allocation (minor)</Th></tr>
                    </THead>
                    <TBody>
                      {payerWindows.charges.map((charge: any) => (
                        <Tr key={charge.entryId} className={charge.reversed ? 'text-muted-foreground' : undefined}>
                          <Td>{charge.description || <span className="font-mono text-xs">{charge.entryId}</span>}{charge.reversed ? <StatusPill tone="neutral" label="Reversed" className="ml-2" /> : null}</Td>
                          <Td numeric align="right">{money(charge.guestMinor)}</Td>
                          <Td numeric align="right">{money(charge.companyMinor)}</Td>
                          <Td align="right"><FieldInput aria-label={`Company allocation for ${charge.description || charge.entryId}`} type="number" min="0" max={charge.guestMinor} step="1" disabled={charge.reversed || busy} className="ml-auto w-32 text-right tabular-nums" value={chargeAmounts[charge.entryId] || ''} onChange={event => setChargeAmounts({ ...chargeAmounts, [charge.entryId]: event.target.value })} /></Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </div>
                <FormNote>Charge portions describe payer responsibility; the ledger balance also includes payments and corrections. A group member window shows only attributable reservation charges; unassigned master add-ons stay with the group master payer.</FormNote>
                <Button size="sm" disabled={busy || !fields.accountId || payerWindows.folioId !== fields.folioId} onClick={() => void run('route_charges')}><Split aria-hidden="true" />Route selected charges to company invoice</Button>
                {payerWindows.companyWindows.length ? (
                  <ul className="divide-y rounded-lg border text-sm">
                    {payerWindows.companyWindows.map((window: any) => (
                      <li key={window.invoiceId} className="space-y-1 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{window.reference}</span>
                          <span className="flex items-center gap-2"><StatusPill kind="invoice" value={window.status} /><span className="tabular-nums">{money(window.balanceMinor)}</span></span>
                        </div>
                        <p className="text-xs text-muted-foreground">{window.payerAllocations.length} allocated charge portions</p>
                        {window.unassignedMinor > 0 ? <p className="text-xs text-amber-700 dark:text-amber-400">Legacy amount-only allocation of {money(window.unassignedMinor)}. Review its charge attribution before creating more charge windows.</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="account" className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Company name" htmlFor="ar-reference-account"><FieldInput id="ar-reference-account" value={fields.reference} onChange={set('reference')} /></Field>
              {amountField('Credit limit (USD)', 'ar-amount-limit')}
              <Field label="Billing email" htmlFor="ar-billingEmail"><FieldInput id="ar-billingEmail" type="email" value={fields.billingEmail} onChange={set('billingEmail')} /></Field>
              <Field label="Payment terms (days)" htmlFor="ar-termsDays"><FieldInput id="ar-termsDays" type="number" min="0" value={fields.termsDays} onChange={set('termsDays')} /></Field>
            </div>
            <Button size="sm" disabled={busy} onClick={() => void run('account')}><Building2 aria-hidden="true" />Create company credit account</Button>
          </WorkspaceTabsContent>
        </WorkspaceTabs>
      </Panel>

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel>
          <PanelHeader title="Accounts" description="Outstanding balance against approved credit limit." />
          {data.accounts.length ? (
            <ul className="divide-y">
              {data.accounts.map((account: any) => {
                const ratio = account.creditLimitMinor > 0 ? account.outstandingMinor / account.creditLimitMinor : 0;
                return (
                  <li key={account.id} className="space-y-2 px-4 py-3 sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{account.name}</span>
                      <span className="shrink-0 text-sm tabular-nums"><span className="font-medium">{money(account.outstandingMinor)}</span><span className="text-muted-foreground"> / {money(account.creditLimitMinor)}</span></span>
                    </div>
                    <Meter value={account.outstandingMinor} max={account.creditLimitMinor} tone={ratio >= 0.9 ? 'danger' : ratio >= 0.7 ? 'warning' : 'info'} label={`${account.name} credit used`} />
                  </li>
                );
              })}
            </ul>
          ) : <WorkspaceEmpty compact icon={Building2} title={loaded ? 'No company accounts' : 'Loading accounts'} description="Create a company credit account in the billing desk." />}
          {data.nextAccountCursor ? <PanelToolbar className="border-b-0 border-t"><Button variant="outline" size="sm" disabled={busy} onClick={() => void loadNextPage('accounts')}>Load more accounts</Button></PanelToolbar> : null}
        </Panel>

        <Panel>
          <PanelHeader title="Invoices & aging" description="Collection, write-off and company refund actions use the entry below." icon={Landmark} />
          <PanelBody className="border-b bg-muted/20 py-3 sm:py-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {amountField('Amount (USD)', 'ar-amount-collect')}
              <Field label="Collection reference" htmlFor="ar-reference-collect"><FieldInput id="ar-reference-collect" value={fields.reference} onChange={set('reference')} /></Field>
              <Field label="Method" htmlFor="ar-method"><NativeSelect id="ar-method" value={fields.method} onChange={set('method')}><option value="bank_transfer">Bank transfer</option><option value="check">Check</option><option value="cash">Cash</option></NativeSelect></Field>
              <Field label="Approval ID" htmlFor="ar-approvalId" optional hint="Write-offs and company refunds."><FieldInput id="ar-approvalId" value={fields.approvalId} onChange={set('approvalId')} /></Field>
            </div>
          </PanelBody>
          {data.invoices.length ? (
            <DataTable minWidth="min-w-[760px]">
              <THead>
                <tr><Th>Invoice</Th><Th>Due</Th><Th align="right">Amount</Th><Th align="right">Balance</Th><Th>Aging</Th><Th align="right">Actions</Th></tr>
              </THead>
              <TBody>
                {data.invoices.map((invoice: any) => (
                  <Tr key={invoice.id}>
                    <Td><p className="font-medium">{invoice.reference}</p><StatusPill kind="invoice" value={invoice.status} className="mt-1" /></Td>
                    <Td className="whitespace-nowrap text-sm text-muted-foreground">{invoice.dueOn ? formatStay(invoice.dueOn) : '—'}</Td>
                    <Td numeric align="right">{money(invoice.amountMinor)}</Td>
                    <Td numeric align="right" className="font-medium">{money(invoice.balanceMinor)}</Td>
                    <Td>{invoice.agingBucket ? <StatusPill tone={agingTone(invoice.agingBucket)} label={humanize(invoice.agingBucket)} /> : '—'}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        {invoice.status === 'open' ? (
                          <>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('collect', invoice.id)}>Record collection</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run('write_off', invoice.id)}>Write off</Button>
                          </>
                        ) : null}
                        {invoice.status === 'credit_due' ? <Button size="sm" disabled={busy} onClick={() => void run('refund_credit', invoice.id)}>Confirm company payout</Button> : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          ) : <WorkspaceEmpty compact icon={FileInput} title={loaded ? 'No invoices yet' : 'Loading invoices'} description="Invoices appear after a folio is allocated or charges are routed to a company." />}
          {data.nextInvoiceCursor ? <PanelToolbar className="border-b-0 border-t"><Button variant="outline" size="sm" disabled={busy} onClick={() => void loadNextPage('invoices')}>Load more invoices</Button></PanelToolbar> : null}
        </Panel>
      </div>
    </PlatformPage>
  );
}
