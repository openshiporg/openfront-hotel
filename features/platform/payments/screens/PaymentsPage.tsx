'use client';
import { operationAttempt } from '@/lib/operationAttempt';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CreditCard, DollarSign, MoreHorizontal, RefreshCw, RotateCcw } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getPaymentsWorkspace, getRefundQuoteAction, requestPaymentRefundAction } from '../actions';

function money(amount?: number | null, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount || 0));
}

type RefundQuote = { refundableMinor: number; currencyCode: string };

export function PaymentsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payments, setPayments] = React.useState<any[]>([]);
  const [summary, setSummary] = React.useState({ capturedAmount: 0, refundedAmount: 0, completedCount: 0, refundedCount: 0, failedCount: 0 });
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
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

  const fetchPayments = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getPaymentsWorkspace();
      setPayments(data?.payments || []);
      setSummary(data?.summary || { capturedAmount: 0, refundedAmount: 0, completedCount: 0, refundedCount: 0, failedCount: 0 });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The bounded payment projection could not be loaded.';
      setError(message);
      toast({ title: 'Payment workspace unavailable', description: message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);
  React.useEffect(() => { void fetchPayments(); }, [fetchPayments]);

  const openRefundDialog = async (payment: any) => {
    setRefundPayment(payment); setRefundQuote(null); setRefundAmount(''); setRefundReason(''); setRefundApprovalId(''); setRefundError(null); setQuoteLoading(true);
    try {
      const quote = await getRefundQuoteAction(payment.id) as RefundQuote;
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
      const response = await requestPaymentRefundAction({ idempotencyKey: attempt.key, paymentId: refundPayment.id, amountMinor, reason: refundReason.trim(), approvalId: refundApprovalId.trim() });
      attempt.complete();
      toast({ title: response.status === 'queued' ? 'Refund queued' : 'Refund recorded', description: 'Durable payment and folio evidence was created. Provider processing or settlement is not yet implied.' });
      setRefundPayment(null);
      await fetchPayments();
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : 'The refundable balance could not be reserved.');
    } finally { setRefunding(false); }
  };

  const visible = React.useMemo(() => applyWorkspaceView(payments, {
    search, status, statusOf: (payment) => payment.status,
    searchText: (payment) => [payment.paymentReference, payment.booking?.guestName, payment.booking?.confirmationNumber, payment.paymentMethod, payment.paymentProvider?.name],
    sortValue: (payment) => sort === 'amount' ? Number(payment.amount || 0) : payment.createdAt,
    direction: 'desc',
  }), [payments, search, status, sort]);
  const cards = [
    { label: 'Recent captured', value: money(summary.capturedAmount), Icon: DollarSign, color: 'text-emerald-500' },
    { label: 'Completed records', value: summary.completedCount, Icon: CreditCard, color: 'text-blue-500' },
    { label: 'Recent refunded', value: money(summary.refundedAmount), Icon: RotateCcw, color: 'text-amber-500' },
    { label: 'Failed records', value: summary.failedCount, Icon: AlertTriangle, color: 'text-rose-500' },
  ];

  return <PageContainer title="Payments" header={<div><h1 className="text-lg font-semibold md:text-2xl">Payments & refunds</h1><p className="text-muted-foreground">Latest 100 authorized records. Capture, refund, provider settlement, and folio balance remain distinct facts.</p></div>} breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Payments' }]}>
    <div className="space-y-6 p-4 md:p-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, Icon, color }) => <Card key={label}><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div><Icon className={`h-6 w-6 ${color}`} /></CardContent></Card>)}</div>
      <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search reference, guest, booking, method, or provider" resultLabel={workspaceResultLabel(visible.length, payments.length, 'payments')}><WorkspaceSelect label="Filter payment status" value={status} onChange={setStatus}><option value="all">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option></WorkspaceSelect><WorkspaceSelect label="Sort payments" value={sort} onChange={setSort}><option value="recent">Most recent</option><option value="amount">Highest amount</option></WorkspaceSelect><Button size="sm" variant="outline" onClick={fetchPayments} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></WorkspaceControls>
      {error ? <WorkspaceError message={error} onRetry={fetchPayments} /> : loading && payments.length === 0 ? <WorkspaceLoading label="Loading payment evidence" /> : visible.length === 0 ? <WorkspaceEmpty title={payments.length ? 'No payments match this view' : 'No payment evidence yet'} description={payments.length ? 'Clear the search or status filter.' : 'Payment records appear only after an authoritative booking payment workflow.'} onClear={payments.length ? () => { setSearch(''); setStatus('all'); } : undefined} /> : <Card><CardHeader data-qa-layout="operator-card-header" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Recent activity</CardTitle><Button asChild size="sm" variant="outline"><Link href="/dashboard/booking-payments">Model view</Link></Button></CardHeader><CardContent className="space-y-3">{visible.map((payment) => <article key={payment.id} className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{payment.paymentReference}</p><Badge variant="outline">{payment.paymentProvider?.name || payment.paymentMethod}</Badge><Badge variant={payment.status === 'failed' ? 'destructive' : 'secondary'}>{payment.status}</Badge></div><p className="text-sm text-muted-foreground">{payment.booking?.guestName || 'Unknown guest'} · {payment.booking?.confirmationNumber || 'No booking'}</p><p className="text-xs text-muted-foreground">{payment.paymentType} · {payment.paymentMethod}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><p className="text-lg font-semibold tabular-nums">{money(payment.amount, payment.currency || 'USD')}</p><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for payment ${payment.paymentReference}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Payment actions</DropdownMenuLabel>{payment.status === 'completed' && payment.paymentType !== 'refund' ? <DropdownMenuItem onSelect={() => void openRefundDialog(payment)}>Request bounded refund</DropdownMenuItem> : <DropdownMenuItem disabled>No refundable capture</DropdownMenuItem>}<DropdownMenuSeparator />{payment.booking?.id ? <DropdownMenuItem asChild><Link href={`/dashboard/platform/folios?bookingId=${payment.booking.id}`}>Open booking folio</Link></DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu></div></article>)}</CardContent></Card>}
    </div>
    <Dialog open={Boolean(refundPayment)} onOpenChange={(open) => { if (!open) closeRefundDialog(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request refund</DialogTitle><DialogDescription>Reserve a refund against the server-derived refundable balance. This creates durable intent and folio evidence; it does not claim provider completion or settlement.</DialogDescription></DialogHeader>
        <form onSubmit={submitRefund} className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">{refundPayment?.paymentReference}</p><p className="text-muted-foreground">{refundPayment?.booking?.guestName || 'Unknown guest'} · {refundPayment?.booking?.confirmationNumber || 'No booking'}</p>{quoteLoading ? <p className="mt-2">Loading authoritative refund quote…</p> : refundQuote ? <p className="mt-2">Available: {refundQuote.refundableMinor} minor units ({refundQuote.currencyCode})</p> : null}</div>
          <div className="space-y-2"><Label htmlFor="refund-amount">Amount in minor units</Label><Input ref={refundAmountRef} id="refund-amount" type="number" inputMode="numeric" min="1" max={refundQuote?.refundableMinor} step="1" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} disabled={!refundQuote || quoteLoading || refunding} required /></div>
          <div className="space-y-2"><Label htmlFor="refund-reason">Required reason</Label><Input id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} disabled={!refundQuote || quoteLoading || refunding} required /></div>
          <div className="space-y-2"><Label htmlFor="refund-approval">Approval ID (when required by property policy)</Label><Input id="refund-approval" value={refundApprovalId} onChange={event => setRefundApprovalId(event.target.value)} disabled={refunding} /><p className="text-xs text-muted-foreground">Request a refund approval for payment {refundPayment?.id}, amount {refundAmount || "0"} minor units. <Link className="underline" href="/dashboard/platform/approvals" target="_blank">Open approvals</Link></p></div>
          {refundError ? <p className="text-sm text-destructive" role="alert">{refundError}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={closeRefundDialog} disabled={refunding}>Cancel</Button><Button type="submit" disabled={!refundQuote || refundQuote.refundableMinor <= 0 || quoteLoading || refunding}>{refunding ? 'Submitting…' : 'Request refund'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </PageContainer>;
}

export default PaymentsPage;
