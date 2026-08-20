'use client';

import React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hotel,
  MoveHorizontal,
  RefreshCw,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'cancellation_pending'
  | 'no_show';

export interface ReservationCalendarReservation {
  id: string;
  confirmationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  source?: string | null;
  numberOfGuests?: number | null;
  totalAmount?: number | null;
  balanceDue?: number | null;
  roomId?: string | null;
  roomNumber?: string | null;
  roomTypeId?: string | null;
  roomTypeName?: string | null;
}

export interface ReservationCalendarRoom {
  id: string;
  roomNumber: string;
  status?: string | null;
  roomType?: {
    id: string;
    name: string;
  } | null;
}

interface ReservationCalendarProps {
  reservations: ReservationCalendarReservation[];
  rooms: ReservationCalendarRoom[];
  loading?: boolean;
  onRefresh?: () => void;
  onViewRangeChange?: (start: Date, end: Date) => void;
  onUpdateStayDates?: (bookingId: string, checkInDate: string, checkOutDate: string) => Promise<void> | void;
  onStatusChange?: (bookingId: string, status: ReservationStatus) => Promise<void> | void;
  onCancel?: (bookingId: string) => Promise<void> | void;
}

const STATUS_STYLES: Record<ReservationStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  checked_in: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  checked_out: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  cancellation_pending: 'bg-amber-100 text-amber-800 border-amber-200',
  no_show: 'bg-orange-100 text-orange-700 border-orange-200',
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  cancellation_pending: 'Cancellation pending',
  no_show: 'No Show',
};

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct',
  website: 'Website',
  phone: 'Phone',
  walk_in: 'Walk In',
  ota: 'OTA',
  corporate: 'Corporate',
  group: 'Group',
};

const VIEW_DAYS = 14;
const LANE_HEIGHT = 34;
const DAY_MS = 86_400_000;

function utcStartOfDay(value: Date | string = new Date()) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function utcDayDifference(left: Date, right: Date) {
  return Math.round((utcStartOfDay(left).getTime() - utcStartOfDay(right).getTime()) / DAY_MS);
}

function isSameUtcDay(left: Date, right: Date) {
  return utcStartOfDay(left).getTime() === utcStartOfDay(right).getTime();
}

function formatUtc(value: Date | string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(value));
}

function getReservationRange(reservation: ReservationCalendarReservation) {
  return {
    start: utcStartOfDay(reservation.checkInDate),
    end: utcStartOfDay(reservation.checkOutDate),
  };
}

function rangesOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && b.start < a.end;
}

function getRowKey(reservation: ReservationCalendarReservation) {
  if (reservation.roomId) {
    return `room-${reservation.roomId}`;
  }
  if (reservation.roomTypeId) {
    return `unassigned-${reservation.roomTypeId}`;
  }
  return 'unassigned-unknown';
}

function assignLanes(reservations: ReservationCalendarReservation[]) {
  const sorted = [...reservations].sort((a, b) => {
    const aStart = getReservationRange(a).start.getTime();
    const bStart = getReservationRange(b).start.getTime();
    return aStart - bStart;
  });

  const laneEnds: number[] = [];
  const positions = new Map<string, number>();

  sorted.forEach((reservation) => {
    const range = getReservationRange(reservation);
    const start = range.start.getTime();
    const end = range.end.getTime();
    let placed = false;

    for (let lane = 0; lane < laneEnds.length; lane += 1) {
      if (start >= laneEnds[lane]) {
        laneEnds[lane] = end;
        positions.set(reservation.id, lane);
        placed = true;
        break;
      }
    }

    if (!placed) {
      laneEnds.push(end);
      positions.set(reservation.id, laneEnds.length - 1);
    }
  });

  return {
    laneCount: laneEnds.length || 1,
    positions,
  };
}

function detectConflicts(reservations: ReservationCalendarReservation[]) {
  const conflicts = new Set<string>();
  for (let i = 0; i < reservations.length; i += 1) {
    for (let j = i + 1; j < reservations.length; j += 1) {
      if (rangesOverlap(getReservationRange(reservations[i]), getReservationRange(reservations[j]))) {
        conflicts.add(reservations[i].id);
        conflicts.add(reservations[j].id);
      }
    }
  }
  return conflicts;
}

