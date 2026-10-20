'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';

import { CalendarDays, MousePointerClick } from 'lucide-react';
import { ReservationCalendar } from '@/features/platform/reservations/components/ReservationCalendar';
import { toast } from 'sonner';
import { StaffReservationForm } from '@/features/platform/reservations/components/StaffReservationForm';
import { MetaItem, PlatformPage } from '@/features/platform/components/PlatformPage';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
import {
  amendReservationStayAction,
  cancelReservationAction,
  getReservationCalendarWorkspace,
  updateReservationStatusAction,
} from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

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
    businessDate?: string;
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
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reservations, setReservations] = React.useState<ReservationCalendarItem[]>([]);
  const [rooms, setRooms] = React.useState<ReservationCalendarRoom[]>([]);
  const [businessDate, setBusinessDate] = React.useState<string | null>(null);
  const [visibleRange, setVisibleRange] = React.useState(initialCalendarRange);

  const handleViewRangeChange = React.useCallback((start: Date, end: Date) => {
    setVisibleRange(current => current.start.getTime() === start.getTime() && current.end.getTime() === end.getTime()
      ? current
      : { start, end });
  }, []);

  // Each read is numbered; a slower response for a range the user has left is discarded.
  const latestRequest = React.useRef(0);
  React.useEffect(() => () => { latestRequest.current += 1; }, []);
  const fetchCalendarData = React.useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const start = visibleRange.start.toISOString();
      const end = visibleRange.end.toISOString();
      const data = await getReservationCalendarWorkspace(start, end) as ReservationCalendarResponse['hotelReservationCalendar'];
      if (requestId !== latestRequest.current) return;

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
      if (data.businessDate) setBusinessDate(String(data.businessDate));
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      const message = error instanceof Error ? error.message : 'Unable to load reservation calendar data.';
      setError(message);
      toast.error('Reservation calendar unavailable', { description: message });
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [visibleRange]);

  React.useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const handleUpdateStayDates = React.useCallback(async (bookingId: string, checkInDate: string, checkOutDate: string) => {
    try {
      unwrapAction(await amendReservationStayAction(bookingId, checkInDate, checkOutDate));
      await fetchCalendarData();
      toast.success('Reservation dates updated', { description: 'The stay dates were saved and conflict-checked.' });
    } catch (error) {
      console.error('Failed to update reservation dates:', error);
      await fetchCalendarData();
      toast.error('Unable to update dates', { description: error instanceof Error ? error.message : 'The reservation dates could not be saved.' });
    }
  }, [fetchCalendarData]);

  const handleStatusChange = React.useCallback(async (bookingId: string, status: ReservationStatus) => {
    try {
      const response = unwrapAction(await updateReservationStatusAction(bookingId, status));
      await fetchCalendarData();
      const savedStatus = response.status;
      toast.success('Reservation updated', { description: savedStatus === 'cancellation_pending' ? 'No-show policy was applied; the provider refund is pending.' : `Status saved as ${savedStatus.replaceAll('_', ' ')}.` });
    } catch (error) {
      await fetchCalendarData();
      toast.error('Status change refused', { description: error instanceof Error ? error.message : 'The lifecycle transition was not saved.' });
      throw error;
    }
  }, [fetchCalendarData]);

  const handleCancel = React.useCallback(async (bookingId: string) => {
    if (!window.confirm('Cancel this reservation and apply its snapshotted refund policy?')) return;
    try {
      unwrapAction(await cancelReservationAction(bookingId));
      await fetchCalendarData();
      toast.success('Cancellation recorded', { description: 'Policy, folio, refund, inventory, and communication work were persisted.' });
    } catch (error) {
      await fetchCalendarData();
      toast.error('Cancellation refused', { description: error instanceof Error ? error.message : 'The cancellation was not saved.' });
    }
  }, [fetchCalendarData]);

  return (
    <PlatformPage
      title="Reservations"
      description="Room-by-room stay calendar. Select a stay for details and desk actions, or drag it to change dates."
      meta={(
        <>
          <MetaItem icon={CalendarDays}>14-day view · UTC business dates</MetaItem>
          <MetaItem icon={MousePointerClick}>Edges resize, body moves</MetaItem>
        </>
      )}
      actions={(
        <StaffReservationForm
          initialGuestId={searchParams?.get('guestId')}
          defaultOpen={searchParams?.get('new') === '1' || Boolean(searchParams?.get('guestId'))}
          onCreated={fetchCalendarData}
        />
      )}
    >
      {error ? <WorkspaceError message={error} onRetry={fetchCalendarData} title="Reservation calendar unavailable" /> : null}
      <ReservationCalendar
        businessDate={businessDate}
        reservations={reservations}
        rooms={rooms}
        loading={loading}
        onRefresh={fetchCalendarData}
        onViewRangeChange={handleViewRangeChange}
        onUpdateStayDates={handleUpdateStayDates}
        onStatusChange={handleStatusChange}
        onCancel={handleCancel}
        initialSearch={searchParams?.get('search') || ''}
      />
    </PlatformPage>
  );
}

export default ReservationsPage;
