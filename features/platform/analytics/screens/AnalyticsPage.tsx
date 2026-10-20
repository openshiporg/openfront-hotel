'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { CalendarDays, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadReport, ExecutiveDashboard, REPORT_PERIODS, type OperationalReport } from '@/features/platform/analytics/components/ExecutiveDashboard';
import { toast } from 'sonner';
import { Segmented } from '@/features/platform/components/FilterTabs';
import { MetaItem, PlatformPage } from '@/features/platform/components/PlatformPage';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
import { formatStay } from '@/features/platform/lib/format';
import { getOperationalReport } from '../actions';

function reportRange(period: string, businessDate: string) {
  const now = new Date(businessDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addUtcDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
  const tomorrow = addUtcDays(today, 1);
  if (period === 'today') return { start: today, end: tomorrow };
  if (period === '7d') return { start: addUtcDays(tomorrow, -7), end: tomorrow };
  if (period === 'mtd') return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: tomorrow };
  if (period === 'ytd') return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: tomorrow };
  if (period === 'next30') return { start: today, end: addUtcDays(today, 30) };
  return { start: addUtcDays(tomorrow, -30), end: tomorrow };
}

export function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPeriod = searchParams?.get('period') || '30d';
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<OperationalReport | null>(null);
  const [businessDate, setBusinessDate] = React.useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  });

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = reportRange(selectedPeriod, businessDate);
      const report = await getOperationalReport(start.toISOString(), end.toISOString()) as OperationalReport;
      setReport(report);
      const reportedBusinessDate = report.summary.businessDate;
      if (reportedBusinessDate.slice(0, 10) !== businessDate.slice(0, 10)) setBusinessDate(reportedBusinessDate);
    } catch (error) {
      console.error('Failed to fetch operational report:', error);
      setReport(null);
      const message = error instanceof Error ? error.message : 'Source records could not be aggregated.';
      setError(message);
      toast.error('Report unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, businessDate]);

  React.useEffect(() => { void fetchData(); }, [fetchData]);

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('period', period);
    router.push(`?${params.toString()}`);
  };

  return (
    <PlatformPage
      title="Analytics"
      description="Occupancy, ADR, RevPAR, posted revenue, tax, payments, refunds and folio exposure — derived from source records."
      meta={<MetaItem icon={CalendarDays}>Business date {formatStay(businessDate)}</MetaItem>}
      actions={(
        <>
          <Segmented label="Reporting period" value={selectedPeriod} onChange={handlePeriodChange} options={REPORT_PERIODS.map((period) => ({ value: period.value, label: period.label }))} />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button variant="outline" size="sm" disabled={!report} onClick={() => report && downloadReport(report)}><Download aria-hidden="true" />Export CSV</Button>
        </>
      )}
    >
      {error ? <WorkspaceError message={error} onRetry={fetchData} title="Report unavailable" /> : null}
      <ExecutiveDashboard report={report} selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} onRefresh={fetchData} loading={loading} />
    </PlatformPage>
  );
}
