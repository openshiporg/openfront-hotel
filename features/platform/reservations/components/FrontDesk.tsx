'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRightLeft,
  Check,
  ClipboardList,
  DoorOpen,
  LogIn,
  LogOut,
  MessageSquareQuote,
  MoreHorizontal,
  PanelRightOpen,
  ReceiptText,
  UserRoundX,
  Users,
  X,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { Field, FieldInput, NativeSelect } from '@/features/platform/components/Form';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { DetailList, InitialsAvatar, Panel, PanelToolbar, SectionLabel, SubSection } from '@/features/platform/components/Surface';
import { WorkspaceTabs, WorkspaceTabsContent, WorkspaceTabsList, WorkspaceTabsTrigger } from '@/features/platform/components/Tabs';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatMoney, formatStayRange, humanize, nightsBetween, pluralize, utcDayKey } from '@/features/platform/lib/format';
import { LoyaltyStayPanel } from '@/features/platform/loyalty/components/LoyaltyStayPanel';
import RelocationPanel from '@/features/platform/relocations/components/RelocationPanel';
import { StayServiceDesk } from '@/features/platform/stay-service/components/StayServiceDesk';
import { InHouseStayControls } from './InHouseStayControls';

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
  /** Reload the workspace after an in-house stay change so dates, room and balance are current. */
  onStayChanged?: () => Promise<void> | void;
  onResolveModification?: (
    bookingId: string,
    decision: 'approved' | 'declined',
    checkInDate?: string,
    checkOutDate?: string,
    staffNote?: string
  ) => Promise<void> | void;
}

type View = 'arrivals' | 'in_house' | 'departures' | 'requests';
type Resolution = { checkInDate: string; checkOutDate: string; staffNote: string };

