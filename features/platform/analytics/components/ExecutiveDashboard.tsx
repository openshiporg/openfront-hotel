'use client';

import * as React from 'react';
import { BarChart3 } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { Meter, StatStrip } from '@/features/platform/components/Stats';
import { Callout, Disclosure, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceEmpty } from '@/features/platform/components/WorkspaceControls';
import { formatStay, humanize } from '@/features/platform/lib/format';

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

export const REPORT_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'mtd', label: 'MTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'next30', label: 'Next 30' },
] as const;

function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amountMinor / 100);
}

function compactMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 1 }).format(amountMinor / 100);
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadReport(report: OperationalReport) {
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

const SERIES_COLOR = 'var(--chart-2)';
const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; format: (value: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums text-foreground">{format(Number(payload[0].value))}</p>
    </div>
  );
}

export function ExecutiveDashboard({
  report,
  loading = false,
}: {
  report: OperationalReport | null;
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading report">
        <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse bg-card" />)}</div>
        <div className="grid gap-6 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-lg bg-muted/50" /><div className="h-72 animate-pulse rounded-lg bg-muted/50" /></div>
      </div>
    );
  }
  if (!report) {
    return <Panel><WorkspaceEmpty icon={BarChart3} title="No report for this period" description="No source-derived figures are available. Choose another period or refresh." /></Panel>;
  }

  const { summary } = report;
  const currency = summary.currencyCode;
  const demand = report.demand ? JSON.parse(report.demand) : null;
  const chart = report.days.map(day => ({
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date)),
    occupancy: Number(day.occupancyRate.toFixed(1)),
    revenue: day.totalRevenueMinor,
  }));
  const maxSourceRevenue = Math.max(1, ...report.channels.map(channel => channel.revenueMinor));
  const maxLeadBand = Math.max(1, ...(demand?.leadTime?.bands || []).map((band: any) => band.reservations));

  return (
    <div className="space-y-6">
      <Callout tone={summary.unclosedHistoricalDays > 0 ? 'warning' : 'neutral'} title={`${formatStay(summary.start)} – ${formatStay(summary.end)} (end exclusive) · business date ${formatStay(summary.businessDate)}`}>
        {summary.closedSnapshotDays} days use preserved night-audit facts; {summary.forecastDays} open or future days show scheduled occupancy. Revenue is posted folio charges and corrections only — payments and refunds are shown separately, and none of this is a bank payout reconciliation.
        {summary.unclosedHistoricalDays > 0 ? <span className="mt-1 block font-medium">{summary.unclosedHistoricalDays} historical days have no preserved close record. Their dated inventory and ledger are shown; missing historical outages cannot be reconstructed.</span> : null}
      </Callout>

      <StatStrip
        items={[
          { label: 'Occupancy', value: `${summary.occupancyRate.toFixed(1)}%`, hint: `${summary.occupiedRoomNights} / ${summary.availableRoomNights} room nights` },
          { label: 'ADR', value: money(summary.adrMinor, currency), hint: 'Room revenue ÷ occupied nights' },
          { label: 'RevPAR', value: money(summary.revparMinor, currency), hint: 'Room revenue ÷ available nights' },
          { label: 'Posted revenue', value: money(summary.totalRevenueMinor, currency), hint: `${compactMoney(summary.roomRevenueMinor, currency)} room · ${compactMoney(summary.taxMinor, currency)} tax · ${compactMoney(summary.feeMinor, currency)} other` },
        ]}
      />
      <StatStrip
        items={[
          { label: 'Payments recorded', value: money(summary.paymentsMinor, currency), tone: 'success', hint: `${money(summary.refundsMinor, currency)} refunded` },
          { label: 'Open folio exposure', value: money(summary.openFolioBalanceMinor, currency), tone: summary.openFolioBalanceMinor > 0 ? 'warning' : 'neutral', hint: `${summary.openFolioCount} open folios` },
          { label: 'Arrivals / departures', value: `${summary.arrivals} / ${summary.departures}`, tone: 'info', hint: `${summary.newReservations} reservations created` },
          { label: 'Cancellations / no-shows', value: `${summary.cancellations} / ${summary.noShows}`, tone: summary.cancellations + summary.noShows ? 'danger' : 'neutral', hint: 'Recorded lifecycle outcomes' },
        ]}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Daily occupancy" description="Occupied ÷ available room nights." />
          <PanelBody className="pl-1 sm:pl-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="occupancyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} tickFormatter={value => `${value}%`} />
                  <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }} content={<ChartTooltip format={value => `${value.toFixed(1)}% occupied`} />} />
                  <Area type="monotone" dataKey="occupancy" stroke={SERIES_COLOR} strokeWidth={2} fill="url(#occupancyFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Daily posted revenue" description="Folio charges and corrections; no extrapolated forecast." />
          <PanelBody className="pl-1 sm:pl-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={value => compactMoney(Number(value), currency)} />
                  <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<ChartTooltip format={value => money(value, currency)} />} />
                  <Bar dataKey="revenue" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelBody>
        </Panel>
      </div>

      {demand?.days?.length > 0 ? (
        <Panel>
          <PanelHeader title="On-books forecast & booking pace" description={`As of business date ${demand.asOfBusinessDate}, captured ${demand.capturedAt}. Outlook ${demand.start} to ${demand.end} (exclusive, at most 90 days).`} />
          <PanelBody className="space-y-6">
            <p className="text-xs leading-5 text-muted-foreground">{demand.basis}</p>
            <StatStrip
              items={[
                { label: 'On-books room nights', value: demand.totals.roomNights, hint: `of ${demand.totals.availableRoomNights} available` },
                { label: 'Quoted room revenue', value: money(demand.totals.roomRevenueMinor, currency), hint: `${demand.totals.unpricedRoomNights} nights lack valid pricing` },
                { label: 'Average lead time', value: demand.leadTime.averageDays ?? '—', hint: `days · ${demand.leadTime.reservations} reservations` },
              ]}
            />
            {demand.leadTime.bands?.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Lead-time distribution</p>
                <ul className="space-y-1.5">
                  {demand.leadTime.bands.map((band: any) => (
                    <li key={band.label} className="grid grid-cols-[7rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs">
                      <span className="truncate text-muted-foreground">{band.label}</span>
                      <Meter value={band.reservations} max={maxLeadBand} tone="info" label={`${band.label} reservations`} className="h-2" />
                      <span className="text-right tabular-nums">{band.reservations}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-lg border">
              <DataTable minWidth="min-w-[640px]">
                <THead><tr><Th>Comparison</Th><Th>Preserved as-of</Th><Th align="right">Prior nights</Th><Th align="right">Net pickup nights</Th><Th align="right">Net quoted pickup</Th></tr></THead>
                <TBody>
                  {demand.pace.map((row: any) => (
                    <Tr key={row.daysAgo}>
                      <Td>{row.daysAgo} days earlier</Td>
                      <Td className="text-muted-foreground">{row.asOfBusinessDate || 'No preserved baseline'}</Td>
                      <Td numeric align="right">{row.priorRoomNights ?? '—'}</Td>
                      <Td numeric align="right">{row.pickupRoomNights ?? '—'}</Td>
                      <Td numeric align="right">{row.pickupRoomRevenueMinor === null ? '—' : money(row.pickupRoomRevenueMinor, currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </DataTable>
            </div>
            <Disclosure title="Daily on-books forecast" badge={<span className="text-xs tabular-nums text-muted-foreground">{demand.days.length} days</span>}>
              <div className="overflow-hidden rounded-lg border">
                <DataTable minWidth="min-w-[520px]">
                  <THead><tr><Th>Date</Th><Th align="right">On-books nights</Th><Th align="right">Available nights</Th><Th align="right">Quoted room revenue</Th></tr></THead>
                  <TBody>
                    {demand.days.map((day: any) => (
                      <Tr key={day.date}>
                        <Td className="whitespace-nowrap">{day.date}</Td>
                        <Td numeric align="right">{day.onBooksRoomNights}</Td>
                        <Td numeric align="right">{day.availableRoomNights}</Td>
                        <Td numeric align="right">{money(day.roomRevenueMinor, currency)}{day.unpricedRoomNights ? <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">({day.unpricedRoomNights} unpriced)</span> : null}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </DataTable>
              </div>
            </Disclosure>
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Booking source" description="Posted charges and corrections attributed to each reservation source." />
          {report.channels.length ? (
            <DataTable minWidth="min-w-[420px]">
              <THead><tr><Th>Source</Th><Th align="right">Reservations</Th><Th className="w-[35%]"><span className="sr-only">Share</span></Th><Th align="right">Revenue</Th></tr></THead>
              <TBody>
                {report.channels.map(channel => (
                  <Tr key={channel.source}>
                    <Td className="font-medium">{humanize(channel.source)}</Td>
                    <Td numeric align="right">{channel.bookings}</Td>
                    <Td><Meter value={channel.revenueMinor} max={maxSourceRevenue} tone="info" label={`${humanize(channel.source)} revenue share`} /></Td>
                    <Td numeric align="right" className="font-medium">{money(channel.revenueMinor, currency)}</Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          ) : <WorkspaceEmpty compact title="No posted stay revenue" description="No source has posted revenue in this period." />}
        </Panel>
        <Panel>
          <PanelHeader title="Room-type performance" description="Physical capacity and occupied room nights." />
          {report.roomTypes.length ? (
            <DataTable minWidth="min-w-[480px]">
              <THead><tr><Th>Room type</Th><Th align="right">Room nights</Th><Th align="right">Occupancy</Th><Th align="right">ADR</Th></tr></THead>
              <TBody>
                {report.roomTypes.map(room => (
                  <Tr key={room.id}>
                    <Td className="font-medium">{room.name}</Td>
                    <Td numeric align="right" className="text-muted-foreground">{room.occupiedRoomNights} / {room.availableRoomNights}</Td>
                    <Td numeric align="right">{room.occupancyRate.toFixed(1)}%</Td>
                    <Td numeric align="right">{money(room.adrMinor, currency)}</Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          ) : <WorkspaceEmpty compact title="No room types" description="Configure room types to see performance." />}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Daily detail" description="The CSV export contains these exact integer-minor-unit facts." />
        <div>
          <DataTable minWidth="min-w-[960px]" className="max-h-[32rem] overflow-auto">
            <THead sticky>
              <tr><Th>Date</Th><Th align="right">Occ.</Th><Th align="right">ADR</Th><Th align="right">RevPAR</Th><Th align="right">Revenue</Th><Th align="right">Tax</Th><Th align="right">Payments</Th><Th align="right">Refunds</Th><Th align="right">Arr.</Th><Th align="right">Dep.</Th><Th align="right">Cxl.</Th></tr>
            </THead>
            <TBody>
              {report.days.map(day => (
                <Tr key={day.date}>
                  <Td className="whitespace-nowrap">{formatStay(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</Td>
                  <Td numeric align="right">{day.occupancyRate.toFixed(1)}%</Td>
                  <Td numeric align="right">{money(day.adrMinor, currency)}</Td>
                  <Td numeric align="right">{money(day.revparMinor, currency)}</Td>
                  <Td numeric align="right" className="font-medium">{money(day.totalRevenueMinor, currency)}</Td>
                  <Td numeric align="right" className="text-muted-foreground">{money(day.taxMinor, currency)}</Td>
                  <Td numeric align="right">{money(day.paymentsMinor, currency)}</Td>
                  <Td numeric align="right" className="text-muted-foreground">{money(day.refundsMinor, currency)}</Td>
                  <Td numeric align="right">{day.arrivals}</Td>
                  <Td numeric align="right">{day.departures}</Td>
                  <Td numeric align="right">{day.cancellations}</Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
        </div>
      </Panel>
    </div>
  );
}

export default ExecutiveDashboard;
