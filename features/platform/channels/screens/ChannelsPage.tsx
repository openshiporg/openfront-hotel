'use client';
import { formatStayDate } from '@/lib/hotelCalendarDate';

import React from 'react';
import { ChannelDraftForm } from '../components/ChannelDraftForm';
import { DownloadCloud, RefreshCw, Send, ShieldCheck, TriangleAlert } from 'lucide-react';

import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getChannelWorkspace, retryFailedChannelSyncsAction, runChannelSyncAction } from '../actions';

interface ChannelItem {
  id: string;
  name: string;
  channelType: string;
  isActive: boolean;
  syncInventory?: boolean | null;
  syncRates?: boolean | null;
  commission?: number | null;
  syncStatus: string;
  lastSyncAt?: string | null;
  syncErrorCount: number;
  latestSyncError?: string | null;
  latestSyncErrorAt?: string | null;
}

interface ChannelReservationItem {
  id: string;
  externalId: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  channelStatus?: string | null;
  totalAmount?: number | null;
  commission?: number | null;
  channel?: { id: string; name: string } | null;
  reservation?: { id: string; confirmationNumber: string; status: string } | null;
  roomType?: { id: string; name: string } | null;
}

interface ChannelSyncEventItem {
  id: string;
  action: string;
  status: string;
  message?: string | null;
  errorMessage?: string | null;
  attempts?: number | null;
  nextAttemptAt?: string | null;
  occurredAt?: string | null;
  channel?: { id: string; name: string } | null;
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
    case 'success':
      return <Badge className="bg-green-100 text-green-700">{status}</Badge>;
    case 'error':
    case 'failed':
      return <Badge className="bg-red-100 text-red-700">{status}</Badge>;
    case 'paused':
    case 'processing':
      return <Badge className="bg-amber-100 text-amber-700">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatMoneyCents(amount?: number | null) {
  if (amount === null || amount === undefined) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

export function ChannelsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [syncingChannelId, setSyncingChannelId] = React.useState<string | null>(null);
  const [channels, setChannels] = React.useState<ChannelItem[]>([]);
  const [reservations, setReservations] = React.useState<ChannelReservationItem[]>([]);
  const [events, setEvents] = React.useState<ChannelSyncEventItem[]>([]);

  const fetchChannels = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getChannelWorkspace() as {
        channels: ChannelItem[];
        reservations: ChannelReservationItem[];
        events: ChannelSyncEventItem[];
      };
      setChannels(data.channels || []);
      setReservations(data.reservations || []);
      setEvents(data.events || []);
    } catch (error) {
      console.error('Failed to load channels:', error);
      const message = error instanceof Error ? error.message : 'Unable to load the bounded channel projection.';
      setError(message);
      toast({
        title: 'Channel evidence unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const retryFailedSyncs = async () => {
    setSyncingChannelId('retry:all');
    try {
      const result = await retryFailedChannelSyncsAction();
      await fetchChannels();
      toast({
        title: 'Retry queue processed',
        description: `${result.processed} syncs processed, ${result.succeeded} succeeded, ${result.failed} failed.`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      console.error('Failed to retry channel syncs:', error);
      toast({
        title: 'Retry failed',
        description: error instanceof Error ? error.message : 'The failed sync queue could not be retried.',
        variant: 'destructive',
      });
    } finally {
      setSyncingChannelId(null);
    }
  };

  const runChannelSync = async (channelId: string, mode: 'push' | 'pull') => {
    setSyncingChannelId(`${channelId}:${mode}`);
    try {
      const result = await runChannelSyncAction(channelId, mode);
      await fetchChannels();
      toast({
        title: result.status === 'success' ? 'Channel sync complete' : 'Channel sync failed',
        description: result.message || `${mode === 'push' ? 'Inventory pushed' : 'Reservations pulled'} for this channel.`,
        variant: result.status === 'success' ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error('Channel sync failed:', error);
      toast({
        title: 'Channel sync failed',
        description: error instanceof Error ? error.message : 'The sync could not be completed.',
        variant: 'destructive',
      });
    } finally {
      setSyncingChannelId(null);
    }
  };

  const active = channels.filter((channel) => channel.isActive);
  const errored = channels.filter((channel) => channel.syncStatus === 'error');
  const paused = channels.filter((channel) => channel.syncStatus === 'paused');
  const visibleChannels = React.useMemo(() => applyWorkspaceView(channels, { search, status: statusFilter, statusOf: (channel) => channel.syncStatus, searchText: (channel) => [channel.name, channel.channelType, channel.latestSyncError], sortValue: (channel) => channel.name, direction: 'asc' }), [channels, search, statusFilter]);

  const reservationsByChannel = React.useMemo(() => {
    const map = new Map<string, ChannelReservationItem[]>();
    reservations.forEach((reservation) => {
      const channelId = reservation.channel?.id;
      if (!channelId) return;
      map.set(channelId, [...(map.get(channelId) || []), reservation]);
    });
    return map;
  }, [reservations]);

  const eventsByChannel = React.useMemo(() => {
    const map = new Map<string, ChannelSyncEventItem[]>();
    events.forEach((event) => {
      const channelId = event.channel?.id;
      if (!channelId) return;
      map.set(channelId, [...(map.get(channelId) || []), event]);
    });
    return map;
  }, [events]);

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Channels' },
  ];

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Channel bridge</h1>
      <p className="text-muted-foreground">Experimental P2 custom-bridge evidence; channels stay disabled for the supported launch.</p>
    </div>
  );

  return (
    <PageContainer title="Channels" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">This release does not bundle or claim a maintained/certified Booking.com, Expedia, Airbnb, Mews, or Cloudbeds adapter. Keep channels disabled for the supported initial launch. The custom bridge is an experimental P2 extension boundary and does not ship rate push.</div>
        <ChannelDraftForm onSaved={fetchChannels} />
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Channels</p>
                  <p className="text-2xl font-semibold">{active.length}</p>
                </div>
                <ShieldCheck className="h-6 w-6 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sync Errors</p>
                  <p className="text-2xl font-semibold">{errored.length}</p>
                </div>
                <TriangleAlert className="h-6 w-6 text-rose-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Paused</p>
                  <p className="text-2xl font-semibold">{paused.length}</p>
                </div>
                <RefreshCw className="h-6 w-6 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Imported bridge bookings</p>
                  <p className="text-2xl font-semibold">{reservations.length}</p>
                </div>
                <DownloadCloud className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search channel, bridge type, or sync error" resultLabel={workspaceResultLabel(visibleChannels.length, channels.length, 'channels')}><WorkspaceSelect label="Filter channel sync status" value={statusFilter} onChange={setStatusFilter}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="error">Error</option><option value="success">Success</option></WorkspaceSelect></WorkspaceControls>
        {error ? <WorkspaceError message={error} onRetry={fetchChannels} /> : null}
        {loading && channels.length === 0 ? <WorkspaceLoading label="Loading channel bridge evidence" /> : null}
        {!error && !(loading && channels.length === 0) && <Card>
          <CardHeader data-qa-layout="operator-card-header" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Channel Health</CardTitle>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button variant="outline" size="sm" onClick={fetchChannels} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={retryFailedSyncs} disabled={!channels.some(channel => channel.isActive) || syncingChannelId === 'retry:all'}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry failures
              </Button>

            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {visibleChannels.map((channel) => {
              const channelReservations = reservationsByChannel.get(channel.id) || [];
              const channelEvents = eventsByChannel.get(channel.id) || [];
              const lastEvent = channelEvents[0];
              const latestError = channel.latestSyncError || lastEvent?.errorMessage;

              return (
                <div key={channel.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{channel.name}</p>
                        <Badge>{channel.channelType}</Badge>
                        {statusBadge(channel.syncStatus)}
                        <Badge variant="outline">{channel.isActive ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 lg:grid-cols-4">
                        <p>Inventory sync: {channel.syncInventory ? 'On' : 'Off'}</p>
                        <p>Rate sync: not shipped</p>
                        <p>Commission: {channel.commission || 0}%</p>
                        <p>{channel.lastSyncAt ? `Last sync ${new Date(channel.lastSyncAt).toLocaleString()}` : 'Never synced'}</p>
                      </div>
                      {latestError && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          <p>{latestError}</p>
                          <p className="mt-1 text-xs">Sync event reference: {lastEvent?.id || channel.id}</p>
                        </div>
                      )}
                      {lastEvent && (
                        <p className="text-sm text-muted-foreground">
                          Last event: {lastEvent.action.replace('_', ' ')} • {lastEvent.status}
                          {lastEvent.occurredAt ? ` • ${new Date(lastEvent.occurredAt).toLocaleString()}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!channel.isActive || syncingChannelId === `${channel.id}:push`}
                        onClick={() => runChannelSync(channel.id, 'push')}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Push inventory
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!channel.isActive || syncingChannelId === `${channel.id}:pull`}
                        onClick={() => runChannelSync(channel.id, 'pull')}
                      >
                        <DownloadCloud className="mr-2 h-4 w-4" />
                        Pull reservations
                      </Button>
                    </div>
                  </div>

                  {channelReservations.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent channel reservations</p>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {channelReservations.slice(0, 4).map((reservation) => (
                          <div key={reservation.id} className="rounded-md bg-muted/40 p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">{reservation.guestName}</p>
                              <Badge variant="outline">{reservation.channelStatus || 'unknown'}</Badge>
                            </div>
                            <p className="text-muted-foreground">
                              {reservation.externalId} {reservation.reservation?.confirmationNumber ? `• ${reservation.reservation.confirmationNumber}` : ''}
                            </p>
                            <p className="text-muted-foreground">
                              {formatStayDate(reservation.checkInDate, { month: "short", day: "numeric", year: "numeric" })} - {formatStayDate(reservation.checkOutDate, { month: "short", day: "numeric", year: "numeric" })}
                              {reservation.roomType?.name ? ` • ${reservation.roomType.name}` : ''}
                            </p>
                            <p className="text-muted-foreground">
                              Gross {formatMoneyCents(reservation.totalAmount)} • Commission {formatMoneyCents(reservation.commission)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visibleChannels.length === 0 && (
              <WorkspaceEmpty title={channels.length ? 'No channels match this view' : 'Channel bridge is not configured'} description={channels.length ? 'Clear the search or status filter.' : 'The supported direct-first launch keeps channels disabled. A contracted, maintained adapter and certification are required before activation.'} onClear={channels.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined} />
            )}
          </CardContent>
        </Card>}
      </div>
    </PageContainer>
  );
}

export default ChannelsPage;
