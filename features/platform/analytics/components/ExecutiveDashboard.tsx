'use client';

import * as React from 'react';
import { BarChart3, Bed, CalendarCheck, CalendarX, Download, ReceiptText, RefreshCw, WalletCards } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export type OperationalReportDay = {
  date: string;
  availableRoomNights: number;
  occupiedRoomNights: number;
  occupancyRate: number;
  roomRevenueMinor: number;
  taxMinor: number;
  feeMinor: number;
  totalRevenueMinor: number;
  adrMinor: number;
  revparMinor: number;
  arrivals: number;
  departures: number;
  newReservations: number;
  cancellations: number;
  noShows: number;
  paymentsMinor: number;
  refundsMinor: number;
};

export type OperationalReport = {
  demand?: string;
  summary: Omit<OperationalReportDay, 'date'> & {
    start: string;
    end: string;
    businessDate: string;
    currencyCode: string;
    openFolioBalanceMinor: number;
    openFolioCount: number;
    closedSnapshotDays: number;
    unclosedHistoricalDays: number;
    forecastDays: number;
  };
  days: OperationalReportDay[];
  channels: Array<{ source: string; bookings: number; revenueMinor: number }>;
  roomTypes: Array<{
    id: string;
    name: string;
    availableRoomNights: number;
    occupiedRoomNights: number;
    occupancyRate: number;
    roomRevenueMinor: number;
    adrMinor: number;
  }>;
};

