'use client';
import React from 'react';
import { BellRing, Clock3, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActionMessage, CheckboxField, Field, FieldInput, FormGrid, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { WorkspaceEmpty } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, humanize } from '@/features/platform/lib/format';
import { getStayServices, saveStayService } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type Service = { id: string; bookingId?: string; roomId?: string; category: string; title: string; description?: string; status: string; priority: string; dueAt?: string; resolution?: string; assignedToId?: string };

const CATEGORIES = ['guest_request', 'incident', 'lost_found', 'wake_up', 'housekeeping_discrepancy'];

/** Guest requests, incidents, wake-up calls and lost property for a stay or room. */
export function StayServiceDesk({ bookingId, rooms = [], staff = [] }: { bookingId?: string; rooms?: Array<{ id: string; roomNumber: string }>; staff?: Array<{ id: string; name: string }> }) {
  const [showClosed, setShowClosed] = React.useState(false);
  const [services, setServices] = React.useState<Service[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [roomId, setRoomId] = React.useState('');
  const [category, setCategory] = React.useState('guest_request');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dueAt, setDueAt] = React.useState('');
  const [assignee, setAssignee] = React.useState('');
  const [resolution, setResolution] = React.useState('');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);
  const attempts = React.useRef(new Map<string, string>());

  const refresh = React.useCallback(async () => {
    try { setServices(await getStayServices({ bookingId })); }
    catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load service cases.' }); }
    finally { setLoaded(true); }
  }, [bookingId]);
  React.useEffect(() => { refresh(); }, [refresh]);

  async function save(service?: Service, status = 'open') {
    const input = service
      ? { serviceId: service.id, bookingId: service.bookingId, roomId: service.roomId, status, expectedStatus: service.status, resolution, ...(assignee ? { assignedToId: assignee } : {}) }
      : { bookingId, roomId: roomId || undefined, category, title, description, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined, status: 'open', priority: category === 'incident' ? 'urgent' : 'normal', ...(assignee ? { assignedToId: assignee } : {}) };
    const intent = JSON.stringify(input); if (!attempts.current.has(intent)) attempts.current.set(intent, crypto.randomUUID());
    setBusy(true); setFeedback(null);
    try {
      unwrapAction(await saveStayService({ ...input, idempotencyKey: attempts.current.get(intent)! }));
      attempts.current.delete(intent); await refresh();
      setFeedback({ tone: 'success', text: 'Service case saved.' });
      if (!service) { setTitle(''); setDescription(''); }
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save service case.' });
    } finally { setBusy(false); }
  }

  const active = services.filter(service => showClosed || service.status !== 'closed');
  const roomLabel = (id?: string) => rooms.find(room => room.id === id)?.roomNumber;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" aria-hidden="true" />Open a service case</div>
        <FormGrid columns={1}>
          {!bookingId ? (
            <Field label="Room" htmlFor="service-room">
              <NativeSelect id="service-room" aria-label="Service room" value={roomId} onChange={event => setRoomId(event.target.value)}>
                <option value="">Select room</option>
                {rooms.map(room => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}
              </NativeSelect>
            </Field>
          ) : null}
          <Field label="Category" htmlFor={`service-category-${bookingId || 'room'}`}>
            <NativeSelect id={`service-category-${bookingId || 'room'}`} aria-label="Service category" value={category} onChange={event => setCategory(event.target.value)}>
              {CATEGORIES.map(value => <option key={value} value={value}>{humanize(value)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Title" htmlFor={`service-title-${bookingId || 'room'}`}>
            <FieldInput id={`service-title-${bookingId || 'room'}`} aria-label="Service title" placeholder="Request, incident or found item" value={title} onChange={event => setTitle(event.target.value)} />
          </Field>
          <Field label="Details" htmlFor={`service-description-${bookingId || 'room'}`} hint="For lost property, record where it was found and current custody.">
            <FieldInput id={`service-description-${bookingId || 'room'}`} aria-label="Service description" value={description} onChange={event => setDescription(event.target.value)} />
          </Field>
          <Field label="Due" htmlFor={`service-due-${bookingId || 'room'}`} optional hint="Uses your device time zone.">
            <FieldInput id={`service-due-${bookingId || 'room'}`} aria-label="Service due time" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} />
          </Field>
          {staff.length ? (
            <Field label="Assignee" htmlFor={`service-assignee-${bookingId || 'room'}`} optional>
              <NativeSelect id={`service-assignee-${bookingId || 'room'}`} aria-label="Service staff assignee" value={assignee} onChange={event => setAssignee(event.target.value)}>
                <option value="">Unassigned</option>
                {staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
              </NativeSelect>
            </Field>
          ) : null}
        </FormGrid>
        <Button type="submit" size="sm" disabled={busy || !title.trim() || (!bookingId && !roomId)}>Open service case</Button>
        <FormNote>Fulfillment is recorded by staff. Wake-up cases do not place calls automatically. Discrepancy cases require a room manager to return availability after resolution.</FormNote>
      </form>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Cases <span className="font-normal text-muted-foreground">({active.length})</span></p>
          <CheckboxField checked={showClosed} onChange={setShowClosed} label="Include closed history" className="text-xs" />
        </div>
        <Field label="Resolution evidence" htmlFor={`service-resolution-${bookingId || 'room'}`} hint="Used when you resolve a case below — at least 3 characters.">
          <FieldInput id={`service-resolution-${bookingId || 'room'}`} aria-label="Service resolution evidence" placeholder="Fulfillment, incident resolution, custody or handover evidence" value={resolution} onChange={event => setResolution(event.target.value)} />
        </Field>
        <ActionMessage feedback={feedback} />
        {active.length ? (
          <ul className="divide-y rounded-lg border">
            {active.map(service => {
              const overdue = service.dueAt && new Date(service.dueAt) < new Date() && !['resolved', 'closed'].includes(service.status);
              return (
                <li key={service.id} className="space-y-2 px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium [overflow-wrap:anywhere]">{service.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Tag icon={BellRing}>{humanize(service.category)}</Tag>
                        {service.priority === 'urgent' ? <StatusPill kind="priority" value="urgent" /> : null}
                        {roomLabel(service.roomId) ? <Tag>Room {roomLabel(service.roomId)}</Tag> : null}
                      </div>
                    </div>
                    <StatusPill kind="service" value={service.status} />
                  </div>
                  {service.description ? <p className="text-muted-foreground [overflow-wrap:anywhere]">{service.description}</p> : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {service.assignedToId ? <span>Assigned to {staff.find(person => person.id === service.assignedToId)?.name || service.assignedToId}</span> : null}
                    {service.dueAt ? <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-rose-700 dark:text-rose-400')}><Clock3 className="size-3" aria-hidden="true" />{overdue ? 'Overdue · ' : 'Due '}{formatDateTime(service.dueAt)}</span> : null}
                  </div>
                  {service.resolution ? <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">{service.resolution}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {service.status === 'open' && assignee ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save(service, 'assigned')}>Assign</Button> : null}
                    {['open', 'assigned', 'resolved'].includes(service.status) ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save(service, 'in_progress')}>{service.status === 'resolved' ? 'Reopen' : 'Start'}</Button> : null}
                    {['open', 'assigned', 'in_progress'].includes(service.status) ? <Button type="button" size="sm" disabled={busy || resolution.trim().length < 3} onClick={() => save(service, 'resolved')}>Resolve</Button> : null}
                    {service.status === 'resolved' ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save(service, 'closed')}>Close</Button> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed">
            <WorkspaceEmpty compact title={loaded ? 'No open service cases' : 'Loading service cases'} description={loaded ? 'Requests, incidents and lost property recorded here stay with the stay or room.' : 'Fetching cases for this stay.'} icon={BellRing} />
          </div>
        )}
      </div>
    </div>
  );
}
