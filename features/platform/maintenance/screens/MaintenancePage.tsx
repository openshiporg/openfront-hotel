'use client';

import React from 'react';
import Link from 'next/link';
import { gql, request } from 'graphql-request';
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const GET_MAINTENANCE = gql`
  query GetMaintenanceDashboard {
    maintenanceRequests(orderBy: { createdAt: desc }, take: 20) {
      id
      title
      category
      priority
      status
      room {
        id
        roomNumber
      }
      assignedTo {
        id
        name
      }
      createdAt
    }
  }
`;

export function MaintenancePage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [requests, setRequests] = React.useState<any[]>([]);

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const data = await request<any>(endpoint, GET_MAINTENANCE);
      setRequests(data.maintenanceRequests || []);
    } catch (error) {
      console.error('Failed to load maintenance requests:', error);
      toast({
        title: 'Error',
        description: 'Unable to load maintenance dashboard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openItems = requests.filter((request) => !['completed', 'verified', 'cancelled'].includes(request.status));
  const emergencies = requests.filter((request) => request.priority === 'emergency');
  const inProgress = requests.filter((request) => request.status === 'in_progress');

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
        <div className="grid gap-4 md:grid-cols-3">
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
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Maintenance Requests</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/MaintenanceRequest">Open model view</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{request.title}</p>
                    <Badge>{request.priority}</Badge>
                    <Badge variant="outline">{request.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Room {request.room?.roomNumber || 'Unassigned'} • {request.category}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Assigned to {request.assignedTo?.name || 'Unassigned'}
                  </p>
                </div>
              </div>
            ))}
            {!loading && requests.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No maintenance issues found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default MaintenancePage;
