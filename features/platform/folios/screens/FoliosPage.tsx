'use client';

import { SecurityAuthorizationOperations } from '@/features/platform/cashier/components/SecurityAuthorizationOperations';
import { FolioReceiptPanel } from '@/features/platform/cashier/screens/FolioReceiptPanel';
import { operationAttempt } from '@/lib/operationAttempt';
import { formatStayDate } from '@/lib/hotelCalendarDate';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarCheck, CalendarDays, ExternalLink, Lock, ReceiptText, RefreshCw, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { Field, FieldInput, FieldTextarea, FormNote, NativeSelect } from '@/features/platform/components/Form';
import { MetaItem, PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { Callout, CopyId, Panel, PanelBody, PanelHeader, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { humanize, previewMinor } from '@/features/platform/lib/format';
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
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

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
  settlementBookingId?: string | null;
  groupBlock?: { id: string; name: string } | null;
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
  return formatStayDate(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FoliosPage() {
  const searchParams = useSearchParams();
  const requestedBookingId = searchParams?.get('bookingId');
  const [folios, setFolios] = React.useState<Folio[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [targetMissing, setTargetMissing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  const [runningAudit, setRunningAudit] = React.useState(false);
  const [businessDate, setBusinessDate] = React.useState<string>('');
  const [businessDateCurrent, setBusinessDateCurrent] = React.useState<boolean | null>(null);
  const [overdue, setOverdue] = React.useState<any[]>([]);
  const [action, setAction] = React.useState({ amount: '', description: '', method: 'cash', direction: 'debit', approvalId: '' });
  const [busy, setBusy] = React.useState(false);
  const [reversalEntry, setReversalEntry] = React.useState<FolioEntry | null>(null);
  const [overdueBooking, setOverdueBooking] = React.useState<any | null>(null);
  const [riskReason, setRiskReason] = React.useState('');
  const [riskApprovalId, setRiskApprovalId] = React.useState('');
  const [riskError, setRiskError] = React.useState<string | null>(null);
  const [riskBusy, setRiskBusy] = React.useState(false);

  const refreshBusinessDateReadiness = React.useCallback(async () => {
    try {
      const response = await fetch('/api/ready', { cache: 'no-store' });
      const readiness = await response.json() as { checks?: { businessDate?: unknown } };
      setBusinessDateCurrent(typeof readiness.checks?.businessDate === 'boolean' ? readiness.checks.businessDate : null);
    } catch {
      setBusinessDateCurrent(null);
    }
  }, []);

  const fetchFolios = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFolioWorkspace(requestedBookingId) as {
        hotelFolioOperations: { folios: Folio[]; overdueExceptions: any[]; targetFolioId: string | null; targetMissing: boolean };
        hotelNightAuditOperations: { currentBusinessDate: string };
      };
      const operations = data.hotelFolioOperations;
      const folios = operations?.folios || [];
      setBusinessDate(data.hotelNightAuditOperations?.currentBusinessDate || '');
      setOverdue(operations?.overdueExceptions || []);
      setFolios(folios);
      setTargetMissing(Boolean(operations?.targetMissing));
      // A linked reservation opens exactly its own folio (or its group master folio), never another one.
      setSelectedId((current) => {
        if (current && folios.some(folio => folio.id === current)) return current;
        if (requestedBookingId) return operations?.targetFolioId || '';
        return folios[0]?.id || '';
      });
    } catch (error) {
      console.error('Failed to load folios:', error);
      const message = error instanceof Error ? error.message : 'Check your payment permissions and try again.';
      setError(message);
      toast.error('Unable to load folios', { description: message });
    } finally {
      setLoading(false);
    }
  }, [requestedBookingId]);

  React.useEffect(() => {
    fetchFolios();
    void refreshBusinessDateReadiness();
  }, [fetchFolios, refreshBusinessDateReadiness]);

  const runNightAudit = async () => {
    if (!businessDate || !window.confirm(`Close business date ${businessDate.slice(0, 10)}? This posts the night's room charges and moves the business date forward one day.`)) return;
    setRunningAudit(true);
    try {
      unwrapAction(await runNightAuditAction(businessDate));
      toast.success('Night audit completed', { description: `Business date ${businessDate.slice(0, 10)} closed.` });
      await Promise.all([fetchFolios(), refreshBusinessDateReadiness()]);
    } catch (error) {
      toast.error('Night audit refused', { description: error instanceof Error ? error.message : 'Resolve folio or snapshot exceptions and retry.' });
    } finally {
      setRunningAudit(false);
    }
  };

  const runFolioAction = async (kind: 'payment' | 'entry') => {
    const settlementBookingId = selected?.settlementBookingId || selected?.booking?.id;
    if (!settlementBookingId || !Number.isSafeInteger(Number(action.amount)) || Number(action.amount) <= 0 || !action.description.trim()) return;
    setBusy(true);
    try {
      const attempt = await operationAttempt(`folio-${kind}`, { bookingId: settlementBookingId, ...action });
      if (kind === 'payment') {
        unwrapAction(await recordFolioPaymentAction({ idempotencyKey: attempt.key, bookingId: settlementBookingId, amountMinor: Number(action.amount), method: action.method, description: action.description }));
      } else {
        unwrapAction(await postFolioEntryAction({ idempotencyKey: attempt.key, bookingId: settlementBookingId, amountMinor: Number(action.amount), direction: action.direction, description: action.description, approvalId: action.approvalId.trim() }));
      }
      attempt.complete();
      toast.success(kind === 'payment' ? 'Payment recorded' : 'Folio entry posted'); setAction({ ...action, amount: '', description: '' }); await fetchFolios();
    } catch (error) { toast.error('Folio operation refused', { description: error instanceof Error ? error.message : 'Invalid operation' }); }
    finally { setBusy(false); }
  };
  const closeSelectedFolio = async () => {
    if (!selected?.booking?.id || selected.balanceMinor !== 0 || !['checked_out', 'cancelled', 'no_show'].includes(selected.booking.status)) return;
    setBusy(true);
    try {
      unwrapAction(await closeReconciledFolioAction(selected.booking.id));
      toast.success('Reconciled folio closed', { description: 'The zero-balance terminal folio is closed with audit evidence.' });
      await fetchFolios();
    } catch (error) {
      toast.error('Folio close refused', { description: error instanceof Error ? error.message : 'The folio is not settled.' });
    } finally {
      setBusy(false);
    }
  };
  const openReversal = (entry: FolioEntry) => { setReversalEntry(entry); setOverdueBooking(null); setRiskReason(''); setRiskApprovalId(''); setRiskError(null); };
  const openOverdueResolution = (booking: any) => { setOverdueBooking(booking); setReversalEntry(null); setRiskReason(''); setRiskApprovalId(''); setRiskError(null); };
  const closeRiskDialog = () => { if (!riskBusy) { setReversalEntry(null); setOverdueBooking(null); setRiskReason(''); setRiskApprovalId(''); setRiskError(null); } };
  const submitReversal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reversalEntry || !riskReason.trim()) { setRiskError('A reversal reason is required.'); return; }
    setRiskBusy(true); setRiskError(null);
    try {
      const attempt = await operationAttempt('folio-reverse', { entryId: reversalEntry.id, reason: riskReason.trim(), approvalId: riskApprovalId.trim() });
      const response = await reverseFolioEntryAction(reversalEntry.id, riskReason.trim(), attempt.key, riskApprovalId.trim());
      if (!response.ok) { setRiskError(response.message); return; }
      attempt.complete();
      toast.success('Compensating reversal posted');
      await fetchFolios();
      setReversalEntry(null);
      setRiskReason('');
    }
    catch (error) { setRiskError(error instanceof Error ? error.message : 'The reversal was refused.'); }
    finally { setRiskBusy(false); }
  };
  const submitOverdueResolution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!overdueBooking || !riskReason.trim()) { setRiskError('An authorized write-off reason is required.'); return; }
    setRiskBusy(true); setRiskError(null);
    try { const attempt = await operationAttempt('overdue-resolution', { bookingId: overdueBooking.id, reason: riskReason.trim(), approvalId: riskApprovalId.trim() }); unwrapAction(await resolveOverdueStayAction(overdueBooking.id, riskReason.trim(), attempt.key, riskApprovalId.trim())); attempt.complete(); toast.success('Overdue stay resolved'); await fetchFolios(); setOverdueBooking(null); setRiskReason(''); }
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
  // Filters narrow the list only; they never change which folio is open.
  const selected = folios.find((folio) => folio.id === selectedId);
  // After a failed refresh the loaded figures may be out of date, so financial actions wait for a successful read.
  const stale = Boolean(error);
  const selectFolio = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setAction({ amount: '', description: '', method: 'cash', direction: 'debit', approvalId: '' });
  };
  const selectedTotals = selected || null;
  const openBalanceMinor = folios
    .filter((folio) => folio.status === 'open')
    .reduce((sum, folio) => sum + folio.balanceMinor, 0);

  const settlementBookingId = selected?.settlementBookingId || selected?.booking?.id;
  const openFolios = folios.filter((folio) => folio.status === 'open');
  const ledgerEntries = folios.reduce((sum, folio) => sum + folio.entries.length, 0);
  const statusCount = (value: string) => folios.filter((folio) => folio.status === value).length;
  const amountPreview = previewMinor(action.amount, selected?.currencyCode || 'USD');
  const canClose = Boolean(selected && selected.balanceMinor === 0 && selected.booking && ['checked_out', 'cancelled', 'no_show'].includes(selected.booking.status));
  const approvalTarget = overdueBooking?.id || selected?.booking?.id || selected?.id;

  const riskApprovalField = (
    <Field
      label="Approval ID"
      htmlFor={reversalEntry ? 'reversal-approval' : 'overdue-approval'}
      optional
      hint={<>Required when property policy sets a threshold. Target {approvalTarget ? <CopyId value={approvalTarget} className="align-middle" /> : null} · <Link href="/dashboard/platform/approvals" target="_blank" className="underline underline-offset-2">Open approvals</Link></>}
    >
      <FieldInput id={reversalEntry ? 'reversal-approval' : 'overdue-approval'} value={riskApprovalId} onChange={event => setRiskApprovalId(event.target.value)} disabled={riskBusy} />
    </Field>
  );

  return (
    <PlatformPage
      title="Folios"
      description="Reservation charges, payments, refunds and corrections."
      meta={(
        <>
          <MetaItem icon={CalendarDays}>Business date {businessDate ? formatDate(businessDate) : 'unavailable'}</MetaItem>
          {businessDateCurrent === false ? <MetaItem icon={AlertTriangle}><span className="text-amber-700 dark:text-amber-400">Readiness reports the business date is behind</span></MetaItem> : null}
        </>
      )}
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={fetchFolios} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button size="sm" onClick={runNightAudit} disabled={!businessDate || runningAudit || stale}><CalendarCheck aria-hidden="true" />{runningAudit ? 'Closing day…' : 'Run night audit'}</Button>
        </>
      )}
    >
      <StatStrip
        loading={loading && !folios.length}
        items={[
          { label: 'Open folios', value: openFolios.length, tone: 'info', hint: `${folios.length} loaded`, onSelect: () => setStatusFilter(statusFilter === 'open' ? 'all' : 'open'), active: statusFilter === 'open' },
          { label: 'Open balance', value: formatMoney(openBalanceMinor, 'USD'), tone: openBalanceMinor > 0 ? 'warning' : 'success', hint: 'Across open folios' },
          { label: 'Ledger entries', value: ledgerEntries, hint: 'Immutable postings' },
          { label: 'Overdue stays', value: overdue.length, tone: overdue.length ? 'danger' : 'neutral', hint: overdue.length ? 'Need an explicit resolution' : 'None past departure' },
        ]}
      />

      {businessDateCurrent === false ? (
        <Callout tone="warning" title="The business date is not current">
          Run the night audit to close the current date. Each audit closes one day, after checking for unsettled departures and folio problems.
        </Callout>
      ) : null}

      {error ? <WorkspaceError message={`${error} Figures below are from the last successful load; posting and payments are paused until a refresh succeeds.`} onRetry={fetchFolios} title="Folio ledgers unavailable" /> : null}
      {targetMissing ? (
        <Callout tone="warning" title="This reservation’s folio is not available">
          No folio was found for the linked reservation, or you can’t view it. Choose a folio from the list instead.
        </Callout>
      ) : null}

      {overdue.length > 0 ? (
        <Panel className="border-rose-500/30">
          <PanelHeader title="Overdue checked-in stays" description="Guests past their departure date. Resolving writes off the open balance and checks the guest out; no payment is recorded." icon={AlertTriangle} />
          <ul className="divide-y">
            {overdue.map((booking) => (
              <li key={booking.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium">{booking.guestName} <span className="font-mono text-xs font-normal text-muted-foreground">{booking.confirmationNumber}</span></p>
                  <p className="text-xs text-muted-foreground">Was due to depart {formatDate(booking.checkOutDate)}</p>
                </div>
                <Button variant="outline" size="sm" className="text-rose-700 dark:text-rose-400" disabled={stale} onClick={() => openOverdueResolution(booking)}>Resolve exception</Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {loading && folios.length === 0 ? <WorkspaceLoading label="Loading folio ledgers" /> : (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Panel className="lg:sticky lg:top-4">
            <div className="border-b px-4">
              <FilterTabs
                label="Filter folios by status"
                value={statusFilter}
                onChange={setStatusFilter}
                tabs={[
                  { value: 'all', label: 'All', count: folios.length },
                  { value: 'open', label: 'Open', count: statusCount('open') },
                  { value: 'closed', label: 'Closed', count: statusCount('closed') },
                ]}
              />
            </div>
            <PanelToolbar className="space-y-2 px-4 sm:px-4">
              <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Guest, confirmation or folio" searchClassName="md:max-w-none" className="md:flex-col md:items-stretch" />
              <div className="flex items-center justify-between gap-2">
                <WorkspaceSelect label="Sort folios" value={sort} onChange={setSort}><option value="recent">Recently opened</option><option value="balance">Largest balance</option></WorkspaceSelect>
                <span className="text-xs tabular-nums text-muted-foreground">{workspaceResultLabel(visibleFolios.length, folios.length, 'folios')}</span>
              </div>
            </PanelToolbar>
            {visibleFolios.length === 0 ? (
              <WorkspaceEmpty
                compact
                icon={ReceiptText}
                title={folios.length ? 'No folios match this view' : 'No folios opened'}
                description={folios.length ? 'Clear the search or status filter.' : 'A folio opens when a reservation is confirmed.'}
                onClear={folios.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined}
              />
            ) : (
              <ul className="max-h-[36rem] divide-y overflow-y-auto">
                {visibleFolios.map((folio) => {
                  const active = selected?.id === folio.id;
                  return (
                    <li key={folio.id}>
                      <button
                        type="button"
                        onClick={() => selectFolio(folio.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn('relative block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', active && 'bg-muted/60 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-foreground')}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium">{folio.booking?.guestName || folio.groupBlock?.name || folio.folioNumber}</span>
                          <span className={cn('shrink-0 text-sm font-medium tabular-nums', folio.balanceMinor > 0 && 'text-amber-700 dark:text-amber-400', folio.balanceMinor < 0 && 'text-emerald-700 dark:text-emerald-400')}>{formatMoney(folio.balanceMinor, folio.currencyCode)}</span>
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate font-mono">{folio.booking?.confirmationNumber || folio.folioNumber}</span>
                          <span className="flex shrink-0 items-center gap-2">{folio.groupBlock ? <Tag>Group</Tag> : null}<StatusPill kind="folio" value={folio.status} /></span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <div className="min-w-0 space-y-6">
            {selected && selectedTotals ? (
              <>
                <Panel>
                  <div className="flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">{selected.booking?.guestName || selected.groupBlock?.name || selected.folioNumber}</h2>
                        <StatusPill kind="folio" value={selected.status} />
                        {selected.booking ? <StatusPill kind="booking" value={selected.booking.status} /> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {selected.booking ? <span className="font-mono">{selected.booking.confirmationNumber}</span> : null}
                        <CopyId value={selected.folioNumber} label="Folio" />
                        {selected.booking ? <span>{formatDate(selected.booking.checkInDate)} – {formatDate(selected.booking.checkOutDate)}</span> : null}
                        {selected.booking ? <Link href={`/dashboard/bookings/${selected.booking.id}`} className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline">Reservation<ExternalLink className="size-3" aria-hidden="true" /></Link> : null}
                        {selected.status === 'open' && selected.balanceMinor > 0 ? <Link href={`/dashboard/platform/receivables?folioId=${encodeURIComponent(selected.id)}${selected.groupBlock && selected.settlementBookingId ? `&bookingId=${encodeURIComponent(selected.settlementBookingId)}` : ''}`} className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline">Bill to company account<ExternalLink className="size-3" aria-hidden="true" /></Link> : null}
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', selected.balanceMinor > 0 && 'text-amber-700 dark:text-amber-400')}>{formatMoney(selectedTotals.balanceMinor, selected.currencyCode)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 divide-x border-b text-sm">
                    <div className="px-4 py-2.5 sm:px-5"><p className="text-xs text-muted-foreground">Charges</p><p className="font-medium tabular-nums">{formatMoney(selectedTotals.debitMinor, selected.currencyCode)}</p></div>
                    <div className="px-4 py-2.5 sm:px-5"><p className="text-xs text-muted-foreground">Credits & payments</p><p className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(selectedTotals.creditMinor, selected.currencyCode)}</p></div>
                    <div className="px-4 py-2.5 sm:px-5"><p className="text-xs text-muted-foreground">Entries</p><p className="font-medium tabular-nums">{selected.entries.length}</p></div>
                  </div>
                  {selected.entries.length ? (
                    <DataTable minWidth="min-w-[680px]">
                      <THead>
                        <tr><Th>Service date</Th><Th>Posting</Th><Th align="right">Charge</Th><Th align="right">Credit</Th><Th><span className="sr-only">Actions</span></Th></tr>
                      </THead>
                      <TBody>
                        {selected.entries.map((entry) => {
                          const reversible = !entry.reversedById && entry.sourceType !== 'reservation_snapshot' && entry.entryType !== 'transfer' && !['payment', 'refund', 'reversal'].includes(entry.entryType);
                          return (
                            <Tr key={entry.id} className={entry.reversedById ? 'text-muted-foreground' : undefined}>
                              <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(entry.serviceDate)}</Td>
                              <Td>
                                <div className="flex min-w-0 items-start gap-2">
                                  {entry.direction === 'debit'
                                    ? <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                                    : <ArrowDownLeft className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
                                  <div className="min-w-0">
                                    <p className={cn('font-medium', entry.reversedById && 'line-through decoration-muted-foreground/60')}>{entry.description}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                      <Tag>{humanize(entry.entryType)}</Tag>
                                      <span>{humanize(entry.sourceType)}</span>
                                      {entry.reversedById ? <StatusPill tone="neutral" label="Reversed" /> : null}
                                      {entry.reversesId ? <StatusPill tone="accent" label="Correction" /> : null}
                                    </p>
                                  </div>
                                </div>
                              </Td>
                              <Td numeric align="right">{entry.direction === 'debit' ? formatMoney(entry.amountMinor, entry.currencyCode) : ''}</Td>
                              <Td numeric align="right" className="text-emerald-700 dark:text-emerald-400">{entry.direction === 'credit' ? `−${formatMoney(entry.amountMinor, entry.currencyCode)}` : ''}</Td>
                              <Td align="right">{reversible && !stale ? <Button size="sm" variant="ghost" className="h-7" onClick={() => openReversal(entry)}><Undo2 aria-hidden="true" />Reverse</Button> : null}</Td>
                            </Tr>
                          );
                        })}
                      </TBody>
                    </DataTable>
                  ) : <WorkspaceEmpty compact icon={ReceiptText} title="No postings yet" description="Charges post as the stay is audited; payments and corrections appear here." />}
                </Panel>

                {settlementBookingId && selected.status === 'open' && !stale ? (
                  <Panel>
                    <PanelHeader title="Settlement & correction" description="Record payments and post charges or credits. Posted entries are never edited; corrections add a new entry." />
                    <PanelBody className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Amount (minor units)" htmlFor="folio-amount" hint={amountPreview ? `= ${amountPreview}` : '100 = $1.00'}>
                          <FieldInput id="folio-amount" aria-label="Amount in minor units" type="number" min="1" inputMode="numeric" value={action.amount} onChange={e => setAction({ ...action, amount: e.target.value })} />
                        </Field>
                        <Field label="Description / reason" htmlFor="folio-description" className="lg:col-span-3">
                          <FieldInput id="folio-description" aria-label="Required description or reason" placeholder="Shown on the guest statement" value={action.description} onChange={e => setAction({ ...action, description: e.target.value })} />
                        </Field>
                        <Field label="Payment method" htmlFor="folio-method">
                          <NativeSelect id="folio-method" aria-label="Payment method" value={action.method} onChange={e => setAction({ ...action, method: e.target.value })}><option value="cash">Cash</option><option value="credit_card">Credit card</option><option value="debit_card">Debit card</option><option value="bank_transfer">Bank transfer</option><option value="check">Check</option></NativeSelect>
                        </Field>
                        <Field label="Correction direction" htmlFor="folio-direction">
                          <NativeSelect id="folio-direction" aria-label="Folio entry direction" value={action.direction} onChange={e => setAction({ ...action, direction: e.target.value })}><option value="debit">Charge (debit)</option><option value="credit">Credit</option></NativeSelect>
                        </Field>
                        <Field label="Credit approval ID" htmlFor="folio-approval" optional className="sm:col-span-2" hint={<>For policy-controlled credits. Target <CopyId value={selected.booking?.id || selected.id} className="align-middle" /></>}>
                          <FieldInput id="folio-approval" aria-label="Credit approval ID" value={action.approvalId} onChange={event => setAction({ ...action, approvalId: event.target.value })} />
                        </Field>
                      </div>
                      <FormNote>A post-stay refund reopens its folio until an authorized zero-balance reconciliation closes it again.</FormNote>
                    </PanelBody>
                    <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div>{canClose ? <Button size="sm" variant="ghost" disabled={busy} onClick={closeSelectedFolio}><Lock aria-hidden="true" />Close settled folio</Button> : null}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => runFolioAction('entry')}>{action.direction === 'debit' ? 'Post charge' : 'Post credit'}</Button>
                        <Button size="sm" disabled={busy} onClick={() => runFolioAction('payment')}>Record payment</Button>
                      </div>
                    </div>
                  </Panel>
                ) : null}

                {settlementBookingId && !stale ? <SecurityAuthorizationOperations key={selected.id} bookingId={settlementBookingId} /> : null}
                <FolioReceiptPanel key={`receipt:${selected.id}`} folioId={selected.id} ledgerRevision={`${selected.entries.length}:${selected.entries.at(-1)?.id || ''}:${selected.balanceMinor}`} />
              </>
            ) : (
              <Panel>
                <WorkspaceEmpty icon={ReceiptText} title="Select a folio" description="Choose a folio from the list to review its ledger, settle it or post a correction." />
              </Panel>
            )}
          </div>
        </div>
      )}

      <Dialog open={Boolean(reversalEntry)} onOpenChange={(open) => { if (!open) closeRiskDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post compensating reversal</DialogTitle><DialogDescription>The original entry stays on the folio. This adds an equal and opposite entry for {reversalEntry ? `${reversalEntry.description} (${formatMoney(reversalEntry.amountMinor, reversalEntry.currencyCode)})` : 'the selected entry'}.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={submitReversal}>
            <Field label="Reversal reason" htmlFor="reversal-reason"><FieldTextarea id="reversal-reason" autoFocus value={riskReason} onChange={(event) => setRiskReason(event.target.value)} maxLength={500} disabled={riskBusy} required /></Field>
            {riskApprovalField}
            {riskError ? <p className="text-sm text-destructive" role="alert">{riskError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={closeRiskDialog} disabled={riskBusy}>Cancel</Button><Button type="submit" variant="destructive" disabled={riskBusy || !riskReason.trim()}>{riskBusy ? 'Posting…' : 'Post reversal'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(overdueBooking)} onOpenChange={(open) => { if (!open) closeRiskDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve overdue checked-in stay</DialogTitle><DialogDescription>This writes off the exact open balance and checks out {overdueBooking?.guestName || 'the selected guest'}. No payment is recorded. The reason is kept with the folio history.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={submitOverdueResolution}>
            <div className="rounded-md border bg-muted/40 p-3 text-sm"><p className="font-mono font-medium">{overdueBooking?.confirmationNumber}</p><p className="text-muted-foreground">Was due {overdueBooking?.checkOutDate ? formatDate(overdueBooking.checkOutDate) : '—'}</p></div>
            <Field label="Authorized write-off reason" htmlFor="overdue-reason"><FieldTextarea id="overdue-reason" autoFocus value={riskReason} onChange={(event) => setRiskReason(event.target.value)} maxLength={500} disabled={riskBusy} required /></Field>
            {riskApprovalField}
            {riskError ? <p className="text-sm text-destructive" role="alert">{riskError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={closeRiskDialog} disabled={riskBusy}>Cancel</Button><Button type="submit" variant="destructive" disabled={riskBusy || !riskReason.trim()}>{riskBusy ? 'Resolving…' : 'Write off and check out'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PlatformPage>
  );
}

export default FoliosPage;
