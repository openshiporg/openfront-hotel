'use client';

import React from 'react';
import { format, isAfter, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';
import {
  BadgeCheck,
  ClipboardList,
  DoorOpen,
  LogIn,
  LogOut,
  Search,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export type FrontDeskStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export interface FrontDeskReservation {
  id: string;
  confirmationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: FrontDeskStatus;
  numberOfGuests?: number | null;
  balanceDue?: number | null;
  totalAmount?: number | null;
  roomNumber?: string | null;
  roomTypeName?: string | null;
  source?: string | null;
}

interface FrontDeskProps {
  reservations: FrontDeskReservation[];
  loading?: boolean;
  onStatusChange?: (bookingId: string, status: FrontDeskStatus) => Promise<void> | void;
}

const STATUS_STYLES: Record<FrontDeskStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  checked_in: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  checked_out: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  no_show: 'bg-orange-100 text-orange-700 border-orange-200',
};

const STATUS_LABELS: Record<FrontDeskStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

function formatCurrency(amount?: number | null) {
  if (amount === null || amount === undefined) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function FrontDesk({ reservations, loading, onStatusChange }: FrontDeskProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [internalReservations, setInternalReservations] = React.useState(reservations);

  React.useEffect(() => {
    setInternalReservations(reservations);
  }, [reservations]);

  const today = startOfDay(new Date());

  const filteredReservations = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return internalReservations;
    return internalReservations.filter((reservation) =>
      reservation.guestName.toLowerCase().includes(term) ||
      reservation.confirmationNumber.toLowerCase().includes(term) ||
      (reservation.roomNumber || '').toLowerCase().includes(term)
    );
  }, [internalReservations, search]);

  const arrivals = filteredReservations.filter((reservation) =>
    isSameDay(parseISO(reservation.checkInDate), today) &&
    !['cancelled', 'no_show', 'checked_out'].includes(reservation.status)
  );

  const departures = filteredReservations.filter((reservation) =>
    isSameDay(parseISO(reservation.checkOutDate), today) &&
    ['checked_in', 'confirmed'].includes(reservation.status)
  );

  const inHouse = filteredReservations.filter((reservation) => {
    const checkIn = parseISO(reservation.checkInDate);
    const checkOut = parseISO(reservation.checkOutDate);
    return (
      reservation.status === 'checked_in' ||
      (isBefore(checkIn, today) && isAfter(checkOut, today) && reservation.status === 'confirmed')
    );
  });

  const handleStatusChange = async (id: string, status: FrontDeskStatus) => {
    setInternalReservations((prev) =>
      prev.map((reservation) =>
        reservation.id === id ? { ...reservation, status } : reservation
      )
    );

    if (onStatusChange) {
      await onStatusChange(id, status);
      return;
    }

    toast({
      title: 'Reservation Updated',
      description: `Status set to ${STATUS_LABELS[status]}.`,
    });
  };

  const handleAssignRoom = (reservationId: string) => {
    router.push(`/dashboard/RoomAssignment/create?bookingId=${reservationId}`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DoorOpen className="h-5 w-5" />
              Front Desk
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Track arrivals, departures, and in-house guests with quick actions.
            </p>
          </div>
          <div className="w-full md:w-72">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search guests or rooms"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Arrivals Today</p>
                <p className="text-3xl font-semibold">{arrivals.length}</p>
              </div>
              <BadgeCheck className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Departures Today</p>
                <p className="text-3xl font-semibold">{departures.length}</p>
              </div>
              <LogOut className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In House</p>
                <p className="text-3xl font-semibold">{inHouse.length}</p>
              </div>
              <Users className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Arrivals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {arrivals.length === 0 && (
              <p className="text-sm text-muted-foreground">No arrivals scheduled for today.</p>
            )}
            {arrivals.map((reservation) => (
              <ReservationRow
                key={reservation.id}
                reservation={reservation}
                onCheckIn={() => handleStatusChange(reservation.id, 'checked_in')}
                onAssignRoom={() => handleAssignRoom(reservation.id)}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Departures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {departures.length === 0 && (
              <p className="text-sm text-muted-foreground">No departures scheduled for today.</p>
            )}
            {departures.map((reservation) => (
              <ReservationRow
                key={reservation.id}
                reservation={reservation}
                onCheckOut={() => handleStatusChange(reservation.id, 'checked_out')}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">In-House Guests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inHouse.length === 0 && (
            <p className="text-sm text-muted-foreground">No in-house guests right now.</p>
          )}
          {inHouse.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              reservation={reservation}
              onAddCharges={() => toast({
                title: 'Charge Added',
                description: `Charge posted to ${reservation.guestName}.`,
              })}
              onCheckOut={() => handleStatusChange(reservation.id, 'checked_out')}
            />
          ))}
        </CardContent>
      </Card>

      {loading && (
        <div className="text-sm text-muted-foreground">
          Loading reservations...
        </div>
      )}
    </div>
  );
}

function ReservationRow({
  reservation,
  onCheckIn,
  onCheckOut,
  onAssignRoom,
  onAddCharges,
}: {
  reservation: FrontDeskReservation;
  onCheckIn?: () => void;
  onCheckOut?: () => void;
  onAssignRoom?: () => void;
  onAddCharges?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background p-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{reservation.guestName}</p>
          <Badge className={STATUS_STYLES[reservation.status]}>
            {STATUS_LABELS[reservation.status]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {reservation.confirmationNumber}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {format(parseISO(reservation.checkInDate), 'MMM d')} -{' '}
          {format(parseISO(reservation.checkOutDate), 'MMM d, yyyy')}
        </div>
        <div className="text-sm text-muted-foreground">
          {reservation.roomNumber ? `Room ${reservation.roomNumber}` : 'Unassigned'}
          {reservation.roomTypeName ? ` • ${reservation.roomTypeName}` : ''}
        </div>
        <div className="text-sm text-muted-foreground">
          Balance Due: {formatCurrency(reservation.balanceDue)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onCheckIn && (
          <Button size="sm" onClick={onCheckIn}>
            <LogIn className="mr-2 h-4 w-4" />
            Check In
          </Button>
        )}
        {onCheckOut && (
          <Button size="sm" variant="outline" onClick={onCheckOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Check Out
          </Button>
        )}
        {onAssignRoom && (
          <Button size="sm" variant="outline" onClick={onAssignRoom}>
            <ClipboardList className="mr-2 h-4 w-4" />
            Assign Room
          </Button>
        )}
        {onAddCharges && (
          <Button size="sm" variant="outline" onClick={onAddCharges}>
            <BadgeCheck className="mr-2 h-4 w-4" />
            Add Charges
          </Button>
        )}
      </div>
    </div>
  );
}

export default FrontDesk;
