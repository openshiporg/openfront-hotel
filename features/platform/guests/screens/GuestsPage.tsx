'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal, RefreshCw, Star, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getGuestWorkspace } from '../actions';

export function GuestsPage() {
  const { toast } = useToast();
  const [guests, setGuests] = React.useState<any[]>([]);
  const [search, setSearch] = React.useState('');
  const [segment, setSegment] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setGuests(await getGuestWorkspace(search || null)); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Guest profiles could not be loaded.'; setError(message); toast({ title: 'Guest workspace unavailable', description: message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [search, toast]);

  React.useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);

  const visible = React.useMemo(() => applyWorkspaceView(guests, {
    status: segment,
    statusOf: (guest) => guest.isBlacklisted ? 'restricted' : guest.isVip ? 'vip' : 'standard',
    searchText: (guest) => [guest.firstName, guest.lastName, guest.email, guest.phone],
    sortValue: (guest) => sort === 'name' ? `${guest.lastName} ${guest.firstName}`.toLocaleLowerCase() : sort === 'stays' ? Number(guest.totalStays || 0) : guest.updatedAt || '',
    direction: sort === 'recent' || sort === 'stays' ? 'desc' : 'asc',
  }), [guests, segment, sort]);

  return (
    <PageContainer title="Guests" breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Guests' }]} header={<div><h1 className="text-lg font-semibold md:text-2xl">Guest relationships</h1><p className="text-muted-foreground">Search the latest 100 authorized profiles without loading identity documents or preference blobs.</p></div>}>
      <div className="space-y-4 p-4 md:p-6">
        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search guest name, email, or phone" resultLabel={workspaceResultLabel(visible.length, guests.length, 'guests')}>
          <WorkspaceSelect label="Filter guest segment" value={segment} onChange={setSegment}><option value="all">All guests</option><option value="vip">VIP</option><option value="standard">Standard</option><option value="restricted">Restricted</option></WorkspaceSelect>
          <WorkspaceSelect label="Sort guests" value={sort} onChange={setSort}><option value="recent">Recently updated</option><option value="name">Name</option><option value="stays">Completed stays</option></WorkspaceSelect>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
        </WorkspaceControls>
        {error ? <WorkspaceError message={error} onRetry={load} /> : loading && guests.length === 0 ? <WorkspaceLoading label="Loading guest relationships" /> : visible.length === 0 ? <WorkspaceEmpty title={guests.length ? 'No guests in this segment' : 'No matching guest profiles'} description={guests.length ? 'Clear the segment filter or choose another view.' : 'Profiles appear after an authorized reservation or staff workflow creates them.'} onClear={guests.length ? () => setSegment('all') : undefined} /> : <div data-qa-layout="guest-card-grid" className="grid min-w-0 max-w-full gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((guest) => <Card key={guest.id} className="group min-w-0 max-w-full transition-colors hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring"><CardContent className="min-w-0 max-w-full space-y-3 pt-6">
            <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3"><div className="min-w-0 max-w-full flex-1"><Link href={`/dashboard/platform/guests/${guest.id}`} className="block font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline focus-visible:outline-none">{guest.firstName} {guest.lastName}</Link><p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{guest.email || 'No email on file'}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button className="shrink-0" size="icon" variant="ghost" aria-label={`Actions for ${guest.firstName} ${guest.lastName}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/dashboard/platform/guests/${guest.id}`}>Open guest profile</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={`/dashboard/platform/reservations?search=${encodeURIComponent(guest.email || `${guest.firstName} ${guest.lastName}`)}`}>Find reservations</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
            <div className="flex min-w-0 max-w-full flex-wrap gap-2 text-xs">{guest.isVip ? <Badge><Star className="mr-1 h-3 w-3" />VIP</Badge> : <Badge variant="outline"><Users className="mr-1 h-3 w-3" />Standard</Badge>}<Badge variant="outline">{guest.totalStays || 0} completed stays</Badge>{guest.isBlacklisted ? <Badge variant="destructive">Restricted</Badge> : null}</div>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{guest.phone || 'No phone on file'} · {guest.loyaltyTier ? `${guest.loyaltyTier} legacy tier` : 'No legacy tier'}</p>
          </CardContent></Card>)}
        </div>}
      </div>
    </PageContainer>
  );
}

export default GuestsPage;
