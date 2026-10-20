'use client';

import React from 'react';
import { Mail, RefreshCw, RotateCcw, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { CopyId, Disclosure, Panel, PanelHeader, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, formatMoneyMinor, humanize } from '@/features/platform/lib/format';
import { statusMeta } from '@/features/platform/lib/status';
import { workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getOutboxWorkspace, replayOutboxEvidence } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type Capabilities = { canManageIntegrations: boolean; canManagePayments: boolean };

export default function OutboxPage() {
  const [data, setData] = React.useState<any>({ events: [], refundIntents: [], eventsTotal: 0, refundIntentsTotal: 0, statusCounts: {} });
  const [capabilities, setCapabilities] = React.useState<Capabilities>({ canManageIntegrations: false, canManagePayments: false });
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState<'events' | 'refunds' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const request = React.useRef(0);
  React.useEffect(() => { const timer = window.setTimeout(() => setSearch(searchText.trim()), 300); return () => window.clearTimeout(timer); }, [searchText]);

  // Status and search run on the server; a response for an older view is discarded.
  const load = React.useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getOutboxWorkspace({ status, search });
      if (id !== request.current) return;
      setData(result.hotelOutboxOperations);
      setCapabilities(result.hotelOperatorCapabilities);
    } catch (error) {
      if (id !== request.current) return;
      const message = error instanceof Error ? error.message : 'Delivery records could not be loaded.';
      setError(message);
      toast.error('Unable to load delivery operations', { description: message });
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [status, search]);

  React.useEffect(() => { void load(); }, [load]);

  const loadMore = async (kind: 'events' | 'refunds') => {
    const id = request.current;
    setLoadingMore(kind);
    try {
      const result = await getOutboxWorkspace({ status, search, eventSkip: data.events.length, refundSkip: data.refundIntents.length });
      if (id !== request.current) return;
      const next = result.hotelOutboxOperations;
      setData((current: any) => {
        const key = kind === 'events' ? 'events' : 'refundIntents';
        const known = new Set(current[key].map((item: any) => item.id));
        return { ...current, [key]: [...current[key], ...next[key].filter((item: any) => !known.has(item.id))], eventsTotal: next.eventsTotal, refundIntentsTotal: next.refundIntentsTotal, statusCounts: next.statusCounts };
      });
    } catch (error) {
      toast.error('More records could not be loaded', { description: error instanceof Error ? error.message : undefined });
    } finally {
      setLoadingMore(null);
    }
  };

  const replay = async (kind: 'event' | 'refund', id: string, deliveryUnknown = false) => {
    const confirmation = deliveryUnknown
      ? 'SMTP may already have accepted this message. Verify the recipient/provider receipt first; replaying without evidence can send a duplicate. Continue only after reviewing that risk.'
      : 'Send this again?';
    if (!window.confirm(confirmation)) return;
    try {
      unwrapAction(await replayOutboxEvidence(kind, id, deliveryUnknown));
      toast.success('Replay queued');
      await load();
    } catch (error) {
      toast.error('Replay refused', { description: error instanceof Error ? error.message : 'Invalid replay' });
    }
  };

  const visibleEvents = data.events || [];
  const visibleRefunds = data.refundIntents || [];
  const matching = Number(data.eventsTotal || 0) + Number(data.refundIntentsTotal || 0);
  const statusCount = (value: string) => Number(data.statusCounts?.[value] || 0);
  const total = ['pending', 'processing', 'failed', 'dead_letter', 'completed'].reduce((sum, value) => sum + statusCount(value), 0);
  const STATUSES = ['dead_letter', 'failed', 'pending', 'processing', 'completed'];
  const unknownDelivery = (event: any) => String(event.lastError || '').startsWith('SMTP delivery outcome is unknown:');

  return (
    <PlatformPage
      title="Outbox"
      description="Guest message and refund delivery, with retry for failures."
      actions={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>}
    >
      <StatStrip
        loading={loading && !total}
        items={[
          { label: 'Dead letters', value: statusCount('dead_letter'), tone: statusCount('dead_letter') ? 'danger' : 'neutral', hint: 'Need a reviewed replay', onSelect: () => setStatus(status === 'dead_letter' ? 'all' : 'dead_letter'), active: status === 'dead_letter' },
          { label: 'Retrying', value: statusCount('failed'), tone: statusCount('failed') ? 'warning' : 'neutral', hint: 'Automatic retry scheduled', onSelect: () => setStatus(status === 'failed' ? 'all' : 'failed'), active: status === 'failed' },
          { label: 'In flight', value: statusCount('pending') + statusCount('processing'), tone: 'progress', hint: 'Pending or processing' },
          { label: 'Delivered', value: statusCount('completed'), tone: 'success', hint: `Messages delivered and refunds processed, of ${total} latest records`, onSelect: () => setStatus(status === 'completed' ? 'all' : 'completed'), active: status === 'completed' },
        ]}
      />
      {error ? <WorkspaceError message={error} onRetry={load} title="Delivery evidence unavailable" /> : loading && total === 0 ? <WorkspaceLoading label="Loading delivery evidence" /> : (
        <>
          <Panel>
            <div className="border-b px-4 sm:px-5">
              <FilterTabs
                label="Filter delivery records by status"
                value={status}
                onChange={setStatus}
                tabs={[{ value: 'all', label: 'All', count: total }, ...STATUSES.map((value) => ({ value, label: statusMeta('delivery', value).label, count: statusCount(value), tone: statusMeta('delivery', value).tone }))]}
              />
            </div>
            <PanelToolbar>
              <WorkspaceControls search={searchText} onSearchChange={setSearchText} searchLabel="Search message type, reference, booking or error" resultLabel={loading ? 'Searching…' : workspaceResultLabel(matching, total, 'records')} />
            </PanelToolbar>
            <PanelHeader title="Guest messages" description={`${data.eventsTotal} matching, newest first.`} icon={Mail} className="border-t-0" />
            {visibleEvents.length ? (
              <ul data-qa-layout="outbox-events-content" className="divide-y">
                {visibleEvents.map((event: any) => (
                  <li key={event.id} data-qa-layout="outbox-event-row" className={cn('space-y-2 px-4 py-3.5 sm:px-5', event.status === 'dead_letter' && 'bg-rose-500/[0.03]')}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium [overflow-wrap:anywhere]">{event.topic}</p>
                          <StatusPill kind="delivery" value={event.status} />
                          <span className="text-xs tabular-nums text-muted-foreground">{event.attempts} attempt{event.attempts === 1 ? '' : 's'}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CopyId value={event.eventKey} className="max-w-[18rem]" />
                          <Tag>{event.aggregateType}</Tag>
                          <CopyId value={event.aggregateId} className="max-w-[12rem]" />
                        </div>
                      </div>
                      {event.status === 'dead_letter' ? (
                        capabilities.canManageIntegrations
                          ? <Button size="sm" variant={unknownDelivery(event) ? 'outline' : 'default'} className="shrink-0" onClick={() => replay('event', event.id, unknownDelivery(event))}><RotateCcw aria-hidden="true" />{unknownDelivery(event) ? 'Replay after receipt review' : 'Replay'}</Button>
                          : <p className="shrink-0 text-xs text-muted-foreground">Integration permission required to replay.</p>
                      ) : null}
                    </div>
                    {event.lastError ? <p className="rounded-md bg-rose-500/[0.06] px-2.5 py-1.5 font-mono text-xs text-rose-800 [overflow-wrap:anywhere] dark:text-rose-200">{event.lastError}</p> : null}
                    {event.attemptsEvidence.length ? (
                      <Disclosure title="Attempt evidence" badge={<span className="text-xs tabular-nums text-muted-foreground">{event.attemptsEvidence.length}</span>} className="bg-muted/10">
                        <ol className="space-y-1.5 text-xs">
                          {event.attemptsEvidence.map((attempt: any) => (
                            <li key={attempt.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-mono tabular-nums">#{attempt.attemptNumber}</span>
                              <StatusPill kind="delivery" value={attempt.status} />
                              <span className="text-muted-foreground">{attempt.workerId}</span>
                              {attempt.startedAt ? <span className="text-muted-foreground">{formatDateTime(attempt.startedAt)}</span> : null}
                              {attempt.errorMessage ? <span className="w-full text-rose-700 [overflow-wrap:anywhere] dark:text-rose-300">{attempt.errorMessage}</span> : null}
                            </li>
                          ))}
                        </ol>
                      </Disclosure>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <WorkspaceEmpty compact icon={Mail} title={search || status !== 'all' ? 'No messages match this view' : 'No messages yet'} description={search || status !== 'all' ? 'Clear the search or status filter.' : 'Guest emails such as confirmations and reminders appear here once sent.'} onClear={search || status !== 'all' ? () => { setSearchText(''); setStatus('all'); } : undefined} />
            )}
            {visibleEvents.length < Number(data.eventsTotal || 0) ? (
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                <span role="status">Showing {visibleEvents.length} of {data.eventsTotal} messages</span>
                <Button size="sm" variant="outline" disabled={loadingMore === 'events'} onClick={() => void loadMore('events')}>{loadingMore === 'events' ? 'Loading…' : 'Load more'}</Button>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader title="Refunds" description={`${data.refundIntentsTotal} matching, newest first.`} icon={Send} />
            {visibleRefunds.length ? (
              <ul data-qa-layout="outbox-refunds-content" className="divide-y">
                {visibleRefunds.map((intent: any) => (
                  <li key={intent.id} data-qa-layout="outbox-refund-row" className={cn('flex flex-col gap-3 px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between', intent.status === 'dead_letter' && 'bg-rose-500/[0.03]')}>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium"><span className="font-mono text-sm">{intent.booking.confirmationNumber}</span><span className="ml-2 tabular-nums">{formatMoneyMinor(intent.amountMinor, intent.currencyCode)}</span></p>
                        <StatusPill kind="delivery" value={intent.status} />
                        <span className="text-xs tabular-nums text-muted-foreground">{intent.attempts} attempt{intent.attempts === 1 ? '' : 's'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{humanize(intent.reason)} · <span className="font-mono">{intent.intentKey}</span></p>
                      {intent.lastError ? <p className="font-mono text-xs text-rose-700 [overflow-wrap:anywhere] dark:text-rose-300">{intent.lastError}</p> : null}
                    </div>
                    {intent.status === 'dead_letter' ? (
                      capabilities.canManageIntegrations && capabilities.canManagePayments
                        ? <Button className="shrink-0" size="sm" onClick={() => replay('refund', intent.id)}><RotateCcw aria-hidden="true" />Replay refund</Button>
                        : <p className="shrink-0 text-xs text-muted-foreground">Payment and integration permissions required.</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <WorkspaceEmpty compact icon={Send} title={search || status !== 'all' ? 'No refunds match this view' : 'No refunds yet'} description={search || status !== 'all' ? 'Clear the search or status filter.' : 'Refunds requested from Payments appear here while the provider processes them.'} onClear={search || status !== 'all' ? () => { setSearchText(''); setStatus('all'); } : undefined} />
            )}
            {visibleRefunds.length < Number(data.refundIntentsTotal || 0) ? (
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                <span role="status">Showing {visibleRefunds.length} of {data.refundIntentsTotal} refunds</span>
                <Button size="sm" variant="outline" disabled={loadingMore === 'refunds'} onClick={() => void loadMore('refunds')}>{loadingMore === 'refunds' ? 'Loading…' : 'Load more'}</Button>
              </div>
            ) : null}
          </Panel>
        </>
      )}
    </PlatformPage>
  );
}