function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amountMinor / 100);
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadReport(report: OperationalReport) {
  const columns: Array<keyof OperationalReportDay> = [
    'date', 'availableRoomNights', 'occupiedRoomNights', 'occupancyRate', 'roomRevenueMinor',
    'taxMinor', 'feeMinor', 'totalRevenueMinor', 'adrMinor', 'revparMinor', 'arrivals', 'departures',
    'newReservations', 'cancellations', 'noShows', 'paymentsMinor', 'refundsMinor',
  ];
  const rows = [columns.join(','), ...report.days.map(day => columns.map(column => csvCell(day[column])).join(','))];
  const blob = new Blob([`${rows.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hotel-operational-report-${report.summary.start.slice(0, 10)}-${report.summary.end.slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export function ExecutiveDashboard({
  report,
  selectedPeriod,
  onPeriodChange,
  onRefresh,
  loading = false,
}: {
  report: OperationalReport | null;
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}) {
  if (loading) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div>;
  if (!report) return <Card><CardContent className="py-12 text-center text-muted-foreground">No source-derived report is available for this period.</CardContent></Card>;
  const { summary } = report;
  const demand = report.demand ? JSON.parse(report.demand) : null;
  const chart = report.days.map(day => ({
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date)),
    occupancy: Number(day.occupancyRate.toFixed(1)),
    revenue: day.totalRevenueMinor / 100,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h2 className="text-2xl font-bold">Operational reports</h2><p className="text-muted-foreground">Room nights, posted folio revenue, recorded tenders, and outstanding balances.</p></div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedPeriod} onValueChange={onPeriodChange}><SelectTrigger className="w-44" aria-label="Reporting period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="mtd">Month to date</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="next30">Next 30 days</SelectItem></SelectContent></Select>
          <Button variant="outline" onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button variant="outline" onClick={() => downloadReport(report)}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Property business date {summary.businessDate.slice(0, 10)}. Calendar period {summary.start.slice(0, 10)} through {summary.end.slice(0, 10)} (exclusive end). {summary.closedSnapshotDays} days use preserved night-audit facts. {summary.forecastDays} open or future days show scheduled occupancy; revenue includes posted folio charges and corrections only, with payment and refund postings shown separately. Other charges include fees, add-ons and signed adjustments. These amounts are not a bank payout reconciliation.
        {summary.unclosedHistoricalDays > 0 ? <p className="mt-2 font-medium">{summary.unclosedHistoricalDays} historical days have no preserved close record. Their dated inventory and ledger are shown; missing historical outages cannot be reconstructed.</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Occupancy" value={`${summary.occupancyRate.toFixed(1)}%`} detail={`${summary.occupiedRoomNights} / ${summary.availableRoomNights} room nights`} icon={Bed} />
        <Metric title="ADR" value={money(summary.adrMinor, summary.currencyCode)} detail="Room revenue / occupied room nights" icon={BarChart3} />
        <Metric title="RevPAR" value={money(summary.revparMinor, summary.currencyCode)} detail="Room revenue / available room nights" icon={ReceiptText} />
        <Metric title="Posted folio revenue" value={money(summary.totalRevenueMinor, summary.currencyCode)} detail={`${money(summary.roomRevenueMinor, summary.currencyCode)} room · ${money(summary.taxMinor, summary.currencyCode)} tax · ${money(summary.feeMinor, summary.currencyCode)} other`} icon={WalletCards} />
        <Metric title="Payments" value={money(summary.paymentsMinor, summary.currencyCode)} detail={`${money(summary.refundsMinor, summary.currencyCode)} refunded`} icon={WalletCards} />
        <Metric title="Open folio exposure" value={money(summary.openFolioBalanceMinor, summary.currencyCode)} detail={`${summary.openFolioCount} open folios`} icon={ReceiptText} />
        <Metric title="Arrivals / departures" value={`${summary.arrivals} / ${summary.departures}`} detail={`${summary.newReservations} reservations created`} icon={CalendarCheck} />
        <Metric title="Cancellations / no-shows" value={`${summary.cancellations} / ${summary.noShows}`} detail="Recorded lifecycle outcomes" icon={CalendarX} />
      </div>

      <Card><CardHeader><CardTitle>Daily occupancy and posted revenue</CardTitle><CardDescription>No extrapolated forecast or seeded DailyMetrics values.</CardDescription></CardHeader><CardContent><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis yAxisId="occupancy" domain={[0, 100]} tickFormatter={value => `${value}%`} /><YAxis yAxisId="revenue" orientation="right" tickFormatter={value => money(Math.round(value * 100), summary.currencyCode)} /><Tooltip formatter={(value: any, name) => name === 'occupancy' ? `${Number(value).toFixed(1)}%` : money(Math.round(Number(value) * 100), summary.currencyCode)} /><Area yAxisId="occupancy" type="monotone" dataKey="occupancy" stroke="#2563eb" fill="#93c5fd" /><Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#059669" fill="#a7f3d0" /></AreaChart></ResponsiveContainer></div></CardContent></Card>

      {demand?.days?.length > 0 && <Card><CardHeader><CardTitle>On-books forecast and booking pace</CardTitle><CardDescription>As of business date {demand.asOfBusinessDate}, captured {demand.capturedAt}. Outlook {demand.start} through {demand.end} (exclusive, at most 90 days).</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{demand.basis}</p><div className="grid gap-3 md:grid-cols-3"><p><strong>{demand.totals.roomNights}</strong> on-books room nights / {demand.totals.availableRoomNights} available</p><p><strong>{money(demand.totals.roomRevenueMinor, summary.currencyCode)}</strong> quoted room revenue; {demand.totals.unpricedRoomNights} nights lack valid pricing</p><p><strong>{demand.leadTime.averageDays ?? 'Unavailable'}</strong> days average booking lead time · {demand.leadTime.reservations} reservations</p></div><div className="flex flex-wrap gap-4">{demand.leadTime.bands.map((band: any) => <p key={band.label}>{band.label}: {band.reservations}</p>)}</div><table className="w-full text-sm"><thead><tr className="border-b text-left"><th>Comparison</th><th>Preserved as-of date</th><th>Prior room nights</th><th>Net pickup nights</th><th>Net quoted room pickup</th></tr></thead><tbody>{demand.pace.map((row: any) => <tr key={row.daysAgo} className="border-b"><td className="py-2">{row.daysAgo} days earlier</td><td>{row.asOfBusinessDate || 'No preserved baseline'}</td><td>{row.priorRoomNights ?? '—'}</td><td>{row.pickupRoomNights ?? '—'}</td><td>{row.pickupRoomRevenueMinor === null ? '—' : money(row.pickupRoomRevenueMinor, summary.currencyCode)}</td></tr>)}</tbody></table><details><summary className="cursor-pointer">Daily on-books forecast</summary><table className="mt-3 w-full text-sm"><thead><tr className="border-b text-left"><th>Date</th><th>On-books nights</th><th>Available nights</th><th>Quoted room revenue</th></tr></thead><tbody>{demand.days.map((day: any) => <tr key={day.date} className="border-b"><td className="py-2">{day.date}</td><td>{day.onBooksRoomNights}</td><td>{day.availableRoomNights}</td><td>{money(day.roomRevenueMinor, summary.currencyCode)}{day.unpricedRoomNights ? ` (${day.unpricedRoomNights} unpriced)` : ''}</td></tr>)}</tbody></table></details></CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Booking source</CardTitle><CardDescription>Posted charges and corrections attributed to their reservation source.</CardDescription></CardHeader><CardContent className="space-y-3">{report.channels.map(channel => <div key={channel.source} className="flex items-center justify-between border-b pb-3"><div><p className="font-medium capitalize">{channel.source.replaceAll('_', ' ')}</p><p className="text-sm text-muted-foreground">{channel.bookings} reservations</p></div><p className="font-medium">{money(channel.revenueMinor, summary.currencyCode)}</p></div>)}{!report.channels.length ? <p className="text-sm text-muted-foreground">No posted stay revenue in this period.</p> : null}</CardContent></Card>
        <Card><CardHeader><CardTitle>Room-type performance</CardTitle><CardDescription>Physical capacity and occupied room nights for the selected period.</CardDescription></CardHeader><CardContent className="space-y-3">{report.roomTypes.map(room => <div key={room.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b pb-3"><div><p className="font-medium">{room.name}</p><p className="text-sm text-muted-foreground">{room.occupiedRoomNights} / {room.availableRoomNights} room nights</p></div><p>{room.occupancyRate.toFixed(1)}%</p><p>{money(room.adrMinor, summary.currencyCode)} ADR</p></div>)}</CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Daily folio and room-night detail</CardTitle><CardDescription>The CSV export contains these exact integer-minor-unit facts.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Date</th><th>Occ.</th><th>ADR</th><th>RevPAR</th><th>Revenue</th><th>Tax</th><th>Payments</th><th>Refunds</th><th>Arr.</th><th>Dep.</th><th>Cancel</th></tr></thead><tbody>{report.days.map(day => <tr key={day.date} className="border-b"><td className="p-2">{day.date.slice(0, 10)}</td><td>{day.occupancyRate.toFixed(1)}%</td><td>{money(day.adrMinor, summary.currencyCode)}</td><td>{money(day.revparMinor, summary.currencyCode)}</td><td>{money(day.totalRevenueMinor, summary.currencyCode)}</td><td>{money(day.taxMinor, summary.currencyCode)}</td><td>{money(day.paymentsMinor, summary.currencyCode)}</td><td>{money(day.refundsMinor, summary.currencyCode)}</td><td>{day.arrivals}</td><td>{day.departures}</td><td>{day.cancellations}</td></tr>)}</tbody></table></CardContent></Card>
    </div>
  );
}

function Metric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }> }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

export default ExecutiveDashboard;
