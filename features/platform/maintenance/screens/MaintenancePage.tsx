'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw, Wrench } from 'lucide-react';

import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getMaintenanceWorkspace, updateMaintenanceStatusAction } from '../actions';

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

function priorityBadge(priority: string) {
  switch (priority) {
    case 'emergency':
      return <Badge className="bg-red-100 text-red-700">Emergency</Badge>;
    case 'high':
      return <Badge className="bg-orange-100 text-orange-700">High</Badge>;
    case 'medium':
      return <Badge className="bg-blue-100 text-blue-700">Medium</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'reported':
      return <Badge className="bg-amber-100 text-amber-700">Reported</Badge>;
    case 'assigned':
      return <Badge className="bg-blue-100 text-blue-700">Assigned</Badge>;
    case 'in_progress':
      return <Badge className="bg-purple-100 text-purple-700">In Progress</Badge>;
    case 'completed':
      return <Badge className="bg-green-100 text-green-700">Completed</Badge>;
    case 'verified':
      return <Badge className="bg-emerald-100 text-emerald-700">Verified</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-700">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function MaintenancePage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [requests, setRequests] = React.useState<MaintenanceRequestItem[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('priority');

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await getMaintenanceWorkspace() as MaintenanceRequestItem[]);
    } catch (error) {
      console.error('Failed to load maintenance requests:', error);
      const message = error instanceof Error ? error.message : 'Unable to load the bounded maintenance projection.';
      setError(message);
      toast({
        title: 'Maintenance workspace unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const updateStatus = async (requestId: string, status: string, notes: string) => {
    setUpdatingId(`${requestId}:${status}`);
    try {
      await updateMaintenanceStatusAction(requestId, status, notes);
      await fetchRequests();
      toast({
        title: 'Maintenance updated',
        description: `Request marked ${status.replace('_', ' ')}.`,
      });
    } catch (error) {
      console.error('Failed to update maintenance request:', error);
      toast({
        title: 'Unable to update request',
        description: error instanceof Error ? error.message : 'Maintenance status could not be updated.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const openItems = requests.filter((request) => !['completed', 'verified', 'cancelled'].includes(request.status));
  const emergencies = requests.filter((request) => request.priority === 'emergency' && !['verified', 'cancelled'].includes(request.status));
  const inProgress = requests.filter((request) => request.status === 'in_progress');
  const waitingVerification = requests.filter((request) => request.status === 'completed');
  const visibleRequests = React.useMemo(() => applyWorkspaceView(requests, {
    search,
    status: statusFilter,
    statusOf: (request) => request.status,
    searchText: (request) => [request.title, request.category, request.room?.roomNumber, request.assignedTo?.name, request.notes],
    sortValue: (request) => sort === 'recent' ? request.createdAt || '' : maintenancePriorityOrder[request.priority] || 0,
    direction: 'desc',
  }), [requests, search, statusFilter, sort]);

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Maintenance' },
  ];

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Maintenance</h1>
      <p className="text-muted-foreground">Track active property issues, outages, and repair work.</p>
    </div>
  );

  return (
    <PageContainer title="Maintenance" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Open Requests</p>
                  <p className="text-2xl font-semibold">{openItems.length}</p>
                </div>
                <Wrench className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Emergency</p>
                  <p className="text-2xl font-semibold">{emergencies.length}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-rose-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-semibold">{inProgress.length}</p>
                </div>
                <RefreshCw className="h-6 w-6 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Needs Verification</p>
                  <p className="text-2xl font-semibold">{waitingVerification.length}</p>
                </div>
                <ClipboardCheck className="h-6 w-6 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search issue, room, category, assignee, or note" resultLabel={workspaceResultLabel(visibleRequests.length, requests.length, 'requests')}>
          <WorkspaceSelect label="Filter maintenance status" value={statusFilter} onChange={setStatusFilter}><option value="all">All statuses</option><option value="reported">Reported</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Needs verification</option><option value="verified">Verified</option><option value="cancelled">Cancelled</option></WorkspaceSelect>
          <WorkspaceSelect label="Sort maintenance requests" value={sort} onChange={setSort}><option value="priority">Priority</option><option value="recent">Most recent</option></WorkspaceSelect>
        </WorkspaceControls>

        {error ? <WorkspaceError message={error} onRetry={fetchRequests} /> : null}
        {loading && requests.length === 0 ? <WorkspaceLoading label="Loading maintenance queue" /> : null}

        {!error && !(loading && requests.length === 0) && <Card>
          <CardHeader data-qa-layout="operator-card-header" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Maintenance Queue</CardTitle>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/platform/rooms">Report from rooms</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleRequests.map((request) => (
              <div key={request.id} className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{request.title}</p>
                    {priorityBadge(request.priority)}
                    {statusBadge(request.status)}
                    {request.room?.status && <Badge variant="outline">Room {request.room.status.replace('_', ' ')}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Room {request.room?.roomNumber || 'Unassigned'} • {request.category}
                    {request.createdAt ? ` • Reported ${new Date(request.createdAt).toLocaleString()}` : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Assigned to {request.assignedTo?.name || 'Unassigned'}
                    {request.completedAt ? ` • Completed ${new Date(request.completedAt).toLocaleString()}` : ''}
                  </p>
                  {request.notes && (
                    <p className="max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{request.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {request.status === 'reported' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === `${request.id}:assigned`}
                      onClick={() => updateStatus(request.id, 'assigned', 'Accepted from maintenance dashboard')}
                    >
                      Assign
                    </Button>
                  )}
                  {['reported', 'assigned'].includes(request.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === `${request.id}:in_progress`}
                      onClick={() => updateStatus(request.id, 'in_progress', 'Work started from maintenance dashboard')}
                    >
                      Start Work
                    </Button>
                  )}
                  {request.status === 'in_progress' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === `${request.id}:completed`}
                      onClick={() => updateStatus(request.id, 'completed', 'Maintenance marked complete; room sent to inspection')}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Complete
                    </Button>
                  )}
                  {request.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === `${request.id}:verified`}
                      onClick={() => updateStatus(request.id, 'verified', 'Verified and returned to service')}
                    >
                      Return to Service
                    </Button>
                  )}
                  {!['completed', 'verified', 'cancelled'].includes(request.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === `${request.id}:cancelled`}
                      onClick={() => updateStatus(request.id, 'cancelled', 'Cancelled from maintenance dashboard')}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/maintenance-requests/${request.id}`}>Details</Link>
                  </Button>
                </div>
              </div>
            ))}
            {!loading && visibleRequests.length === 0 && (
              <WorkspaceEmpty title={requests.length ? 'No requests match this view' : 'No maintenance issues reported'} description={requests.length ? 'Clear the search or status filter.' : 'Reported room issues will enter this queue for triage, repair, and separate return-to-service verification.'} onClear={requests.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined} />
            )}
          </CardContent>
        </Card>}
      </div>
    </PageContainer>
  );
}

export default MaintenancePage;
