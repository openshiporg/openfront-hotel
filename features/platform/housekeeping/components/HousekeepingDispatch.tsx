'use client';
import React from 'react';
import { CloudUpload, ListPlus, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ActionMessage, CheckboxField, Field, FieldInput, FormGrid, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout } from '@/features/platform/components/Surface';
import { humanize } from '@/features/platform/lib/format';
import { getHousekeepingStaffCapabilities, updateHousekeepingTaskAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';
import { INSPECTION_CHECKLIST_NOTE, requiresInspectionChecklist } from '@/features/keystone/workforce/inspectionChecklist';

type Task = { id: string; status: string; taskType: string; updatedAt?: string; room?: { roomNumber?: string }; assignedTo?: { id: string } | null };
type Pending = { taskId: string; status: string; options: { assignedToId: string | null; notes: string; idempotencyKey: string; expectedStatus: string; expectedUpdatedAt?: string } };
const STORAGE_KEY = 'hotel-housekeeping-commands-v1';

/**
 * Assignment, inspection and completion commands queued on this device and
 * synced to the property. The server rechecks permissions and revisions.
 */
export function HousekeepingDispatch({ tasks, staff, onRefresh }: { tasks: Task[]; staff: Array<{ id: string; name: string }>; onRefresh: () => unknown }) {
  const [taskId, setTaskId] = React.useState('');
  const [staffId, setStaffId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [inspected, setInspected] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);
  const [dispatchStaff, setDispatchStaff] = React.useState(staff);
  const [pending, setPending] = React.useState<Pending[]>([]);

  React.useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); if (Array.isArray(stored)) setPending(stored); }
    catch { setFeedback({ tone: 'error', text: 'Updates saved on this device could not be read.' }); }
  }, []);
  // A checklist confirmation belongs to one task at one revision; selecting another task or
  // receiving a newer revision clears it.
  const selectedRevision = tasks.find(item => item.id === taskId)?.updatedAt;
  React.useEffect(() => { setInspected(false); setNotes(''); setFeedback(null); }, [taskId, selectedRevision]);
  React.useEffect(() => {
    getHousekeepingStaffCapabilities().then(value => setDispatchStaff(value.staff)).catch(error => setFeedback({ tone: 'error', text: error.message }));
  }, []);

  function savePending(next: Pending[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setPending(next); }

  async function queue(complete: boolean) {
    const task = tasks.find(item => item.id === taskId); if (!task) return;
    if (!task.updatedAt) { setFeedback({ tone: 'error', text: 'Refresh task data before queuing an offline update.' }); return; }
    if (complete && requiresInspectionChecklist(task) && !inspected) { setFeedback({ tone: 'error', text: 'Record the room safety, cleanliness and repair checks before inspection completion.' }); return; }
    const item: Pending = { taskId, status: complete ? 'completed' : task.status, options: { assignedToId: staffId || null, notes: `${inspected && requiresInspectionChecklist(task) ? `${INSPECTION_CHECKLIST_NOTE} ` : ''}${notes}`.trim(), idempotencyKey: crypto.randomUUID(), expectedStatus: task.status, expectedUpdatedAt: task.updatedAt } };
    savePending([...pending, item]);
    setFeedback({ tone: 'info', text: 'Command saved on this device. Sync to persist it to the property.' });
  }

  async function sync() {
    setBusy(true); let remaining = [...pending];
    try {
      for (const item of pending) {
        if (!item.options.expectedUpdatedAt) throw new Error('This saved update is out of date. Refresh tasks and enter it again.');
        unwrapAction(await updateHousekeepingTaskAction(item.taskId, item.status, item.options));
        remaining = remaining.filter(candidate => candidate.options.idempotencyKey !== item.options.idempotencyKey); savePending(remaining);
      }
      setFeedback({ tone: 'success', text: 'All saved updates were sent.' }); onRefresh();
    } catch (error) {
      setFeedback({ tone: 'error', text: `${error instanceof Error ? error.message : 'Sending failed.'} The remaining updates stay on this device. Refresh tasks, then try again.` });
    } finally { setBusy(false); }
  }

  const openTasks = tasks.filter(task => task.status !== 'completed');
  const taskLabel = (id: string) => {
    const task = tasks.find(item => item.id === id);
    return task ? `Room ${task.room?.roomNumber || '—'} · ${humanize(task.taskType)}` : id;
  };

  return (
    <div className="space-y-5">
      {pending.length ? (
        <Callout
          tone="warning"
          title={`${pending.length} update${pending.length === 1 ? '' : 's'} saved on this device only`}
          action={<Button size="sm" disabled={busy} onClick={sync}><CloudUpload aria-hidden="true" />{busy ? 'Sending…' : 'Send now'}</Button>}
        >
          Other staff cannot see these updates until you send them.
        </Callout>
      ) : null}

      <FormGrid columns={3}>
        <Field label="Open task" htmlFor="dispatch-task">
          <NativeSelect id="dispatch-task" aria-label="Housekeeping task" value={taskId} onChange={event => { setTaskId(event.target.value); setStaffId(tasks.find(task => task.id === event.target.value)?.assignedTo?.id || ''); }}>
            <option value="">Select open task</option>
            {openTasks.map(task => <option key={task.id} value={task.id}>Room {task.room?.roomNumber} · {humanize(task.taskType)} · {humanize(task.status)}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Assign to" htmlFor="dispatch-staff">
          <NativeSelect id="dispatch-staff" aria-label="Assigned housekeeping staff" value={staffId} onChange={event => setStaffId(event.target.value)}>
            <option value="">Unassigned</option>
            {dispatchStaff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Notes" htmlFor="dispatch-notes" optional>
          <FieldInput id="dispatch-notes" aria-label="Inspection or dispatch notes" placeholder="Inspection, discrepancy or dispatch notes" value={notes} onChange={event => setNotes(event.target.value)} />
        </Field>
      </FormGrid>
      <CheckboxField checked={inspected} onChange={setInspected} label="Cleanliness, safety and repairs checked" description="Required before completing an inspection task." />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || !taskId} onClick={() => queue(false)}><ListPlus aria-hidden="true" />Save assignment</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !taskId} onClick={() => queue(true)}><ListPlus aria-hidden="true" />Mark complete</Button>
        <Button type="button" size="sm" disabled={busy || !pending.length} onClick={sync}><CloudUpload aria-hidden="true" />Send {pending.length} saved</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onRefresh()}><RefreshCw aria-hidden="true" />Refresh tasks</Button>
      </div>
      <ActionMessage feedback={feedback} />

      {pending.length ? (
        <ul className="divide-y rounded-lg border">
          {pending.map(item => (
            <li key={item.options.idempotencyKey} className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{taskLabel(item.taskId)}</span>
                <StatusPill kind="task" value={item.options.expectedStatus} />
                <span className="text-muted-foreground" aria-hidden="true">→</span>
                <StatusPill kind="task" value={item.status} />
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => savePending(pending.filter(candidate => candidate.options.idempotencyKey !== item.options.idempotencyKey))}><Trash2 aria-hidden="true" />Discard</Button>
            </li>
          ))}
        </ul>
      ) : null}
      <FormNote>Updates stay on this device until you send them. Each one is checked against the task's current status when it is sent.</FormNote>
    </div>
  );
}