export function ReservationCalendar({
  reservations,
  rooms,
  loading,
  onRefresh,
  onViewRangeChange,
  onUpdateStayDates,
  onStatusChange,
  onCancel,
}: ReservationCalendarProps) {
  const [viewStart, setViewStart] = React.useState<Date>(utcStartOfDay());
  const [selectedReservationId, setSelectedReservationId] = React.useState<string | null>(null);
  const [manualCheckIn, setManualCheckIn] = React.useState('');
  const [manualCheckOut, setManualCheckOut] = React.useState('');
  const [savingDates, setSavingDates] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [roomTypeFilter, setRoomTypeFilter] = React.useState('all');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [internalReservations, setInternalReservations] = React.useState(reservations);
  const [dayWidth, setDayWidth] = React.useState(72);

  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const internalReservationsRef = React.useRef(reservations);
  const dragStateRef = React.useRef<{
    id: string;
    mode: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    originalStart: Date;
    originalEnd: Date;
    deltaDays: number;
  } | null>(null);

  React.useEffect(() => {
    internalReservationsRef.current = reservations;
    setInternalReservations(reservations);
  }, [reservations]);

  React.useEffect(() => {
    onViewRangeChange?.(viewStart, addUtcDays(viewStart, VIEW_DAYS));
  }, [onViewRangeChange, viewStart]);

  React.useEffect(() => {
    if (!gridRef.current) return;

    const updateWidth = () => {
      if (!gridRef.current) return;
      const width = gridRef.current.getBoundingClientRect().width;
      setDayWidth(width / VIEW_DAYS);
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStateRef.current || dayWidth <= 0) return;
      const { id, mode, startX, originalStart, originalEnd } = dragStateRef.current;
      const deltaDays = Math.round((event.clientX - startX) / dayWidth);
      dragStateRef.current.deltaDays = deltaDays;

      setInternalReservations((prev) => {
        const next = prev.map((reservation) => {
          if (reservation.id !== id) return reservation;

          let newStart = originalStart;
          let newEnd = originalEnd;

          if (mode === 'move') {
            newStart = addUtcDays(originalStart, deltaDays);
            newEnd = addUtcDays(originalEnd, deltaDays);
          }

          if (mode === 'resize-start') {
            const candidate = addUtcDays(originalStart, deltaDays);
            if (candidate < originalEnd) {
              newStart = candidate;
            }
          }

          if (mode === 'resize-end') {
            const candidate = addUtcDays(originalEnd, deltaDays);
            if (candidate > originalStart) {
              newEnd = candidate;
            }
          }

          return {
            ...reservation,
            checkInDate: newStart.toISOString(),
            checkOutDate: newEnd.toISOString(),
          };
        });
        internalReservationsRef.current = next;
        return next;
      });
    };

    const handleMouseUp = async () => {
      if (!dragStateRef.current) return;

      const draggedReservationId = dragStateRef.current.id;
      const changed = dragStateRef.current.deltaDays !== 0;
      dragStateRef.current = null;
      if (!changed) return;
      const reservation = internalReservationsRef.current.find((item) => item.id === draggedReservationId);

      if (reservation && onUpdateStayDates) {
        await onUpdateStayDates(reservation.id, reservation.checkInDate, reservation.checkOutDate);
        return;
      }

      internalReservationsRef.current = reservations;
      setInternalReservations(reservations);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dayWidth, onUpdateStayDates, reservations]);

  const days = React.useMemo(
    () => Array.from({ length: VIEW_DAYS }, (_, index) => addUtcDays(viewStart, index)),
    [viewStart]
  );

  const roomTypeOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    rooms.forEach((room) => {
      if (room.roomType) {
        options.set(room.roomType.id, room.roomType.name);
      }
    });
    internalReservations.forEach((reservation) => {
      if (reservation.roomTypeId && reservation.roomTypeName) {
        options.set(reservation.roomTypeId, reservation.roomTypeName);
      }
    });
    return Array.from(options.entries()).map(([id, name]) => ({ id, name }));
  }, [rooms, internalReservations]);

  const filteredReservations = React.useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return internalReservations.filter((reservation) => {
      if (statusFilter !== 'all' && reservation.status !== statusFilter) return false;
      if (channelFilter !== 'all' && reservation.source !== channelFilter) return false;
      if (roomTypeFilter !== 'all' && reservation.roomTypeId !== roomTypeFilter) return false;

      if (!searchTerm) return true;
      return (
        reservation.guestName.toLowerCase().includes(searchTerm) ||
        reservation.confirmationNumber.toLowerCase().includes(searchTerm) ||
        (reservation.roomNumber || '').toLowerCase().includes(searchTerm)
      );
    });
  }, [internalReservations, search, statusFilter, channelFilter, roomTypeFilter]);

  const rowDefinitions = React.useMemo(() => {
    const rows = rooms.map((room) => ({
      id: `room-${room.id}`,
      label: room.roomNumber,
      roomTypeId: room.roomType?.id || null,
      roomTypeName: room.roomType?.name || null,
    }));

    const unassignedByType = new Map<string, string>();

    filteredReservations.forEach((reservation) => {
      if (reservation.roomId) return;
      if (reservation.roomTypeId) {
        unassignedByType.set(
          reservation.roomTypeId,
          reservation.roomTypeName || 'Unknown Room Type'
        );
      } else {
        unassignedByType.set('unknown', 'Unknown Room Type');
      }
    });

    Array.from(unassignedByType.entries()).forEach(([id, name]) => {
      rows.push({
        id: `unassigned-${id}`,
        label: `Unassigned - ${name}`,
        roomTypeId: id === 'unknown' ? null : id,
        roomTypeName: name,
      });
    });

    return rows.filter((row) => {
      if (roomTypeFilter === 'all') return true;
      return row.roomTypeId === roomTypeFilter;
    });
  }, [rooms, filteredReservations, roomTypeFilter]);

  const reservationsByRow = React.useMemo(() => {
    const map = new Map<string, ReservationCalendarReservation[]>();
    filteredReservations.forEach((reservation) => {
      const key = getRowKey(reservation);
      const current = map.get(key) || [];
      map.set(key, [...current, reservation]);
    });
    return map;
  }, [filteredReservations]);


  const rowMetrics = React.useMemo(() => {
    const map = new Map<
      string,
      {
        height: number;
        conflicts: Set<string>;
        positions: Map<string, number>;
      }
    >();

    rowDefinitions.forEach((row) => {
      const rowReservations = reservationsByRow.get(row.id) || [];
      const conflicts = detectConflicts(rowReservations);
      const { laneCount, positions } = assignLanes(rowReservations);
      const height = Math.max(LANE_HEIGHT, laneCount * LANE_HEIGHT);
      map.set(row.id, { height, conflicts, positions });
    });

    return map;
  }, [rowDefinitions, reservationsByRow]);

  const conflictCount = React.useMemo(() => {
    let count = 0;
    reservationsByRow.forEach((rowReservations) => {
      count += detectConflicts(rowReservations).size;
    });
    return count;
  }, [reservationsByRow]);

  const selectedReservation = internalReservations.find(
    (reservation) => reservation.id === selectedReservationId
  );

  const selectedCheckInDate = selectedReservation?.checkInDate;
  const selectedCheckOutDate = selectedReservation?.checkOutDate;
  React.useEffect(() => {
    if (!selectedCheckInDate || !selectedCheckOutDate) return;
    setManualCheckIn(selectedCheckInDate.slice(0, 10));
    setManualCheckOut(selectedCheckOutDate.slice(0, 10));
  }, [selectedCheckInDate, selectedCheckOutDate]);

  const handleSelectReservation = (reservation: ReservationCalendarReservation) => {
    setSelectedReservationId(reservation.id);
    setManualCheckIn(reservation.checkInDate.slice(0, 10));
    setManualCheckOut(reservation.checkOutDate.slice(0, 10));
  };

  const saveManualStayDates = async () => {
    if (!selectedReservation || !onUpdateStayDates || !manualCheckIn || !manualCheckOut) return;
    const withDate = (original: string, datePart: string) => {
      const [year, month, day] = datePart.split('-').map(Number);
      const date = new Date(original);
      date.setUTCFullYear(year, month - 1, day);
      return date.toISOString();
    };
    setSavingDates(true);
    try {
      await onUpdateStayDates(
        selectedReservation.id,
        withDate(selectedReservation.checkInDate, manualCheckIn),
        withDate(selectedReservation.checkOutDate, manualCheckOut),
      );
    } finally {
      setSavingDates(false);
    }
  };

  const handleStartDrag = (
    event: React.MouseEvent,
    reservation: ReservationCalendarReservation,
    mode: 'move' | 'resize-start' | 'resize-end'
  ) => {
    event.stopPropagation();
    dragStateRef.current = {
      id: reservation.id,
      mode,
      startX: event.clientX,
      originalStart: new Date(reservation.checkInDate),
      originalEnd: new Date(reservation.checkOutDate),
      deltaDays: 0,
    };
  };

  const handleStatusChange = async (reservationId: string, status: ReservationStatus) => {
    if (!onStatusChange) return;
    await onStatusChange(reservationId, status);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5" />
                Reservation Calendar
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Drag reservations to adjust dates, spot conflicts, and manage stays.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewStart(utcStartOfDay())}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewStart(addUtcDays(viewStart, -VIEW_DAYS))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewStart(addUtcDays(viewStart, VIEW_DAYS))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                  <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
                  Refresh
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search guest, confirmation, or room"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Room Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Room Types</SelectItem>
                  {roomTypeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {conflictCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              {conflictCount} potential room conflicts detected in this view.
            </div>
          )}
        </CardHeader>
        <CardContent className="min-w-0 max-w-full">
          <div data-qa-layout="reservation-calendar-scroll" className="max-w-full overflow-x-auto pb-2">
          <div className="grid min-w-[900px] grid-cols-[220px_minmax(0,1fr)] gap-4">
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Rooms</div>
              <div className="space-y-1">
                {rowDefinitions.map((row) => (
                  <div
                    key={row.id}
                    className="flex h-[var(--row-height)] items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm font-medium"
                    style={{
                      ['--row-height' as any]: `${rowMetrics.get(row.id)?.height || LANE_HEIGHT}px`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Hotel className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p>{row.label}</p>
                        {row.roomTypeName && (
                          <p className="text-xs text-muted-foreground">{row.roomTypeName}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="grid grid-cols-14 gap-1 text-xs text-muted-foreground">
                {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'rounded-md border border-transparent bg-muted/30 px-2 py-2 text-center',
                      isSameUtcDay(day, new Date()) && 'border-blue-200 bg-blue-50 text-blue-700'
                    )}
                  >
                    <p className="font-medium">{formatUtc(day, { weekday: 'short' })}</p>
                    <p>{formatUtc(day, { month: 'short', day: 'numeric' })}</p>
                  </div>
                ))}
              </div>

              <div ref={gridRef} className="mt-3 space-y-2">
                {rowDefinitions.map((row) => {
                  const rowReservations = reservationsByRow.get(row.id) || [];
                  const metrics = rowMetrics.get(row.id);
                  const conflicts = metrics?.conflicts || new Set<string>();
                  const positions = metrics?.positions || new Map<string, number>();
                  const rowHeight = metrics?.height || LANE_HEIGHT;

                  return (
                    <div
                      key={row.id}
                      className="relative rounded-md border border-border/60 bg-background/80"
                      style={{ height: rowHeight }}
                    >
                      {rowReservations.map((reservation) => {
                        const range = getReservationRange(reservation);
                        const startIndex = utcDayDifference(range.start, viewStart);
                        const endIndex = utcDayDifference(range.end, viewStart);
                        const clampedStart = Math.max(0, startIndex);
                        const clampedEnd = Math.min(VIEW_DAYS, endIndex);
                        if (clampedEnd <= 0 || clampedStart >= VIEW_DAYS) {
                          return null;
                        }

                        const lane = positions.get(reservation.id) || 0;
                        const left = clampedStart * dayWidth;
                        const width = Math.max((clampedEnd - clampedStart) * dayWidth, dayWidth * 0.6);
                        const hasConflict = conflicts.has(reservation.id);

                        return (
                          <div
                            key={reservation.id}
                            className={cn(
                              'absolute top-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs shadow-sm transition',
                              STATUS_STYLES[reservation.status],
                              hasConflict && 'ring-2 ring-amber-400/70'
                            )}
                            style={{
                              left,
                              width,
                              top: lane * LANE_HEIGHT + 8,
                              height: LANE_HEIGHT - 10,
                            }}
                            onClick={() => handleSelectReservation(reservation)}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSelectReservation(reservation); } }}
                            role="button"
                            tabIndex={0}
                          >
                            <div
                              className="absolute left-0 top-0 h-full w-3 cursor-ew-resize"
                              onMouseDown={(event) => handleStartDrag(event, reservation, 'resize-start')}
                            />
                            <div
                              className="absolute right-0 top-0 h-full w-3 cursor-ew-resize"
                              onMouseDown={(event) => handleStartDrag(event, reservation, 'resize-end')}
                            />
                            <div
                              className="flex h-full items-center gap-1"
                              onMouseDown={(event) => handleStartDrag(event, reservation, 'move')}
                            >
                              <MoveHorizontal className="h-3 w-3" />
                              <span className="truncate font-medium">
                                {reservation.guestName}
                              </span>
                              {reservation.roomNumber && (
                                <span className="text-[10px] text-muted-foreground">
                                  {reservation.roomNumber}
                                </span>
                              )}
                              {hasConflict && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>Potential conflict</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Reservation Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedReservation ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{selectedReservation.guestName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReservation.confirmationNumber}
                  </p>
                </div>
                <Badge className={STATUS_STYLES[selectedReservation.status]}>
                  {STATUS_LABELS[selectedReservation.status]}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Stay</p>
                  <p className="font-medium">
                    {formatUtc(selectedReservation.checkInDate, { month: 'short', day: 'numeric' })} -{' '}
                    {formatUtc(selectedReservation.checkOutDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Guests: {selectedReservation.numberOfGuests || 1}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Assignment</p>
                  <p className="font-medium">
                    {selectedReservation.roomNumber
                      ? `Room ${selectedReservation.roomNumber}`
                      : 'Unassigned'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReservation.roomTypeName || 'Room type pending'}
                  </p>
                </div>
              </div>

              {['pending', 'confirmed'].includes(selectedReservation.status) && onUpdateStayDates ? (
                <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1"><label htmlFor="manualCheckIn" className="text-xs font-medium uppercase text-muted-foreground">Arrival date</label><Input id="manualCheckIn" type="date" value={manualCheckIn} onChange={event => setManualCheckIn(event.target.value)} /></div>
                  <div className="space-y-1"><label htmlFor="manualCheckOut" className="text-xs font-medium uppercase text-muted-foreground">Departure date</label><Input id="manualCheckOut" type="date" value={manualCheckOut} onChange={event => setManualCheckOut(event.target.value)} /></div>
                  <Button size="sm" variant="outline" onClick={saveManualStayDates} disabled={savingDates || !manualCheckIn || !manualCheckOut}>Save dates</Button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {selectedReservation.status === 'confirmed' && (
                  <>
                    <Button size="sm" onClick={() => handleStatusChange(selectedReservation.id, 'checked_in')}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />Quick Check-In
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedReservation.id, 'no_show')}>Mark no show</Button>
                  </>
                )}
                {selectedReservation.status === 'checked_in' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(selectedReservation.id, 'checked_out')}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Quick Check-Out
                  </Button>
                )}
                {selectedReservation.status === 'pending' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedReservation.id, 'confirmed')}>
                    Confirm Reservation
                  </Button>
                )}
                {['pending', 'confirmed'].includes(selectedReservation.status) && onCancel ? (
                  <Button size="sm" variant="destructive" onClick={() => onCancel(selectedReservation.id)}>Cancel reservation</Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <CalendarDays className="h-10 w-10" />
              <p>Select a reservation to view details and quick actions.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ReservationCalendar;
