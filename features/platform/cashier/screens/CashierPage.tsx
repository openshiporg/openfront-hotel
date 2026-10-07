'use client';
import { useEffect, useState } from 'react';
import { durableFinancialAttempt } from '@/features/platform/cashier/financialAttempt';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cashierAction, getCashierWorkspace } from '../actions';
import type { HotelCashierAction, ManageHotelCashierInput } from '@/features/keystone/cashier/commands';
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
export function CashierPage() {
  const [shifts, setShifts] = useState<any[]>([]); const [refunds, setRefunds] = useState<any[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState('front-desk'); const [amount, setAmount] = useState('0.00'); const [reason, setReason] = useState(''); const [approvalId, setApprovalId] = useState('');
  const reload = async () => { const data = await getCashierWorkspace(); setShifts(data.shifts); setRefunds(data.manualRefunds || []); };
  useEffect(() => { void reload().catch(() => setError('Cashier workspace could not be loaded.')); }, []);
  const run = async (action: HotelCashierAction, shiftId = '') => {
    if (busy) return; setBusy(true); setError('');
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a non-negative USD amount with at most two decimals.');
      const input = { action, shiftId, drawerId: drawer, amountMinor: Math.round(Number(amount) * 100), reason, approvalId };
      const attempt = await durableFinancialAttempt(window.sessionStorage, 'hotel-cashier-attempt', input, shiftId);
      const command: ManageHotelCashierInput = action === 'pay_refund'
        ? { ...input, action, shiftId: attempt.id, idempotencyKey: attempt.key }
        : { ...input, action, shiftId: attempt.id, idempotencyKey: attempt.key };
      await cashierAction(command);
      await reload(); window.sessionStorage.removeItem('hotel-cashier-attempt');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cashier action failed. Retry the same attempt.'); }
    finally { setBusy(false); }
  };
  return <PageContainer title="Cashier" header={<><h1 className="text-2xl font-semibold">Cashier</h1><p>Open a drawer, record cash drops and reconcile posted cash payments.</p></>}>
    {error && <p role="alert">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-3">
      <div><Label htmlFor="cash-drawer">Drawer</Label><Input id="cash-drawer" value={drawer} onChange={e => setDrawer(e.target.value)} /></div>
      <div><Label htmlFor="cash-amount">USD amount (opening float, drop or counted cash)</Label><Input id="cash-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div><Label htmlFor="cash-reason">Reason / variance explanation</Label><Input id="cash-reason" value={reason} onChange={e => setReason(e.target.value)} /></div>
    </div>
    <div><Label htmlFor="cash-approval">Independent approval ID (when required)</Label><Input id="cash-approval" value={approvalId} onChange={e => setApprovalId(e.target.value)} /></div>
    <Button disabled={busy} onClick={() => void run('open')}>Open shift</Button>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Drawer</th><th>Status</th><th>Float</th><th>Drops</th><th>Expected</th><th>Variance</th><th>Actions</th></tr></thead><tbody>{shifts.map(shift => <tr key={shift.id}>
      <td>{shift.drawerId}</td><td>{shift.status.replaceAll('_', ' ')}</td><td>{money(shift.floatMinor)}</td><td>{money(shift.dropsMinor)}</td><td>{money(shift.expectedMinor || 0)}</td><td>{money(shift.varianceMinor || 0)}</td>
      <td>{shift.status === 'open' && <><Button disabled={busy} variant="outline" onClick={() => void run('drop', shift.id)}>Drop cash</Button><Button disabled={busy} onClick={() => void run('close', shift.id)}>Count and close</Button></>}{shift.status === 'awaiting_review' && <Button disabled={busy} onClick={() => void run('approve', shift.id)}>Independent variance review</Button>}</td>
    </tr>)}</tbody></table></div>
    <h2 className="text-xl font-semibold">Manual refunds awaiting payout</h2>{refunds.map(refund => <div key={refund.id} className="flex flex-wrap items-center gap-4 border p-3"><span>{refund.confirmationNumber} — {money(refund.amountMinor)} — {refund.reason}</span><Button disabled={busy} onClick={() => void run('pay_refund', refund.id)}>Confirm money returned</Button></div>)}
  </PageContainer>;
}
