'use client';

import React from 'react';
import { gql, request } from 'graphql-request';
import { addDays, startOfDay } from 'date-fns';

import { FrontDesk } from '@/features/platform/reservations/components/FrontDesk';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';

type FrontDeskStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
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
  roomAssignments?: Array<{
    room?: { id: string; roomNumber: string } | null;
    roomType?: { id: string; name: string } | null;
  }>;
}

interface FrontDeskResponse {
  bookings: FrontDeskReservationItem[];
}

const GET_FRONT_DESK = gql`
  query FrontDeskReservations($start: DateTime!, $end: DateTime!) {
    bookings(
      where: {
        checkOutDate: { gte: $start }
        checkInDate: { lte: $end }
      }
      orderBy: { checkInDate: asc }
    ) {
      id
      confirmationNumber
      guestName
      checkInDate
      checkOutDate
      status
      numberOfGuests
      totalAmount
      balanceDue
      source
      roomAssignments {
        room {
          id
          roomNumber
        }
        roomType {
          id
          name
        }
      }
    }
  }
`;

const UPDATE_BOOKING_STATUS = gql`
  mutation UpdateBookingStatus($bookingId: ID!, $status: String!) {
    updateBookingStatus(bookingId: $bookingId, status: $status) {
      id
      status
    }
  }
`;

export function FrontDeskPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
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
    roomNumber: string | null;
    roomTypeName: string | null;
  }>>([]);

  const fetchFrontDeskData = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const start = startOfDay(addDays(new Date(), -7)).toISOString();
      const end = startOfDay(addDays(new Date(), 7)).toISOString();

      const data = await request<FrontDeskResponse>(endpoint, GET_FRONT_DESK, { start, end });

      const mappedReservations = (data.bookings || []).map((booking: any) => {
        const assignment = booking.roomAssignments?.[0];
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
          roomNumber: assignment?.room?.roomNumber || null,
          roomTypeName: assignment?.roomType?.name || null,
        };
      });

      setReservations(mappedReservations);
    } catch (error) {
      console.error('Failed to load front desk data:', error);
      toast({
        title: 'Error',
        description: 'Unable to load front desk reservations.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchFrontDeskData();
  }, [fetchFrontDeskData]);

  const handleStatusChange = React.useCallback(async (bookingId: string, status: FrontDeskStatus) => {
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      await request(endpoint, UPDATE_BOOKING_STATUS, { bookingId, status });
      await fetchFrontDeskData();
      toast({
        title: 'Reservation Updated',
        description: `Status set to ${status.replace('_', ' ')}.`,
      });
    } catch (error) {
      console.error('Failed to update booking status:', error);
      toast({
        title: 'Error',
        description: 'Unable to update reservation status.',
        variant: 'destructive',
      });
    }
  }, [fetchFrontDeskData, toast]);

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Front Desk</h1>
      <p className="text-muted-foreground">Arrivals, departures, and in-house guests</p>
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Front Desk' },
  ];

  return (
    <PageContainer title="Front Desk" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full p-4 md:p-6">
        <FrontDesk
          reservations={reservations}
          loading={loading}
          onStatusChange={handleStatusChange}
        />
      </div>
    </PageContainer>
  );
}
