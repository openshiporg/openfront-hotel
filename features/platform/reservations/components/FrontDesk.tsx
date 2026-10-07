'use client';

import React from 'react';
import { InHouseStayControls } from './InHouseStayControls';
import RelocationPanel from '@/features/platform/relocations/components/RelocationPanel';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export type FrontDeskStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'cancellation_pending'
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
  roomStatus?: string | null;
  roomTypeId?: string | null;
  roomTypeName?: string | null;
  source?: string | null;
  internalNotes?: string | null;
  hasPendingModificationRequest?: boolean;
  pendingModificationRequest?: {
    id: string;
    requestedCheckInDate?: string | null;
    requestedCheckOutDate?: string | null;
    guestMessage?: string | null;
  } | null;
}

export interface FrontDeskRoomOption {
  id: string;
  roomNumber: string;
  status: string;
  roomType?: {
    id: string;
    name: string;
  } | null;
}

interface FrontDeskProps {
  reservations: FrontDeskReservation[];
  availableRooms?: FrontDeskRoomOption[];
  businessDate?: string;
  loading?: boolean;
  onStatusChange?: (bookingId: string, status: FrontDeskStatus) => Promise<void> | void;
  onAssignRoom?: (bookingId: string, roomId: string) => Promise<void> | void;
  onCancel?: (bookingId: string) => Promise<void> | void;
  onResolveModification?: (
    bookingId: string,
    decision: 'approved' | 'declined',
    checkInDate?: string,
    checkOutDate?: string,
    staffNote?: string
  ) => Promise<void> | void;
}

const STATUS_STYLES: Record<FrontDeskStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  checked_in: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  checked_out: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  cancellation_pending: 'bg-amber-100 text-amber-800 border-amber-200',
  no_show: 'bg-orange-100 text-orange-700 border-orange-200',
};

const STATUS_LABELS: Record<FrontDeskStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  cancellation_pending: 'Cancellation pending',
  no_show: 'No Show',
};

function utcDateKey(value: Date | string = new Date()) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatUtc(value: Date | string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(value));
}

