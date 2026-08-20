'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarRange, DollarSign, Eye, EyeOff, RefreshCw, Tag } from 'lucide-react';

import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { WorkspaceControls, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { applyWorkspaceView, workspaceResultLabel } from '@/features/platform/lib/workspace';
import { getRatePlanWorkspace, updateRatePlanPublicationAction, updateRoomInventoryAction } from '../actions';

interface RoomTypeInventoryItem {
  id: string;
  name: string;
  totalRooms: number;
  sellableRooms: number;
}

interface RoomInventoryItem {
  id: string;
  date: string;
  totalRooms: number;
  bookedRooms: number;
  blockedRooms: number;
  availableRooms?: number | null;
  isAvailable?: boolean | null;
  roomType?: { id: string; name: string } | null;
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

function utcDay(offset = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
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

function statusBadge(status?: string | null) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700">Active</Badge>;
    case 'inactive':
      return <Badge className="bg-gray-100 text-gray-700">Inactive</Badge>;
    case 'draft':
      return <Badge className="bg-amber-100 text-amber-700">Draft</Badge>;
    default:
      return <Badge variant="outline">{status || 'Unknown'}</Badge>;
  }
}

export function RatePlansPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [ratePlans, setRatePlans] = React.useState<RatePlanItem[]>([]);
  const [roomTypes, setRoomTypes] = React.useState<RoomTypeInventoryItem[]>([]);
  const [inventories, setInventories] = React.useState<RoomInventoryItem[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('priority');

  const fetchRatePlans = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = utcDay().toISOString();
      const end = utcDay(60).toISOString();
      const data = await getRatePlanWorkspace(start, end) as {
        ratePlans: RatePlanItem[];
        roomTypes: RoomTypeInventoryItem[];
        inventories: RoomInventoryItem[];
      };
      setRatePlans(data.ratePlans || []);
      setRoomTypes(data.roomTypes || []);
      setInventories(data.inventories || []);
    } catch (error) {
      console.error('Failed to load rate plans:', error);
      const message = error instanceof Error ? error.message : 'Unable to load rate plan dashboard.';
      setError(message);
      toast({
        title: 'Rates workspace unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchRatePlans();
  }, [fetchRatePlans]);

  const updateInventory = async (
    roomTypeId: string,
    date: string,
    data: { totalRooms?: number; bookedRooms?: number; blockedRooms?: number },
    successMessage: string
  ) => {
    try {
      await updateRoomInventoryAction({ roomTypeId, date, ...data });
      await fetchRatePlans();
      toast({ title: 'Inventory updated', description: successMessage });
    } catch (error) {
      console.error('Failed to update inventory:', error);
      toast({
        title: 'Unable to update inventory',
        description: error instanceof Error ? error.message : 'Inventory controls could not be saved.',
        variant: 'destructive',
      });
    }
  };

  const updateRatePlan = async (id: string, data: Record<string, any>, successMessage: string) => {
    try {
      await updateRatePlanPublicationAction({ ratePlanId: id, status: data.status, isPublic: data.isPublic });
      await fetchRatePlans();
      toast({ title: 'Rate plan updated', description: successMessage });
    } catch (error) {
      console.error('Failed to update rate plan:', error);
      toast({
        title: 'Unable to update rate plan',
        description: error instanceof Error ? error.message : 'The rate plan could not be saved.',
        variant: 'destructive',
      });
    }
  };

  const activePlans = ratePlans.filter((plan) => plan.status === 'active');
  const publicPlans = ratePlans.filter((plan) => plan.isPublic && plan.status === 'active');
  const promotionalPlans = ratePlans.filter((plan) => plan.isPromotional);
  const averagePublicRate = publicPlans.length
    ? publicPlans.reduce((sum, plan) => sum + (plan.baseRate || 0), 0) / publicPlans.length
    : 0;

  const inventoryDays = React.useMemo(
    () => Array.from({ length: 7 }, (_, index) => utcDay(index)),
    []
  );

  const inventoryByRoomTypeAndDay = React.useMemo(() => {
    const map = new Map<string, RoomInventoryItem>();
    inventories.forEach((record) => {
      if (!record.roomType?.id) return;
      const key = `${record.roomType.id}:${utcDateKey(record.date)}`;
      map.set(key, record);
    });
    return map;
  }, [inventories]);

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

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Rate Plans' },
  ];

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Rate Plans</h1>
      <p className="text-muted-foreground">Manage public, promotional, and package rates by room type.</p>
    </div>
  );

  return (
    <PageContainer title="Rate Plans" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-6 p-4 md:p-6">
        {error ? <WorkspaceError message={error} onRetry={fetchRatePlans} /> : null}
        {loading && ratePlans.length === 0 && roomTypes.length === 0 ? <WorkspaceLoading label="Loading rates and inventory" /> : null}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Plans</p>
                  <p className="text-2xl font-semibold">{activePlans.length}</p>
                </div>
                <CalendarRange className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Public Rates</p>
                  <p className="text-2xl font-semibold">{publicPlans.length}</p>
                </div>
                <Eye className="h-6 w-6 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Promotions</p>
                  <p className="text-2xl font-semibold">{promotionalPlans.length}</p>
                </div>
                <Tag className="h-6 w-6 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Public Rate</p>
                  <p className="text-2xl font-semibold">{formatCurrency(averagePublicRate)}</p>
                </div>
                <DollarSign className="h-6 w-6 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader data-qa-layout="operator-card-header" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>7-Day Inventory Controls</CardTitle>
              <p className="text-sm text-muted-foreground">Block or release sellable inventory by room type on authoritative UTC business dates without touching physical room records.</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRatePlans} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent data-qa-layout="inventory-scroll-region" className="min-w-0 max-w-full space-y-4 overflow-x-auto">
            <div className="min-w-[860px] space-y-3">
              <div className="grid grid-cols-[180px_repeat(7,1fr)] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <div>Room type</div>
                {inventoryDays.map((day) => (
                  <div key={day.toISOString()} className="text-center">
                    <p>{utcDateLabel(day, { weekday: 'short' })}</p>
                    <p>{utcDateLabel(day, { month: 'short', day: 'numeric' })}</p>
                  </div>
                ))}
              </div>
              {roomTypes.map((roomType) => {
                const physicalTotal = roomType.totalRooms;
                const defaultBlocked = roomType.totalRooms - roomType.sellableRooms;
                return (
                  <div key={roomType.id} className="grid grid-cols-[180px_repeat(7,1fr)] gap-2">
                    <div className="rounded-lg border p-3">
                      <p className="font-medium">{roomType.name}</p>
                      <p className="text-xs text-muted-foreground">{physicalTotal} physical rooms</p>
                    </div>
                    {inventoryDays.map((day) => {
                      const key = `${roomType.id}:${utcDateKey(day)}`;
                      const record = inventoryByRoomTypeAndDay.get(key);
                      const totalRooms = record?.totalRooms ?? physicalTotal;
                      const bookedRooms = record?.bookedRooms ?? 0;
                      const blockedRooms = record?.blockedRooms ?? defaultBlocked;
                      const availableRooms = Math.max(0, totalRooms - bookedRooms - blockedRooms);
                      const date = day.toISOString();
                      return (
                        <div key={key} className="rounded-lg border p-3 text-center">
                          <p className="text-2xl font-semibold">{availableRooms}</p>
                          <p className="text-[11px] text-muted-foreground">available</p>
                          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                            <p>{bookedRooms} booked</p>
                            <p>{blockedRooms} blocked</p>
                          </div>
                          <div className="mt-3 flex justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => updateInventory(
                                roomType.id,
                                date,
                                { totalRooms, bookedRooms, blockedRooms: blockedRooms + 1 },
                                `${roomType.name} blocked inventory increased for ${utcDateLabel(day, { month: 'short', day: 'numeric' })}.`
                              )}
                            >
                              Block
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={blockedRooms <= 0}
                              onClick={() => updateInventory(
                                roomType.id,
                                date,
                                { totalRooms, bookedRooms, blockedRooms: Math.max(0, blockedRooms - 1) },
                                `${roomType.name} blocked inventory reduced for ${utcDateLabel(day, { month: 'short', day: 'numeric' })}.`
                              )}
                            >
                              Release
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {!loading && roomTypes.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No room types found. Create room types and rooms before managing inventory controls.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <WorkspaceControls search={search} onSearchChange={setSearch} searchLabel="Search plan, room type, promo, meal, or cancellation terms" resultLabel={workspaceResultLabel(visibleRatePlans.length, ratePlans.length, 'rate plans')}>
          <WorkspaceSelect label="Filter rate-plan status" value={statusFilter} onChange={setStatusFilter}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Draft</option></WorkspaceSelect>
          <WorkspaceSelect label="Sort rate plans" value={sort} onChange={setSort}><option value="priority">Highest priority</option><option value="rate">Highest rate</option><option value="name">Name</option></WorkspaceSelect>
        </WorkspaceControls>

        <Card className="min-w-0">
          <CardHeader data-qa-layout="operator-card-header" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Rate Plan Board</CardTitle>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button variant="outline" size="sm" onClick={fetchRatePlans} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/rate-plans/create">Create rate plan</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {groupedPlans.map((group) => (
              <div key={group.label} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                  <Badge variant="outline">{group.plans.length} plans</Badge>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.plans.map((plan) => (
                    <div key={plan.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{plan.name}</p>
                            {statusBadge(plan.status)}
                            {plan.isPublic ? <Badge variant="outline">Public</Badge> : <Badge variant="outline">Private</Badge>}
                            {plan.isPromotional && <Badge className="bg-purple-100 text-purple-700">Promo</Badge>}
                          </div>
                          <p className="text-2xl font-semibold">{formatCurrency(plan.baseRate)}</p>
                          <div className="grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                            <p>Min stay: {plan.minimumStay || 1} night{(plan.minimumStay || 1) === 1 ? '' : 's'}</p>
                            <p>Max stay: {plan.maximumStay || 'No limit'}</p>
                            <p>Cancellation: {formatEnum(plan.cancellationPolicy)}</p>
                            <p>Meal plan: {formatEnum(plan.mealPlan)}</p>
                            {plan.promoCode && <p>Promo code: {plan.promoCode}</p>}
                            {plan.priority !== null && plan.priority !== undefined && <p>Priority: {plan.priority}</p>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          {plan.status !== 'active' && (
                            <Button size="sm" variant="outline" onClick={() => updateRatePlan(plan.id, { status: 'active' }, 'The rate is now bookable.')}>Activate</Button>
                          )}
                          {plan.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => updateRatePlan(plan.id, { status: 'inactive' }, 'The rate has been paused.')}>Pause</Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRatePlan(plan.id, { isPublic: !plan.isPublic }, plan.isPublic ? 'The rate is now private.' : 'The rate is now public.')}
                          >
                            {plan.isPublic ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                            {plan.isPublic ? 'Hide' : 'Publish'}
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/rate-plans/${plan.id}`}>Edit</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!loading && visibleRatePlans.length === 0 && (
              <WorkspaceEmpty title={ratePlans.length ? 'No rate plans match this view' : 'No rate plans configured'} description={ratePlans.length ? 'Clear the search or status filter.' : 'Create an authoritative standard rate for each sellable room type before enabling direct booking.'} onClear={ratePlans.length ? () => { setSearch(''); setStatusFilter('all'); } : undefined} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default RatePlansPage;
