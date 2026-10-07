'use client';

import React from 'react';
import { FrontDesk } from '@/features/platform/reservations/components/FrontDesk';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { StaffReservationForm } from '@/features/platform/reservations/components/StaffReservationForm';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
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

function utcBusinessDate(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

export function FrontDeskPage() {
  const { toast } = useToast();
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
      const start = utcBusinessDate(-7).toISOString();
      const end = utcBusinessDate(7).toISOString();
      const data = await getFrontDeskWorkspace(start, end) as FrontDeskResponse['hotelFrontDesk'];

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
      toast({
        title: 'Front desk unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
        toast({
          title: 'Unable to update reservation',
          description: response.message,
          variant: 'destructive',
        });
        return;
      }
      const savedStatus = response.data.status;
      toast({
        title: 'Reservation Updated',
        description: savedStatus === 'cancellation_pending' ? 'No-show policy was applied; the provider refund is pending.' : `Status set to ${savedStatus.replaceAll('_', ' ')}.`,
      });
    } catch (error) {
      console.error('Failed to update booking status:', error);
      toast({
        title: 'Unable to update reservation',
        description: error instanceof Error ? error.message : 'Unable to update reservation status.',
        variant: 'destructive',
      });
    }
  }, [fetchFrontDeskData, toast]);

  const handleCancel = React.useCallback(async (bookingId: string) => {
    if (!window.confirm('Cancel this reservation and apply the booked refund policy?')) return;
    try {
      const response = await cancelFrontDeskBooking(bookingId, attemptKey(`cancel:${bookingId}`));
      await fetchFrontDeskData();
      if (!response.ok) {
        toast({ title: 'Cancellation refused', description: response.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Cancellation recorded', description: 'Policy, refund, folio, and delivery work were persisted.' });
    } catch (error) {
      await fetchFrontDeskData();
      toast({ title: 'Cancellation refused', description: error instanceof Error ? error.message : 'Cancellation was not persisted.', variant: 'destructive' });
    }
  }, [fetchFrontDeskData, toast]);

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
        toast({ title: 'Unable to resolve request', description: response.message, variant: 'destructive' });
        return;
      }
      attemptKeys.current.delete(JSON.stringify({ bookingId, decision, checkInDate, checkOutDate, staffNote }));
      toast({
        title: decision === 'approved' ? 'Change request approved' : 'Change request declined',
        description: decision === 'approved'
          ? 'Reservation dates were updated and the request was recorded.'
          : 'The guest request was marked as declined in staff notes.',
      });
    } catch (error) {
      console.error('Failed to resolve modification request:', error);
      toast({
        title: 'Unable to resolve request',
        description: error instanceof Error ? error.message : 'The guest change request could not be resolved.',
        variant: 'destructive',
      });
    }
  }, [fetchFrontDeskData, reservations, toast]);

  const handleRoomAssignment = React.useCallback(async (bookingId: string, roomId: string) => {
    try {
      const response = await assignFrontDeskRoom(bookingId, roomId, attemptKey(`assign:${bookingId}:${roomId}`));
      await fetchFrontDeskData();
      if (!response.ok) {
        toast({ title: 'Unable to assign room', description: response.message, variant: 'destructive' });
        return;
      }
      attemptKeys.current.delete(`assign:${bookingId}:${roomId}`);
      toast({
        title: 'Room Assigned',
        description: 'The reservation now has a ready room assigned.',
      });
    } catch (error) {
      console.error('Failed to assign room:', error);
      toast({
        title: 'Unable to assign room',
        description: error instanceof Error ? error.message : 'Room assignment failed.',
        variant: 'destructive',
      });
    }
  }, [fetchFrontDeskData, toast]);

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-lg font-semibold md:text-2xl">Front Desk</h1><p className="text-muted-foreground">UTC business-date arrivals, departures, and in-house guests{businessDate ? ` · ${businessDate.slice(0, 10)}` : ''}</p></div>
      <StaffReservationForm onCreated={fetchFrontDeskData} />
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Front Desk' },
  ];

  return (
    <PageContainer title="Front Desk" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full space-y-4 p-4 md:p-6">
        {error ? <WorkspaceError message={error} onRetry={fetchFrontDeskData} /> : null}
        <FrontDesk
          reservations={reservations}
          availableRooms={availableRooms}
          businessDate={businessDate}
          loading={loading}
          onStatusChange={handleStatusChange}
          onAssignRoom={handleRoomAssignment}
          onCancel={handleCancel}
          onResolveModification={handleResolveModification}
        />
      </div>
    </PageContainer>
  );
}
