'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, MoreHorizontal, RefreshCw, Search, Star, UserRound, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pagination } from '@/features/dashboard/components/Pagination';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { InitialsAvatar, Panel, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { formatMoney, formatStay, humanize } from '@/features/platform/lib/format';
import { useDebouncedSearch, useListUrlState } from '@/features/platform/lib/listUrlState';
import type { GuestListPage } from '../actions';

const segmentOf = (guest: any) => guest.isBlacklisted ? 'restricted' : guest.isVip ? 'vip' : 'standard';
const VIEW_DEFAULTS = { search: '', segment: 'all', sort: 'recent', page: '1' };

/**
 * Guest list. The server renders each page for the search, segment, sort and page in the URL;
 * this component only edits the URL, so results always belong to the current view.
 */
export function GuestsPageClient({ data, error }: { data: GuestListPage | null; error: string | null }) {
  const router = useRouter();
  const { values, update, pending } = useListUrlState(VIEW_DEFAULTS);
  const [searchText, setSearchText] = useDebouncedSearch(values.search, (search) => update({ search }));
  const guests = data?.guests || [];
  const counts = data?.segmentCounts || { all: 0, vip: 0, standard: 0, restricted: 0 };
  const total = data?.total || 0;
  const currentPage = Math.max(1, Number(values.page) || 1);

  return (
    <PlatformPage
      title="Guests"
      description="Guest profiles, stay history and contact details."
      actions={(
        <>
          <Button size="sm" variant="outline" onClick={() => router.refresh()} disabled={pending}><RefreshCw className={pending ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button size="sm" asChild><Link href="/dashboard/platform/reservations?new=1"><CalendarPlus aria-hidden="true" />New reservation</Link></Button>
        </>
      )}
    >
      {error ? <WorkspaceError message={error} onRetry={() => router.refresh()} title="Guest workspace unavailable" /> : (
        <Panel>
          <div className="border-b px-4">
            <FilterTabs
              label="Filter guests by segment"
              value={values.segment}
              onChange={(segment) => update({ segment })}
              tabs={[
                { value: 'all', label: 'All guests', count: counts.all },
                { value: 'vip', label: 'VIP', count: counts.vip, tone: 'warning' },
                { value: 'standard', label: 'Standard', count: counts.standard },
                { value: 'restricted', label: 'Restricted', count: counts.restricted, tone: 'danger' },
              ]}
            />
          </div>
          <PanelToolbar>
            <WorkspaceControls search={searchText} onSearchChange={setSearchText} searchLabel="Search name, email or phone" resultLabel={pending ? 'Searching…' : `${total} ${total === 1 ? 'guest' : 'guests'}`}>
              <WorkspaceSelect label="Sort guests" value={values.sort} onChange={(sort) => update({ sort })}><option value="recent">Sort: recently updated</option><option value="name">Sort: name</option><option value="reservations">Sort: most reservations</option></WorkspaceSelect>
            </WorkspaceControls>
          </PanelToolbar>
          {guests.length === 0 ? (
            <WorkspaceEmpty
              icon={values.search ? Search : Users}
              title={values.search || values.segment !== 'all' ? 'No matching guest profiles' : 'No guest profiles yet'}
              description={values.search || values.segment !== 'all' ? 'Try a different name, email or phone number, or another segment.' : 'Profiles appear after a reservation or staff workflow creates them.'}
              onClear={values.search || values.segment !== 'all' ? () => update({ search: '', segment: 'all' }) : undefined}
            />
          ) : (
            <DataTable minWidth="min-w-[820px]">
              <THead>
                <tr>
                  <Th>Guest</Th>
                  <Th>Phone</Th>
                  <Th>Segment</Th>
                  <Th align="right">Stays</Th>
                  <Th>Last stay</Th>
                  <Th align="right" title="Booked total of completed stays">Stay value</Th>
                  <Th><span className="sr-only">Actions</span></Th>
                </tr>
              </THead>
              <TBody>
                {guests.map((guest) => {
                  const name = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Unnamed guest';
                  const seg = segmentOf(guest);
                  return (
                    <Tr key={guest.id}>
                      <Td>
                        <div className="flex min-w-0 items-center gap-3">
                          <InitialsAvatar name={name} tone={seg === 'vip' ? 'vip' : seg === 'restricted' ? 'restricted' : 'neutral'} />
                          <div className="min-w-0">
                            <Link href={`/dashboard/platform/guests/${guest.id}`} className="block truncate font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">{name}</Link>
                            <p className="truncate text-xs text-muted-foreground">{guest.email || 'No email on file'}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-muted-foreground">{guest.phone || '—'}</Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {seg === 'vip' ? <StatusPill tone="warning" label={<span className="inline-flex items-center gap-1"><Star className="size-3" aria-hidden="true" />VIP</span>} /> : null}
                          {seg === 'restricted' ? <StatusPill tone="danger" label="Restricted" /> : null}
                          {seg === 'standard' ? <span className="text-xs text-muted-foreground">Standard</span> : null}
                          {guest.loyaltyTier ? <Tag>{humanize(guest.loyaltyTier)} tier</Tag> : null}
                        </div>
                      </Td>
                      <Td numeric align="right">{guest.totalStays || 0}</Td>
                      <Td className="whitespace-nowrap text-sm text-muted-foreground">{guest.lastStayAt ? formatStay(guest.lastStayAt) : 'Never'}</Td>
                      <Td numeric align="right">{guest.totalSpent !== null && guest.totalSpent !== undefined && guest.totalSpent !== '' ? formatMoney(Number(guest.totalSpent)) : '—'}</Td>
                      <Td align="right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8" aria-label={`Actions for ${name}`}><MoreHorizontal aria-hidden="true" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 [&_svg]:size-4">
                            <DropdownMenuItem asChild><Link href={`/dashboard/platform/guests/${guest.id}`}><UserRound aria-hidden="true" />Open profile</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href={`/dashboard/platform/reservations?guestId=${guest.id}&new=1`}><CalendarPlus aria-hidden="true" />New reservation</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href={`/dashboard/platform/reservations?search=${encodeURIComponent(name)}`}><Search aria-hidden="true" />Find reservations</Link></DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </DataTable>
          )}
          {data && total > data.pageSize ? (
            <div className="border-t px-4 py-4">
              <Pagination currentPage={currentPage} total={total} pageSize={data.pageSize} list={{ singular: 'guest', plural: 'guests' }} />
            </div>
          ) : null}
        </Panel>
      )}
    </PlatformPage>
  );
}
