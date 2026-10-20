'use client';

import React from 'react';
import { ChannelDraftForm } from '../components/ChannelDraftForm';
import { DownloadCloud, RefreshCw, RotateCcw, Send, Waypoints } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { Callout, DetailList, Panel, PanelToolbar, SectionLabel } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, formatStayRange, humanize } from '@/features/platform/lib/format';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getChannelWorkspace, retryFailedChannelSyncsAction, runChannelSyncAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

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

function formatMoneyCents(amount?: number | null) {
  if (amount === null || amount === undefined) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

export function ChannelsPage() {
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
      const message = error instanceof Error ? error.message : 'Channels could not be loaded.';
      setError(message);
      toast.error('Channel evidence unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const retryFailedSyncs = async () => {
    setSyncingChannelId('retry:all');
    try {
      const result = unwrapAction(await retryFailedChannelSyncsAction());
      await fetchChannels();
      toast.success('Retry queue processed', { description: `${result.processed} syncs processed, ${result.succeeded} succeeded, ${result.failed} failed.` });
    } catch (error) {
      console.error('Failed to retry channel syncs:', error);
      toast.error('Retry failed', { description: error instanceof Error ? error.message : 'The failed sync queue could not be retried.' });
    } finally {
      setSyncingChannelId(null);
    }
  };

  const runChannelSync = async (channelId: string, mode: 'push' | 'pull') => {
    setSyncingChannelId(`${channelId}:${mode}`);
    try {
      const result = unwrapAction(await runChannelSyncAction(channelId, mode));
      await fetchChannels();
      toast.success(result.status === 'success' ? 'Channel sync complete' : 'Channel sync failed', { description: result.message || `${mode === 'push' ? 'Inventory pushed' : 'Reservations pulled'} for this channel.` });
    } catch (error) {
      console.error('Channel sync failed:', error);
      toast.error('Channel sync failed', { description: error instanceof Error ? error.message : 'The sync could not be completed.' });
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

  return (
    <PlatformPage
      title="Channels"
      description="Connections to booking channels. Channels are off; bookings come directly through your storefront."
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={fetchChannels} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={retryFailedSyncs} disabled={!channels.some(channel => channel.isActive) || syncingChannelId === 'retry:all'}><RotateCcw aria-hidden="true" />Retry failures</Button>
        </>
      )}
    >
      <Callout tone="warning" title="No channel connections are included">
        Booking.com, Expedia, Airbnb, Mews and Cloudbeds connections are not included. Channels stay off, and rates and availability are not sent to any channel.
      </Callout>

      <StatStrip
        loading={loading && !channels.length}
        items={[
          { label: 'Active channels', value: active.length, tone: active.length ? 'success' : 'neutral', hint: `${channels.length} configured` },
          { label: 'Sync errors', value: errored.length, tone: errored.length ? 'danger' : 'neutral', hint: 'Channels in error state', onSelect: () => setStatusFilter(statusFilter === 'error' ? 'all' : 'error'), active: statusFilter === 'error' },
          { label: 'Paused', value: paused.length, tone: paused.length ? 'warning' : 'neutral', hint: 'Sync suspended', onSelect: () => setStatusFilter(statusFilter === 'paused' ? 'all' : 'paused'), active: statusFilter === 'paused' },
          { label: 'Imported bookings', value: reservations.length, tone: 'info', hint: 'Pulled through the bridge' },
        ]}
      />

      <ChannelDraftForm onSaved={fetchChannels} />

      {error ? <WorkspaceError message={error} onRetry={fetchChannels} title="Channels unavailable" /> : loading && channels.length === 0 ? <WorkspaceLoading label="Loading channels" rows={3} /> : (
        <Panel>
          <PanelToolbar>
            <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search channel, bridge type or sync error" resultLabel={workspaceResultLabel(visibleChannels.length, channels.length, 'channels')}>
              <WorkspaceSelect label="Filter channel sync status" value={statusFilter} onChange={setStatusFilter}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="error">Error</option><option value="success">Healthy</option></WorkspaceSelect>
            </WorkspaceControls>
          </PanelToolbar>
          {visibleChannels.length === 0 ? (
            <WorkspaceEmpty icon={Waypoints} title={channels.length ? 'No channels match this view' : 'No channels connected'} description={channels.length ? 'Clear the search or status filter.' : 'Channel connections need an agreement with the channel before they can be turned on.'} onClear={channels.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined} />
          ) : (
            <ul className="divide-y">
              {visibleChannels.map((channel) => {
                const channelReservations = reservationsByChannel.get(channel.id) || [];
                const channelEvents = eventsByChannel.get(channel.id) || [];
                const lastEvent = channelEvents[0];
                const latestError = channel.latestSyncError || lastEvent?.errorMessage;
                return (
                  <li key={channel.id} className="space-y-4 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{channel.name}</p>
                          <Tag>{channel.channelType.toUpperCase()}</Tag>
                          <StatusPill kind="channel" value={channel.syncStatus} />
                          {!channel.isActive ? <StatusPill tone="neutral" label="Inactive" /> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{channel.lastSyncAt ? `Last sync ${formatDateTime(channel.lastSyncAt)}` : 'Never synced'}{lastEvent ? ` · last event ${humanize(lastEvent.action)} (${humanize(lastEvent.status)})` : ''}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={!channel.isActive || syncingChannelId === `${channel.id}:push`} onClick={() => runChannelSync(channel.id, 'push')}><Send aria-hidden="true" />Push inventory</Button>
                        <Button size="sm" variant="outline" disabled={!channel.isActive || syncingChannelId === `${channel.id}:pull`} onClick={() => runChannelSync(channel.id, 'pull')}><DownloadCloud aria-hidden="true" />Pull reservations</Button>
                      </div>
                    </div>
                    <DetailList
                      columns={4}
                      items={[
                        { label: 'Inventory sync', value: channel.syncInventory ? 'On' : 'Off' },
                        { label: 'Rate sync', value: 'Not shipped' },
                        { label: 'Commission', value: `${channel.commission || 0}%` },
                        { label: 'Errors recorded', value: channel.syncErrorCount },
                      ]}
                    />
                    {latestError ? (
                      <Callout tone="danger" title="Latest sync error">
                        <p className="[overflow-wrap:anywhere]">{latestError}</p>
                        <p className="mt-1 font-mono text-xs opacity-80">Reference {lastEvent?.id || channel.id}</p>
                      </Callout>
                    ) : null}
                    {channelReservations.length > 0 ? (
                      <div className="space-y-2">
                        <SectionLabel>Recent channel reservations</SectionLabel>
                        <ul className="divide-y rounded-lg border text-sm">
                          {channelReservations.slice(0, 4).map((reservation) => (
                            <li key={reservation.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{reservation.guestName} <span className="font-mono text-xs font-normal text-muted-foreground">{reservation.externalId}{reservation.reservation?.confirmationNumber ? ` → ${reservation.reservation.confirmationNumber}` : ''}</span></p>
                                <p className="text-xs text-muted-foreground">{formatStayRange(reservation.checkInDate, reservation.checkOutDate)}{reservation.roomType?.name ? ` · ${reservation.roomType.name}` : ''}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-xs">
                                <span className="tabular-nums">{formatMoneyCents(reservation.totalAmount)} <span className="text-muted-foreground">· fee {formatMoneyCents(reservation.commission)}</span></span>
                                <StatusPill tone="neutral" label={humanize(reservation.channelStatus || 'unknown')} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </PlatformPage>
  );
}

export default ChannelsPage;
