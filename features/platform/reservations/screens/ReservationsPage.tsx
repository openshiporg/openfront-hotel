'use client';

import React from 'react';
import { gql, request } from 'graphql-request';
import { addDays, startOfDay } from 'date-fns';

import { ReservationCalendar } from '@/features/platform/reservations/components/ReservationCalendar';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';

type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
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
  bookings: Array<{
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
    roomAssignments?: Array<{
      room?: { id: string; roomNumber: string } | null;
      roomType?: { id: string; name: string } | null;
    }>;
  }>;
  rooms: ReservationCalendarRoom[];
}

const GET_RESERVATION_CALENDAR = gql`
  query ReservationCalendar($start: DateTime!, $end: DateTime!) {
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
      source
      numberOfGuests
      totalAmount
      balanceDue
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
    rooms(orderBy: { roomNumber: asc }) {
      id
      roomNumber
      status
      roomType {
        id
        name
      }
    }
  }
`;

export function ReservationsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [reservations, setReservations] = React.useState<ReservationCalendarItem[]>([]);
  const [rooms, setRooms] = React.useState<ReservationCalendarRoom[]>([]);

  const fetchCalendarData = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const start = startOfDay(addDays(new Date(), -7)).toISOString();
      const end = startOfDay(addDays(new Date(), 30)).toISOString();

      const data = await request<ReservationCalendarResponse>(endpoint, GET_RESERVATION_CALENDAR, { start, end });

      const mappedReservations = (data.bookings || []).map((booking: any) => {
        const assignment = booking.roomAssignments?.[0];
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
          roomId: assignment?.room?.id || null,
          roomNumber: assignment?.room?.roomNumber || null,
          roomTypeId: assignment?.roomType?.id || null,
          roomTypeName: assignment?.roomType?.name || null,
        };
      });

      setReservations(mappedReservations);
      setRooms(data.rooms || []);
    } catch (error) {
      console.error('Failed to load reservations:', error);
      toast({
        title: 'Error',
        description: 'Unable to load reservation calendar data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Reservations</h1>
      <p className="text-muted-foreground">Calendar and front desk visibility</p>
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Reservations' },
  ];

  return (
    <PageContainer title="Reservations" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full p-4 md:p-6">
        <ReservationCalendar
          reservations={reservations}
          rooms={rooms}
          loading={loading}
          onRefresh={fetchCalendarData}
        />
      </div>
    </PageContainer>
  );
}

export default ReservationsPage;
