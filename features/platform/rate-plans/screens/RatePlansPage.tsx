'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Minus, Pause, Pencil, Play, Plus, RefreshCw, Tag as TagIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { operationAttempt } from '@/lib/operationAttempt';
import { cn } from '@/lib/utils';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { FieldInput } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { CopyId, Panel, PanelHeader, PanelToolbar } from '@/features/platform/components/Surface';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { humanize } from '@/features/platform/lib/format';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { DerivedRatePanel } from '../DerivedRatePanel';
import { getRatePlanWorkspace, updateRatePlanPublicationAction, updateRoomInventoryAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

interface RoomTypeInventoryItem {
  id: string;
  name: string;
  totalRooms: number;
  sellableRooms: number;
}

/** Authoritative per-day counts for one room type, as the booking flow calculates them. */
interface AvailabilityDay {
  roomTypeId: string;
  date: string;
  total: number;
  booked: number;
  held: number;
  blocked: number;
  available: number;
}

interface RatePlanItem {
  id: string;
  name: string;
  description?: string | null;
  baseRate: number;
  minimumStay?: number | null;
  maximumStay?: number | null;
  cancellationPolicy?: string | null;
  mealPlan?: string | null;
  status?: string | null;
  isPublic?: boolean | null;
  isPromotional?: boolean | null;
  promoCode?: string | null;
  priority?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  roomType?: {
    id: string;
    name: string;
    baseRate?: number | null;
  } | null;
}

function formatCurrency(amount?: number | null) {
  if (amount === null || amount === undefined) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function utcDateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function utcDateLabel(value: Date | string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(value));
}

function formatEnum(value?: string | null) {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

export function RatePlansPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [ratePlans, setRatePlans] = React.useState<RatePlanItem[]>([]);
  const [roomTypes, setRoomTypes] = React.useState<RoomTypeInventoryItem[]>([]);
  const [availability, setAvailability] = React.useState<AvailabilityDay[]>([]);
  const [boardStart, setBoardStart] = React.useState<string | null>(null);
  const [ratePlanTotal, setRatePlanTotal] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  // One block/release at a time per cell, so a quick double click is never applied twice.
  const [pendingCells, setPendingCells] = React.useState<Set<string>>(() => new Set());
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('priority');
  const [approvalId, setApprovalId] = React.useState('');

  const fetchRatePlans = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The server reads the week starting on the property's business date.
      const data = await getRatePlanWorkspace() as {
        businessDate?: string | null;
        start: string;
        ratePlans: RatePlanItem[];
        ratePlanTotal: number;
        roomTypes: RoomTypeInventoryItem[];
        availability: AvailabilityDay[];
      };
      setRatePlans(data.ratePlans || []);
      setRatePlanTotal(Number(data.ratePlanTotal) || 0);
      setBoardStart(data.start ? String(data.start) : null);
      setRoomTypes(data.roomTypes || []);
      setAvailability(data.availability || []);
    } catch (error) {
      console.error('Failed to load rate plans:', error);
      const message = error instanceof Error ? error.message : 'Unable to load rate plan dashboard.';
      setError(message);
      toast.error('Rates workspace unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRatePlans();
  }, [fetchRatePlans]);

  const updateInventory = async (roomTypeId: string, date: string, blockedRoomsDelta: 1 | -1, successMessage: string) => {
    const cell = `${roomTypeId}:${utcDateKey(date)}`;
    if (pendingCells.has(cell)) return;
    setPendingCells((current) => new Set(current).add(cell));
    try {
      const request = { roomTypeId, date, blockedRoomsDelta };
      const attempt = await operationAttempt('inventory-block', request);
      unwrapAction(await updateRoomInventoryAction({ ...request, idempotencyKey: attempt.key }));
      attempt.complete();
      await fetchRatePlans();
      toast.success('Inventory updated', { description: successMessage });
    } catch (error) {
      toast.error('Unable to update inventory', { description: error instanceof Error ? error.message : 'Inventory controls could not be saved.' });
    } finally {
      setPendingCells((current) => { const next = new Set(current); next.delete(cell); return next; });
    }
  };

  const loadMorePlans = async () => {
    setLoadingMore(true);
    try {
      const data = await getRatePlanWorkspace(ratePlans.length) as { ratePlans: RatePlanItem[]; ratePlanTotal: number };
      const known = new Set(ratePlans.map((plan) => plan.id));
      setRatePlans([...ratePlans, ...(data.ratePlans || []).filter((plan) => !known.has(plan.id))]);
      setRatePlanTotal(Number(data.ratePlanTotal) || 0);
    } catch (error) {
      toast.error('More rate plans could not be loaded', { description: error instanceof Error ? error.message : undefined });
    } finally {
      setLoadingMore(false);
    }
  };

  const updateRatePlan = async (id: string, data: Record<string, any>, successMessage: string) => {
    try {
      const payload = { ratePlanId: id, status: data.status, isPublic: data.isPublic, approvalId: approvalId.trim() };
      const attempt = await operationAttempt('rate-publication', payload);
      unwrapAction(await updateRatePlanPublicationAction({ ...payload, idempotencyKey: attempt.key }));
      attempt.complete();
      await fetchRatePlans();
      toast.success('Rate plan updated', { description: successMessage });
    } catch (error) {
      console.error('Failed to update rate plan:', error);
      toast.error('Unable to update rate plan', { description: error instanceof Error ? error.message : 'The rate plan could not be saved.' });
    }
  };

  const activePlans = ratePlans.filter((plan) => plan.status === 'active');
  const publicPlans = ratePlans.filter((plan) => plan.isPublic && plan.status === 'active');
  const promotionalPlans = ratePlans.filter((plan) => plan.isPromotional);
  const averagePublicRate = publicPlans.length
    ? publicPlans.reduce((sum, plan) => sum + (plan.baseRate || 0), 0) / publicPlans.length
    : 0;

  // The week the server read: it starts on the property's open business date.
  const inventoryDays = React.useMemo(() => {
    if (!boardStart) return [];
    const first = new Date(`${utcDateKey(boardStart)}T00:00:00.000Z`);
    return Array.from({ length: 7 }, (_, index) => new Date(first.getTime() + index * 86_400_000));
  }, [boardStart]);

  const availabilityByRoomTypeAndDay = React.useMemo(() => {
    const map = new Map<string, AvailabilityDay>();
    availability.forEach((day) => map.set(`${day.roomTypeId}:${day.date}`, day));
    return map;
  }, [availability]);
  // A failed refresh leaves the last figures on screen, but changes wait for a successful read.
  const stale = Boolean(error);

  const visibleRatePlans = React.useMemo(() => applyWorkspaceView(ratePlans, {
    search,
    status: statusFilter,
    statusOf: (plan) => plan.status,
    searchText: (plan) => [plan.name, plan.description, plan.roomType?.name, plan.promoCode, plan.cancellationPolicy, plan.mealPlan],
    sortValue: (plan) => sort === 'name' ? plan.name.toLocaleLowerCase() : sort === 'rate' ? plan.baseRate : plan.priority ?? 0,
    direction: sort === 'name' ? 'asc' : 'desc',
  }), [ratePlans, search, statusFilter, sort]);

  const groupedPlans = React.useMemo(() => {
    const groups = new Map<string, { label: string; plans: RatePlanItem[] }>();
    visibleRatePlans.forEach((plan) => {
      const key = plan.roomType?.id || 'unassigned';
      const existing = groups.get(key) || { label: plan.roomType?.name || 'Unassigned room type', plans: [] };
      existing.plans.push(plan);
      groups.set(key, existing);
    });
    return Array.from(groups.values());
  }, [visibleRatePlans]);

  const statusCount = (value: string) => ratePlans.filter((plan) => plan.status === value).length;

  return (
    <PlatformPage
      title="Rate Plans"
      description="Public, promotional and package rates by room type, plus day-level sellable inventory controls."
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={fetchRatePlans} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh</Button>
          <Button size="sm" asChild><Link href="/dashboard/rate-plans/create"><Plus aria-hidden="true" />Create rate plan</Link></Button>
        </>
      )}
    >
      <StatStrip
        loading={loading && !ratePlans.length}
        items={[
          { label: 'Active plans', value: activePlans.length, tone: 'success', hint: `${ratePlanTotal} total`, onSelect: () => setStatusFilter(statusFilter === 'active' ? 'all' : 'active'), active: statusFilter === 'active' },
          { label: 'Bookable publicly', value: publicPlans.length, tone: 'info', hint: 'Active and public' },
          { label: 'Promotions', value: promotionalPlans.length, tone: 'accent', hint: 'Promo-code rates' },
          { label: 'Average public rate', value: formatCurrency(averagePublicRate), hint: 'Across bookable plans' },
        ]}
      />

      {error ? <WorkspaceError message={error} onRetry={fetchRatePlans} title="Rates workspace unavailable" /> : null}
      {loading && ratePlans.length === 0 && roomTypes.length === 0 ? <WorkspaceLoading label="Loading rates and inventory" /> : (
        <>
          <Panel>
            <PanelHeader title="7-day inventory controls" description="Rooms left to sell for the week starting on the business date, after bookings, group holds, blocks and outages. Physical room records are not changed." />
            {roomTypes.length === 0 ? (
              <WorkspaceEmpty compact title="No room types" description="Create room types and rooms before managing inventory controls." />
            ) : (
              <div data-qa-layout="inventory-scroll-region" className="max-w-full overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[12rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    <div className="sticky left-0 bg-muted px-4 py-2">Room type</div>
                    {inventoryDays.map((day, index) => (
                      <div key={day.toISOString()} className={cn('border-l px-2 py-2 text-center', index === 0 && 'text-foreground')}>
                        {utcDateLabel(day, { weekday: 'short' })} <span className="tabular-nums">{utcDateLabel(day, { day: 'numeric' })}</span>
                      </div>
                    ))}
                  </div>
                  {roomTypes.map((roomType) => {
                    const physicalTotal = roomType.totalRooms;
                    return (
                      <div key={roomType.id} className="grid grid-cols-[12rem_repeat(7,minmax(0,1fr))] border-b last:border-b-0">
                        <div className="sticky left-0 flex flex-col justify-center bg-card px-4 py-3">
                          <p className="truncate text-sm font-medium">{roomType.name}</p>
                          <p className="text-xs text-muted-foreground">{physicalTotal} physical rooms</p>
                        </div>
                        {inventoryDays.map((day) => {
                          const key = `${roomType.id}:${utcDateKey(day)}`;
                          const counts = availabilityByRoomTypeAndDay.get(key);
                          const date = day.toISOString();
                          const dayLabel = utcDateLabel(day, { month: 'short', day: 'numeric' });
                          const busy = pendingCells.has(key);
                          if (!counts) {
                            // Not part of the authoritative read: unknown, never shown as zero bookings.
                            return <div key={key} className="flex items-center justify-center border-l px-2 py-2.5 text-sm text-muted-foreground" aria-label={`${roomType.name} on ${dayLabel}: not loaded`}>—</div>;
                          }
                          return (
                            <div key={key} className={cn('group flex flex-col items-center justify-center gap-1 border-l px-2 py-2.5', counts.available === 0 ? 'bg-rose-500/[0.05]' : counts.available <= 1 ? 'bg-amber-500/[0.05]' : undefined)}>
                              <p className={cn('text-lg font-semibold leading-6 tabular-nums', counts.available === 0 && 'text-rose-700 dark:text-rose-400')}>{counts.available}</p>
                              <p className="text-[11px] leading-4 text-muted-foreground tabular-nums" title={`${counts.booked} booked, ${counts.held} held for groups, ${counts.blocked} blocked`}>{counts.booked} bkd · {counts.held} held · {counts.blocked} blk</p>
                              <div className="mt-0.5 flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                <Button size="icon" variant="ghost" className="size-6" disabled={stale || busy || counts.blocked <= 0} aria-label={`Release one ${roomType.name} room on ${dayLabel}`} title="Release one room" onClick={() => updateInventory(roomType.id, date, -1, `${roomType.name} blocked inventory reduced for ${dayLabel}.`)}><Minus className="size-3" aria-hidden="true" /></Button>
                                <Button size="icon" variant="ghost" className="size-6" disabled={stale || busy || counts.available <= 0} aria-label={`Block one ${roomType.name} room on ${dayLabel}`} title="Block one room" onClick={() => updateInventory(roomType.id, date, 1, `${roomType.name} blocked inventory increased for ${dayLabel}.`)}><Plus className="size-3" aria-hidden="true" /></Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">Numbers show rooms available to sell. <span className="font-medium text-foreground">−</span> releases a blocked room; <span className="font-medium text-foreground">+</span> blocks one.</div>
          </Panel>

          <Panel>
            <div className="border-b px-4 sm:px-5">
              <FilterTabs
                label="Filter rate plans by status"
                value={statusFilter}
                onChange={setStatusFilter}
                tabs={[
                  { value: 'all', label: 'All plans', count: ratePlans.length },
                  { value: 'active', label: 'Active', count: statusCount('active'), tone: 'success' },
                  { value: 'inactive', label: 'Paused', count: statusCount('inactive') },
                  { value: 'draft', label: 'Draft', count: statusCount('draft'), tone: 'warning' },
                ]}
              />
            </div>
            <PanelToolbar className="space-y-3">
              <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search plan, room type, promo, meal or cancellation terms" resultLabel={workspaceResultLabel(visibleRatePlans.length, ratePlans.length, 'rate plans')}>
                <WorkspaceSelect label="Sort rate plans" value={sort} onChange={setSort}><option value="priority">Sort: priority</option><option value="rate">Sort: highest rate</option><option value="name">Sort: name</option></WorkspaceSelect>
              </WorkspaceControls>
              <div className="flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2 sm:flex-row sm:items-center">
                <label htmlFor="rate-approval" className="shrink-0 text-xs font-medium">Publication approval ID</label>
                <FieldInput id="rate-approval" className="h-8 font-mono text-xs sm:max-w-xs" value={approvalId} onChange={event => setApprovalId(event.target.value)} placeholder="Required when policy demands approval" />
                <p className="text-xs text-muted-foreground">Must name the rate-plan ID and the exact resulting status/visibility. <Link href="/dashboard/platform/approvals" target="_blank" className="underline underline-offset-2">Open approvals</Link></p>
              </div>
            </PanelToolbar>
            {visibleRatePlans.length === 0 ? (
              <WorkspaceEmpty icon={TagIcon} title={ratePlans.length ? 'No rate plans match this view' : 'No rate plans configured'} description={ratePlans.length ? 'Clear the search or status filter.' : 'Create a standard rate for each room type before taking direct bookings.'} onClear={ratePlans.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined} />
            ) : (
              <DataTable minWidth="min-w-[960px]">
                <THead>
                  <tr><Th>Plan</Th><Th>Status</Th><Th align="right">Nightly rate</Th><Th>Stay rules</Th><Th>Terms</Th><Th align="right">Priority</Th><Th align="right">Actions</Th></tr>
                </THead>
                {groupedPlans.map((group) => (
                  <TBody key={group.label}>
                    <tr className="bg-muted/25">
                      <td colSpan={7} className="px-4 py-1.5 sm:px-5"><span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{group.label}</span><span className="ml-2 text-[11px] text-muted-foreground">{group.plans.length} plan{group.plans.length === 1 ? '' : 's'}</span></td>
                    </tr>
                    {group.plans.map((plan) => (
                      <Tr key={plan.id}>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5"><p className="font-medium">{plan.name}</p>{plan.isPromotional ? <StatusPill tone="accent" label={plan.promoCode ? `Promo · ${plan.promoCode}` : 'Promo'} /> : null}</div>
                          {plan.description ? <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-muted-foreground">{plan.description}</p> : null}
                          <CopyId value={plan.id} label="ID" className="mt-1 max-w-[12rem]" />
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1">
                            <StatusPill kind="rate" value={plan.status} />
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{plan.isPublic ? <Eye className="size-3" aria-hidden="true" /> : <EyeOff className="size-3" aria-hidden="true" />}{plan.isPublic ? 'Public' : 'Private'}</span>
                          </div>
                        </Td>
                        <Td numeric align="right" className="text-base font-semibold">{formatCurrency(plan.baseRate)}</Td>
                        <Td className="text-xs text-muted-foreground"><p>Min {plan.minimumStay || 1} night{(plan.minimumStay || 1) === 1 ? '' : 's'}</p><p>Max {plan.maximumStay || 'no limit'}</p></Td>
                        <Td><div className="flex flex-col items-start gap-1"><Tag>{formatEnum(plan.cancellationPolicy)}</Tag><span className="text-xs text-muted-foreground">{humanize(plan.mealPlan)}</span></div></Td>
                        <Td numeric align="right" className="text-muted-foreground">{plan.priority ?? '—'}</Td>
                        <Td align="right">
                          <div className="flex justify-end gap-1">
                            {plan.status !== 'active'
                              ? <Button size="sm" variant="outline" disabled={stale} onClick={() => updateRatePlan(plan.id, { status: 'active' }, 'The rate is now bookable.')}><Play aria-hidden="true" />Activate</Button>
                              : <Button size="sm" variant="outline" disabled={stale} onClick={() => updateRatePlan(plan.id, { status: 'inactive' }, 'The rate has been paused.')}><Pause aria-hidden="true" />Pause</Button>}
                            <Button size="sm" variant="ghost" disabled={stale} onClick={() => updateRatePlan(plan.id, { isPublic: !plan.isPublic }, plan.isPublic ? 'The rate is now private.' : 'The rate is now public.')}>{plan.isPublic ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{plan.isPublic ? 'Hide' : 'Publish'}</Button>
                            <Button size="icon" variant="ghost" className="size-8" asChild><Link href={`/dashboard/rate-plans/${plan.id}`} aria-label={`Edit ${plan.name}`}><Pencil aria-hidden="true" /></Link></Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                ))}
              </DataTable>
            )}
            {ratePlans.length < ratePlanTotal ? (
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                <span role="status">Showing {ratePlans.length} of {ratePlanTotal} rate plans. Search and filters apply to the loaded plans.</span>
                <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void loadMorePlans()}>{loadingMore ? 'Loading…' : 'Load more'}</Button>
              </div>
            ) : null}
          </Panel>
        </>
      )}

      <DerivedRatePanel />
    </PlatformPage>
  );
}

export default RatePlansPage;
