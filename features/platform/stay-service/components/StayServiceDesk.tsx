'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStayServices, saveStayService } from '../actions';

type Service = { id: string; bookingId?: string; roomId?: string; category: string; title: string; description?: string; status: string; priority: string; dueAt?: string; resolution?: string; assignedToId?: string };
export function StayServiceDesk({ bookingId, rooms = [], staff = [] }: { bookingId?: string; rooms?: Array<{ id: string; roomNumber: string }>; staff?: Array<{ id: string; name: string }> }) {
  const [showClosed, setShowClosed] = React.useState(false);
  const [services, setServices] = React.useState<Service[]>([]), [roomId, setRoomId] = React.useState(''), [category, setCategory] = React.useState('guest_request');
  const [title, setTitle] = React.useState(''), [description, setDescription] = React.useState(''), [dueAt, setDueAt] = React.useState(''), [assignee, setAssignee] = React.useState('');
  const [resolution, setResolution] = React.useState(''), [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false);
  const attempts = React.useRef(new Map<string, string>());
  const refresh = React.useCallback(async () => { try { setServices(await getStayServices({ bookingId })); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load service cases.'); } }, [bookingId]);
  React.useEffect(() => { refresh(); }, [refresh]);
  async function save(service?: Service, status = 'open') {
    const input = service ? { serviceId: service.id, bookingId: service.bookingId, roomId: service.roomId, status, expectedStatus: service.status, resolution, ...(assignee ? { assignedToId: assignee } : {}) } : { bookingId, roomId: roomId || undefined, category, title, description, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined, status: 'open', priority: category === 'incident' ? 'urgent' : 'normal', ...(assignee ? { assignedToId: assignee } : {}) };
    const intent = JSON.stringify(input); if (!attempts.current.has(intent)) attempts.current.set(intent, crypto.randomUUID());
    setBusy(true); setMessage('');
    try { await saveStayService({ ...input, idempotencyKey: attempts.current.get(intent)! }); attempts.current.delete(intent); await refresh(); setMessage('Service case saved.'); if (!service) { setTitle(''); setDescription(''); } }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save service case.'); }
    finally { setBusy(false); }
  }
  const active = services.filter(service => showClosed || service.status !== 'closed');
  return <details className="rounded border p-3"><summary className="cursor-pointer font-medium">Guest services, incidents and lost property ({active.length})</summary><div className="mt-3 space-y-2">
    {!bookingId && <select aria-label="Service room" className="w-full rounded border p-2" value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">Select room</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.roomNumber}</option>)}</select>}
    <select aria-label="Service category" className="w-full rounded border p-2" value={category} onChange={event => setCategory(event.target.value)}>{['guest_request', 'incident', 'lost_found', 'wake_up', 'housekeeping_discrepancy'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
    <Input aria-label="Service title" placeholder="Request, incident or found item" value={title} onChange={event => setTitle(event.target.value)} /><Input aria-label="Service description" placeholder="Details; for lost property record where found and current custody" value={description} onChange={event => setDescription(event.target.value)} />
    <label className="block text-sm">Due time (your device timezone)<Input aria-label="Service due time" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
    {!!staff.length && <select aria-label="Service staff assignee" className="w-full rounded border p-2" value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">Select staff assignee</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>}
    <Button type="button" size="sm" disabled={busy || !title.trim() || (!bookingId && !roomId)} onClick={() => save()}>Open service case</Button>
    <Input aria-label="Service resolution evidence" placeholder="Fulfillment / incident resolution / item custody or handover evidence" value={resolution} onChange={event => setResolution(event.target.value)} />
    <label className="text-sm"><input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)} /> Include closed history</label>
    {active.map(service => <div key={service.id} className="rounded border p-2 text-sm"><p>{service.title} · {service.category.replaceAll('_', ' ')} · {service.status}</p>{service.description && <p>{service.description}</p>}{service.assignedToId && <p>Assigned: {staff.find(person => person.id === service.assignedToId)?.name || service.assignedToId}</p>}{service.dueAt && <p className={new Date(service.dueAt) < new Date() && service.status !== 'resolved' ? 'text-red-700' : ''}>Due {new Date(service.dueAt).toLocaleString()}</p>}{service.resolution && <p>{service.resolution}</p>}<div className="mt-2 flex flex-wrap gap-2">
      {service.status === 'open' && assignee && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save(service, 'assigned')}>Assign</Button>}
      {['open', 'assigned', 'resolved'].includes(service.status) && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save(service, 'in_progress')}>Start / reopen</Button>}
      {['open', 'assigned', 'in_progress'].includes(service.status) && <Button type="button" size="sm" variant="outline" disabled={busy || resolution.trim().length < 3} onClick={() => save(service, 'resolved')}>Resolve</Button>}
      {service.status === 'resolved' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save(service, 'closed')}>Close</Button>}
    </div></div>)}
    <p className="text-xs">Fulfillment is recorded by staff. Wake-up cases do not place calls automatically. Discrepancy cases require a room manager to return availability after resolution.</p>
    {message && <p role="status">{message}</p>}
  </div></details>;
}
