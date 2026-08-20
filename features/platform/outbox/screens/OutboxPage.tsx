'use client';

import React from 'react';
import { RefreshCw, RotateCcw, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getOutboxWorkspace, replayOutboxEvidence } from '../actions';

type Capabilities = { canManageIntegrations: boolean; canManagePayments: boolean };

export default function OutboxPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<any>({ events: [], refundIntents: [] });
  const [capabilities, setCapabilities] = React.useState<Capabilities>({ canManageIntegrations: false, canManagePayments: false });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getOutboxWorkspace();
      setData(result.hotelOutboxOperations);
      setCapabilities(result.hotelOperatorCapabilities);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audit evidence is unavailable.';
      setError(message);
      toast({ title: 'Unable to load delivery operations', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { void load(); }, [load]);

  const replay = async (kind: 'event' | 'refund', id: string) => {
    if (!window.confirm('Create an authorized replay from immutable evidence?')) return;
    try {
      await replayOutboxEvidence(kind, id);
      toast({ title: 'Replay queued' });
      await load();
    } catch (error) {
      toast({ title: 'Replay refused', description: error instanceof Error ? error.message : 'Invalid replay', variant: 'destructive' });
    }
  };

  const visibleEvents = React.useMemo(() => applyWorkspaceView(data.events || [], { search, status, statusOf: (event: any) => event.status, searchText: (event: any) => [event.topic, event.eventKey, event.aggregateType, event.aggregateId, event.lastError] }), [data.events, search, status]);
  const visibleRefunds = React.useMemo(() => applyWorkspaceView(data.refundIntents || [], { search, status, statusOf: (intent: any) => intent.status, searchText: (intent: any) => [intent.booking?.confirmationNumber, intent.reason, intent.currencyCode, intent.lastError] }), [data.refundIntents, search, status]);
  const total = (data.events?.length || 0) + (data.refundIntents?.length || 0);
  const visibleTotal = visibleEvents.length + visibleRefunds.length;

  return (
    <PageContainer
      title="Outbox & DLQ"
      header={<div><h1 className="text-lg font-semibold md:text-2xl">Outbox & DLQ</h1><p className="text-muted-foreground">Authenticated delivery evidence, failures, and permission-aware controlled replay.</p></div>}
      breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Outbox & DLQ' }]}
    >
      <div className="space-y-6 p-4 md:p-6">
        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search topic, event key, booking, aggregate, or error" resultLabel={workspaceResultLabel(visibleTotal, total, 'delivery records')}><WorkspaceSelect label="Filter delivery status" value={status} onChange={setStatus}><option value="all">All statuses</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="failed">Failed</option><option value="dead_letter">Dead letter</option><option value="completed">Completed</option></WorkspaceSelect><Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></WorkspaceControls>
        {error ? <WorkspaceError message={error} onRetry={load} /> : null}
        {loading && total === 0 ? <WorkspaceLoading label="Loading delivery evidence" /> : null}
        {!error && !(loading && total === 0) && <Card data-qa-layout="outbox-events-card" className="min-w-0 max-w-full">
          <CardHeader className="min-w-0 max-w-full"><CardTitle className="[overflow-wrap:anywhere]">Latest 100 hotel events</CardTitle></CardHeader>
          <CardContent data-qa-layout="outbox-events-content" className="min-w-0 max-w-full space-y-3">
            {visibleEvents.map((event: any) => (
              <div key={event.id} data-qa-layout="outbox-event-row" className="min-w-0 max-w-full border p-4">
                <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 max-w-full flex-1"><p className="font-medium [overflow-wrap:anywhere]">{event.topic}</p><p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{event.eventKey}</p></div>
                  <Badge className="shrink-0" variant={event.status === 'dead_letter' ? 'destructive' : 'outline'}>{event.status}</Badge>
                </div>
                <p className="mt-2 min-w-0 max-w-full text-sm [overflow-wrap:anywhere]">{event.aggregateType}:{event.aggregateId} · {event.attempts} attempts</p>
                {event.lastError ? <p className="mt-1 min-w-0 max-w-full text-sm text-destructive [overflow-wrap:anywhere]">{event.lastError}</p> : null}
                {event.status === 'dead_letter' ? capabilities.canManageIntegrations
                  ? <Button className="mt-3" size="sm" onClick={() => replay('event', event.id)}><RotateCcw className="mr-2 h-4 w-4" />Replay</Button>
                  : <p className="mt-2 text-xs text-muted-foreground">Integration permission is required to replay.</p>
                : null}
                <details className="mt-3 min-w-0 max-w-full text-sm"><summary>Attempt evidence ({event.attemptsEvidence.length})</summary>{event.attemptsEvidence.map((attempt: any) => <p key={attempt.id} className="mt-1 text-muted-foreground [overflow-wrap:anywhere]">#{attempt.attemptNumber} {attempt.status} · {attempt.workerId} {attempt.errorMessage}</p>)}</details>
              </div>
            ))}
            {!loading && !visibleEvents.length ? <WorkspaceEmpty title={data.events.length ? 'No events match this view' : 'No delivery events'} description={data.events.length ? 'Clear the search or status filter.' : 'Durable hotel communication events will appear when authoritative workflows enqueue them.'} onClear={data.events.length ? () => { setSearch(''); setStatus('all'); } : undefined} /> : null}
          </CardContent>
        </Card>}
        {!error && !(loading && total === 0) && <Card data-qa-layout="outbox-refunds-card" className="min-w-0 max-w-full">
          <CardHeader className="min-w-0 max-w-full"><CardTitle>Latest 100 refund intents</CardTitle></CardHeader>
          <CardContent data-qa-layout="outbox-refunds-content" className="min-w-0 max-w-full space-y-3">
            {visibleRefunds.map((intent: any) => (
              <div key={intent.id} data-qa-layout="outbox-refund-row" className="flex min-w-0 max-w-full flex-col gap-3 border p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 max-w-full flex-1"><div className="flex min-w-0 max-w-full flex-wrap items-center gap-2"><Send className="h-4 w-4 shrink-0" /><p className="min-w-0 font-medium [overflow-wrap:anywhere]">{intent.booking.confirmationNumber} · {(intent.amountMinor / 100).toFixed(2)} {intent.currencyCode}</p><Badge className="shrink-0" variant={intent.status === 'dead_letter' ? 'destructive' : 'outline'}>{intent.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{intent.reason} · {intent.attempts} attempts</p>{intent.lastError ? <p className="text-sm text-destructive [overflow-wrap:anywhere]">{intent.lastError}</p> : null}</div>
                {intent.status === 'dead_letter' ? capabilities.canManageIntegrations && capabilities.canManagePayments
                  ? <Button className="shrink-0" size="sm" onClick={() => replay('refund', intent.id)}>Replay refund</Button>
                  : <p className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">Payment and integration permissions are required to replay.</p>
                : null}
              </div>
            ))}
            {!loading && !visibleRefunds.length ? <WorkspaceEmpty title={data.refundIntents.length ? 'No refund intents match this view' : 'No refund intents'} description={data.refundIntents.length ? 'Clear the search or status filter.' : 'Refund work appears only after an authoritative payment workflow creates an intent.'} onClear={data.refundIntents.length ? () => { setSearch(''); setStatus('all'); } : undefined} /> : null}
          </CardContent>
        </Card>}
      </div>
    </PageContainer>
  );
}
