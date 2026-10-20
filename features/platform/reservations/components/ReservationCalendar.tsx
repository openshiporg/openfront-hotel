'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LogIn,
  LogOut,
  ReceiptText,
  RefreshCw,
  UserRoundX,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Field, FieldInput } from '@/features/platform/components/Form';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, DetailList, InitialsAvatar, Panel, PanelToolbar, SubSection } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { formatMoney, formatStayRange, humanize, nightsBetween, pluralize } from '@/features/platform/lib/format';
import { statusMeta, TONE_DOT, TONE_EDGE, TONE_SURFACE } from '@/features/platform/lib/status';

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
  /** Pre-fills the guest/confirmation/room search, e.g. from a guest profile deep link. */
  initialSearch?: string;
  /** The property's open business date; "Today" follows it rather than the UTC calendar. */
  businessDate?: string | null;
}

const STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'cancellation_pending', 'no_show'];

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct',
  website: 'Website',
  phone: 'Phone',
  walk_in: 'Walk in',
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
  if (reservation.roomId) return `room-${reservation.roomId}`;
  if (reservation.roomTypeId) return `unassigned-${reservation.roomTypeId}`;
  return 'unassigned-unknown';
}

function assignLanes(reservations: ReservationCalendarReservation[]) {
  const sorted = [...reservations].sort((a, b) => getReservationRange(a).start.getTime() - getReservationRange(b).start.getTime());
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

  return { laneCount: laneEnds.length || 1, positions };
}

// Stays that hold their physical room; cancelled, no-show and checked-out stays do not.
const ROOM_HOLDING_STATUSES = new Set(['pending', 'confirmed', 'checked_in', 'cancellation_pending']);
// Only these stays can be moved through the pre-arrival date change.
const DATE_AMENDABLE_STATUSES = new Set(['pending', 'confirmed']);

/**
 * Overlapping stays assigned to the same physical room. Unassigned stays share a room-type row
 * without double-booking anything, so they are never flagged here.
 */
