'use client';

import React from 'react';
import Link from 'next/link';
import { gql, request } from 'graphql-request';
import { CreditCard, DollarSign, RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

const GET_PAYMENTS = gql`
  query GetPaymentsDashboard {
    bookingPayments(orderBy: { createdAt: desc }, take: 20) {
      id
      paymentReference
      amount
      currency
      paymentType
      paymentMethod
      status
      booking {
        id
        confirmationNumber
        guestName
      }
      paymentProvider {
        id
        name
        code
      }
      createdAt
    }
  }
`;

function formatCurrency(amount?: number | null) {
  const value = Number(amount || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function PaymentsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [payments, setPayments] = React.useState<any[]>([]);

  const fetchPayments = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const data = await request<any>(endpoint, GET_PAYMENTS);
      setPayments(data.bookingPayments || []);
    } catch (error) {
      console.error('Failed to load payments:', error);
      toast({
        title: 'Error',
        description: 'Unable to load payments dashboard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const completed = payments.filter((payment) => payment.status === 'completed');
  const refunded = payments.filter((payment) => payment.status === 'refunded');
  const failed = payments.filter((payment) => payment.status === 'failed');

  const capturedTotal = completed.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const refundedTotal = refunded.reduce((sum, payment) => sum + Math.abs(Number(payment.amount || 0)), 0);

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Payments' },
  ];

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Payments</h1>
      <p className="text-muted-foreground">Recent booking payments, refunds, and payment-provider activity.</p>
    </div>
  );

  return (
    <PageContainer title="Payments" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Captured</p>
                  <p className="text-2xl font-semibold">{formatCurrency(capturedTotal)}</p>
                </div>
                <DollarSign className="h-6 w-6 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed Payments</p>
                  <p className="text-2xl font-semibold">{completed.length}</p>
                </div>
                <CreditCard className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Refunded</p>
                  <p className="text-2xl font-semibold">{formatCurrency(refundedTotal)}</p>
                </div>
                <RotateCcw className="h-6 w-6 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-semibold">{failed.length}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-rose-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Payment Activity</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/BookingPayment">Open model view</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{payment.paymentReference}</p>
                    <Badge variant="outline">{payment.paymentProvider?.name || payment.paymentMethod}</Badge>
                    <Badge>{payment.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {payment.booking?.guestName || 'Unknown guest'} • {payment.booking?.confirmationNumber || 'No booking'}
                  </p>
                  <p className="text-sm text-muted-foreground">{payment.paymentType} • {payment.paymentMethod}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatCurrency(payment.amount)}</p>
                </div>
              </div>
            ))}
            {!loading && payments.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No payment records found yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default PaymentsPage;
