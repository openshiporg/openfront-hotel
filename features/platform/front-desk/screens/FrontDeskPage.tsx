'use client';

import React from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FrontDesk } from '@/features/platform/reservations/components/FrontDesk';
import { toast } from 'sonner';
import { StaffReservationForm } from '@/features/platform/reservations/components/StaffReservationForm';
import { MetaItem, PlatformPage } from '@/features/platform/components/PlatformPage';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
import { formatStay } from '@/features/platform/lib/format';
import {
  assignFrontDeskRoom,
  cancelFrontDeskBooking,
  getFrontDeskWorkspace,
  resolveFrontDeskModification,
  updateFrontDeskBookingStatus,
} from '../actions';

type FrontDeskStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'cancellation_pending'
  | 'no_show';

interface FrontDeskReservationItem {
  id: string;
  confirmationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: FrontDeskStatus;
  numberOfGuests: number;
  totalAmount: number;
  balanceDue: number;
  source: string;
  internalNotes?: string | null;
  hasPendingModificationRequest: boolean;
  pendingModificationRequest?: {
    id: string;
    requestedCheckInDate?: string | null;
    requestedCheckOutDate?: string | null;
    guestMessage?: string | null;
  } | null;
  roomAssignments?: Array<{
    room?: { id: string; roomNumber: string; status?: string | null } | null;
    roomType?: { id: string; name: string } | null;
  }>;
}

interface FrontDeskRoomOption {
  id: string;
  roomNumber: string;
  status: string;
  roomType?: { id: string; name: string } | null;
}

interface FrontDeskResponse {
  hotelFrontDesk: {
    businessDate: string;
    reservations: FrontDeskReservationItem[];
    rooms: FrontDeskRoomOption[];
  };
}

