'use client';
import { useEffect, useState } from 'react';
import { durableFinancialAttempt } from '@/features/platform/cashier/financialAttempt';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getReceivablesWorkspace, receivableAction, getPayerWindows } from '../actions';
import type { HotelReceivableAction, ManageHotelReceivableInput } from '@/features/keystone/receivables/contracts';
const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100);
export function ReceivablesPage() {
  const [data, setData] = useState<any>({ accounts: [], invoices: [], nextAccountCursor: null, nextInvoiceCursor: null }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [payerWindows, setPayerWindows] = useState<any>(null); const [chargeAmounts, setChargeAmounts] = useState<Record<string, string>>({});
  const [fields, setFields] = useState({ reference: '', amount: '0.00', billingEmail: '', termsDays: '30', accountId: '', folioId: '', bookingId: '', method: 'bank_transfer', approvalId: '' });
  const reload = async () => setData(await getReceivablesWorkspace());
  useEffect(() => { void reload().catch(() => setError('Receivables could not be loaded.')); }, []);
  const loadNextPage = async (kind: 'accounts' | 'invoices') => {
    if (busy) return;
    const cursor = kind === 'accounts' ? data.nextAccountCursor : data.nextInvoiceCursor;
    if (!cursor) return;
    setBusy(true); setError('');
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'More receivables could not be loaded. Refresh the workspace.'); }
    finally { setBusy(false); }
  };
  const run = async (action: HotelReceivableAction, id = '') => {
    if (busy) return; setBusy(true); setError('');
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
      await receivableAction(input);
      await reload(); if (payerWindows?.folioId === fields.folioId) setPayerWindows(await getPayerWindows(fields.folioId, fields.bookingId)); window.sessionStorage.removeItem('hotel-receivables-attempt');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Billing action failed; retry the same attempt.'); } finally { setBusy(false); }
  };
  const field = (key: keyof typeof fields, label: string) => <div key={key}><Label htmlFor={`ar-${key}`}>{label}</Label><Input id={`ar-${key}`} value={fields[key]} onChange={event => setFields({ ...fields, [key]: event.target.value })} /></div>;
  return <PageContainer header={<><h1 className="text-2xl font-semibold">Receivables and direct billing</h1><p>Allocate an open folio balance to an approved company account, then record collections against its invoice.</p></>}>
    {error && <p role="alert">{error}</p>}<div className="grid gap-4 p-4 sm:grid-cols-3">{field('reference', 'Company name / invoice or collection reference')}{field('amount', 'USD amount / account credit limit')}{field('billingEmail', 'Company billing email')}{field('termsDays', 'Payment terms (days)')}{field('folioId', 'Source folio ID')}{field('bookingId', 'Group member booking ID (shared master folios)')}
      <div><Label htmlFor="ar-account">Company account</Label><select id="ar-account" value={fields.accountId} onChange={e => setFields({ ...fields, accountId: e.target.value })}><option value="">Choose account</option>{data.accounts.map((account: any) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
      <div><Label htmlFor="ar-method">Collection method</Label><select id="ar-method" value={fields.method} onChange={e => setFields({ ...fields, method: e.target.value })}><option value="bank_transfer">Bank transfer</option><option value="check">Check</option><option value="cash">Cash</option></select></div>{field('approvalId', 'Independent write-off / company refund approval ID')}
    </div><div className="flex gap-2"><Button disabled={busy} onClick={() => void run('account')}>Create company credit account</Button><Button disabled={busy} onClick={() => void run('invoice')}>Allocate folio to invoice</Button></div>
    <section className="my-6 space-y-3 rounded border p-4"><h2 className="text-xl font-semibold">Guest, master and company payer windows</h2><p>Route exact posted charges or part of a charge to the selected company account. The remaining portion stays with the original guest or group master payer. Routing creates a company invoice and a folio transfer; it does not record cash received.</p><Button variant="outline" disabled={busy || !fields.folioId} onClick={async()=>{setBusy(true);setError('');try{setPayerWindows(await getPayerWindows(fields.folioId, fields.bookingId));setChargeAmounts({});}catch(cause){setError(cause instanceof Error?cause.message:'Payer windows could not be loaded.');}finally{setBusy(false);}}}>Load source folio payer windows</Button>{payerWindows && <><p>{payerWindows.remainingPayer === 'group_master' ? 'Shared master ledger balance' : 'Guest ledger balance'} after payments and credits: {money(payerWindows.guestLedgerBalanceMinor)}</p><p className="text-xs text-muted-foreground">The charge portions below describe payer responsibility; the ledger balance also includes payments and corrections. A selected group member window shows only attributable reservation charges; unassigned master add-ons remain with the group master payer.</p><table className="w-full text-left"><thead><tr><th>Posted charge</th><th>{payerWindows.remainingPayer === 'group_master' ? 'Master payer portion' : 'Guest portion'}</th><th>Company portion</th><th>New company allocation (minor units)</th></tr></thead><tbody>{payerWindows.charges.map((charge:any)=><tr key={charge.entryId}><td>{charge.description || charge.entryId}{charge.reversed?' (reversed)':''}</td><td>{money(charge.guestMinor)}</td><td>{money(charge.companyMinor)}</td><td><Input aria-label={`Company allocation for ${charge.description || charge.entryId}`} type="number" min="0" max={charge.guestMinor} step="1" disabled={charge.reversed || busy} value={chargeAmounts[charge.entryId] || ''} onChange={event=>setChargeAmounts({...chargeAmounts,[charge.entryId]:event.target.value})}/></td></tr>)}</tbody></table><Button disabled={busy || !fields.accountId || payerWindows.folioId!==fields.folioId} onClick={()=>void run('route_charges')}>Route selected charges to company invoice</Button>{payerWindows.companyWindows.map((window:any)=><div className="rounded border p-3" key={window.invoiceId}><p>{window.reference} · {window.status} · company balance {money(window.balanceMinor)}</p><p>{window.payerAllocations.length} allocated charge portions</p>{window.unassignedMinor>0 && <p>Legacy amount-only company allocation: {money(window.unassignedMinor)}. Review its charge attribution before creating additional charge windows.</p>}</div>)}</>}</section>
    <h2 className="mt-6 text-xl font-semibold">Accounts</h2>{data.accounts.map((account: any) => <p key={account.id}>{account.name} — {money(account.outstandingMinor)} outstanding / {money(account.creditLimitMinor)} credit limit</p>)}{data.nextAccountCursor && <Button variant="outline" disabled={busy} onClick={() => void loadNextPage('accounts')}>Load more accounts</Button>}
    <h2 className="mt-6 text-xl font-semibold">Invoices and aging</h2><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Invoice</th><th>Due</th><th>Amount</th><th>Balance</th><th>Aging</th><th>Actions</th></tr></thead><tbody>{data.invoices.map((invoice: any) => <tr key={invoice.id}><td>{invoice.reference}</td><td>{invoice.dueOn}</td><td>{money(invoice.amountMinor)}</td><td>{money(invoice.balanceMinor)}</td><td>{invoice.agingBucket}</td><td>{invoice.status === 'open' && <><Button disabled={busy} variant="outline" onClick={() => void run('collect', invoice.id)}>Record collection</Button><Button disabled={busy} variant="outline" onClick={() => void run('write_off', invoice.id)}>Approved write-off</Button></>}{invoice.status === 'credit_due' && <Button disabled={busy} onClick={() => void run('refund_credit', invoice.id)}>Confirm approved company payout</Button>}</td></tr>)}</tbody></table></div>{data.nextInvoiceCursor && <Button variant="outline" disabled={busy} onClick={() => void loadNextPage('invoices')}>Load more invoices</Button>}
  </PageContainer>;
}
