'use client';

import React from 'react';
import Link from 'next/link';
import { BedDouble, MoreHorizontal, RefreshCw, Wrench, type LucideIcon } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getRoomsWorkspace, updateRoomStatusAction } from '../actions';

function statusBadge(status: string) {
  const labels: Record<string, string> = { vacant: 'Vacant', occupied: 'Occupied', cleaning: 'Cleaning', maintenance: 'Maintenance', out_of_order: 'Out of order' };
  const classes: Record<string, string> = { vacant: 'bg-green-100 text-green-700', occupied: 'bg-blue-100 text-blue-700', cleaning: 'bg-yellow-100 text-yellow-700', maintenance: 'bg-orange-100 text-orange-700', out_of_order: 'bg-red-100 text-red-700' };
  return <Badge className={classes[status]} variant={classes[status] ? 'default' : 'outline'}>{labels[status] || status.replaceAll('_', ' ')}</Badge>;
}

export function RoomsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rooms, setRooms] = React.useState<any[]>([]);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [sort, setSort] = React.useState('room');
  const [updating, setUpdating] = React.useState<string | null>(null);

  const fetchRooms = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setRooms(await getRoomsWorkspace()); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Unable to load the bounded room projection.'; setError(message); toast({ title: 'Room board unavailable', description: message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);

  React.useEffect(() => { void fetchRooms(); }, [fetchRooms]);

  const handleMarkRoom = async (roomId: string, nextStatus: string, notes: string) => {
    setUpdating(roomId);
    try { await updateRoomStatusAction(roomId, nextStatus, notes); await fetchRooms(); toast({ title: 'Room updated', description: `Room status set to ${nextStatus.replaceAll('_', ' ')}.` }); }
    catch (cause) { toast({ title: 'Room transition refused', description: cause instanceof Error ? cause.message : 'The authoritative room transition was not accepted.', variant: 'destructive' }); }
    finally { setUpdating(null); }
  };

  const visibleRooms = React.useMemo(() => applyWorkspaceView(rooms, {
    search, status, statusOf: (room) => room.status,
    searchText: (room) => [room.roomNumber, room.floor, room.roomType?.name, room.notes, room.activeTask?.taskType],
    sortValue: (room) => sort === 'status' ? room.status : sort === 'floor' ? Number(room.floor || 0) : String(room.roomNumber).padStart(8, '0'), direction: 'asc',
  }), [rooms, search, status, sort]);
  const vacant = rooms.filter((room) => room.status === 'vacant').length;
  const cleaning = rooms.filter((room) => room.status === 'cleaning').length;
  const exceptions = rooms.filter((room) => ['maintenance', 'out_of_order'].includes(room.status)).length;
  const metrics: Array<{ label: string; value: number; Icon: LucideIcon; color: string }> = [
    { label: 'Vacant', value: vacant, Icon: BedDouble, color: 'text-green-500' },
    { label: 'Cleaning queue', value: cleaning, Icon: RefreshCw, color: 'text-yellow-500' },
    { label: 'Maintenance / OOO', value: exceptions, Icon: Wrench, color: 'text-orange-500' },
  ];

  return (
    <PageContainer title="Rooms" header={<div><h1 className="text-lg font-semibold md:text-2xl">Room readiness</h1><p className="text-muted-foreground">Coordinate the bounded room-status model without treating vacant, clean, inspected, assigned, and sellable as interchangeable.</p></div>} breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Rooms' }]}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {metrics.map(({ label, value, Icon, color }) => <Card key={label}><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div><Icon className={`h-6 w-6 ${color}`} aria-hidden="true" /></CardContent></Card>)}
        </div>
        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search room, floor, type, note, or task" resultLabel={workspaceResultLabel(visibleRooms.length, rooms.length, 'rooms')}>
          <WorkspaceSelect label="Filter room status" value={status} onChange={setStatus}><option value="all">All statuses</option><option value="vacant">Vacant</option><option value="occupied">Occupied</option><option value="cleaning">Cleaning</option><option value="maintenance">Maintenance</option><option value="out_of_order">Out of order</option></WorkspaceSelect>
          <WorkspaceSelect label="Sort rooms" value={sort} onChange={setSort}><option value="room">Room number</option><option value="floor">Floor</option><option value="status">Status</option></WorkspaceSelect>
          <Button variant="outline" size="sm" onClick={fetchRooms} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh</Button>
        </WorkspaceControls>
        {error ? <WorkspaceError message={error} onRetry={fetchRooms} /> : loading && rooms.length === 0 ? <WorkspaceLoading label="Loading room readiness" /> : visibleRooms.length === 0 ? <WorkspaceEmpty title={rooms.length ? 'No rooms match this view' : 'No rooms configured'} description={rooms.length ? 'Clear the search or status filter to return to the full bounded room board.' : 'Complete property onboarding before assigning, cleaning, or restricting rooms.'} onClear={rooms.length ? () => { setSearch(''); setStatus('all'); } : undefined} /> : (
          <Card><CardHeader data-qa-layout="operator-card-header" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Room operations board</CardTitle><Button asChild variant="outline" size="sm"><Link href="/dashboard/rooms">Model view</Link></Button></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleRooms.map((room) => <article key={room.id} className="rounded-lg border p-4 transition-colors hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Room {room.roomNumber}</h2>{statusBadge(room.status)}</div><p className="mt-1 text-sm text-muted-foreground">{room.roomType?.name || 'No room type'} · Floor {room.floor || '—'}</p></div>
                <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" disabled={updating === room.id} aria-label={`Actions for room ${room.roomNumber}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Readiness action</DropdownMenuLabel><DropdownMenuItem disabled={room.status === 'vacant'} onSelect={() => handleMarkRoom(room.id, 'vacant', 'Marked ready from room readiness workspace')}>Mark ready</DropdownMenuItem><DropdownMenuItem disabled={room.status === 'cleaning'} onSelect={() => handleMarkRoom(room.id, 'cleaning', 'Sent to cleaning from room readiness workspace')}>Send to cleaning</DropdownMenuItem><DropdownMenuItem disabled={room.status === 'out_of_order'} onSelect={() => handleMarkRoom(room.id, 'out_of_order', 'Marked out of order from room readiness workspace')}>Mark out of order</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/dashboard/platform/maintenance">Open maintenance queue</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </div>
              {room.activeTask ? <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">Next task: {room.activeTask.taskType?.replaceAll('_', ' ')} · {room.activeTask.status?.replaceAll('_', ' ')}</p> : <p className="mt-3 text-sm text-muted-foreground">No active housekeeping task.</p>}
              {room.notes ? <details className="mt-3 text-sm"><summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Operational notes</summary><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{room.notes}</p></details> : null}
            </article>)}
          </CardContent></Card>
        )}
      </div>
    </PageContainer>
  );
}

export default RoomsPage;