export function FrontDeskPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reservations, setReservations] = React.useState<Array<{
    id: string;
    confirmationNumber: string;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    status: FrontDeskStatus;
    numberOfGuests: number;
    totalAmount: number;
    balanceDue: number;
    source: string;
    internalNotes: string | null;
    hasPendingModificationRequest: boolean;
    pendingModificationRequest: {
      id: string;
      requestedCheckInDate?: string | null;
      requestedCheckOutDate?: string | null;
      guestMessage?: string | null;
    } | null;
    roomNumber: string | null;
    roomStatus: string | null;
    roomTypeId: string | null;
    roomTypeName: string | null;
  }>>([]);
  const [availableRooms, setAvailableRooms] = React.useState<FrontDeskRoomOption[]>([]);
  const [businessDate, setBusinessDate] = React.useState('');

  const fetchFrontDeskData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFrontDeskWorkspace() as FrontDeskResponse['hotelFrontDesk'];

      const mappedReservations = (data.reservations || []).map((booking: any) => {
        return {
          id: booking.id,
          confirmationNumber: booking.confirmationNumber,
          guestName: booking.guestName,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          status: booking.status,
          numberOfGuests: booking.numberOfGuests,
          totalAmount: booking.totalAmount,
          balanceDue: booking.balanceDue,
          source: booking.source,
          internalNotes: booking.internalNotes || null,
          hasPendingModificationRequest: Boolean(booking.hasPendingModificationRequest),
          pendingModificationRequest: booking.pendingModificationRequest || null,
          roomNumber: booking.room?.roomNumber || null,
          roomStatus: booking.room?.status || null,
          roomTypeId: booking.roomType?.id || null,
          roomTypeName: booking.roomType?.name || null,
        };
      });

      setReservations(mappedReservations);
      setAvailableRooms(data.rooms || []);
      setBusinessDate(data.businessDate || '');
    } catch (error) {
      console.error('Failed to load front desk data:', error);
      const message = error instanceof Error ? error.message : 'Unable to load front desk reservations.';
      setError(message);
      toast.error('Front desk unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchFrontDeskData();
  }, [fetchFrontDeskData]);

  const attemptKeys = React.useRef(new Map<string, string>());
  const attemptKey = (intent: string) => {
    if (!attemptKeys.current.has(intent)) attemptKeys.current.set(intent, crypto.randomUUID());
    return attemptKeys.current.get(intent)!;
  };

  const handleStatusChange = React.useCallback(async (bookingId: string, status: FrontDeskStatus) => {
    try {
      const response = await updateFrontDeskBookingStatus(bookingId, status, attemptKey(`status:${bookingId}:${status}`));
      await fetchFrontDeskData();
      if (!response.ok) {
        toast.error('Unable to update reservation', { description: response.message });
        return;
      }
      const savedStatus = response.data.status;
      toast.success('Reservation Updated', { description: savedStatus === 'cancellation_pending' ? 'No-show policy was applied; the provider refund is pending.' : `Status set to ${savedStatus.replaceAll('_', ' ')}.` });
    } catch (error) {
      console.error('Failed to update booking status:', error);
      toast.error('Unable to update reservation', { description: error instanceof Error ? error.message : 'Unable to update reservation status.' });
    }
  }, [fetchFrontDeskData]);

  const handleCancel = React.useCallback(async (bookingId: string) => {
    if (!window.confirm('Cancel this reservation and apply the booked refund policy?')) return;
    try {
      const response = await cancelFrontDeskBooking(bookingId, attemptKey(`cancel:${bookingId}`));
      await fetchFrontDeskData();
      if (!response.ok) {
        toast.error('Cancellation refused', { description: response.message });
        return;
      }
      toast.success('Cancellation recorded', { description: 'Policy, refund, folio, and delivery work were persisted.' });
    } catch (error) {
      await fetchFrontDeskData();
      toast.error('Cancellation refused', { description: error instanceof Error ? error.message : 'Cancellation was not persisted.' });
    }
  }, [fetchFrontDeskData]);

  const handleResolveModification = React.useCallback(async (
    bookingId: string,
    decision: 'approved' | 'declined',
    checkInDate?: string,
    checkOutDate?: string,
    staffNote?: string
  ) => {
    try {
      const booking = reservations.find(item => item.id === bookingId);
      const preserveTime = (original: string | undefined, datePart: string | undefined) => {
        if (!original || !datePart) return null;
        const [year, month, day] = datePart.split('-').map(Number);
        const value = new Date(original);
        value.setUTCFullYear(year, month - 1, day);
        return value.toISOString();
      };
      const response = await resolveFrontDeskModification({
        bookingId,
        decision,
        checkInDate: preserveTime(booking?.checkInDate, checkInDate),
        checkOutDate: preserveTime(booking?.checkOutDate, checkOutDate),
        staffNote: staffNote || null,
        idempotencyKey: attemptKey(JSON.stringify({ bookingId, decision, checkInDate, checkOutDate, staffNote })),
      });
      await fetchFrontDeskData();
      if (!response.ok) {
        toast.error('Unable to resolve request', { description: response.message });
        return;
      }
      attemptKeys.current.delete(JSON.stringify({ bookingId, decision, checkInDate, checkOutDate, staffNote }));
      toast.success(decision === 'approved' ? 'Change request approved' : 'Change request declined', { description: decision === 'approved'
          ? 'Reservation dates were updated and the request was recorded.'
          : 'The guest request was marked as declined in staff notes.' });
    } catch (error) {
      console.error('Failed to resolve modification request:', error);
      toast.error('Unable to resolve request', { description: error instanceof Error ? error.message : 'The guest change request could not be resolved.' });
    }
  }, [fetchFrontDeskData, reservations]);

  const handleRoomAssignment = React.useCallback(async (bookingId: string, roomId: string) => {
    try {
      const response = await assignFrontDeskRoom(bookingId, roomId, attemptKey(`assign:${bookingId}:${roomId}`));
      await fetchFrontDeskData();
      if (!response.ok) {
        toast.error('Unable to assign room', { description: response.message });
        return;
      }
      attemptKeys.current.delete(`assign:${bookingId}:${roomId}`);
      toast.success('Room Assigned', { description: 'The reservation now has a ready room assigned.' });
    } catch (error) {
      console.error('Failed to assign room:', error);
      toast.error('Unable to assign room', { description: error instanceof Error ? error.message : 'Room assignment failed.' });
    }
  }, [fetchFrontDeskData]);

  return (
    <PlatformPage
      title="Front Desk"
      description="Arrivals, in-house guests, departures and guest change requests for the property business date."
      meta={(
        <>
          <MetaItem icon={CalendarDays}>Business date {businessDate ? formatStay(businessDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'} (UTC)</MetaItem>
          <MetaItem>Window ±7 days</MetaItem>
        </>
      )}
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={fetchFrontDeskData} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh
          </Button>
          <StaffReservationForm onCreated={fetchFrontDeskData} />
        </>
      )}
    >
      {error ? <WorkspaceError message={error} onRetry={fetchFrontDeskData} title="Front desk queue unavailable" /> : null}
      <FrontDesk
        reservations={reservations}
        availableRooms={availableRooms}
        businessDate={businessDate}
        loading={loading}
        onStatusChange={handleStatusChange}
        onAssignRoom={handleRoomAssignment}
        onCancel={handleCancel}
        onStayChanged={fetchFrontDeskData}
        onResolveModification={handleResolveModification}
      />
    </PlatformPage>
  );
}
