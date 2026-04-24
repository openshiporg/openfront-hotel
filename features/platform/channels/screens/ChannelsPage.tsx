'use client';

import React from 'react';
import Link from 'next/link';
import { gql, request } from 'graphql-request';
import { RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const GET_CHANNELS = gql`
  query GetChannelsDashboard {
    channels(orderBy: { createdAt: desc }, take: 20) {
      id
      name
      channelType
      isActive
      syncStatus
      lastSyncAt
      syncErrors
    }
  }
`;

export function ChannelsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [channels, setChannels] = React.useState<any[]>([]);

  const fetchChannels = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const data = await request<any>(endpoint, GET_CHANNELS);
      setChannels(data.channels || []);
    } catch (error) {
      console.error('Failed to load channels:', error);
      toast({
        title: 'Error',
        description: 'Unable to load channels dashboard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const active = channels.filter((channel) => channel.isActive);
  const errored = channels.filter((channel) => channel.syncStatus === 'error');
  const paused = channels.filter((channel) => channel.syncStatus === 'paused');

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Channels' },
  ];

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Channels</h1>
      <p className="text-muted-foreground">Monitor OTA connectivity, sync health, and recent integration issues.</p>
    </div>
  );

  return (
    <PageContainer title="Channels" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
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
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Channel Health</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchChannels} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/Channel">Open model view</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {channels.map((channel) => (
              <div key={channel.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{channel.name}</p>
                    <Badge>{channel.channelType}</Badge>
                    <Badge variant="outline">{channel.syncStatus}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {channel.isActive ? 'Active' : 'Inactive'}
                    {channel.lastSyncAt ? ` • Last sync ${new Date(channel.lastSyncAt).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {!loading && channels.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No channels configured yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default ChannelsPage;
