'use client';

import React from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, ExternalLink, MoreHorizontal, Play, RefreshCw, ShieldCheck, UserCheck, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { Panel, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, humanize } from '@/features/platform/lib/format';
import { statusMeta, TONE_EDGE } from '@/features/platform/lib/status';
import { workspaceResultLabel } from '@/features/platform/lib/workspace';
import { usePagedList } from '@/features/platform/lib/pagedList';
import { getMaintenanceWorkspace, updateMaintenanceStatusAction } from '../actions';
import MaintenanceCommercialPanel from '../MaintenanceCommercialPanel';

const maintenancePriorityOrder: Record<string, number> = { emergency: 4, high: 3, medium: 2, low: 1 };

interface MaintenanceRequestItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  notes?: string | null;
  completedAt?: string | null;
  room?: {
    id: string;
    roomNumber: string;
    status?: string | null;
  } | null;
  assignedTo?: {
    id: string;
    name: string;
  } | null;
  createdAt?: string | null;
}

export function MaintenancePage() {
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('priority');
  const [priorityFilter, setPriorityFilter] = React.useState('all');

  React.useEffect(() => { const timer = window.setTimeout(() => setSearch(searchText.trim()), 300); return () => window.clearTimeout(timer); }, [searchText]);
  // Search, filters and priority order run on the server over every request; pages load on demand.
  const list = usePagedList<MaintenanceRequestItem, Record<string, number>>(async (skip) => {
    const data = await getMaintenanceWorkspace({ search, status: statusFilter, priority: priorityFilter, sort, skip });
    return { items: data.requests as MaintenanceRequestItem[], total: data.total, extra: data.statusCounts };
  }, JSON.stringify({ search, statusFilter, priorityFilter, sort }));
  const { items: requests, total, loading, error } = list;
  const counts = list.extra || {};
  const fetchRequests = list.reload;

  const updateStatus = async (requestId: string, status: string, notes: string) => {
    setUpdatingId(`${requestId}:${status}`);
    try {
      const response = await updateMaintenanceStatusAction(requestId, status, notes);
      await fetchRequests();
      if (!response.ok) {
        toast.error('Unable to update request', { description: response.message });
        return;
      }
      toast.success('Maintenance updated', { description: `Request marked ${status.replace('_', ' ')}.` });
    } catch (error) {
      console.error('Failed to update maintenance request:', error);
      toast.error('Unable to update request', { description: error instanceof Error ? error.message : 'Maintenance status could not be updated.' });
    } finally {
      setUpdatingId(null);
    }
  };

  const statusCount = (value: string) => Number(counts[value] || 0);
  const openCount = statusCount('reported') + statusCount('assigned') + statusCount('in_progress');
  const allCount = ['reported', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'].reduce((sum, value) => sum + statusCount(value), 0);
  const visibleRequests = requests;
  const STATUS_TABS = ['reported', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'];

  const nextStep = (request: MaintenanceRequestItem) => {
    if (request.status === 'reported') return { status: 'assigned', label: 'Accept', icon: UserCheck, note: 'Accepted from maintenance dashboard' };
    if (request.status === 'assigned') return { status: 'in_progress', label: 'Start work', icon: Play, note: 'Work started from maintenance dashboard' };
    if (request.status === 'in_progress') return { status: 'completed', label: 'Complete', icon: CheckCircle2, note: 'Maintenance marked complete; room sent to inspection' };
    if (request.status === 'completed') return { status: 'verified', label: 'Return to service', icon: ShieldCheck, note: 'Verified and returned to service' };
    return null;
  };

  return (
    <PlatformPage
      title="Maintenance"
      description="Property issues from report to repair to a separate return-to-service verification."
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button size="sm" asChild><Link href="/dashboard/platform/housekeeping"><Wrench aria-hidden="true" />Report from room board</Link></Button>
        </>
      )}
    >
      <StatStrip
        loading={loading && !requests.length}
        items={[
          { label: 'Open', value: openCount, tone: 'info', hint: 'Reported, assigned or in progress' },
          { label: 'Emergency', value: statusCount('emergencyOpen'), tone: statusCount('emergencyOpen') ? 'danger' : 'neutral', hint: 'Not yet verified', onSelect: () => setPriorityFilter(priorityFilter === 'emergency' ? 'all' : 'emergency'), active: priorityFilter === 'emergency' },
          { label: 'In progress', value: statusCount('in_progress'), tone: 'progress', hint: 'Work underway', onSelect: () => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress'), active: statusFilter === 'in_progress' },
          { label: 'Needs verification', value: statusCount('completed'), tone: 'accent', hint: 'Ready to return to service', onSelect: () => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed'), active: statusFilter === 'completed' },
        ]}
      />

      {error && !requests.length ? <WorkspaceError message={error} onRetry={fetchRequests} title="Maintenance workspace unavailable" /> : loading && requests.length === 0 ? <WorkspaceLoading label="Loading maintenance queue" /> : (
        <Panel>
          <div className="border-b px-4 sm:px-5">
            <FilterTabs
              label="Filter maintenance requests"
              value={statusFilter}
              onChange={setStatusFilter}
              tabs={[{ value: 'all', label: 'All', count: allCount }, ...STATUS_TABS.map((value) => ({ value, label: statusMeta('maintenance', value).label, count: statusCount(value), tone: statusMeta('maintenance', value).tone }))]}
            />
          </div>
          <PanelToolbar>
            <WorkspaceControls search={searchText} onSearchChange={setSearchText} searchLabel="Search issue, room, category, assignee or note" resultLabel={loading ? 'Searching…' : workspaceResultLabel(requests.length, total, 'requests')}>
              <WorkspaceSelect label="Filter by priority" value={priorityFilter} onChange={setPriorityFilter}><option value="all">All priorities</option>{Object.keys(maintenancePriorityOrder).map((value) => <option key={value} value={value}>{statusMeta('priority', value).label}</option>)}</WorkspaceSelect>
              <WorkspaceSelect label="Sort maintenance requests" value={sort} onChange={setSort}><option value="priority">Sort: priority</option><option value="recent">Sort: most recent</option></WorkspaceSelect>
            </WorkspaceControls>
          </PanelToolbar>
          {visibleRequests.length === 0 ? (
            <WorkspaceEmpty icon={Wrench} title={search || statusFilter !== 'all' || priorityFilter !== 'all' ? 'No requests match this view' : 'No maintenance issues reported'} description={search || statusFilter !== 'all' || priorityFilter !== 'all' ? 'Clear the search or filters.' : 'Reported room issues enter this queue for triage, repair and return-to-service verification.'} onClear={search || statusFilter !== 'all' || priorityFilter !== 'all' ? () => { setSearchText(''); setStatusFilter('all'); setPriorityFilter('all'); } : undefined} />
          ) : (
            <ul className="divide-y">
              {visibleRequests.map((request) => {
                const step = nextStep(request);
                const priorityTone = statusMeta('priority', request.priority).tone;
                const closed = ['verified', 'cancelled'].includes(request.status);
                return (
                  <li key={request.id} className={cn('border-l-[3px] px-4 py-4 sm:px-5', TONE_EDGE[priorityTone], closed && 'opacity-75')}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{request.title}</p>
                          <StatusPill kind="priority" value={request.priority} />
                          <StatusPill kind="maintenance" value={request.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{request.room?.roomNumber ? `Room ${request.room.roomNumber}` : 'No room'}</span>
                          {request.room?.status ? <StatusPill kind="room" value={request.room.status} /> : null}
                          <Tag>{humanize(request.category)}</Tag>
                          <span>{request.assignedTo?.name ? `Assigned to ${request.assignedTo.name}` : 'Unassigned'}</span>
                          {request.createdAt ? <span>Reported {formatDateTime(request.createdAt)}</span> : null}
                          {request.completedAt ? <span>Completed {formatDateTime(request.completedAt)}</span> : null}
                        </div>
                        {request.notes ? <p className="max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{request.notes}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {step ? (
                          <Button size="sm" variant={step.status === 'verified' ? 'default' : 'outline'} disabled={updatingId === `${request.id}:${step.status}`} onClick={() => updateStatus(request.id, step.status, step.note)}>
                            <step.icon aria-hidden="true" />{step.label}
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8" aria-label={`More actions for ${request.title}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 [&_svg]:size-4">
                            {request.status === 'reported' ? (
                              <DropdownMenuItem disabled={updatingId === `${request.id}:in_progress`} onSelect={() => updateStatus(request.id, 'in_progress', 'Work started from maintenance dashboard')}><Play aria-hidden="true" />Start work now</DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild><Link href={`/dashboard/maintenance-requests/${request.id}`}><ExternalLink aria-hidden="true" />Request record</Link></DropdownMenuItem>
                            {!['completed', 'verified', 'cancelled'].includes(request.status) ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={updatingId === `${request.id}:cancelled`} className="text-rose-700 focus:text-rose-700 dark:text-rose-400" onSelect={() => updateStatus(request.id, 'cancelled', 'Cancelled from maintenance dashboard')}><Ban aria-hidden="true" />Cancel request</DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="mt-3"><MaintenanceCommercialPanel requestId={request.id} /></div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && requests.length ? <div className="border-t p-4"><WorkspaceError message={error} onRetry={fetchRequests} title="Maintenance could not be refreshed" /></div> : null}
          {list.hasMore ? (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
              <span role="status">Showing {requests.length} of {total} requests</span>
              <Button size="sm" variant="outline" disabled={list.loadingMore} onClick={() => void list.loadMore()}>{list.loadingMore ? 'Loading…' : 'Load more'}</Button>
            </div>
          ) : null}
        </Panel>
      )}
    </PlatformPage>
  );
}

export default MaintenancePage;
