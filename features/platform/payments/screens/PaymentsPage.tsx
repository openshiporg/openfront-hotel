'use client';
import { operationAttempt } from '@/lib/operationAttempt';

import React from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink, MoreHorizontal, ReceiptText, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { Field, FieldInput } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { CopyId, Panel, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, formatMoneyMinor, humanize, previewMinor } from '@/features/platform/lib/format';
import { statusMeta } from '@/features/platform/lib/status';
import { workspaceResultLabel } from '@/features/platform/lib/workspace';
import { usePagedList } from '@/features/platform/lib/pagedList';
import { getPaymentsWorkspace, getRefundQuoteAction, requestPaymentRefundAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

function money(amount?: number | null, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount || 0));
}

type RefundQuote = { refundableMinor: number; currencyCode: string };

export function PaymentsPage() {
  const [searchText, setSearchText] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  React.useEffect(() => { const timer = window.setTimeout(() => setSearch(searchText.trim()), 300); return () => window.clearTimeout(timer); }, [searchText]);
  const [refundPayment, setRefundPayment] = React.useState<any | null>(null);
  const [refundQuote, setRefundQuote] = React.useState<RefundQuote | null>(null);
  const [refundAmount, setRefundAmount] = React.useState('');
  const [refundReason, setRefundReason] = React.useState('');
  const [refundApprovalId, setRefundApprovalId] = React.useState('');
  const [refundError, setRefundError] = React.useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);
  const refundAmountRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (refundPayment && refundQuote && refundQuote.refundableMinor > 0) refundAmountRef.current?.focus();
  }, [refundPayment, refundQuote]);

  // Search, status and sort run on the server over every payment record; pages load on demand.
  const list = usePagedList<any, any>(async (skip) => {
    const data = await getPaymentsWorkspace({ search, status, sort, skip });
    return { items: data?.payments || [], total: data?.total || 0, extra: data?.summary };
  }, JSON.stringify({ search, status, sort }));
  const { items: payments, total, loading, error } = list;
  const summary = list.extra || { capturedAmount: 0, refundedAmount: 0, completedCount: 0, refundedCount: 0, failedCount: 0, pendingCount: 0 };
  const fetchPayments = list.reload;

  const openRefundDialog = async (payment: any) => {
    setRefundPayment(payment); setRefundQuote(null); setRefundAmount(''); setRefundReason(''); setRefundApprovalId(''); setRefundError(null); setQuoteLoading(true);
    try {
      const quote = unwrapAction(await getRefundQuoteAction(payment.id)) as RefundQuote;
      setRefundQuote(quote);
      setRefundAmount(quote.refundableMinor > 0 ? String(quote.refundableMinor) : '');
      if (quote.refundableMinor <= 0) setRefundError('This capture is fully refunded or reserved by an existing refund intent.');
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : 'The refundable balance could not be loaded.');
    } finally { setQuoteLoading(false); }
  };

  const closeRefundDialog = () => {
    if (!refunding) setRefundPayment(null);
  };

  const submitRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!refundPayment || !refundQuote) return;
    const amountMinor = Number(refundAmount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > refundQuote.refundableMinor) {
      setRefundError(`Enter an integer from 1 to ${refundQuote.refundableMinor} minor units.`); return;
    }
    if (!refundReason.trim()) { setRefundError('A refund reason is required.'); return; }
    setRefunding(true); setRefundError(null);
    try {
      const attempt = await operationAttempt('refund', { paymentId: refundPayment.id, amountMinor, reason: refundReason.trim(), approvalId: refundApprovalId.trim() });
      const response = unwrapAction(await requestPaymentRefundAction({ idempotencyKey: attempt.key, paymentId: refundPayment.id, amountMinor, reason: refundReason.trim(), approvalId: refundApprovalId.trim() }));
      attempt.complete();
      toast.success(response.status === 'queued' ? 'Refund queued' : 'Refund recorded', { description: 'The refund is recorded on the folio. The provider confirms when it is processed.' });
      setRefundPayment(null);
      await fetchPayments();
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : 'The refundable balance could not be reserved.');
    } finally { setRefunding(false); }
  };

  const visible = payments;
  const statusCount = (value: string) => Number({ completed: summary.completedCount, pending: summary.pendingCount, failed: summary.failedCount, refunded: summary.refundedCount }[value] || 0);
  const allCount = summary.completedCount + summary.pendingCount + summary.failedCount + summary.refundedCount;
  const refundPreview = previewMinor(refundAmount, refundQuote?.currencyCode || 'USD');

  return <PlatformPage
    title="Payments"
    description="Booking payments and refunds. Captures, refunds, provider settlement and folio balance are tracked separately."
    actions={(
      <>
        <Button size="sm" variant="outline" onClick={fetchPayments} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
        <Button size="sm" variant="ghost" asChild><Link href="/dashboard/booking-payments"><ExternalLink aria-hidden="true" />Payment records</Link></Button>
      </>
    )}
  >
    <StatStrip
      loading={loading && !payments.length}
      items={[
        { label: 'Captured', value: money(summary.capturedAmount), tone: 'success', hint: `${summary.completedCount} completed records` },
        { label: 'Refunded', value: money(summary.refundedAmount), tone: 'neutral', hint: `${summary.refundedCount} refund records` },
        { label: 'Failed', value: summary.failedCount, tone: summary.failedCount ? 'danger' : 'neutral', hint: 'Declined or errored attempts', onSelect: () => setStatus(status === 'failed' ? 'all' : 'failed'), active: status === 'failed' },
        { label: 'Pending', value: statusCount('pending'), tone: statusCount('pending') ? 'warning' : 'neutral', hint: 'Awaiting provider outcome', onSelect: () => setStatus(status === 'pending' ? 'all' : 'pending'), active: status === 'pending' },
      ]}
    />
    {error && !payments.length ? <WorkspaceError message={error} onRetry={fetchPayments} title="Payment workspace unavailable" /> : loading && payments.length === 0 ? <WorkspaceLoading label="Loading payments" /> : (
      <Panel>
        <div className="border-b px-4 sm:px-5">
          <FilterTabs
            label="Filter payments by status"
            value={status}
            onChange={setStatus}
            tabs={[{ value: 'all', label: 'All', count: allCount }, ...['completed', 'pending', 'failed', 'refunded'].map((value) => ({ value, label: statusMeta('payment', value).label, count: statusCount(value), tone: statusMeta('payment', value).tone }))]}
          />
        </div>
        <PanelToolbar>
          <WorkspaceControls search={searchText} onSearchChange={setSearchText} searchLabel="Search reference, guest, booking, method or provider" resultLabel={loading ? 'Searching…' : workspaceResultLabel(payments.length, total, 'payments')}>
            <WorkspaceSelect label="Sort payments" value={sort} onChange={setSort}><option value="recent">Sort: most recent</option><option value="amount">Sort: highest amount</option></WorkspaceSelect>
          </WorkspaceControls>
        </PanelToolbar>
        {visible.length === 0 ? (
          <WorkspaceEmpty icon={CreditCard} title={search || status !== 'all' ? 'No payments match this view' : 'No payments yet'} description={search || status !== 'all' ? 'Clear the search or status filter.' : 'Payments appear here when guests pay for bookings or staff record a payment.'} onClear={search || status !== 'all' ? () => { setSearchText(''); setStatus('all'); } : undefined} />
        ) : (
          <DataTable minWidth="min-w-[860px]">
            <THead>
              <tr><Th>Payment</Th><Th>Guest & booking</Th><Th>Method</Th><Th>Status</Th><Th>Recorded</Th><Th align="right">Amount</Th><Th><span className="sr-only">Actions</span></Th></tr>
            </THead>
            <TBody>
              {visible.map((payment) => {
                const isRefund = payment.paymentType === 'refund';
                return (
                  <Tr key={payment.id}>
                    <Td>
                      <p className="font-mono text-xs font-medium">{payment.paymentReference}</p>
                      <p className="text-xs text-muted-foreground">{humanize(payment.paymentType)}</p>
                    </Td>
                    <Td>
                      <p className="truncate font-medium">{payment.booking?.guestName || 'Unknown guest'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{payment.booking?.confirmationNumber || 'No booking'}</p>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag>{payment.paymentProvider?.name || humanize(payment.paymentMethod)}</Tag>
                        {payment.paymentProvider?.name ? <span className="text-xs text-muted-foreground">{humanize(payment.paymentMethod)}</span> : null}
                      </div>
                    </Td>
                    <Td><StatusPill kind="payment" value={payment.status} /></Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(payment.createdAt)}</Td>
                    <Td numeric align="right" className={isRefund ? 'text-muted-foreground' : 'font-medium'}>{isRefund ? `−${money(Math.abs(Number(payment.amount) || 0), payment.currency || 'USD')}` : money(payment.amount, payment.currency || 'USD')}</Td>
                    <Td align="right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8" aria-label={`Actions for payment ${payment.paymentReference}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 [&_svg]:size-4">
                          <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">{payment.paymentReference}</DropdownMenuLabel>
                          {payment.status === 'completed' && !isRefund
                            ? <DropdownMenuItem onSelect={() => void openRefundDialog(payment)}><RotateCcw aria-hidden="true" />Request refund</DropdownMenuItem>
                            : <DropdownMenuItem disabled><RotateCcw aria-hidden="true" />No refundable capture</DropdownMenuItem>}
                          {payment.booking?.id ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild><Link href={`/dashboard/platform/folios?bookingId=${payment.booking.id}`}><ReceiptText aria-hidden="true" />Open booking folio</Link></DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
        {error && payments.length ? <div className="border-t p-4"><WorkspaceError message={error} onRetry={fetchPayments} title="Payments could not be refreshed" /></div> : null}
        {list.hasMore ? (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
            <span role="status">Showing {payments.length} of {total} payments</span>
            <Button size="sm" variant="outline" disabled={list.loadingMore} onClick={() => void list.loadMore()}>{list.loadingMore ? 'Loading…' : 'Load more'}</Button>
          </div>
        ) : null}
      </Panel>
    )}
    <Dialog open={Boolean(refundPayment)} onOpenChange={(open) => { if (!open) closeRefundDialog(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request refund</DialogTitle><DialogDescription>Refunds up to the amount still refundable on this payment. The refund is recorded now; the provider confirms when it has been processed.</DialogDescription></DialogHeader>
        <form onSubmit={submitRefund} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Payment</p><p className="truncate font-mono text-xs font-medium">{refundPayment?.paymentReference}</p><p className="truncate text-xs text-muted-foreground">{refundPayment?.booking?.guestName || 'Unknown guest'} · {refundPayment?.booking?.confirmationNumber || 'No booking'}</p></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">Refundable</p><p className="text-lg font-semibold tabular-nums">{quoteLoading ? '…' : refundQuote ? formatMoneyMinor(refundQuote.refundableMinor, refundQuote.currencyCode) : '—'}</p></div>
          </div>
          <Field label="Amount (minor units)" htmlFor="refund-amount" hint={refundPreview ? `= ${refundPreview}` : refundQuote ? `1 to ${refundQuote.refundableMinor}` : undefined}>
            <FieldInput ref={refundAmountRef} id="refund-amount" type="number" inputMode="numeric" min="1" max={refundQuote?.refundableMinor} step="1" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} disabled={!refundQuote || quoteLoading || refunding} required />
          </Field>
          <Field label="Reason" htmlFor="refund-reason"><FieldInput id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} disabled={!refundQuote || quoteLoading || refunding} required /></Field>
          <Field label="Approval ID" htmlFor="refund-approval" optional hint={<>Needed when the amount meets the property threshold. Approve payment {refundPayment?.id ? <CopyId value={refundPayment.id} className="align-middle" /> : null} for {refundAmount || '0'} minor units in <Link className="underline underline-offset-2" href="/dashboard/platform/approvals" target="_blank">Approvals</Link>.</>}>
            <FieldInput id="refund-approval" value={refundApprovalId} onChange={event => setRefundApprovalId(event.target.value)} disabled={refunding} />
          </Field>
          {refundError ? <p className="text-sm text-destructive" role="alert">{refundError}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={closeRefundDialog} disabled={refunding}>Cancel</Button><Button type="submit" disabled={!refundQuote || refundQuote.refundableMinor <= 0 || quoteLoading || refunding}>{refunding ? 'Submitting…' : 'Request refund'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </PlatformPage>;
}

export default PaymentsPage;
