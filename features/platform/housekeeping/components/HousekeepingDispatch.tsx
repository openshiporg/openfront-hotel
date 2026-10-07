'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StaffCapabilityEditor from './StaffCapabilityEditor';
import { getHousekeepingStaffCapabilities, updateHousekeepingTaskAction } from '../actions';

type Task = { id: string; status: string; taskType: string; updatedAt?: string; room?: { roomNumber?: string }; assignedTo?: { id: string } | null };
type Pending = { taskId: string; status: string; options: { assignedToId: string | null; notes: string; idempotencyKey: string; expectedStatus: string; expectedUpdatedAt?: string } };
const STORAGE_KEY = 'hotel-housekeeping-commands-v1';

export function HousekeepingDispatch({ tasks, staff, onRefresh }: { tasks: Task[]; staff: Array<{ id: string; name: string }>; onRefresh: () => unknown }) {
  const [taskId, setTaskId] = React.useState(''), [staffId, setStaffId] = React.useState(''), [notes, setNotes] = React.useState('');
  const [inspected, setInspected] = React.useState(false), [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false);
  const [dispatchStaff, setDispatchStaff] = React.useState(staff);
  const [pending, setPending] = React.useState<Pending[]>([]);
  React.useEffect(() => { try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); if (Array.isArray(stored)) setPending(stored); } catch { setMessage('Saved offline commands could not be read.'); } }, []);
  function savePending(next: Pending[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setPending(next); }
  async function queue(complete: boolean) {
    const task = tasks.find(item => item.id === taskId); if (!task) return;
    if (!task.updatedAt) { setMessage('Refresh task data before queuing an offline update.'); return; }
    if (complete && task.taskType === 'inspection' && !inspected) { setMessage('Record the room safety, cleanliness and repair checks before inspection completion.'); return; }
    const item: Pending = { taskId, status: complete ? 'completed' : task.status, options: { assignedToId: staffId || null, notes: `${inspected ? 'Inspection: cleanliness, room safety and repair completion checked. ' : ''}${notes}`.trim(), idempotencyKey: crypto.randomUUID(), expectedStatus: task.status, expectedUpdatedAt: task.updatedAt } };
    const next = [...pending, item]; savePending(next); setMessage('Command saved on this device. Sync to persist it to the property.');
  }
  async function sync() {
    setBusy(true); let remaining = [...pending];
    try {
      for (const item of pending) {
        if (!item.options.expectedUpdatedAt) throw new Error('This older local command has no task revision. Refresh, discard it locally and requeue against the current task.');
        await updateHousekeepingTaskAction(item.taskId, item.status, item.options);
        remaining = remaining.filter(candidate => candidate.options.idempotencyKey !== item.options.idempotencyKey); savePending(remaining);
      }
      setMessage('All queued commands saved to the property.'); onRefresh();
    } catch (error) { setMessage(`${error instanceof Error ? error.message : 'Sync failed.'} The remaining commands stay on this device. Refresh the workspace before resolving a conflict.`); }
    finally { setBusy(false); }
  }
  return <details className="rounded border p-4" onToggle={event => { if (event.currentTarget.open) getHousekeepingStaffCapabilities().then(value => setDispatchStaff(value.staff)).catch(error => setMessage(error.message)); }}><summary className="cursor-pointer font-medium">Dispatch, inspection and offline updates</summary><div className="mt-3 grid gap-3 md:grid-cols-3">
    <select aria-label="Housekeeping task" className="rounded border p-2" value={taskId} onChange={event => { setTaskId(event.target.value); setStaffId(tasks.find(task => task.id === event.target.value)?.assignedTo?.id || ''); }}><option value="">Select open task</option>{tasks.filter(task => task.status !== 'completed').map(task => <option key={task.id} value={task.id}>Room {task.room?.roomNumber} · {task.taskType} · {task.status}</option>)}</select>
    <select aria-label="Assigned housekeeping staff" className="rounded border p-2" value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">Unassigned</option>{dispatchStaff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
    <Input aria-label="Inspection or dispatch notes" placeholder="Inspection, discrepancy or dispatch notes" value={notes} onChange={event => setNotes(event.target.value)} />
    <label className="text-sm"><input type="checkbox" checked={inspected} onChange={event => setInspected(event.target.checked)} /> Cleanliness, safety and repairs checked</label>
    <Button type="button" disabled={busy || !taskId} onClick={() => queue(false)}>Queue assignment / notes</Button><Button type="button" disabled={busy || !taskId} onClick={() => queue(true)}>Queue completion</Button>
  </div><p className="mt-2 text-sm">Offline commands stay on this browser until synced. Server permissions, transitions and current task status are checked again during sync.</p>
  <div className="mt-2 flex gap-2"><Button type="button" disabled={busy || !pending.length} onClick={sync}>Sync {pending.length} pending commands</Button><Button type="button" variant="outline" disabled={busy} onClick={() => onRefresh()}>Refresh tasks</Button></div>
  {pending.map(item => <div className="mt-2 flex items-center justify-between text-sm" key={item.options.idempotencyKey}><span>{item.taskId}: {item.options.expectedStatus} → {item.status}</span><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => savePending(pending.filter(candidate => candidate.options.idempotencyKey !== item.options.idempotencyKey))}>Discard local command</Button></div>)}
  <StaffCapabilityEditor />
  {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </details>;
}
