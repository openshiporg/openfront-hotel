'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, RefreshCw, ReceiptText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import {
  closeReconciledFolioAction,
  getFolioWorkspace,
  postFolioEntryAction,
  recordFolioPaymentAction,
  resolveOverdueStayAction,
  reverseFolioEntryAction,
  runNightAuditAction,
} from '../actions';

type FolioEntry = {
  id: string;
  postingKey: string;
  entryType: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currencyCode: string;
  description: string;
  serviceDate: string;
  postedAt: string;
  sourceType: string;
  taxCategorySnapshot?: string | null;
  reversesId?: string | null;
  reversedById?: string | null;
};

type Folio = {
  id: string;
  folioNumber: string;
  status: string;
  currencyCode: string;
  openedAt: string;
  booking?: {
    id: string;
    confirmationNumber: string;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    status: string;
  } | null;
  entries: FolioEntry[];
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
};

function formatMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'USD',
  }).format(amountMinor / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(value));
}

export function FoliosPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const requestedBookingId = searchParams?.get('bookingId');
  const [folios, setFolios] = React.useState<Folio[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  const [runningAudit, setRunningAudit] = React.useState(false);
  const [businessDate, setBusinessDate] = React.useState<string>('');
  const [overdue, setOverdue] = React.useState<any[]>([]);
  const [action, setAction] = React.useState({ amount: '', description: '', method: 'cash', direction: 'debit' });
  const [busy, setBusy] = React.useState(false);
  const [reversalEntry, setReversalEntry] = React.useState<FolioEntry | null>(null);
  const [overdueBooking, setOverdueBooking] = React.useState<any | null>(null);
  const [riskReason, setRiskReason] = React.useState('');
  const [riskError, setRiskError] = React.useState<string | null>(null);
  const [riskBusy, setRiskBusy] = React.useState(false);

  const fetchFolios = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFolioWorkspace() as {
        hotelFolioOperations: { folios: Folio[]; overdueExceptions: any[] };
        hotelNightAuditOperations: { currentBusinessDate: string };
      };
      const folios = data.hotelFolioOperations?.folios || [];
      setBusinessDate(data.hotelNightAuditOperations?.currentBusinessDate || '');
      setOverdue(data.hotelFolioOperations?.overdueExceptions || []);
      setFolios(folios);
      setSelectedId((current) => {
        const requested = requestedBookingId ? folios.find(folio => folio.booking?.id === requestedBookingId)?.id : null;
        return requested || current || folios[0]?.id || '';
      });
    } catch (error) {
      console.error('Failed to load folios:', error);
      const message = error instanceof Error ? error.message : 'Check your payment permissions and try again.';
      setError(message);
      toast({ title: 'Unable to load folios', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, requestedBookingId]);

  React.useEffect(() => { fetchFolios(); }, [fetchFolios]);

  const runNightAudit = async () => {
    if (!businessDate || !window.confirm(`Close business date ${businessDate.slice(0, 10)}? This posts due immutable snapshots and advances the property clock.`)) return;
    setRunningAudit(true);
    try {
      await runNightAuditAction(businessDate);
      toast({ title: 'Night audit completed', description: `Business date ${businessDate.slice(0, 10)} closed.` });
      await fetchFolios();
    } catch (error) {
      toast({ title: 'Night audit refused', description: error instanceof Error ? error.message : 'Resolve folio or snapshot exceptions and retry.', variant: 'destructive' });
    } finally {
      setRunningAudit(false);
    }
  };

  const runFolioAction = async (kind: 'payment' | 'entry') => {
    if (!selected?.booking?.id || !Number.isSafeInteger(Number(action.amount)) || Number(action.amount) <= 0 || !action.description.trim()) return;
    setBusy(true);
    try {
      if (kind === 'payment') {
        await recordFolioPaymentAction({ bookingId: selected.booking.id, amountMinor: Number(action.amount), method: action.method, description: action.description });
      } else {
        await postFolioEntryAction({ bookingId: selected.booking.id, amountMinor: Number(action.amount), direction: action.direction, description: action.description });
      }
      toast({ title: kind === 'payment' ? 'Payment recorded' : 'Folio entry posted' }); setAction({ ...action, amount: '', description: '' }); await fetchFolios();
    } catch (error) { toast({ title: 'Folio operation refused', description: error instanceof Error ? error.message : 'Invalid operation', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const closeSelectedFolio = async () => {
    if (!selected?.booking?.id || selected.balanceMinor !== 0 || !['checked_out', 'cancelled', 'no_show'].includes(selected.booking.status)) return;
    setBusy(true);
    try {
      await closeReconciledFolioAction(selected.booking.id);
      toast({ title: 'Reconciled folio closed', description: 'The zero-balance terminal folio is closed with audit evidence.' });
      await fetchFolios();
    } catch (error) {
      toast({ title: 'Folio close refused', description: error instanceof Error ? error.message : 'The folio is not settled.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  const openReversal = (entry: FolioEntry) => { setReversalEntry(entry); setOverdueBooking(null); setRiskReason(''); setRiskError(null); };
  const openOverdueResolution = (booking: any) => { setOverdueBooking(booking); setReversalEntry(null); setRiskReason(''); setRiskError(null); };
  const closeRiskDialog = () => { if (!riskBusy) { setReversalEntry(null); setOverdueBooking(null); setRiskReason(''); setRiskError(null); } };
  const submitReversal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reversalEntry || !riskReason.trim()) { setRiskError('A reversal reason is required.'); return; }
    setRiskBusy(true); setRiskError(null);
    try { await reverseFolioEntryAction(reversalEntry.id, riskReason.trim()); toast({ title: 'Compensating reversal posted' }); await fetchFolios(); setReversalEntry(null); setRiskReason(''); }
    catch (error) { setRiskError(error instanceof Error ? error.message : 'The reversal was refused.'); }
    finally { setRiskBusy(false); }
  };
  const submitOverdueResolution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!overdueBooking || !riskReason.trim()) { setRiskError('An authorized write-off reason is required.'); return; }
    setRiskBusy(true); setRiskError(null);
    try { await resolveOverdueStayAction(overdueBooking.id, riskReason.trim()); toast({ title: 'Overdue stay resolved with immutable evidence' }); await fetchFolios(); setOverdueBooking(null); setRiskReason(''); }
    catch (error) { setRiskError(error instanceof Error ? error.message : 'The overdue resolution was refused.'); }
    finally { setRiskBusy(false); }
  };

  const visibleFolios = React.useMemo(() => applyWorkspaceView(folios, {
    search,
    status: statusFilter,
    statusOf: (folio) => folio.status,
    searchText: (folio) => [folio.folioNumber, folio.booking?.guestName, folio.booking?.confirmationNumber, folio.booking?.status],
    sortValue: (folio) => sort === 'balance' ? Math.abs(folio.balanceMinor) : folio.openedAt,
    direction: 'desc',
  }), [folios, search, statusFilter, sort]);
  const selected = visibleFolios.find((folio) => folio.id === selectedId) || visibleFolios[0];
  const selectedTotals = selected || null;
  const openBalanceMinor = folios
    .filter((folio) => folio.status === 'open')
    .reduce((sum, folio) => sum + folio.balanceMinor, 0);

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Folios' },
  ];
  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Folios</h1>
      <p className="text-muted-foreground">Append-only reservation charges, payments, refunds, and corrections.</p>
    </div>
  );

  return (
    <PageContainer title="Folios" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-6 p-4 md:p-6">
        <div data-qa-layout="folio-metrics-grid" className="grid min-w-0 max-w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="min-w-0 max-w-full">
            <CardContent className="min-w-0 max-w-full pt-6">
              <p className="text-sm text-muted-foreground">Open folios</p>
              <p className="mt-1 text-2xl font-semibold [overflow-wrap:anywhere]">{folios.filter((folio) => folio.status === 'open').length}</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 max-w-full">
            <CardContent className="min-w-0 max-w-full pt-6">
              <p className="text-sm text-muted-foreground">Open balance</p>
              <p className="mt-1 text-2xl font-semibold [overflow-wrap:anywhere]">{formatMoney(openBalanceMinor, 'USD')}</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 max-w-full">
            <CardContent className="min-w-0 max-w-full pt-6">
              <p className="text-sm text-muted-foreground">Ledger entries</p>
              <p className="mt-1 text-2xl font-semibold [overflow-wrap:anywhere]">{folios.reduce((sum, folio) => sum + folio.entries.length, 0)}</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 max-w-full">
            <CardContent className="min-w-0 max-w-full pt-6">
              <p className="text-sm text-muted-foreground">Business date</p>
              <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{businessDate ? businessDate.slice(0, 10) : 'Unavailable'}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={runNightAudit} disabled={!businessDate || runningAudit}>
                <CalendarCheck className="mr-2 h-4 w-4" />{runningAudit ? 'Closing…' : 'Run night audit'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search guest, confirmation, or folio number" resultLabel={workspaceResultLabel(visibleFolios.length, folios.length, 'folios')}><WorkspaceSelect label="Filter folio status" value={statusFilter} onChange={setStatusFilter}><option value="all">All statuses</option><option value="open">Open</option><option value="closed">Closed</option></WorkspaceSelect><WorkspaceSelect label="Sort folios" value={sort} onChange={setSort}><option value="recent">Recently opened</option><option value="balance">Largest balance</option></WorkspaceSelect></WorkspaceControls>
        {error ? <WorkspaceError message={error} onRetry={fetchFolios} /> : null}
        {loading && folios.length === 0 ? <WorkspaceLoading label="Loading folio ledgers" /> : null}

        {overdue.length > 0 && <Card className="border-amber-300"><CardHeader><CardTitle>Overdue checked-in exceptions</CardTitle></CardHeader><CardContent className="space-y-3">{overdue.map((booking) => <div key={booking.id} className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{booking.guestName} · {booking.confirmationNumber}</p><p className="text-sm text-muted-foreground">Due {booking.checkOutDate.slice(0,10)} · lifecycle resolution requires an explicit write-off reason</p></div><Button variant="destructive" size="sm" onClick={() => openOverdueResolution(booking)}>Resolve exception</Button></div>)}</CardContent></Card>}

        {selected?.booking && selected.status === 'open' && <Card><CardHeader><CardTitle>Operator settlement & correction</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-7"><Input aria-label="Amount in minor units" className="md:col-span-1" type="number" min="1" placeholder="Minor units" value={action.amount} onChange={e=>setAction({...action,amount:e.target.value})}/><Input aria-label="Required description or reason" className="md:col-span-2" placeholder="Required description / reason" value={action.description} onChange={e=>setAction({...action,description:e.target.value})}/><select aria-label="Folio entry direction" className="h-10 border bg-background px-3" value={action.direction} onChange={e=>setAction({...action,direction:e.target.value})}><option value="debit">Debit</option><option value="credit">Credit</option></select><select aria-label="Payment method" className="h-10 border bg-background px-3" value={action.method} onChange={e=>setAction({...action,method:e.target.value})}><option value="cash">Cash</option><option value="credit_card">Credit card</option><option value="debit_card">Debit card</option><option value="bank_transfer">Bank transfer</option><option value="check">Check</option></select><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy} onClick={()=>runFolioAction('payment')}>Record payment</Button><Button disabled={busy} variant="outline" onClick={()=>runFolioAction('entry')}>{action.direction === 'debit' ? 'Post charge' : 'Post credit'}</Button>{selected.balanceMinor === 0 && ['checked_out', 'cancelled', 'no_show'].includes(selected.booking.status) ? <Button disabled={busy} variant="secondary" onClick={closeSelectedFolio}>Close settled folio</Button> : null}</div><p className="md:col-span-6 text-xs text-muted-foreground">Amounts are entered in integer minor units. Payments create immutable payment and folio evidence; corrections are append-only. A post-stay refund reopens its folio until an authorized zero-balance reconciliation closes it again.</p></CardContent></Card>}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Reservation folios</CardTitle>
              <Button variant="ghost" size="icon" onClick={fetchFolios} disabled={loading} aria-label="Refresh folios">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleFolios.map((folio) => {
                const balance = folio.balanceMinor;
                return (
                  <button
                    key={folio.id}
                    type="button"
                    onClick={() => setSelectedId(folio.id)}
                    className={`w-full border p-3 text-left transition-colors hover:bg-muted/50 ${selected?.id === folio.id ? 'border-foreground bg-muted/50' : 'border-border'}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{folio.booking?.guestName || folio.folioNumber}</span>
                      <span className="tabular-nums">{formatMoney(balance, folio.currencyCode)}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{folio.booking?.confirmationNumber || folio.folioNumber}</span>
                      <span>{folio.entries.length} entries</span>
                    </span>
                  </button>
                );
              })}
              {!loading && visibleFolios.length === 0 && (
                <WorkspaceEmpty title={folios.length ? 'No folios match this view' : 'No folios opened'} description={folios.length ? 'Clear the search or status filter.' : 'A folio opens through an authoritative reservation workflow; this workspace does not fabricate one.'} onClear={folios.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined} />
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            {selected && selectedTotals ? (
              <>
                <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{selected.booking?.guestName || selected.folioNumber}</CardTitle>
                      <Badge variant="outline">{selected.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.booking?.confirmationNumber} · {selected.folioNumber}
                    </p>
                    {selected.booking && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(selected.booking.checkInDate)} – {formatDate(selected.booking.checkOutDate)}
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
                    <p className="text-2xl font-semibold tabular-nums">{formatMoney(selectedTotals.balanceMinor, selected.currencyCode)}</p>
                    {selected.booking && (
                      <Button asChild variant="link" className="h-auto p-0 text-sm">
                        <Link href={`/dashboard/bookings/${selected.booking.id}`}>Open reservation</Link>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-3 border-b px-4 py-3 text-sm md:px-6">
                    <div><span className="block text-xs text-muted-foreground">Debits</span>{formatMoney(selectedTotals.debitMinor, selected.currencyCode)}</div>
                    <div><span className="block text-xs text-muted-foreground">Credits</span>{formatMoney(selectedTotals.creditMinor, selected.currencyCode)}</div>
                    <div><span className="block text-xs text-muted-foreground">Entries</span>{selected.entries.length}</div>
                  </div>
                  <div className="divide-y">
                    {selected.entries.map((entry) => (
                      <div key={entry.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] md:px-6">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {entry.direction === 'debit'
                              ? <ArrowUpRight className="h-4 w-4 text-amber-600" aria-hidden="true" />
                              : <ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                            <p className="font-medium">{entry.description}</p>
                            <Badge variant="outline">{entry.entryType.replaceAll('_', ' ')}</Badge>
                            {entry.reversedById && <Badge variant="secondary">reversed</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Service {formatDate(entry.serviceDate)} · {entry.sourceType.replaceAll('_', ' ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2"><p className={`font-medium tabular-nums ${entry.direction === 'credit' ? 'text-emerald-700' : ''}`}>
                          {entry.direction === 'credit' ? '−' : ''}{formatMoney(entry.amountMinor, entry.currencyCode)}
                        </p>{!entry.reversedById && !['payment','refund','reversal'].includes(entry.entryType) && <Button size="sm" variant="ghost" onClick={()=>openReversal(entry)}>Reverse</Button>}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex min-h-80 flex-col items-center justify-center text-center text-muted-foreground">
                <ReceiptText className="mb-3 h-8 w-8" />
                <p>Select a folio to review its ledger.</p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={Boolean(reversalEntry)} onOpenChange={(open) => { if (!open) closeRiskDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post compensating reversal</DialogTitle><DialogDescription>The original posting remains immutable. This creates a linked compensating entry for {reversalEntry ? `${reversalEntry.description} (${formatMoney(reversalEntry.amountMinor, reversalEntry.currencyCode)})` : 'the selected entry'}.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={submitReversal}>
            <div className="space-y-2"><Label htmlFor="reversal-reason">Required reversal reason</Label><Textarea id="reversal-reason" autoFocus value={riskReason} onChange={(event) => setRiskReason(event.target.value)} maxLength={500} disabled={riskBusy} required /></div>
            {riskError ? <p className="text-sm text-destructive" role="alert">{riskError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={closeRiskDialog} disabled={riskBusy}>Cancel</Button><Button type="submit" variant="destructive" disabled={riskBusy || !riskReason.trim()}>{riskBusy ? 'Posting…' : 'Post reversal'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(overdueBooking)} onOpenChange={(open) => { if (!open) closeRiskDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve overdue checked-in stay</DialogTitle><DialogDescription>This writes off the exact open balance and checks out {overdueBooking?.guestName || 'the selected guest'}. No payment is fabricated. The reason becomes immutable lifecycle evidence.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={submitOverdueResolution}>
            <div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">{overdueBooking?.confirmationNumber}</p><p className="text-muted-foreground">Due {overdueBooking?.checkOutDate?.slice(0, 10)}</p></div>
            <div className="space-y-2"><Label htmlFor="overdue-reason">Authorized write-off reason</Label><Textarea id="overdue-reason" autoFocus value={riskReason} onChange={(event) => setRiskReason(event.target.value)} maxLength={500} disabled={riskBusy} required /></div>
            {riskError ? <p className="text-sm text-destructive" role="alert">{riskError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={closeRiskDialog} disabled={riskBusy}>Cancel</Button><Button type="submit" variant="destructive" disabled={riskBusy || !riskReason.trim()}>{riskBusy ? 'Resolving…' : 'Write off and check out'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

export default FoliosPage;