export function FrontDesk({
  reservations,
  availableRooms = [],
  businessDate,
  loading,
  onStatusChange,
  onAssignRoom,
  onCancel,
  onStayChanged,
  onResolveModification,
}: FrontDeskProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [view, setView] = React.useState<View>('arrivals');
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [selectedRoomByReservation, setSelectedRoomByReservation] = React.useState<Record<string, string>>({});
  const [modificationResolutionByReservation, setModificationResolutionByReservation] = React.useState<Record<string, Resolution>>({});

  const today = utcDayKey(businessDate || new Date());

  const filteredReservations = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return reservations;
    return reservations.filter((reservation) =>
      reservation.guestName.toLowerCase().includes(term) ||
      reservation.confirmationNumber.toLowerCase().includes(term) ||
      (reservation.roomNumber || '').toLowerCase().includes(term)
    );
  }, [reservations, search]);

  const arrivals = filteredReservations.filter((reservation) =>
    utcDayKey(reservation.checkInDate) === today &&
    !['cancelled', 'cancellation_pending', 'no_show', 'checked_out'].includes(reservation.status)
  );
  const departures = filteredReservations.filter((reservation) =>
    utcDayKey(reservation.checkOutDate) === today && reservation.status === 'checked_in'
  );
  const modificationRequests = filteredReservations.filter((reservation) =>
    reservation.hasPendingModificationRequest && ['pending', 'confirmed'].includes(reservation.status)
  );
  const inHouse = filteredReservations.filter((reservation) => {
    const checkIn = utcDayKey(reservation.checkInDate);
    const checkOut = utcDayKey(reservation.checkOutDate);
    return reservation.status === 'checked_in' && checkIn <= today && checkOut > today;
  });

  const lists: Record<View, FrontDeskReservation[]> = { arrivals, in_house: inHouse, departures, requests: modificationRequests };
  const visible = lists[view];
  const arrivalsAwaitingRoom = arrivals.filter((reservation) => !reservation.roomNumber && reservation.status !== 'checked_in').length;
  const departuresWithBalance = departures.filter((reservation) => Number(reservation.balanceDue || 0) > 0).length;
  const arrivedToday = arrivals.filter((reservation) => reservation.status === 'checked_in').length;

  const run = async (key: string, action: () => Promise<void> | void) => {
    setPending(key);
    try { await action(); } finally { setPending(null); }
  };

  const handleStatusChange = (id: string, status: FrontDeskStatus) => run(`${id}:${status}`, async () => { if (onStatusChange) await onStatusChange(id, status); });

  const getModificationResolution = (reservation: FrontDeskReservation): Resolution => {
    const existing = modificationResolutionByReservation[reservation.id];
    if (existing) return existing;
    return {
      checkInDate: utcDayKey(reservation.pendingModificationRequest?.requestedCheckInDate || reservation.checkInDate),
      checkOutDate: utcDayKey(reservation.pendingModificationRequest?.requestedCheckOutDate || reservation.checkOutDate),
      staffNote: '',
    };
  };

  const updateModificationResolution = (reservation: FrontDeskReservation, updates: Partial<Resolution>) => {
    setModificationResolutionByReservation((prev) => ({
      ...prev,
      [reservation.id]: { ...(prev[reservation.id] || getModificationResolution(reservation)), ...updates },
    }));
  };

  const handleResolveModification = (reservation: FrontDeskReservation, decision: 'approved' | 'declined') => run(`${reservation.id}:${decision}`, async () => {
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
  });

  const handleAssignRoom = (reservationId: string) => run(`${reservationId}:assign`, async () => {
    const selectedRoomId = selectedRoomByReservation[reservationId];
    if (!onAssignRoom || !selectedRoomId) return;
    await onAssignRoom(reservationId, selectedRoomId);
    setSelectedRoomByReservation((prev) => {
      const next = { ...prev };
      delete next[reservationId];
      return next;
    });
  });

  const openFolio = (reservationId: string) => router.push(`/dashboard/platform/folios?bookingId=${reservationId}`);
  const workspace = reservations.find((reservation) => reservation.id === workspaceId) || null;

  const roomAssigner = (reservation: FrontDeskReservation, compact = false) => (
    <RoomAssigner
      reservation={reservation}
      rooms={availableRooms}
      value={selectedRoomByReservation[reservation.id] || ''}
      onChange={(roomId) => setSelectedRoomByReservation((prev) => ({ ...prev, [reservation.id]: roomId }))}
      onAssign={() => handleAssignRoom(reservation.id)}
      busy={pending === `${reservation.id}:assign`}
      compact={compact}
    />
  );

  const emptyCopy: Record<View, { title: string; description: string }> = {
    arrivals: { title: 'No arrivals for this business date', description: 'Reservations arriving today appear here once confirmed or pending.' },
    in_house: { title: 'No guests in house', description: 'Checked-in stays that continue past today appear here.' },
    departures: { title: 'No departures due today', description: 'Checked-in guests scheduled to leave today appear here.' },
    requests: { title: 'No change requests waiting', description: 'Guest date-change requests that need a staff decision appear here.' },
  };

  return (
    <div className="space-y-6">
      <StatStrip
        loading={loading && !reservations.length}
        items={[
          { label: 'Arrivals', value: arrivals.length, tone: 'info', hint: arrivalsAwaitingRoom ? `${arrivalsAwaitingRoom} awaiting a room` : arrivedToday ? `${arrivedToday} already checked in` : 'All rooms assigned', onSelect: () => setView('arrivals'), active: view === 'arrivals' },
          { label: 'In house', value: inHouse.length, tone: 'success', hint: 'Stays continuing past today', onSelect: () => setView('in_house'), active: view === 'in_house' },
          { label: 'Departures', value: departures.length, tone: 'warning', hint: departuresWithBalance ? `${departuresWithBalance} with balance due` : 'No open balances', onSelect: () => setView('departures'), active: view === 'departures' },
          { label: 'Change requests', value: modificationRequests.length, tone: 'accent', hint: modificationRequests.length ? 'Awaiting staff decision' : 'Nothing waiting', onSelect: () => setView('requests'), active: view === 'requests' },
        ]}
      />

      <Panel>
        <div className="flex flex-col gap-3 border-b px-4 pt-2 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <FilterTabs
            label="Front desk queue"
            value={view}
            onChange={(next) => setView(next as View)}
            tabs={[
              { value: 'arrivals', label: 'Arrivals', count: arrivals.length },
              { value: 'in_house', label: 'In house', count: inHouse.length },
              { value: 'departures', label: 'Departures', count: departures.length },
              { value: 'requests', label: 'Change requests', count: modificationRequests.length, tone: modificationRequests.length ? 'accent' : undefined },
            ]}
          />
          <div className="pb-2 lg:w-80">
            <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search guest, confirmation or room" searchClassName="md:max-w-none" />
          </div>
        </div>

        {loading && !reservations.length ? (
          <WorkspaceLoading label="Loading front desk queue" className="rounded-none border-0" />
        ) : visible.length === 0 ? (
          <WorkspaceEmpty
            title={search ? 'No reservations match this search' : emptyCopy[view].title}
            description={search ? 'Try a guest name, confirmation number or room.' : emptyCopy[view].description}
            onClear={search ? () => setSearch('') : undefined}
            icon={view === 'requests' ? MessageSquareQuote : view === 'departures' ? LogOut : view === 'in_house' ? Users : DoorOpen}
          />
        ) : (
          <ul className="divide-y">
            {visible.map((reservation) => view === 'requests' ? (
              <ChangeRequestRow
                key={reservation.id}
                reservation={reservation}
                resolution={getModificationResolution(reservation)}
                onChange={(updates) => updateModificationResolution(reservation, updates)}
                onApprove={onResolveModification ? () => handleResolveModification(reservation, 'approved') : undefined}
                onDecline={onResolveModification ? () => handleResolveModification(reservation, 'declined') : undefined}
                busy={pending?.startsWith(`${reservation.id}:`) || false}
                onOpen={() => setWorkspaceId(reservation.id)}
              />
            ) : (
              <QueueRow
                key={reservation.id}
                reservation={reservation}
                view={view}
                pending={pending}
                roomControl={onAssignRoom && !reservation.roomNumber && view !== 'departures' ? roomAssigner(reservation, true) : null}
                onStatusChange={handleStatusChange}
                onCancel={view === 'arrivals' && onCancel ? () => run(`${reservation.id}:cancel`, () => onCancel(reservation.id)) : undefined}
                onOpenFolio={() => openFolio(reservation.id)}
                onOpenWorkspace={() => setWorkspaceId(reservation.id)}
              />
            ))}
          </ul>
        )}
        {visible.length ? (
          <PanelToolbar className="border-b-0 border-t bg-muted/20 py-2.5">
            <p className="text-xs text-muted-foreground">
              Showing {pluralize(visible.length, 'reservation')} for business date {today}. Open <span className="font-medium text-foreground">Manage stay</span> for keys, occupants, service cases, loyalty and relocation.
            </p>
          </PanelToolbar>
        ) : null}
      </Panel>

      <Sheet open={Boolean(workspace)} onOpenChange={(open) => { if (!open) setWorkspaceId(null); }}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          {workspace ? (
            <>
              <SheetHeader className="space-y-3 border-b px-5 py-4 pr-12 text-left">
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={workspace.guestName} className="size-10 text-xs" />
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-base">{workspace.guestName}</SheetTitle>
                    <SheetDescription className="text-xs">
                      <span className="font-mono">{workspace.confirmationNumber}</span> · {formatStayRange(workspace.checkInDate, workspace.checkOutDate)} · {pluralize(nightsBetween(workspace.checkInDate, workspace.checkOutDate), 'night')}
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill kind="booking" value={workspace.status} />
                  <Tag>{workspace.roomNumber ? `Room ${workspace.roomNumber}` : 'Unassigned'}{workspace.roomTypeName ? ` · ${workspace.roomTypeName}` : ''}</Tag>
                  {Number(workspace.balanceDue || 0) > 0 ? <Tag className="border-amber-500/30 text-amber-800 dark:text-amber-300">Balance {formatMoney(workspace.balanceDue)}</Tag> : <Tag>Settled</Tag>}
                </div>
              </SheetHeader>
              <WorkspaceTabs key={workspace.id} defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
                <WorkspaceTabsList>
                  <WorkspaceTabsTrigger value="overview">Overview</WorkspaceTabsTrigger>
                  {workspace.status === 'checked_in' ? <WorkspaceTabsTrigger value="stay">Stay & keys</WorkspaceTabsTrigger> : null}
                  <WorkspaceTabsTrigger value="services">Services</WorkspaceTabsTrigger>
                  {workspace.status === 'checked_in' ? <WorkspaceTabsTrigger value="loyalty">Loyalty</WorkspaceTabsTrigger> : null}
                  <WorkspaceTabsTrigger value="relocation">Relocation</WorkspaceTabsTrigger>
                </WorkspaceTabsList>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <WorkspaceTabsContent value="overview" className="space-y-6 p-5">
                    <DetailList
                      items={[
                        { label: 'Stay', value: formatStayRange(workspace.checkInDate, workspace.checkOutDate) },
                        { label: 'Guests', value: workspace.numberOfGuests ?? '—' },
                        { label: 'Source', value: humanize(workspace.source) },
                        { label: 'Total', value: <span className="tabular-nums">{formatMoney(workspace.totalAmount)}</span> },
                        { label: 'Balance due', value: <span className="tabular-nums">{formatMoney(workspace.balanceDue)}</span> },
                        { label: 'Room status', value: workspace.roomStatus ? <StatusPill kind="room" value={workspace.roomStatus} /> : '—' },
                      ]}
                    />
                    {workspace.internalNotes ? (
                      <div className="space-y-1.5">
                        <SectionLabel>Internal notes</SectionLabel>
                        <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">{workspace.internalNotes}</p>
                      </div>
                    ) : null}
                    {onAssignRoom && (!workspace.roomNumber || workspace.status === 'checked_in') ? (
                      <SubSection
                        title={workspace.status === 'checked_in' ? 'Move room' : 'Assign room'}
                        description="Only ready rooms of the booked room type are offered."
                      >
                        {roomAssigner(workspace)}
                      </SubSection>
                    ) : null}
                    <div className="flex flex-wrap gap-2 border-t pt-5">
                      <Button size="sm" variant="outline" onClick={() => openFolio(workspace.id)}><ReceiptText aria-hidden="true" />Open folio</Button>
                      <Button size="sm" variant="ghost" asChild><Link href={`/dashboard/bookings/${workspace.id}`}>Reservation record</Link></Button>
                    </div>
                  </WorkspaceTabsContent>
                  {workspace.status === 'checked_in' ? (
                    <WorkspaceTabsContent value="stay" className="p-5">
                      <InHouseStayControls key={workspace.id} bookingId={workspace.id} checkInDate={workspace.checkInDate} checkOutDate={workspace.checkOutDate} onSaved={onStayChanged} />
                    </WorkspaceTabsContent>
                  ) : null}
                  <WorkspaceTabsContent value="services" className="p-5">
                    <StayServiceDesk bookingId={workspace.id} />
                  </WorkspaceTabsContent>
                  {workspace.status === 'checked_in' ? (
                    <WorkspaceTabsContent value="loyalty" className="p-5">
                      <LoyaltyStayPanel bookingId={workspace.id} />
                    </WorkspaceTabsContent>
                  ) : null}
                  <WorkspaceTabsContent value="relocation" className="p-5">
                    <RelocationPanel bookingId={workspace.id} />
                  </WorkspaceTabsContent>
                </div>
              </WorkspaceTabs>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GuestIdentity({ reservation, children }: { reservation: FrontDeskReservation; children?: React.ReactNode }) {
  const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <InitialsAvatar name={reservation.guestName} className="mt-0.5" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-foreground">{reservation.guestName}</p>
          <StatusPill kind="booking" value={reservation.status} />
          {children}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{reservation.confirmationNumber}</span>
          <span>{formatStayRange(reservation.checkInDate, reservation.checkOutDate)} · {pluralize(nights, 'night')}</span>
          {reservation.numberOfGuests ? <span>{pluralize(reservation.numberOfGuests, 'guest')}</span> : null}
          {reservation.source ? <span>{humanize(reservation.source)}</span> : null}
        </p>
      </div>
    </div>
  );
}

function QueueRow({
  reservation,
  view,
  pending,
  roomControl,
  onStatusChange,
  onCancel,
  onOpenFolio,
  onOpenWorkspace,
}: {
  reservation: FrontDeskReservation;
  view: Exclude<View, 'requests'>;
  pending: string | null;
  roomControl: React.ReactNode;
  onStatusChange: (id: string, status: FrontDeskStatus) => void;
  onCancel?: () => void;
  onOpenFolio: () => void;
  onOpenWorkspace: () => void;
}) {
  const busy = pending?.startsWith(`${reservation.id}:`) || false;
  const balance = Number(reservation.balanceDue || 0);

  let primary: React.ReactNode = null;
  if (view === 'arrivals' && reservation.status === 'pending') {
    primary = <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatusChange(reservation.id, 'confirmed')}><Check aria-hidden="true" />Confirm</Button>;
  } else if (view === 'arrivals' && reservation.status === 'confirmed') {
    primary = <Button size="sm" disabled={busy} onClick={() => onStatusChange(reservation.id, 'checked_in')}><LogIn aria-hidden="true" />Check in</Button>;
  } else if (view === 'in_house' || view === 'departures') {
    primary = <Button size="sm" variant={view === 'departures' ? 'default' : 'outline'} disabled={busy} onClick={() => onStatusChange(reservation.id, 'checked_out')}><LogOut aria-hidden="true" />Check out</Button>;
  }

  return (
    <li className={cn('px-4 py-3.5 transition-colors hover:bg-muted/20 sm:px-5', busy && 'opacity-70')}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <GuestIdentity reservation={reservation}>
          {reservation.hasPendingModificationRequest ? <StatusPill tone="accent" label="Change requested" /> : null}
        </GuestIdentity>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pl-11 xl:w-[24rem] xl:shrink-0 xl:pl-0">
          <div className="min-w-0">
            {reservation.roomNumber ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Room {reservation.roomNumber}</span>
                {reservation.roomStatus ? <StatusPill kind="room" value={reservation.roomStatus} /> : null}
                {reservation.roomTypeName ? <span className="w-full truncate text-xs text-muted-foreground">{reservation.roomTypeName}</span> : null}
              </div>
            ) : roomControl ? roomControl : (
              <div className="text-sm">
                <span className="font-medium text-muted-foreground">Unassigned</span>
                {reservation.roomTypeName ? <span className="block truncate text-xs text-muted-foreground">{reservation.roomTypeName}</span> : null}
              </div>
            )}
          </div>
          <div className="whitespace-nowrap text-right">
            <p className={cn('text-sm font-medium tabular-nums', balance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>{formatMoney(reservation.balanceDue)}</p>
            <p className="text-[11px] text-muted-foreground">{balance > 0 ? 'Balance due' : 'Settled'}</p>
          </div>
        </div>

        {/* Natural width: a fixed width let "Check out" spill over the balance column. */}
        <div className="flex shrink-0 items-center justify-end gap-1.5 pl-11 xl:min-w-[13.5rem] xl:pl-0">
          {primary}
          <Button size="sm" variant="ghost" onClick={onOpenWorkspace}><PanelRightOpen aria-hidden="true" />Manage</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8" aria-label={`More actions for ${reservation.guestName}`}><MoreHorizontal aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 [&_svg]:size-4">
              <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">{reservation.confirmationNumber}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onOpenWorkspace}><PanelRightOpen aria-hidden="true" />Manage stay</DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenFolio}><ReceiptText aria-hidden="true" />{view === 'in_house' ? 'Add charges' : 'Open folio'}</DropdownMenuItem>
              {view === 'in_house' ? <DropdownMenuItem onSelect={onOpenWorkspace}><ArrowRightLeft aria-hidden="true" />Move room</DropdownMenuItem> : null}
              {view === 'arrivals' && reservation.status === 'confirmed' ? (
                <DropdownMenuItem disabled={busy} onSelect={() => onStatusChange(reservation.id, 'no_show')}><UserRoundX aria-hidden="true" />Mark no-show</DropdownMenuItem>
              ) : null}
              {onCancel ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={busy} className="text-rose-700 focus:text-rose-700 dark:text-rose-400" onSelect={onCancel}><XCircle aria-hidden="true" />Cancel reservation</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

function ChangeRequestRow({
  reservation,
  resolution,
  onChange,
  onApprove,
  onDecline,
  busy,
  onOpen,
}: {
  reservation: FrontDeskReservation;
  resolution: Resolution;
  onChange: (updates: Partial<Resolution>) => void;
  onApprove?: () => void;
  onDecline?: () => void;
  busy: boolean;
  onOpen: () => void;
}) {
  const request = reservation.pendingModificationRequest;
  return (
    <li className="space-y-4 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <GuestIdentity reservation={reservation} />
        <Button size="sm" variant="ghost" className="self-start" onClick={onOpen}><PanelRightOpen aria-hidden="true" />Manage</Button>
      </div>
      <div className="grid gap-4 rounded-lg border border-violet-500/20 bg-violet-500/[0.03] p-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <SectionLabel>Guest request</SectionLabel>
          {request?.guestMessage ? (
            <blockquote className="border-l-2 border-violet-500/40 pl-3 text-sm italic text-foreground/90 [overflow-wrap:anywhere]">{request.guestMessage}</blockquote>
          ) : <p className="text-sm text-muted-foreground">No message from the guest.</p>}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Currently booked</dt><dd className="font-medium">{formatStayRange(reservation.checkInDate, reservation.checkOutDate)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Requested</dt><dd className="font-medium text-violet-800 dark:text-violet-300">{request?.requestedCheckInDate && request?.requestedCheckOutDate ? formatStayRange(request.requestedCheckInDate, request.requestedCheckOutDate) : 'Dates not specified'}</dd></div>
          </dl>
        </div>
        <div className="min-w-0 space-y-3">
          <SectionLabel>Staff decision</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Arrival" htmlFor={`mod-in-${reservation.id}`}>
              <FieldInput id={`mod-in-${reservation.id}`} type="date" value={resolution.checkInDate} onChange={(event) => onChange({ checkInDate: event.target.value })} />
            </Field>
            <Field label="Departure" htmlFor={`mod-out-${reservation.id}`}>
              <FieldInput id={`mod-out-${reservation.id}`} type="date" value={resolution.checkOutDate} onChange={(event) => onChange({ checkOutDate: event.target.value })} />
            </Field>
          </div>
          <Field label="Staff note" htmlFor={`mod-note-${reservation.id}`} optional>
            <FieldInput id={`mod-note-${reservation.id}`} value={resolution.staffNote} onChange={(event) => onChange({ staffNote: event.target.value })} placeholder="Shared in the decision record" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {onApprove ? <Button size="sm" disabled={busy} onClick={onApprove}><Check aria-hidden="true" />Approve change</Button> : null}
            {onDecline ? <Button size="sm" variant="outline" disabled={busy} onClick={onDecline}><X aria-hidden="true" />Decline</Button> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function RoomAssigner({
  reservation,
  rooms,
  value,
  onChange,
  onAssign,
  busy,
  compact,
}: {
  reservation: FrontDeskReservation;
  rooms: FrontDeskRoomOption[];
  value: string;
  onChange: (roomId: string) => void;
  onAssign: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const compatibleRooms = rooms.filter((room) => room.roomType?.id === reservation.roomTypeId);
  if (!compatibleRooms.length) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <ClipboardList className="size-3.5 shrink-0" aria-hidden="true" />
        No ready {reservation.roomTypeName || 'room'} available
      </p>
    );
  }
  return (
    <div className={cn('flex min-w-0 gap-1.5', compact ? 'max-w-[15rem]' : 'max-w-sm')}>
      <NativeSelect
        aria-label={`Ready room for ${reservation.guestName}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn('flex-1', compact && '[&_select]:h-8')}
      >
        <option value="">{compact ? 'Assign room…' : 'Select a ready room'}</option>
        {compatibleRooms.map((room) => <option key={room.id} value={room.id}>Room {room.roomNumber}{room.roomType?.name ? ` · ${room.roomType.name}` : ''}</option>)}
      </NativeSelect>
      <Button size="sm" variant="outline" className={compact ? 'h-8' : 'h-9'} onClick={onAssign} disabled={!value || busy}>
        {reservation.status === 'checked_in' ? 'Move' : 'Assign'}
      </Button>
    </div>
  );
}

export default FrontDesk;