function formatCurrency(amount?: number | null) {
  if (amount === null || amount === undefined) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function FrontDesk({
  reservations,
  availableRooms = [],
  businessDate,
  loading,
  onStatusChange,
  onAssignRoom,
  onCancel,
  onResolveModification,
}: FrontDeskProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [selectedRoomByReservation, setSelectedRoomByReservation] = React.useState<Record<string, string>>({});
  const [modificationResolutionByReservation, setModificationResolutionByReservation] = React.useState<Record<string, {
    checkInDate: string;
    checkOutDate: string;
    staffNote: string;
  }>>({});
  const [internalReservations, setInternalReservations] = React.useState(reservations);

  React.useEffect(() => {
    setInternalReservations(reservations);
  }, [reservations]);

  const today = utcDateKey(businessDate || new Date());

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
    utcDateKey(reservation.checkInDate) === today &&
    !['cancelled', 'cancellation_pending', 'no_show', 'checked_out'].includes(reservation.status)
  );

  const departures = filteredReservations.filter((reservation) =>
    utcDateKey(reservation.checkOutDate) === today && reservation.status === 'checked_in'
  );

  const modificationRequests = filteredReservations.filter((reservation) =>
    reservation.hasPendingModificationRequest &&
    ['pending', 'confirmed'].includes(reservation.status)
  );

  const inHouse = filteredReservations.filter((reservation) => {
    const checkIn = utcDateKey(reservation.checkInDate);
    const checkOut = utcDateKey(reservation.checkOutDate);
    return reservation.status === 'checked_in' && checkIn <= today && checkOut > today;
  });

  const handleStatusChange = async (id: string, status: FrontDeskStatus) => {
    if (onStatusChange) await onStatusChange(id, status);
  };

  const getModificationResolution = (reservation: FrontDeskReservation) => {
    const existing = modificationResolutionByReservation[reservation.id];
    if (existing) return existing;
    return {
      checkInDate: utcDateKey(
        reservation.pendingModificationRequest?.requestedCheckInDate || reservation.checkInDate
      ),
      checkOutDate: utcDateKey(
        reservation.pendingModificationRequest?.requestedCheckOutDate || reservation.checkOutDate
      ),
      staffNote: '',
    };
  };

  const updateModificationResolution = (reservationId: string, updates: Partial<{ checkInDate: string; checkOutDate: string; staffNote: string }>) => {
    setModificationResolutionByReservation((prev) => ({
      ...prev,
      [reservationId]: {
        ...(prev[reservationId] || { checkInDate: '', checkOutDate: '', staffNote: '' }),
        ...updates,
      },
    }));
  };

  const handleResolveModification = async (reservation: FrontDeskReservation, decision: 'approved' | 'declined') => {
    if (!onResolveModification) return;
    const resolution = getModificationResolution(reservation);
    await onResolveModification(
      reservation.id,
      decision,
      decision === 'approved' ? resolution.checkInDate : undefined,
      decision === 'approved' ? resolution.checkOutDate : undefined,
      resolution.staffNote
    );
    setModificationResolutionByReservation((prev) => {
      const next = { ...prev };
      delete next[reservation.id];
      return next;
    });
  };

  const handleAssignRoom = async (reservationId: string) => {
    const selectedRoomId = selectedRoomByReservation[reservationId];

    if (!onAssignRoom || !selectedRoomId) return;
    await onAssignRoom(reservationId, selectedRoomId);
    setSelectedRoomByReservation((prev) => {
      const next = { ...prev };
      delete next[reservationId];
      return next;
    });
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

      <div className="grid gap-4 md:grid-cols-4">
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Change Requests</p>
                <p className="text-3xl font-semibold">{modificationRequests.length}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {modificationRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guest Change Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {modificationRequests.map((reservation) => (
              <ReservationRow
                key={reservation.id}
                reservation={reservation}
                modificationResolution={getModificationResolution(reservation)}
                onModificationResolutionChange={(updates) => updateModificationResolution(reservation.id, updates)}
                onApproveModification={onResolveModification ? () => handleResolveModification(reservation, 'approved') : undefined}
                onDeclineModification={onResolveModification ? () => handleResolveModification(reservation, 'declined') : undefined}
              />
            ))}
          </CardContent>
        </Card>
      )}

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
                availableRooms={availableRooms}
                selectedRoomId={selectedRoomByReservation[reservation.id] || ''}
                onSelectedRoomChange={(roomId) => setSelectedRoomByReservation((prev) => ({ ...prev, [reservation.id]: roomId }))}
                onConfirm={reservation.status === 'pending' ? () => handleStatusChange(reservation.id, 'confirmed') : undefined}
                onCheckIn={reservation.status === 'confirmed' ? () => handleStatusChange(reservation.id, 'checked_in') : undefined}
                onNoShow={reservation.status === 'confirmed' ? () => handleStatusChange(reservation.id, 'no_show') : undefined}
                onCancel={onCancel ? () => onCancel(reservation.id) : undefined}
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
              availableRooms={availableRooms}
              selectedRoomId={selectedRoomByReservation[reservation.id] || ''}
              onSelectedRoomChange={(roomId) => setSelectedRoomByReservation((prev) => ({ ...prev, [reservation.id]: roomId }))}
              onAssignRoom={() => handleAssignRoom(reservation.id)}
              onAddCharges={() => router.push(`/dashboard/platform/folios?bookingId=${reservation.id}`)}
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
  onConfirm,
  onCheckIn,
  onNoShow,
  onCheckOut,
  availableRooms = [],
  selectedRoomId,
  onSelectedRoomChange,
  modificationResolution,
  onModificationResolutionChange,
  onApproveModification,
  onDeclineModification,
  onAssignRoom,
  onAddCharges,
  onCancel,
}: {
  reservation: FrontDeskReservation;
  availableRooms?: FrontDeskRoomOption[];
  selectedRoomId?: string;
  modificationResolution?: { checkInDate: string; checkOutDate: string; staffNote: string };
  onSelectedRoomChange?: (roomId: string) => void;
  onModificationResolutionChange?: (updates: Partial<{ checkInDate: string; checkOutDate: string; staffNote: string }>) => void;
  onConfirm?: () => void;
  onCheckIn?: () => void;
  onNoShow?: () => void;
  onCheckOut?: () => void;
  onApproveModification?: () => void;
  onDeclineModification?: () => void;
  onAssignRoom?: () => void;
  onAddCharges?: () => void;
  onCancel?: () => void;
}) {
  const compatibleRooms = availableRooms.filter(room => room.roomType?.id === reservation.roomTypeId);
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
          {formatUtc(reservation.checkInDate, { month: 'short', day: 'numeric' })} -{' '}
          {formatUtc(reservation.checkOutDate, { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {reservation.roomNumber ? `Room ${reservation.roomNumber}` : 'Unassigned'}
            {reservation.roomTypeName ? ` • ${reservation.roomTypeName}` : ''}
          </span>
          {reservation.roomStatus && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {reservation.roomStatus.replace('_', ' ')}
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          Balance Due: {formatCurrency(reservation.balanceDue)}
        </div>
        <RelocationPanel bookingId={reservation.id} />
        {reservation.status === 'checked_in' && <InHouseStayControls bookingId={reservation.id} checkInDate={reservation.checkInDate} checkOutDate={reservation.checkOutDate} />}
        {reservation.hasPendingModificationRequest && (
          <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-3 text-sm text-purple-700">
            <p className="font-medium">Guest change request pending staff review.</p>
            {reservation.pendingModificationRequest?.guestMessage && (
              <p className="whitespace-pre-wrap text-purple-800">
                {reservation.pendingModificationRequest.guestMessage}
              </p>
            )}
            {reservation.pendingModificationRequest?.requestedCheckInDate && reservation.pendingModificationRequest?.requestedCheckOutDate && (
              <p className="text-xs text-purple-700">
                Requested stay: {formatUtc(reservation.pendingModificationRequest.requestedCheckInDate, { month: 'short', day: 'numeric', year: 'numeric' })} –{' '}
                {formatUtc(reservation.pendingModificationRequest.requestedCheckOutDate, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            {modificationResolution && onModificationResolutionChange && (
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  type="date"
                  value={modificationResolution.checkInDate}
                  onChange={(event) => onModificationResolutionChange({ checkInDate: event.target.value })}
                  className="h-8 bg-white"
                />
                <Input
                  type="date"
                  value={modificationResolution.checkOutDate}
                  onChange={(event) => onModificationResolutionChange({ checkOutDate: event.target.value })}
                  className="h-8 bg-white"
                />
                <Input
                  value={modificationResolution.staffNote}
                  onChange={(event) => onModificationResolutionChange({ staffNote: event.target.value })}
                  placeholder="Staff note"
                  className="h-8 bg-white"
                />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {onConfirm && <Button size="sm" variant="outline" onClick={onConfirm}>Confirm</Button>}
        {onCheckIn && (
          <Button size="sm" onClick={onCheckIn}>
            <LogIn className="mr-2 h-4 w-4" />
            Check In
          </Button>
        )}
        {onNoShow && <Button size="sm" variant="outline" onClick={onNoShow}>No show</Button>}
        {onCheckOut && (
          <Button size="sm" variant="outline" onClick={onCheckOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Check Out
          </Button>
        )}
        {(onApproveModification || onDeclineModification) && (
          <>
            {onApproveModification && (
              <Button size="sm" variant="outline" onClick={onApproveModification}>
                Approve Change
              </Button>
            )}
            {onDeclineModification && (
              <Button size="sm" variant="outline" onClick={onDeclineModification}>
                Decline
              </Button>
            )}
          </>
        )}
        {onAssignRoom && (!reservation.roomNumber || reservation.status === 'checked_in') && (
          compatibleRooms.length ? (
            <div className="flex flex-wrap gap-2">
              <Select value={selectedRoomId} onValueChange={onSelectedRoomChange}>
                <SelectTrigger
                  className="h-9 w-[180px]"
                  aria-label={`Ready room for ${reservation.guestName}`}
                ><SelectValue placeholder="Ready room" /></SelectTrigger>
                <SelectContent>{compatibleRooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.roomNumber}{room.roomType?.name ? ` • ${room.roomType.name}` : ''}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={onAssignRoom} disabled={!selectedRoomId}><ClipboardList className="mr-2 h-4 w-4" />{reservation.status === 'checked_in' ? 'Move Room' : 'Assign Room'}</Button>
            </div>
          ) : <span className="text-xs text-amber-700">No ready room of the booked type.</span>
        )}
        {onAddCharges && (
          <Button size="sm" variant="outline" onClick={onAddCharges}>
            <BadgeCheck className="mr-2 h-4 w-4" />
            Add Charges
          </Button>
        )}
        {onCancel && <Button size="sm" variant="destructive" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

export default FrontDesk;
