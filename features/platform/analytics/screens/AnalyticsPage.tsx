'use client';

import React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { request } from 'graphql-request';
import { ExecutiveDashboard, HotelMetrics, ChannelData, RoomTypePerformance, OccupancyForecast } from '@/features/dashboard/analytics/ExecutiveDashboard';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { GET_ANALYTICS_DATA } from '../queries';

export function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const selectedPeriod = searchParams?.get('period') || '30d';

  const [loading, setLoading] = React.useState(true);
  const [metrics, setMetrics] = React.useState<HotelMetrics | null>(null);
  const [channelData, setChannelData] = React.useState<ChannelData[]>([]);
  const [roomTypePerformance, setRoomTypePerformance] = React.useState<RoomTypePerformance[]>([]);
  const [occupancyForecast, setOccupancyForecast] = React.useState<OccupancyForecast[]>([]);
  const [occupancyTrend, setOccupancyTrend] = React.useState<{ date: string; occupancy: number; revenue: number }[]>([]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const data: any = await request(endpoint, GET_ANALYTICS_DATA);

      if (!data.dailyMetrics || data.dailyMetrics.length === 0) {
        // If no real data yet, keep skeletons or show empty state
        setLoading(false);
        return;
      }

      const latest = data.dailyMetrics[0];
      const previous = data.dailyMetrics[1] || latest;

      const centsToDollars = (value: number | null | undefined) => (value || 0) / 100;

      const hotelMetrics: HotelMetrics = {
        occupancy: {
          current: latest.occupancyRate || 0,
          previous: previous.occupancyRate || 0,
          trend: (latest.occupancyRate || 0) - (previous.occupancyRate || 0),
        },
        revenue: {
          today: centsToDollars(latest.totalRevenue),
          mtd: data.dailyMetrics.reduce((sum: number, m: any) => sum + centsToDollars(m.totalRevenue), 0),
          ytd: data.dailyMetrics.reduce((sum: number, m: any) => sum + centsToDollars(m.totalRevenue), 0),
          forecast: centsToDollars(latest.totalRevenue) * 30,
          previousMtd: centsToDollars(previous.totalRevenue) * 30,
        },
        adr: {
          current: centsToDollars(latest.averageDailyRate),
          previous: centsToDollars(previous.averageDailyRate),
          trend: centsToDollars(latest.averageDailyRate) - centsToDollars(previous.averageDailyRate),
        },
        revpar: {
          current: centsToDollars(latest.revenuePerAvailableRoom),
          previous: centsToDollars(previous.revenuePerAvailableRoom),
          trend: centsToDollars(latest.revenuePerAvailableRoom) - centsToDollars(previous.revenuePerAvailableRoom),
        },
        arrivals: {
          today: latest.checkIns || 0,
          tomorrow: 0,
        },
        departures: {
          today: latest.checkOuts || 0,
          tomorrow: 0,
        },
        inHouse: 0,
        noShows: 0,
        cancellations: latest.cancellations || 0,
        bookingPace: {
          current: latest.newReservations || 0,
          lastYear: 0,
        },
      };

      const channels: Record<string, { revenue: number, bookings: number }> = {};
      (data.bookings || []).forEach((b: any) => {
        const source = b.source || 'Direct';
        if (!channels[source]) channels[source] = { revenue: 0, bookings: 0 };
        channels[source].revenue += b.totalAmount || 0;
        channels[source].bookings += 1;
      });

      const channelColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];
      const mappedChannelData: ChannelData[] = Object.entries(channels).map(([name, val], i) => ({
        name,
        revenue: val.revenue,
        bookings: val.bookings,
        color: channelColors[i % channelColors.length],
      }));

      const mappedRoomTypePerformance: RoomTypePerformance[] = (data.roomTypes || []).map((rt: any) => {
        const totalRooms = rt.rooms?.length || 0;
        const occupiedRooms = rt.rooms?.filter((r: any) => r.status === 'occupied').length || 0;
        return {
          name: rt.name,
          occupancy: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
          revenue: 0, // Need more granular revenue per room type
          adr: 0,
        };
      });

      const mappedOccupancyTrend = data.dailyMetrics.map((m: any) => ({
        date: format(parseISO(m.date), 'MMM d'),
        occupancy: Math.round(m.occupancyRate || 0),
        revenue: Math.round(centsToDollars(m.totalRevenue || 0)),
      })).reverse();

      setMetrics(hotelMetrics);
      setChannelData(mappedChannelData);
      setRoomTypePerformance(mappedRoomTypePerformance);
      setOccupancyTrend(mappedOccupancyTrend);
      
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      toast({
        title: 'Error',
        description: 'Failed to load analytics data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData, selectedPeriod]);

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('period', period);
    router.push(`?${params.toString()}`);
  };

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Analytics</h1>
      <p className="text-muted-foreground">Hotel performance metrics and insights</p>
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Analytics' },
  ];

  return (
    <PageContainer title="Analytics" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full p-4 md:p-6">
        <ExecutiveDashboard
          metrics={metrics}
          channelData={channelData}
          roomTypePerformance={roomTypePerformance}
          occupancyForecast={occupancyForecast}
          occupancyTrend={occupancyTrend}
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          loading={loading}
        />
      </div>
    </PageContainer>
  );
}
