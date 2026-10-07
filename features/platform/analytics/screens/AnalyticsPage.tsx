'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ExecutiveDashboard, type OperationalReport } from '@/features/platform/analytics/components/ExecutiveDashboard';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
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
  const { toast } = useToast();
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
      toast({ title: 'Report unavailable', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, businessDate, toast]);

  React.useEffect(() => { void fetchData(); }, [fetchData]);

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('period', period);
    router.push(`?${params.toString()}`);
  };

  return (
    <PageContainer
      title="Operational reports"
      header={<div><h1 className="text-lg font-semibold md:text-2xl">Operational reports</h1><p className="text-muted-foreground">Occupancy, ADR, RevPAR, revenue, tax, payment, refund, and folio reconciliation.</p></div>}
      breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Reports' }]}
    >
      <div className="w-full space-y-4 p-4 md:p-6">{error ? <WorkspaceError message={error} onRetry={fetchData} /> : null}<ExecutiveDashboard report={report} selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} onRefresh={fetchData} loading={loading} /></div>
    </PageContainer>
  );
}
