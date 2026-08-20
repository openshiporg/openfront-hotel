'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';

import { ReservationCalendar } from '@/features/platform/reservations/components/ReservationCalendar';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { StaffReservationForm } from '@/features/platform/reservations/components/StaffReservationForm';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
import {
  amendReservationStayAction,
  cancelReservationAction,
  getReservationCalendarWorkspace,
  updateReservationStatusAction,
} from '../actions';

type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'cancellation_pending'
  | 'no_show';

interface ReservationCalendarItem {
  id: string;
  confirmationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  source: string;
  numberOfGuests: number;
  totalAmount: number;
  balanceDue: number;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
}

interface ReservationCalendarRoom {
  id: string;
  roomNumber: string;
  status: string;
  roomType?: { id: string; name: string } | null;
}

interface ReservationCalendarResponse {
  hotelReservationCalendar: {
    reservations: Array<{
    id: string;
    confirmationNumber: string;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    status: string;
    source: string;
    numberOfGuests: number;
    totalAmount: number;
    balanceDue: number;
    room?: { id: string; roomNumber: string } | null;
    roomType?: { id: string; name: string } | null;
  }>;
    rooms: ReservationCalendarRoom[];
  };
}

function initialCalendarRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 14 * 86_400_000) };
}

export function ReservationsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reservations, setReservations] = React.useState<ReservationCalendarItem[]>([]);
  const [rooms, setRooms] = React.useState<ReservationCalendarRoom[]>([]);
  const [visibleRange, setVisibleRange] = React.useState(initialCalendarRange);

  const handleViewRangeChange = React.useCallback((start: Date, end: Date) => {
    setVisibleRange(current => current.start.getTime() === start.getTime() && current.end.getTime() === end.getTime()
      ? current
      : { start, end });
  }, []);

  const fetchCalendarData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = visibleRange.start.toISOString();
      const end = visibleRange.end.toISOString();
      const data = await getReservationCalendarWorkspace(start, end) as ReservationCalendarResponse['hotelReservationCalendar'];

      const mappedReservations = (data.reservations || []).map((booking: any) => {
        return {
          id: booking.id,
          confirmationNumber: booking.confirmationNumber,
          guestName: booking.guestName,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          status: booking.status,
          source: booking.source,
          numberOfGuests: booking.numberOfGuests,
          totalAmount: booking.totalAmount,
          balanceDue: booking.balanceDue,
          roomId: booking.room?.id || null,
          roomNumber: booking.room?.roomNumber || null,
          roomTypeId: booking.roomType?.id || null,
          roomTypeName: booking.roomType?.name || null,
        };
      });

      setReservations(mappedReservations);
      setRooms(data.rooms || []);
    } catch (error) {
      console.error('Failed to load reservations:', error);
      const message = error instanceof Error ? error.message : 'Unable to load reservation calendar data.';
      setError(message);
      toast({
        title: 'Reservation calendar unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, visibleRange]);

  React.useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const handleUpdateStayDates = React.useCallback(async (bookingId: string, checkInDate: string, checkOutDate: string) => {
    try {
      await amendReservationStayAction(bookingId, checkInDate, checkOutDate);
      await fetchCalendarData();
      toast({
        title: 'Reservation dates updated',
        description: 'The stay dates were saved and conflict-checked.',
      });
    } catch (error) {
      console.error('Failed to update reservation dates:', error);
      await fetchCalendarData();
      toast({
        title: 'Unable to update dates',
        description: error instanceof Error ? error.message : 'The reservation dates could not be saved.',
        variant: 'destructive',
      });
    }
  }, [fetchCalendarData, toast]);

  const handleStatusChange = React.useCallback(async (bookingId: string, status: ReservationStatus) => {
    try {
      const response = await updateReservationStatusAction(bookingId, status);
      await fetchCalendarData();
      const savedStatus = response.status;
      toast({ title: 'Reservation updated', description: savedStatus === 'cancellation_pending' ? 'No-show policy was applied; the provider refund is pending.' : `Status saved as ${savedStatus.replaceAll('_', ' ')}.` });
    } catch (error) {
      await fetchCalendarData();
      toast({ title: 'Status change refused', description: error instanceof Error ? error.message : 'The lifecycle transition was not saved.', variant: 'destructive' });
      throw error;
    }
  }, [fetchCalendarData, toast]);

  const handleCancel = React.useCallback(async (bookingId: string) => {
    if (!window.confirm('Cancel this reservation and apply its snapshotted refund policy?')) return;
    try {
      await cancelReservationAction(bookingId);
      await fetchCalendarData();
      toast({ title: 'Cancellation recorded', description: 'Policy, folio, refund, inventory, and communication work were persisted.' });
    } catch (error) {
      await fetchCalendarData();
      toast({ title: 'Cancellation refused', description: error instanceof Error ? error.message : 'The cancellation was not saved.', variant: 'destructive' });
    }
  }, [fetchCalendarData, toast]);

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-lg font-semibold md:text-2xl">Reservations</h1><p className="text-muted-foreground">UTC business-date calendar and authoritative desk workflows</p></div>
      <StaffReservationForm
        initialGuestId={searchParams?.get('guestId')}
        defaultOpen={searchParams?.get('new') === '1' || Boolean(searchParams?.get('guestId'))}
        onCreated={fetchCalendarData}
      />
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Reservations' },
  ];

  return (
    <PageContainer title="Reservations" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full space-y-4 p-4 md:p-6">
        {error ? <WorkspaceError message={error} onRetry={fetchCalendarData} /> : null}
        <ReservationCalendar
          reservations={reservations}
          rooms={rooms}
          loading={loading}
          onRefresh={fetchCalendarData}
          onViewRangeChange={handleViewRangeChange}
          onUpdateStayDates={handleUpdateStayDates}
          onStatusChange={handleStatusChange}
          onCancel={handleCancel}
        />
      </div>
    </PageContainer>
  );
}

export default ReservationsPage;
