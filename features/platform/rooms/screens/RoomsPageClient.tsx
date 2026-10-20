'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BedDouble, ExternalLink, Layers, MoreHorizontal, RefreshCw, Sparkles, StickyNote, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { FilterTabs, Segmented } from '@/features/platform/components/FilterTabs';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Panel, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { Pagination } from '@/features/dashboard/components/Pagination';
import { formatDateTime, humanize, pluralize } from '@/features/platform/lib/format';
import { statusMeta, TONE_DOT, TONE_SURFACE } from '@/features/platform/lib/status';
import { cn } from '@/lib/utils';
import { useDebouncedSearch, useListUrlState } from '@/features/platform/lib/listUrlState';
import { updateRoomStatusAction, type RoomListPage } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const ROOM_STATUSES = ['vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order'] as const;

type RoomAction = (roomId: string, nextStatus: string, notes: string) => void;

/** Readiness transitions shared by the floor board tiles and the list rows. */
function RoomActions({ room, disabled, onMark }: { room: any; disabled: boolean; onMark: RoomAction }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" disabled={disabled} aria-label={`Actions for room ${room.roomNumber}`}><MoreHorizontal aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 [&_svg]:size-4">
        <DropdownMenuLabel>Room {room.roomNumber} readiness</DropdownMenuLabel>
        <DropdownMenuItem disabled={room.status === 'vacant'} onSelect={() => onMark(room.id, 'vacant', 'Marked ready from room readiness workspace')}><BedDouble aria-hidden="true" />Mark ready</DropdownMenuItem>
        <DropdownMenuItem disabled={room.status === 'cleaning'} onSelect={() => onMark(room.id, 'cleaning', 'Sent to cleaning from room readiness workspace')}><Sparkles aria-hidden="true" />Send to cleaning</DropdownMenuItem>
        <DropdownMenuItem disabled={room.status === 'out_of_order'} className="text-rose-700 focus:text-rose-700 dark:text-rose-400" onSelect={() => onMark(room.id, 'out_of_order', 'Marked out of order from room readiness workspace')}><Wrench aria-hidden="true" />Mark out of order</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/dashboard/platform/maintenance"><Wrench aria-hidden="true" />Open maintenance queue</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Floor-by-floor room grid: the housekeeping supervisor's mental model of the building. */
function RoomFloorBoard({ rooms, updating, onMark }: { rooms: any[]; updating: string | null; onMark: RoomAction }) {
  const floors = React.useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const room of rooms) {
      const key = room.floor === null || room.floor === undefined || room.floor === '' ? 'Unassigned' : String(room.floor);
      groups.set(key, [...(groups.get(key) || []), room]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : Number(a) - Number(b) || a.localeCompare(b)));
  }, [rooms]);

  return (
    <div className="divide-y">
      {floors.map(([floor, floorRooms]) => {
        const ready = floorRooms.filter((room) => ['vacant', 'inspected'].includes(room.status)).length;
        return (
          <section key={floor} aria-label={floor === 'Unassigned' ? 'Rooms without a floor' : `Floor ${floor}`} className="px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />{floor === 'Unassigned' ? 'No floor set' : `Floor ${floor}`}</h3>
              <p className="text-xs tabular-nums text-muted-foreground">{ready} of {pluralize(floorRooms.length, 'room')} ready</p>
            </div>
            <ul className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {floorRooms.map((room) => {
                const meta = statusMeta('room', room.status);
                return (
                  <li key={room.id} className={cn('relative flex min-h-[6.5rem] flex-col rounded-lg border px-3 py-2.5 transition-opacity', TONE_SURFACE[meta.tone], updating === room.id && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="text-base font-semibold leading-6 tabular-nums">{room.roomNumber}</p>
                        <p className="truncate text-[11px] leading-4 opacity-80">{room.roomType?.name || 'No room type'}</p>
                      </div>
                      <div className="-mr-1.5 -mt-1"><RoomActions room={room} disabled={updating === room.id} onMark={onMark} /></div>
                    </div>
                    <div className="mt-auto space-y-1 pt-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium"><span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[meta.tone])} aria-hidden="true" />{meta.label}</p>
                      {room.activeTask ? (
                        <p className="flex items-center gap-1 truncate text-[11px] opacity-80"><Sparkles className="size-3 shrink-0" aria-hidden="true" />{humanize(room.activeTask.taskType)} · {statusMeta('task', room.activeTask.status).label}</p>
                      ) : room.notes ? (
                        <p className="flex items-center gap-1 truncate text-[11px] opacity-80" title={room.notes}><StickyNote className="size-3 shrink-0" aria-hidden="true" />{room.notes}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const VIEW_DEFAULTS = { search: '', status: 'all', sort: 'room', view: 'board', page: '1' };

/**
 * Room readiness. The server renders each page for the search, status, sort and page in the
 * URL; this component edits the URL and runs readiness transitions.
 */
export function RoomsPageClient({ data, error }: { data: RoomListPage | null; error: string | null }) {
  const router = useRouter();
  const { values, update, pending } = useListUrlState(VIEW_DEFAULTS);
  const [searchText, setSearchText] = useDebouncedSearch(values.search, (search) => update({ search }));
  const [updating, setUpdating] = React.useState<string | null>(null);
  const rooms = data?.rooms || [];
  const counts = data?.statusCounts || { all: 0, vacant: 0, occupied: 0, cleaning: 0, maintenance: 0, out_of_order: 0 };
  const total = data?.total || 0;
  const status = values.status;
  const view = values.view === 'list' ? 'list' : 'board';

  const handleMarkRoom = async (roomId: string, nextStatus: string, notes: string) => {
    setUpdating(roomId);
    try { unwrapAction(await updateRoomStatusAction(roomId, nextStatus, notes)); router.refresh(); toast.success('Room updated', { description: `Room status set to ${nextStatus.replaceAll('_', ' ')}.` }); }
    catch (cause) { toast.error('Room not updated', { description: cause instanceof Error ? cause.message : 'The room status change was not accepted.' }); }
    finally { setUpdating(null); }
  };

  const count = (value: keyof typeof counts) => counts[value];
  const exceptions = count('maintenance') + count('out_of_order');
  const toggle = (value: string) => update({ status: status === value ? 'all' : value });
  const visibleRooms = rooms;

  return (
    <PlatformPage
      title="Rooms"
      description="Room readiness by floor, with housekeeping and maintenance status."
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={pending}><RefreshCw className={pending ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button variant="ghost" size="sm" asChild><Link href="/dashboard/rooms"><ExternalLink aria-hidden="true" />Room records</Link></Button>
        </>
      )}
    >
      <StatStrip
        loading={false}
        items={[
          { label: 'Vacant', value: count('vacant'), tone: 'success', hint: `of ${counts.all} rooms`, onSelect: () => toggle('vacant'), active: status === 'vacant' },
          { label: 'Occupied', value: count('occupied'), tone: 'info', hint: 'Guests in house', onSelect: () => toggle('occupied'), active: status === 'occupied' },
          { label: 'Cleaning queue', value: count('cleaning'), tone: 'warning', hint: 'Awaiting housekeeping', onSelect: () => toggle('cleaning'), active: status === 'cleaning' },
          { label: 'Out of service', value: exceptions, tone: 'danger', hint: `${count('maintenance')} maintenance · ${count('out_of_order')} out of order`, onSelect: () => toggle('out_of_service'), active: status === 'out_of_service' },
        ]}
      />

      {error ? <WorkspaceError message={error} onRetry={() => router.refresh()} title="Room board unavailable" /> : (
        <Panel>
          <div className="border-b px-4 sm:px-5">
            <FilterTabs
              label="Filter rooms by status"
              value={status}
              onChange={(next) => update({ status: next })}
              tabs={[{ value: 'all', label: 'All rooms', count: counts.all }, ...ROOM_STATUSES.map((value) => ({ value, label: statusMeta('room', value).label, count: count(value), tone: statusMeta('room', value).tone }))]}
            />
          </div>
          <PanelToolbar>
            <WorkspaceControls search={searchText} onSearchChange={setSearchText} searchLabel="Search room, floor, type or note" resultLabel={pending ? 'Searching…' : `${total} ${total === 1 ? 'room' : 'rooms'}`}>
              <Segmented label="Room view" value={view} onChange={(next) => update({ view: next, page: values.page })} options={[{ value: 'board', label: 'Floor board' }, { value: 'list', label: 'List' }]} />
              {view === 'list' ? <WorkspaceSelect label="Sort rooms" value={values.sort} onChange={(sort) => update({ sort })}><option value="room">Sort: room number</option><option value="floor">Sort: floor</option><option value="status">Sort: status</option></WorkspaceSelect> : null}
            </WorkspaceControls>
          </PanelToolbar>
          {visibleRooms.length === 0 ? (
            <WorkspaceEmpty
              icon={BedDouble}
              title={counts.all ? 'No rooms match this view' : 'No rooms configured'}
              description={counts.all ? 'Clear the search or status filter to return to the full room board.' : 'Complete property onboarding before assigning, cleaning, or restricting rooms.'}
              onClear={counts.all || values.search ? () => update({ search: '', status: 'all' }) : undefined}
            />
          ) : view === 'board' ? (
            <RoomFloorBoard rooms={visibleRooms} updating={updating} onMark={handleMarkRoom} />
          ) : (
            <DataTable minWidth="min-w-[760px]">
              <THead>
                <tr>
                  <Th>Room</Th>
                  <Th>Floor</Th>
                  <Th>Status</Th>
                  <Th>Housekeeping</Th>
                  <Th>Last cleaned</Th>
                  <Th>Notes</Th>
                  <Th align="right"><span className="sr-only">Actions</span></Th>
                </tr>
              </THead>
              <TBody>
                {visibleRooms.map((room) => (
                  <Tr key={room.id} className={updating === room.id ? 'opacity-60' : undefined}>
                    <Td>
                      <p className="font-medium">Room {room.roomNumber}</p>
                      <p className="text-xs text-muted-foreground">{room.roomType?.name || 'No room type'}</p>
                    </Td>
                    <Td numeric className="text-muted-foreground">{room.floor ?? '—'}</Td>
                    <Td><StatusPill kind="room" value={room.status} /></Td>
                    <Td>
                      {room.activeTask ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm">{humanize(room.activeTask.taskType)}</span>
                          <StatusPill kind="task" value={room.activeTask.status} />
                        </div>
                      ) : <span className="text-xs text-muted-foreground">No active task</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{room.lastCleaned ? formatDateTime(room.lastCleaned) : '—'}</Td>
                    <Td className="max-w-[16rem]">
                      {room.notes ? (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" title={room.notes}>
                          <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          <span className="line-clamp-2 whitespace-pre-wrap">{room.notes}</span>
                        </p>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </Td>
                    <Td align="right"><RoomActions room={room} disabled={updating === room.id} onMark={handleMarkRoom} /></Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          )}
          {data && total > data.pageSize ? (
            <div className="border-t px-4 py-4">
              <Pagination currentPage={Math.max(1, Number(values.page) || 1)} total={total} pageSize={data.pageSize} list={{ singular: 'room', plural: 'rooms' }} />
            </div>
          ) : null}
        </Panel>
      )}
    </PlatformPage>
  );
}
