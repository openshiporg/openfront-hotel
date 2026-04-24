'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bed,
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Hotel,
  CalendarCheck,
  CalendarX,
  Clock,
  Download
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, parseISO, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';

export interface HotelMetrics {
  occupancy: {
    current: number;
    previous: number;
    trend: number;
  };
  revenue: {
    today: number;
    mtd: number;
    ytd: number;
    forecast: number;
    previousMtd: number;
  };
  adr: {
    current: number;
    previous: number;
    trend: number;
  };
  revpar: {
    current: number;
    previous: number;
    trend: number;
  };
  arrivals: {
    today: number;
    tomorrow: number;
  };
  departures: {
    today: number;
    tomorrow: number;
  };
  inHouse: number;
  noShows: number;
  cancellations: number;
  bookingPace: {
    current: number;
    lastYear: number;
  };
}

export interface ChannelData {
  name: string;
  revenue: number;
  bookings: number;
  color: string;
}

export interface RoomTypePerformance {
  name: string;
  occupancy: number;
  revenue: number;
  adr: number;
}

export interface OccupancyForecast {
  date: string;
  forecast: number;
  onTheBooks: number;
  lastYear?: number;
}

interface ExecutiveDashboardProps {
  metrics: HotelMetrics | null;
  channelData: ChannelData[];
  roomTypePerformance: RoomTypePerformance[];
  occupancyForecast: OccupancyForecast[];
  occupancyTrend: { date: string; occupancy: number; revenue: number }[];
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  loading?: boolean;
}

const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function TrendIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  const isPositive = value >= 0;
  return (
    <span className={cn(
      'inline-flex items-center text-sm font-medium',
      isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
    )}>
      {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

export function ExecutiveDashboard({
  metrics,
  channelData,
  roomTypePerformance,
  occupancyForecast,
  occupancyTrend,
  selectedPeriod,
  onPeriodChange,
  loading = false,
}: ExecutiveDashboardProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name.toLowerCase().includes('revenue') 
                ? formatCurrency(entry.value)
                : entry.name.toLowerCase().includes('occupancy') || entry.name.toLowerCase().includes('forecast')
                ? formatPercent(entry.value)
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Executive Dashboard</h2>
          <p className="text-muted-foreground">Hotel performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="mtd">Month to Date</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" title="Export to PDF">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics ? formatPercent(metrics.occupancy.current) : '-'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {metrics && <TrendIndicator value={metrics.occupancy.trend} suffix="%" />}
              <span className="text-xs text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue (MTD)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics ? formatCurrency(metrics.revenue.mtd) : '-'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {metrics && (
                <TrendIndicator 
                  value={((metrics.revenue.mtd - metrics.revenue.previousMtd) / metrics.revenue.previousMtd) * 100} 
                  suffix="%" 
                />
              )}
              <span className="text-xs text-muted-foreground">vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ADR</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics ? formatCurrency(metrics.adr.current) : '-'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {metrics && <TrendIndicator value={metrics.adr.trend} suffix="%" />}
              <span className="text-xs text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RevPAR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics ? formatCurrency(metrics.revpar.current) : '-'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {metrics && <TrendIndicator value={metrics.revpar.trend} suffix="%" />}
              <span className="text-xs text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Operations */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <CalendarCheck className="h-5 w-5 text-green-600 dark:text-green-300" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.arrivals.today ?? 0}</p>
                <p className="text-xs text-muted-foreground">Arrivals Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <CalendarX className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.departures.today ?? 0}</p>
                <p className="text-xs text-muted-foreground">Departures Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <Hotel className="h-5 w-5 text-purple-600 dark:text-purple-300" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.inHouse ?? 0}</p>
                <p className="text-xs text-muted-foreground">In-House Guests</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-300" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.noShows ?? 0}</p>
                <p className="text-xs text-muted-foreground">No Shows (MTD)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                <CalendarX className="h-5 w-5 text-orange-600 dark:text-orange-300" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.cancellations ?? 0}</p>
                <p className="text-xs text-muted-foreground">Cancellations (MTD)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Occupancy & Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Occupancy & Revenue Trend</CardTitle>
            <CardDescription>Daily performance over selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={occupancyTrend}>
                  <defs>
                    <linearGradient id="colorOccupancy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={(value) => `$${(value/1000).toFixed(0)}K`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="occupancy"
                    name="Occupancy"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorOccupancy)"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Channel */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Channel</CardTitle>
            <CardDescription>Booking source distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="revenue"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Occupancy Forecast */}
      <Card>
        <CardHeader>
          <CardTitle>30-Day Occupancy Forecast</CardTitle>
          <CardDescription>Predicted occupancy vs on-the-books reservations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={occupancyForecast}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: 'currentColor' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'currentColor' }}
                  tickFormatter={(value) => `${value}%`}
                  domain={[0, 100]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="onTheBooks"
                  name="On The Books"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
                {occupancyForecast[0]?.lastYear !== undefined && (
                  <Line
                    type="monotone"
                    dataKey="lastYear"
                    name="Last Year"
                    stroke="#94a3b8"
                    strokeWidth={1}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Room Type Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Room Type Performance</CardTitle>
          <CardDescription>Occupancy and revenue by room category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomTypePerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" tick={{ fill: 'currentColor' }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  className="text-xs" 
                  tick={{ fill: 'currentColor' }}
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="occupancy" name="Occupancy %" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Booking Pace */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Booking Pace</CardTitle>
            <CardDescription>Current bookings vs same time last year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics?.bookingPace.current ?? 0}</p>
                <p className="text-sm text-muted-foreground">Bookings this period</p>
              </div>
              <div className="text-right">
                <p className="text-xl text-muted-foreground">{metrics?.bookingPace.lastYear ?? 0}</p>
                <p className="text-sm text-muted-foreground">Same period last year</p>
              </div>
            </div>
            {metrics && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Pace comparison</span>
                  <TrendIndicator 
                    value={((metrics.bookingPace.current - metrics.bookingPace.lastYear) / metrics.bookingPace.lastYear) * 100} 
                    suffix="%" 
                  />
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${Math.min((metrics.bookingPace.current / metrics.bookingPace.lastYear) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Forecast</CardTitle>
            <CardDescription>Monthly revenue projection</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics ? formatCurrency(metrics.revenue.forecast) : '-'}</p>
                <p className="text-sm text-muted-foreground">Forecasted revenue</p>
              </div>
              <div className="text-right">
                <p className="text-xl text-muted-foreground">{metrics ? formatCurrency(metrics.revenue.mtd) : '-'}</p>
                <p className="text-sm text-muted-foreground">Actual MTD</p>
              </div>
            </div>
            {metrics && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Progress to forecast</span>
                  <span>{((metrics.revenue.mtd / metrics.revenue.forecast) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full"
                    style={{ 
                      width: `${Math.min((metrics.revenue.mtd / metrics.revenue.forecast) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ExecutiveDashboard;