function detectConflicts(reservations: ReservationCalendarReservation[]) {
  const conflicts = new Set<string>();
  const holding = reservations.filter((reservation) => reservation.roomId && ROOM_HOLDING_STATUSES.has(reservation.status));
  for (let i = 0; i < holding.length; i += 1) {
    for (let j = i + 1; j < holding.length; j += 1) {
      if (holding[i].roomId === holding[j].roomId && rangesOverlap(getReservationRange(holding[i]), getReservationRange(holding[j]))) {
        conflicts.add(holding[i].id);
        conflicts.add(holding[j].id);
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
  initialSearch = '',
  businessDate = null,
}: ReservationCalendarProps) {
  const [viewStart, setViewStart] = React.useState<Date>(utcStartOfDay());
  const followedBusinessDate = React.useRef(false);
  React.useEffect(() => {
    if (!businessDate || followedBusinessDate.current) return;
    followedBusinessDate.current = true;
    setViewStart(utcStartOfDay(businessDate));
  }, [businessDate]);
  const [selectedReservationId, setSelectedReservationId] = React.useState<string | null>(null);
  const [manualCheckIn, setManualCheckIn] = React.useState('');
  const [manualCheckOut, setManualCheckOut] = React.useState('');
  const [savingDates, setSavingDates] = React.useState(false);
  const [actionPending, setActionPending] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState(initialSearch);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [roomTypeFilter, setRoomTypeFilter] = React.useState('all');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [internalReservations, setInternalReservations] = React.useState(reservations);
  const [dayWidth, setDayWidth] = React.useState(72);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const internalReservationsRef = React.useRef(reservations);
  const suppressClickRef = React.useRef(false);
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
    const element = gridRef.current;
    if (!element) return;
    const updateWidth = () => setDayWidth(element.getBoundingClientRect().width / VIEW_DAYS);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
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
            if (candidate < originalEnd) newStart = candidate;
          }
          if (mode === 'resize-end') {
            const candidate = addUtcDays(originalEnd, deltaDays);
            if (candidate > originalStart) newEnd = candidate;
          }
          return { ...reservation, checkInDate: newStart.toISOString(), checkOutDate: newEnd.toISOString() };
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
      setDraggingId(null);
      if (!changed) return;
      suppressClickRef.current = true;
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

  const days = React.useMemo(() => Array.from({ length: VIEW_DAYS }, (_, index) => addUtcDays(viewStart, index)), [viewStart]);
  const today = businessDate ? utcStartOfDay(businessDate) : utcStartOfDay();

  const roomTypeOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    rooms.forEach((room) => { if (room.roomType) options.set(room.roomType.id, room.roomType.name); });
    internalReservations.forEach((reservation) => {
      if (reservation.roomTypeId && reservation.roomTypeName) options.set(reservation.roomTypeId, reservation.roomTypeName);
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
    const rows: Array<{ id: string; label: string; roomTypeId: string | null; roomTypeName: string | null; roomStatus?: string | null; unassigned?: boolean }> = rooms.map((room) => ({
      id: `room-${room.id}`,
      label: room.roomNumber,
      roomTypeId: room.roomType?.id || null,
      roomTypeName: room.roomType?.name || null,
      roomStatus: room.status,
    }));
    const unassignedByType = new Map<string, string>();
    filteredReservations.forEach((reservation) => {
      if (reservation.roomId) return;
      if (reservation.roomTypeId) unassignedByType.set(reservation.roomTypeId, reservation.roomTypeName || 'Unknown room type');
      else unassignedByType.set('unknown', 'Unknown room type');
    });
    Array.from(unassignedByType.entries()).forEach(([id, name]) => {
      rows.push({ id: `unassigned-${id}`, label: 'Unassigned', roomTypeId: id === 'unknown' ? null : id, roomTypeName: name, unassigned: true });
    });
    return rows.filter((row) => roomTypeFilter === 'all' || row.roomTypeId === roomTypeFilter);
  }, [rooms, filteredReservations, roomTypeFilter]);

  const reservationsByRow = React.useMemo(() => {
    const map = new Map<string, ReservationCalendarReservation[]>();
    filteredReservations.forEach((reservation) => {
      const key = getRowKey(reservation);
      map.set(key, [...(map.get(key) || []), reservation]);
    });
    return map;
  }, [filteredReservations]);

  const rowMetrics = React.useMemo(() => {
    const map = new Map<string, { height: number; conflicts: Set<string>; positions: Map<string, number> }>();
    rowDefinitions.forEach((row) => {
      const rowReservations = reservationsByRow.get(row.id) || [];
      const conflicts = detectConflicts(rowReservations);
      const { laneCount, positions } = assignLanes(rowReservations);
      map.set(row.id, { height: Math.max(LANE_HEIGHT, laneCount * LANE_HEIGHT) + 8, conflicts, positions });
    });
    return map;
  }, [rowDefinitions, reservationsByRow]);

  const conflictCount = React.useMemo(() => {
    let count = 0;
    reservationsByRow.forEach((rowReservations) => { count += detectConflicts(rowReservations).size; });
    return count;
  }, [reservationsByRow]);

  const inViewCount = filteredReservations.filter((reservation) => {
    const range = getReservationRange(reservation);
    return rangesOverlap(range, { start: viewStart, end: addUtcDays(viewStart, VIEW_DAYS) });
  }).length;

  const selectedReservation = internalReservations.find((reservation) => reservation.id === selectedReservationId);
  const selectedCheckInDate = selectedReservation?.checkInDate;
  const selectedCheckOutDate = selectedReservation?.checkOutDate;
  React.useEffect(() => {
    if (!selectedCheckInDate || !selectedCheckOutDate) return;
    setManualCheckIn(selectedCheckInDate.slice(0, 10));
    setManualCheckOut(selectedCheckOutDate.slice(0, 10));
  }, [selectedCheckInDate, selectedCheckOutDate]);

  const handleSelectReservation = (reservation: ReservationCalendarReservation) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
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
      await onUpdateStayDates(selectedReservation.id, withDate(selectedReservation.checkInDate, manualCheckIn), withDate(selectedReservation.checkOutDate, manualCheckOut));
    } finally {
      setSavingDates(false);
    }
  };

  const handleStartDrag = (event: React.MouseEvent, reservation: ReservationCalendarReservation, mode: 'move' | 'resize-start' | 'resize-end') => {
    if (event.button !== 0 || !DATE_AMENDABLE_STATUSES.has(reservation.status)) return;
    event.stopPropagation();
    suppressClickRef.current = false;
    setDraggingId(reservation.id);
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
    setActionPending(status);
    try { await onStatusChange(reservationId, status); } catch { /* The page reports the refusal. */ } finally { setActionPending(null); }
  };

  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setRoomTypeFilter('all'); setChannelFilter('all'); };
  const filtered = Boolean(search) || statusFilter !== 'all' || roomTypeFilter !== 'all' || channelFilter !== 'all';
  const rangeLabel = `${formatUtc(viewStart, { month: 'short', day: 'numeric' })} – ${formatUtc(addUtcDays(viewStart, VIEW_DAYS - 1), { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const legendStatuses: ReservationStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out', 'no_show'];

  return (
    <div className="space-y-4">
      <Panel className="relative">
        {loading ? <div className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-foreground/60" aria-hidden="true" /> : null}
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewStart(today)}>Today</Button>
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="size-8" aria-label="Previous two weeks" onClick={() => setViewStart(addUtcDays(viewStart, -VIEW_DAYS))}><ChevronLeft aria-hidden="true" /></Button>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Next two weeks" onClick={() => setViewStart(addUtcDays(viewStart, VIEW_DAYS))}><ChevronRight aria-hidden="true" /></Button>
            </div>
            <p className="text-sm font-semibold tabular-nums">{rangeLabel}</p>
            <span className="text-xs text-muted-foreground">· {pluralize(inViewCount, 'stay')} in view</span>
          </div>
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="self-start lg:self-auto">
              <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden="true" />Refresh
            </Button>
          ) : null}
        </div>
        <PanelToolbar>
          <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search guest, confirmation or room">
            <WorkspaceSelect label="Filter by status" value={statusFilter} onChange={setStatusFilter}>
              <option value="all">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{statusMeta('booking', value).label}</option>)}
            </WorkspaceSelect>
            <WorkspaceSelect label="Filter by room type" value={roomTypeFilter} onChange={setRoomTypeFilter}>
              <option value="all">All room types</option>
              {roomTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </WorkspaceSelect>
            <WorkspaceSelect label="Filter by channel" value={channelFilter} onChange={setChannelFilter}>
              <option value="all">All channels</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </WorkspaceSelect>
            {filtered ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button> : null}
          </WorkspaceControls>
        </PanelToolbar>

        {conflictCount > 0 ? (
          <div className="border-b px-4 py-3 sm:px-5">
            <Callout tone="warning" title={`${conflictCount} reservations overlap on the same room in this view`}>
              Overlapping bars are outlined. Move or reassign one of each pair before arrival.
            </Callout>
          </div>
        ) : null}

        {rowDefinitions.length === 0 && !loading ? (
          <WorkspaceEmpty
            icon={CalendarDays}
            title={filtered ? 'No rooms match these filters' : 'No rooms configured'}
            description={filtered ? 'Clear the filters to see the full room calendar.' : 'Create rooms and room types before reservations can be placed on the calendar.'}
            onClear={filtered ? clearFilters : undefined}
          />
        ) : (
          <div data-qa-layout="reservation-calendar-scroll" className="max-w-full overflow-x-auto">
            <div className={cn('min-w-[980px] select-none', draggingId && 'cursor-grabbing')}>
              <div className="sticky top-0 z-20 grid grid-cols-[11rem_minmax(0,1fr)] border-b bg-card">
                <div className="sticky left-0 z-10 flex items-end border-r bg-card px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Room</div>
                <div ref={gridRef} className="grid grid-cols-14">
                  {days.map((day) => {
                    const isToday = isSameUtcDay(day, today);
                    const weekend = [0, 6].includes(day.getUTCDay());
                    return (
                      <div key={day.toISOString()} className={cn('border-l px-1 pb-2 pt-3 text-center', weekend && 'bg-muted/40')}>
                        <p className={cn('text-[11px] font-medium uppercase tracking-wide text-muted-foreground', isToday && 'text-foreground')}>{formatUtc(day, { weekday: 'short' })}</p>
                        <p className={cn('mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-sm tabular-nums', isToday ? 'bg-foreground font-semibold text-background' : 'text-foreground')}>{formatUtc(day, { day: 'numeric' })}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {rowDefinitions.map((row) => {
                const rowReservations = reservationsByRow.get(row.id) || [];
                const metrics = rowMetrics.get(row.id);
                const conflicts = metrics?.conflicts || new Set<string>();
                const positions = metrics?.positions || new Map<string, number>();
                const rowHeight = metrics?.height || LANE_HEIGHT + 8;
                return (
                  <div key={row.id} className="grid grid-cols-[11rem_minmax(0,1fr)] border-b last:border-b-0">
                    <div className={cn('sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r bg-card px-4', row.unassigned && 'bg-amber-500/[0.04]')} style={{ minHeight: rowHeight }}>
                      <div className="min-w-0">
                        <p className={cn('truncate text-sm font-medium', row.unassigned && 'text-amber-800 dark:text-amber-300')}>{row.unassigned ? 'Unassigned' : `Room ${row.label}`}</p>
                        {row.roomTypeName ? <p className="truncate text-[11px] text-muted-foreground">{row.roomTypeName}</p> : null}
                      </div>
                      {row.roomStatus && !['vacant', 'occupied', 'inspected'].includes(row.roomStatus) ? (
                        <span className={cn('ml-auto size-1.5 shrink-0 rounded-full', TONE_DOT[statusMeta('room', row.roomStatus).tone])} title={statusMeta('room', row.roomStatus).label} />
                      ) : null}
                    </div>
                    <div className="relative" style={{ height: rowHeight }}>
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-14" aria-hidden="true">
                        {days.map((day) => (
                          <div key={day.toISOString()} className={cn('border-l', [0, 6].includes(day.getUTCDay()) && 'bg-muted/30', isSameUtcDay(day, today) && 'bg-sky-500/[0.05]')} />
                        ))}
                      </div>
                      {rowReservations.map((reservation) => {
                        const range = getReservationRange(reservation);
                        const startIndex = utcDayDifference(range.start, viewStart);
                        const endIndex = utcDayDifference(range.end, viewStart);
                        const clampedStart = Math.max(0, startIndex);
                        const clampedEnd = Math.min(VIEW_DAYS, endIndex);
                        if (clampedEnd <= 0 || clampedStart >= VIEW_DAYS) return null;
                        const lane = positions.get(reservation.id) || 0;
                        const span = Math.max(clampedEnd - clampedStart, 0.6);
                        const hasConflict = conflicts.has(reservation.id);
                        const tone = statusMeta('booking', reservation.status).tone;
                        const clippedLeft = startIndex < 0;
                        const clippedRight = endIndex > VIEW_DAYS;
                        return (
                          <div
                            key={reservation.id}
                            className={cn(
                              'group absolute flex items-center overflow-hidden border border-l-[3px] text-xs shadow-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              TONE_SURFACE[tone],
                              TONE_EDGE[tone],
                              clippedLeft ? 'rounded-l-none' : 'rounded-l-md',
                              clippedRight ? 'rounded-r-none' : 'rounded-r-md',
                              hasConflict && 'ring-2 ring-amber-500/80 ring-offset-1 ring-offset-card',
                              draggingId === reservation.id && 'z-10 shadow-lg ring-2 ring-foreground/30',
                              selectedReservationId === reservation.id && 'ring-2 ring-foreground/60',
                            )}
                            style={{
                              left: `calc(${(clampedStart / VIEW_DAYS) * 100}% + 3px)`,
                              width: `calc(${(span / VIEW_DAYS) * 100}% - 6px)`,
                              top: lane * LANE_HEIGHT + 6,
                              height: LANE_HEIGHT - 6,
                            }}
                            onClick={() => handleSelectReservation(reservation)}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSelectReservation(reservation); } }}
                            role="button"
                            tabIndex={0}
                            aria-label={`${reservation.guestName}, ${statusMeta('booking', reservation.status).label}, ${formatStayRange(reservation.checkInDate, reservation.checkOutDate)}`}
                          >
                            {DATE_AMENDABLE_STATUSES.has(reservation.status) ? <>
                              <div className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize" onMouseDown={(event) => handleStartDrag(event, reservation, 'resize-start')} />
                              <div className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize" onMouseDown={(event) => handleStartDrag(event, reservation, 'resize-end')} />
                            </> : null}
                            <div className={cn('flex h-full min-w-0 flex-1 items-center gap-1 pl-1.5 pr-2', DATE_AMENDABLE_STATUSES.has(reservation.status) ? 'cursor-grab' : 'cursor-pointer')} onMouseDown={(event) => handleStartDrag(event, reservation, 'move')}>
                              {DATE_AMENDABLE_STATUSES.has(reservation.status) ? <GripVertical className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" aria-hidden="true" /> : null}
                              <span className="truncate font-medium">{reservation.guestName}</span>
                              {hasConflict ? <AlertTriangle className="size-3 shrink-0 text-amber-600" aria-label="Potential conflict" /> : null}
                              {span >= 2 ? <span className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums opacity-70">{pluralize(nightsBetween(reservation.checkInDate, reservation.checkOutDate), 'nt', 'nts')}</span> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {legendStatuses.map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', TONE_DOT[statusMeta('booking', status).tone])} aria-hidden="true" />{statusMeta('booking', status).label}</span>
            ))}
          </div>
          <p>Drag a stay to move it; drag its edges to change dates. All dates are UTC business dates.</p>
        </div>
      </Panel>

      <Sheet open={Boolean(selectedReservation)} onOpenChange={(open) => { if (!open) setSelectedReservationId(null); }}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
          {selectedReservation ? (
            <>
              <SheetHeader className="space-y-3 border-b px-5 py-4 pr-12 text-left">
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={selectedReservation.guestName} className="size-10 text-xs" />
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-base">{selectedReservation.guestName}</SheetTitle>
                    <SheetDescription className="font-mono text-xs">{selectedReservation.confirmationNumber}</SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2"><StatusPill kind="booking" value={selectedReservation.status} /></div>
              </SheetHeader>
              <div className="space-y-6 p-5">
                <DetailList
                  items={[
                    { label: 'Stay', value: formatStayRange(selectedReservation.checkInDate, selectedReservation.checkOutDate) },
                    { label: 'Nights', value: nightsBetween(selectedReservation.checkInDate, selectedReservation.checkOutDate) },
                    { label: 'Room', value: selectedReservation.roomNumber ? `Room ${selectedReservation.roomNumber}` : 'Unassigned' },
                    { label: 'Room type', value: selectedReservation.roomTypeName || 'Pending' },
                    { label: 'Guests', value: selectedReservation.numberOfGuests || 1 },
                    { label: 'Source', value: humanize(selectedReservation.source) },
                    { label: 'Total', value: <span className="tabular-nums">{formatMoney(selectedReservation.totalAmount)}</span> },
                    { label: 'Balance due', value: <span className="tabular-nums">{formatMoney(selectedReservation.balanceDue)}</span> },
                  ]}
                />

                {['pending', 'confirmed'].includes(selectedReservation.status) && onUpdateStayDates ? (
                  <SubSection title="Change dates" description="Saved dates are repriced and conflict-checked by the server.">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <Field label="Arrival" htmlFor="manualCheckIn"><FieldInput id="manualCheckIn" type="date" value={manualCheckIn} onChange={(event) => setManualCheckIn(event.target.value)} /></Field>
                      <Field label="Departure" htmlFor="manualCheckOut"><FieldInput id="manualCheckOut" type="date" value={manualCheckOut} onChange={(event) => setManualCheckOut(event.target.value)} /></Field>
                      <Button size="sm" variant="outline" className="h-9" onClick={saveManualStayDates} disabled={savingDates || !manualCheckIn || !manualCheckOut}>{savingDates ? 'Saving…' : 'Save dates'}</Button>
                    </div>
                  </SubSection>
                ) : null}

                <SubSection title="Actions">
                  <div className="flex flex-wrap gap-2">
                    {selectedReservation.status === 'pending' ? <Button size="sm" disabled={Boolean(actionPending)} onClick={() => handleStatusChange(selectedReservation.id, 'confirmed')}><CheckCircle2 aria-hidden="true" />Confirm reservation</Button> : null}
                    {selectedReservation.status === 'confirmed' ? (
                      <>
                        <Button size="sm" disabled={Boolean(actionPending)} onClick={() => handleStatusChange(selectedReservation.id, 'checked_in')}><LogIn aria-hidden="true" />Check in</Button>
                        <Button size="sm" variant="outline" disabled={Boolean(actionPending)} onClick={() => handleStatusChange(selectedReservation.id, 'no_show')}><UserRoundX aria-hidden="true" />Mark no-show</Button>
                      </>
                    ) : null}
                    {selectedReservation.status === 'checked_in' ? <Button size="sm" disabled={Boolean(actionPending)} onClick={() => handleStatusChange(selectedReservation.id, 'checked_out')}><LogOut aria-hidden="true" />Check out</Button> : null}
                    <Button size="sm" variant="outline" asChild><Link href={`/dashboard/platform/folios?bookingId=${selectedReservation.id}`}><ReceiptText aria-hidden="true" />Open folio</Link></Button>
                    <Button size="sm" variant="ghost" asChild><Link href={`/dashboard/bookings/${selectedReservation.id}`}>Reservation record</Link></Button>
                  </div>
                  {['pending', 'confirmed'].includes(selectedReservation.status) && onCancel ? (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.04] px-3 py-2.5">
                      <p className="text-xs text-rose-900 dark:text-rose-200">Cancelling applies the reservation&apos;s snapshotted refund policy.</p>
                      <Button size="sm" variant="destructive" onClick={() => onCancel(selectedReservation.id)}><XCircle aria-hidden="true" />Cancel</Button>
                    </div>
                  ) : null}
                </SubSection>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ReservationCalendar;
