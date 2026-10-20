'use client';
import React from 'react';
import Link from 'next/link';
import { Blocks, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Lock, PackageOpen, Plus, ReceiptText, Settings2, Users, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { ActionMessage, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { Meter, StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { Callout, Disclosure, Panel, SectionLabel } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, formatStayRange, nightsBetween, pluralize } from '@/features/platform/lib/format';
import { statusMeta } from '@/features/platform/lib/status';
import { closeGroupMasterFolio, createGroupBlock, createGroupRoomingList, getGroupWorkspace, updateGroupStatus } from '../actions';
import GroupRecontract from '../components/GroupRecontract';
import { RoomingListImport } from '../components/RoomingListImport';
import { unwrapAction, type ActionResult } from '@/features/platform/lib/actionOutcome';

const GROUP_STATUSES = ['tentative', 'definite', 'released', 'completed', 'cancelled'] as const;

type Allocation = { id: string; roomsHeld: number; roomsPickedUp: number; rateMinor: number; roomType: { name: string } };
type Group = { id: string; name: string; blockCode: string; status: string; arrivalDate: string; departureDate: string; releaseDate?: string; billingType: string; allocations: Allocation[]; bookings: Array<{ id: string; confirmationNumber: string; guestName: string; status: string }>; masterFolio?: { id: string; folioNumber: string; status: string; entries: Array<{ amountMinor: number; direction: string }> } };

export default function GroupsPage() {
  const [workspace, setWorkspace] = React.useState<{ groupsEnabled: boolean; hasMore?: boolean; nextCursor?: string; groups: Group[]; roomTypes: Array<{ id: string; name: string; ratePlans: Array<{ id: string; name: string }> }> }>({ groupsEnabled: false, groups: [], roomTypes: [] });
  const [loaded, setLoaded] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [form, setForm] = React.useState({ name: '', arrivalDate: '', departureDate: '', releaseDate: '', contactName: '', contactEmail: '', billingType: 'guest_pays', roomTypeId: '', ratePlanId: '', roomsHeld: 1, rateDollars: '' });
  const [selectedGroup, setSelectedGroup] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try { setWorkspace(await getGroupWorkspace(cursor)); }
    catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to load group workspace.' }); }
    finally { setLoaded(true); }
  }, [cursor]);
  React.useEffect(() => { refresh(); }, [refresh]);

  async function perform(intent: string, operation: (key: string) => Promise<ActionResult<unknown>>) {
    setBusy(true); setFeedback(null);
    try { const attempt = await operationAttempt('group', intent); unwrapAction(await operation(attempt.key)); attempt.complete(); await refresh(); setFeedback({ tone: 'success', text: 'Group operation saved.' }); }
    catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Group operation was not saved. Retry the same request.' }); }
    finally { setBusy(false); }
  }
  function create() {
    const data = { ...form, arrivalDate: `${form.arrivalDate}T00:00:00.000Z`, departureDate: `${form.departureDate}T00:00:00.000Z`, releaseDate: form.releaseDate ? new Date(form.releaseDate).toISOString() : undefined, ratePlanId: form.ratePlanId || undefined, rateMinor: Math.round(Number(form.rateDollars) * 100), currencyCode: 'USD' };
    perform(JSON.stringify(data), key => createGroupBlock({ ...data, idempotencyKey: key }));
  }

  const roomType = workspace.roomTypes.find(type => type.id === form.roomTypeId);
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
  const held = workspace.groups.reduce((sum, group) => sum + group.allocations.reduce((inner, allocation) => inner + allocation.roomsHeld, 0), 0);
  const pickedUp = workspace.groups.reduce((sum, group) => sum + group.allocations.reduce((inner, allocation) => inner + allocation.roomsPickedUp, 0), 0);
  const visibleGroups = statusFilter === 'all' ? workspace.groups : workspace.groups.filter(group => group.status === statusFilter);
  const confirmThen = (message: string, run: () => void) => { if (window.confirm(message)) run(); };
  const canCreate = workspace.groupsEnabled && form.name && form.roomTypeId && form.ratePlanId && form.arrivalDate && form.departureDate && form.rateDollars;

  return (
    <PlatformPage
      title="Group Blocks"
      description="Hold room nights under a negotiated contract, confirm it, pick up guest rooms from a rooming list and settle the group's bill."
    >
      {loaded && !workspace.groupsEnabled ? (
        <Callout tone="warning" title="Group operations are turned off" action={<Button size="sm" variant="outline" asChild><Link href="/dashboard/platform/property"><Settings2 aria-hidden="true" />Property settings</Link></Button>}>
          Existing reservations remain visible. Enable the capability after reviewing group contract and billing settings.
        </Callout>
      ) : null}

      <StatStrip
        loading={!loaded}
        items={[
          { label: 'Blocks', value: workspace.groups.length, hint: workspace.hasMore ? 'More on older pages' : 'On this page' },
          { label: 'Tentative', value: workspace.groups.filter(group => group.status === 'tentative').length, tone: 'warning', hint: 'Awaiting contract' },
          { label: 'Definite', value: workspace.groups.filter(group => group.status === 'definite').length, tone: 'success', hint: 'Contract confirmed' },
          { label: 'Rooms picked up', value: `${pickedUp} / ${held}`, tone: 'info', hint: held ? `${Math.round((pickedUp / held) * 100)}% of held rooms` : 'No rooms held' },
        ]}
      />

      <ActionMessage feedback={feedback} />

      <Disclosure title="Create a negotiated group block" description="Rate, cancellation and meal terms, taxes and fees are frozen when the block is created." icon={Plus}>
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionLabel>Contract</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Group / contract name" htmlFor="group-name"><FieldInput id="group-name" aria-label="Group name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Booker contact" htmlFor="group-contact"><FieldInput id="group-contact" aria-label="Group contact name" value={form.contactName} onChange={event => setForm({ ...form, contactName: event.target.value })} /></Field>
              <Field label="Booker email" htmlFor="group-email"><FieldInput id="group-email" aria-label="Group contact email" type="email" value={form.contactEmail} onChange={event => setForm({ ...form, contactEmail: event.target.value })} /></Field>
            </div>
          </section>
          <section className="space-y-3">
            <SectionLabel>Dates</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Arrival" htmlFor="group-arrival"><FieldInput id="group-arrival" type="date" value={form.arrivalDate} onChange={event => setForm({ ...form, arrivalDate: event.target.value })} /></Field>
              <Field label="Departure" htmlFor="group-departure" hint={form.arrivalDate && form.departureDate ? pluralize(nightsBetween(form.arrivalDate, form.departureDate), 'night') : undefined}><FieldInput id="group-departure" type="date" value={form.departureDate} onChange={event => setForm({ ...form, departureDate: event.target.value })} /></Field>
              <Field label="Pickup cutoff" htmlFor="group-cutoff" optional hint="Device time zone."><FieldInput id="group-cutoff" type="datetime-local" value={form.releaseDate} onChange={event => setForm({ ...form, releaseDate: event.target.value })} /></Field>
            </div>
          </section>
          <section className="space-y-3">
            <SectionLabel>Inventory, rate & billing</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Room type" htmlFor="group-room-type">
                <NativeSelect id="group-room-type" aria-label="Group room type" value={form.roomTypeId} onChange={event => setForm({ ...form, roomTypeId: event.target.value, ratePlanId: '' })}><option value="">Select room type</option>{workspace.roomTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</NativeSelect>
              </Field>
              <Field label="Contract terms from rate plan" htmlFor="group-rate-plan" hint="Supplies cancellation and meal terms.">
                <NativeSelect id="group-rate-plan" aria-label="Contract rate plan" value={form.ratePlanId} onChange={event => setForm({ ...form, ratePlanId: event.target.value })}><option value="">Select rate plan</option>{roomType?.ratePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</NativeSelect>
              </Field>
              <Field label="Payer routing" htmlFor="group-billing">
                <NativeSelect id="group-billing" aria-label="Group payer routing" value={form.billingType} onChange={event => setForm({ ...form, billingType: event.target.value })}><option value="guest_pays">Each guest pays their stay</option><option value="master_folio">Whole stays to group master folio</option></NativeSelect>
              </Field>
              <Field label="Rooms held" htmlFor="group-rooms"><FieldInput id="group-rooms" type="number" min="1" value={form.roomsHeld} onChange={event => setForm({ ...form, roomsHeld: Number(event.target.value) })} /></Field>
              <Field label="Negotiated nightly rate (USD)" htmlFor="group-rate" hint="Before tax and fees.">
                <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><FieldInput id="group-rate" type="number" min="0" step="0.01" className="pl-6 tabular-nums" value={form.rateDollars} onChange={event => setForm({ ...form, rateDollars: event.target.value })} /></div>
              </Field>
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={busy || !canCreate} onClick={create}><Blocks aria-hidden="true" />Hold group room nights</Button>
            <FormNote>Split payer windows are not supported for group blocks.</FormNote>
          </div>
        </div>
      </Disclosure>

      {!loaded ? <WorkspaceLoading label="Loading group blocks" rows={3} /> : workspace.groups.length === 0 ? (
        <Panel><WorkspaceEmpty icon={Blocks} title="No group blocks" description={workspace.groupsEnabled ? 'Create a negotiated block above to hold room nights for a group.' : 'Enable group operations in property settings to create blocks.'} /></Panel>
      ) : (
        <div className="space-y-4">
          <div className="border-b">
            <FilterTabs
              label="Filter group blocks by status"
              value={statusFilter}
              onChange={setStatusFilter}
              tabs={[{ value: 'all', label: 'All blocks', count: workspace.groups.length }, ...GROUP_STATUSES.map(value => ({ value, label: statusMeta('group', value).label, count: workspace.groups.filter(group => group.status === value).length, tone: statusMeta('group', value).tone }))]}
            />
          </div>
          {visibleGroups.length === 0 ? (
            <Panel><WorkspaceEmpty icon={Blocks} title={`No ${statusMeta('group', statusFilter).label.toLowerCase()} blocks on this page`} description="Choose another status or page through older groups." onClear={() => setStatusFilter('all')} compact /></Panel>
          ) : null}
          {visibleGroups.map(group => {
            const masterBalance = group.masterFolio ? group.masterFolio.entries.reduce((sum, entry) => sum + (entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor), 0) : 0;
            const editable = ['tentative', 'definite'].includes(group.status);
            return (
              <Panel key={group.id}>
                <div className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{group.name}</h2>
                      <span className="font-mono text-xs text-muted-foreground">{group.blockCode}</span>
                      <StatusPill kind="group" value={group.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarRange className="size-3" aria-hidden="true" />{formatStayRange(group.arrivalDate, group.departureDate)} · {pluralize(nightsBetween(group.arrivalDate, group.departureDate), 'night')}</span>
                      <Tag>{group.billingType === 'master_folio' ? 'Master folio billing' : 'Guests pay'}</Tag>
                      {group.releaseDate ? <span>Cutoff {formatDateTime(group.releaseDate)}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {group.status === 'tentative' ? <Button size="sm" disabled={busy || !workspace.groupsEnabled} onClick={() => perform(`definite:${group.id}`, key => updateGroupStatus(group.id, 'definite', key))}><CheckCircle2 aria-hidden="true" />Confirm block</Button> : null}
                    {editable ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setSelectedGroup(selectedGroup === group.id ? '' : group.id)}><FileUp aria-hidden="true" />{selectedGroup === group.id ? 'Hide rooming list' : 'Import rooming list'}</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmThen(`Release unused rooms held for ${group.name} back to general inventory?`, () => perform(`release:${group.id}`, key => updateGroupStatus(group.id, 'released', key)))}><PackageOpen aria-hidden="true" />Release unused</Button>
                        <Button size="sm" variant="ghost" className="text-rose-700 dark:text-rose-400" disabled={busy} onClick={() => confirmThen(`Cancel the ${group.name} block? Only blocks with no picked-up reservations can be cancelled.`, () => perform(`cancel:${group.id}`, key => updateGroupStatus(group.id, 'cancelled', key)))}><XCircle aria-hidden="true" />Cancel empty block</Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4 sm:px-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.allocations.map(allocation => (
                      <div key={allocation.id} className="space-y-2 rounded-lg border px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{allocation.roomType.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{money(allocation.rateMinor)}/night</span>
                        </div>
                        <Meter value={allocation.roomsPickedUp} max={allocation.roomsHeld} tone={allocation.roomsPickedUp >= allocation.roomsHeld ? 'success' : 'info'} label={`${allocation.roomType.name} pickup`} />
                        <p className="text-xs tabular-nums text-muted-foreground">{allocation.roomsPickedUp} of {allocation.roomsHeld} rooms picked up</p>
                      </div>
                    ))}
                  </div>

                  {selectedGroup === group.id ? (
                    <RoomingListImport
                      groupId={group.id}
                      allocations={group.allocations}
                      disabled={busy || !workspace.groupsEnabled}
                      onImport={(allocationId, rows, csv) => perform(`rooming:${group.id}:${allocationId}:${csv}`, key => createGroupRoomingList(group.id, allocationId, rows, key))}
                    />
                  ) : null}

                  {group.bookings.length ? (
                    <Disclosure title="Picked-up reservations" badge={<span className="text-xs tabular-nums text-muted-foreground">{group.bookings.length}</span>} icon={Users}>
                      <ul className="divide-y rounded-lg border">
                        {group.bookings.map(booking => (
                          <li key={booking.id} className="space-y-2 px-3 py-2.5 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Link className="min-w-0 truncate font-medium underline-offset-2 hover:underline" href={`/dashboard/platform/folios?bookingId=${booking.id}`}><span className="font-mono text-xs">{booking.confirmationNumber}</span> · {booking.guestName}</Link>
                              <StatusPill kind="booking" value={booking.status} />
                            </div>
                            {group.billingType === 'guest_pays' && ['pending', 'confirmed'].includes(booking.status) ? <GroupRecontract bookingId={booking.id} arrival={group.arrivalDate} departure={group.departureDate} roomTypes={workspace.roomTypes} onSaved={refresh} /> : null}
                          </li>
                        ))}
                      </ul>
                    </Disclosure>
                  ) : null}

                  {group.masterFolio ? (
                    <div className="flex flex-col gap-3 rounded-lg bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-0.5 text-sm">
                        <p className="flex flex-wrap items-center gap-2 font-medium"><ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />Master folio <span className="font-mono text-xs">{group.masterFolio.folioNumber}</span><StatusPill kind="folio" value={group.masterFolio.status} /></p>
                        <p className="text-xs text-muted-foreground">Posted balance <span className="font-medium tabular-nums text-foreground">{money(masterBalance)}</span>. Postings accumulate as service nights are audited. Record group payment from a member&apos;s folio, or transfer to an approved <Link className="underline underline-offset-2" href="/dashboard/platform/receivables">receivable account</Link>.</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={busy || group.masterFolio.status !== 'open'} onClick={() => perform(`close:${group.id}`, key => closeGroupMasterFolio(group.id, key))}><Lock aria-hidden="true" />Close settled master folio</Button>
                    </div>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {cursor || workspace.hasMore ? (
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={!cursor} onClick={() => setCursor(undefined)}><ChevronLeft aria-hidden="true" />Newest groups</Button>
          <Button variant="ghost" size="sm" disabled={!workspace.hasMore} onClick={() => setCursor(workspace.nextCursor)}>Older groups<ChevronRight aria-hidden="true" /></Button>
        </div>
      ) : null}
    </PlatformPage>
  );
}
