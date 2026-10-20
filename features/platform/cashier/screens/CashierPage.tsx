'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, ExternalLink, HandCoins, Landmark, LockKeyhole, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { durableFinancialAttempt } from '@/features/platform/cashier/financialAttempt';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { ActionMessage, Field, FieldInput, FormNote, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { cn } from '@/lib/utils';
import { cashierAction, getCashierWorkspace } from '../actions';
import type { HotelCashierAction, ManageHotelCashierInput } from '@/features/keystone/cashier/commands';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);

export function CashierPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState('front-desk');
  const [amount, setAmount] = useState('0.00');
  const [reason, setReason] = useState('');
  const [approvalId, setApprovalId] = useState('');

  const reload = async () => { const data = await getCashierWorkspace(); setShifts(data.shifts); setRefunds(data.manualRefunds || []); setLoaded(true); };
  useEffect(() => { void reload().catch(() => { setLoaded(true); setFeedback({ tone: 'error', text: 'Cashier workspace could not be loaded.' }); }); }, []);

  const run = async (action: HotelCashierAction, shiftId = '') => {
    if (busy) return; setBusy(true); setFeedback(null);
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a non-negative USD amount with at most two decimals.');
      const input = { action, shiftId, drawerId: drawer, amountMinor: Math.round(Number(amount) * 100), reason, approvalId };
      const attempt = await durableFinancialAttempt(window.sessionStorage, 'hotel-cashier-attempt', input, shiftId);
      const command: ManageHotelCashierInput = action === 'pay_refund'
        ? { ...input, action, shiftId: attempt.id, idempotencyKey: attempt.key }
        : { ...input, action, shiftId: attempt.id, idempotencyKey: attempt.key };
      unwrapAction(await cashierAction(command));
      await reload(); window.sessionStorage.removeItem('hotel-cashier-attempt');
      setFeedback({ tone: 'success', text: 'Cashier evidence recorded.' });
    } catch (cause) {
      setFeedback({ tone: 'error', text: cause instanceof Error ? cause.message : 'Cashier action failed. Retry the same attempt.' });
    } finally { setBusy(false); }
  };

  const openShifts = shifts.filter(shift => shift.status === 'open');
  const awaitingReview = shifts.filter(shift => shift.status === 'awaiting_review');
  const outstandingRefunds = refunds.reduce((sum, refund) => sum + Number(refund.amountMinor || 0), 0);

  return (
    <PlatformPage
      title="Cashier"
      description="Open a drawer, record cash drops, count and close, and confirm manual refunds paid out in cash."
      actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void reload().catch(() => setFeedback({ tone: 'error', text: 'Cashier workspace could not be loaded.' }))}><RefreshCw aria-hidden="true" />Refresh</Button>}
    >
      <StatStrip
        loading={!loaded}
        items={[
          { label: 'Open drawers', value: openShifts.length, tone: openShifts.length ? 'success' : 'neutral', hint: openShifts.map(shift => shift.drawerId).join(', ') || 'No drawer open' },
          { label: 'Awaiting variance review', value: awaitingReview.length, tone: awaitingReview.length ? 'warning' : 'neutral', hint: 'Independent reviewer required' },
          { label: 'Manual refunds to pay', value: refunds.length, tone: refunds.length ? 'warning' : 'neutral', hint: refunds.length ? `${money(outstandingRefunds)} owed to guests` : 'Nothing owed' },
        ]}
      />

      <Panel>
        <PanelHeader title="Drawer command" description="These values apply to the next action you take — opening a shift, a cash drop, or the closing count." icon={Banknote} />
        <PanelBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Drawer" htmlFor="cash-drawer"><FieldInput id="cash-drawer" value={drawer} onChange={e => setDrawer(e.target.value)} /></Field>
            <Field label="USD amount" htmlFor="cash-amount" hint="Opening float, drop amount or counted cash.">
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><FieldInput id="cash-amount" inputMode="decimal" className="pl-6 tabular-nums" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            </Field>
            <Field label="Reason / variance note" htmlFor="cash-reason" optional><FieldInput id="cash-reason" value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <Field label="Approval ID" htmlFor="cash-approval" optional hint="When a variance meets the threshold."><FieldInput id="cash-approval" value={approvalId} onChange={e => setApprovalId(e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={busy} onClick={() => void run('open')}><LockKeyhole aria-hidden="true" />Open shift for {drawer || 'drawer'}</Button>
            <Link href="/dashboard/platform/approvals" target="_blank" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Request variance approval<ExternalLink className="size-3" aria-hidden="true" /></Link>
          </div>
          <ActionMessage feedback={feedback} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Shifts" description="Expected cash is float plus posted cash payments, less drops. Variance is counted minus expected." />
        {shifts.length ? (
          <DataTable minWidth="min-w-[820px]">
            <THead>
              <tr><Th>Drawer</Th><Th>Status</Th><Th align="right">Float</Th><Th align="right">Drops</Th><Th align="right">Expected</Th><Th align="right">Variance</Th><Th align="right">Actions</Th></tr>
            </THead>
            <TBody>
              {shifts.map(shift => {
                const variance = Number(shift.varianceMinor || 0);
                return (
                  <Tr key={shift.id}>
                    <Td className="font-medium">{shift.drawerId}</Td>
                    <Td><StatusPill kind="shift" value={shift.status} /></Td>
                    <Td numeric align="right">{money(shift.floatMinor)}</Td>
                    <Td numeric align="right">{money(shift.dropsMinor)}</Td>
                    <Td numeric align="right">{money(shift.expectedMinor || 0)}</Td>
                    <Td numeric align="right" className={cn(variance < 0 && 'text-rose-700 dark:text-rose-400', variance > 0 && 'text-amber-700 dark:text-amber-400')}>{variance > 0 ? '+' : ''}{money(variance)}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        {shift.status === 'open' ? (
                          <>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('drop', shift.id)}>Drop cash</Button>
                            <Button size="sm" disabled={busy} onClick={() => void run('close', shift.id)}>Count & close</Button>
                          </>
                        ) : null}
                        {shift.status === 'awaiting_review' ? <Button size="sm" disabled={busy} onClick={() => void run('approve', shift.id)}>Review variance</Button> : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        ) : (
          loaded
            ? <WorkspaceEmpty compact icon={Landmark} title="No cashier shifts yet" description="Open a shift above to start tracking a drawer." />
            : <WorkspaceLoading label="Loading cashier shifts" rows={3} className="rounded-none border-0" />
        )}
        <div className="border-t px-4 py-2.5 sm:px-5"><FormNote>Variance review must be completed by a different authorized staff member than the one who closed the drawer.</FormNote></div>
      </Panel>

      <Panel>
        <PanelHeader title="Manual refunds awaiting payout" description="Refunds approved for cash or manual return. Confirm only once the money has physically left the drawer." icon={HandCoins} />
        {refunds.length ? (
          <ul className="divide-y">
            {refunds.map(refund => (
              <li key={refund.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium"><span className="font-mono">{refund.confirmationNumber}</span><span className="ml-2 tabular-nums">{money(refund.amountMinor)}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{refund.reason}</p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => void run('pay_refund', refund.id)}>Confirm money returned</Button>
              </li>
            ))}
          </ul>
        ) : <WorkspaceEmpty compact icon={HandCoins} title="No manual refunds pending" description="Approved manual refunds appear here until the payout is confirmed." />}
      </Panel>
    </PlatformPage>
  );
}
