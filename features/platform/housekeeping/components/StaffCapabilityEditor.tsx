'use client';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { ActionMessage, CheckboxField, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { Callout } from '@/features/platform/components/Surface';
import { humanize } from '@/features/platform/lib/format';
import { getHousekeepingStaffCapabilities, updateHousekeepingStaffCapability } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

/** Per-person dispatch eligibility: floors, room sections and qualified task types. */
export default function StaffCapabilityEditor() {
  const [workspace, setWorkspace] = useState<any>(null);
  const [staffId, setStaffId] = useState('');
  const [configured, setConfigured] = useState(true);
  const [floors, setFloors] = useState('*');
  const [allRooms, setAllRooms] = useState(true);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [section, setSection] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try { setWorkspace(await getHousekeepingStaffCapabilities()); }
    catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to load staff capabilities.' }); }
  }
  useEffect(() => { void refresh(); }, []);

  function select(id: string) {
    setStaffId(id);
    const value = workspace.staff.find((person: any) => person.id === id)?.capability;
    setConfigured(value?.configured ?? true);
    setFloors(value?.allowedFloors === null || !value ? '*' : value.allowedFloors.join(','));
    setAllRooms(value?.allowedRoomIds === null || !value);
    setRoomIds(value?.allowedRoomIds || []);
    setTasks(value?.taskTypes || workspace.taskTypes);
    setSection(value?.sectionName || '');
  }

  async function save() {
    setBusy(true); setFeedback(null);
    try {
      const configuration = { configured, allowedFloors: floors.trim() === '*' ? null : floors.trim() ? floors.split(',').map(value => Number(value.trim())) : [], allowedRoomIds: allRooms ? null : roomIds, taskTypes: tasks, sectionName: allRooms ? '' : section };
      const expectedRevision = workspace.staff.find((person: any) => person.id === staffId)?.capability?.revision || 0;
      const attempt = await operationAttempt('housekeeping-capability', { staffId, configuration, expectedRevision });
      unwrapAction(await updateHousekeepingStaffCapability(staffId, configuration, expectedRevision, attempt.key));
      attempt.complete(); await refresh();
      setFeedback({ tone: 'success', text: 'Staff skills and section restrictions saved.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Staff capability could not be saved.' });
    } finally { setBusy(false); }
  }

  if (!workspace) return feedback ? <ActionMessage feedback={feedback} /> : <div className="h-28 animate-pulse rounded-lg bg-muted/60" role="status" aria-label="Loading staff capabilities" />;
  if (!workspace.canConfigure) {
    return <Callout tone="neutral" title="View only">Staff skill and section changes require people or role management permission. Dispatch rechecks these restrictions when commands sync.</Callout>;
  }

  return (
    <div className="space-y-5">
      <FormNote>Without custom rules, the active housekeeping or maintenance role determines eligibility. Floor and room-section restrictions both apply.</FormNote>
      <Field label="Staff member" htmlFor="capability-staff" className="max-w-sm">
        <NativeSelect id="capability-staff" aria-label="Staff capability profile" value={staffId} onChange={event => select(event.target.value)}>
          <option value="">Select staff member</option>
          {workspace.staff.map((person: any) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </NativeSelect>
      </Field>
      {staffId ? (
        <div className="space-y-5 rounded-lg border p-4">
          <CheckboxField checked={configured} onChange={setConfigured} label="Apply custom dispatch restrictions" description="Turn off to fall back to role-based eligibility." />
          <Field label="Allowed floors" htmlFor="capability-floors" hint="* means every floor; a comma list such as 1,2,3 limits floors; empty permits none." className="max-w-sm">
            <FieldInput id="capability-floors" aria-label="Allowed floors" value={floors} onChange={event => setFloors(event.target.value)} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Qualified task types</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {workspace.taskTypes.map((type: string) => (
                <CheckboxField key={type} checked={tasks.includes(type)} onChange={checked => setTasks(checked ? [...tasks, type] : tasks.filter(item => item !== type))} label={humanize(type)} />
              ))}
            </div>
          </fieldset>
          <CheckboxField checked={allRooms} onChange={setAllRooms} label="All physical rooms" description="Untick to restrict this person to a named section of rooms." />
          {!allRooms ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section name" htmlFor="capability-section">
                <FieldInput id="capability-section" aria-label="Section name" placeholder="For example east wing" value={section} onChange={event => setSection(event.target.value)} />
              </Field>
              <Field label="Rooms in section" htmlFor="capability-rooms" hint="Hold Ctrl / ⌘ to select several.">
                <NativeSelect id="capability-rooms" aria-label="Rooms in assigned section" multiple value={roomIds} onChange={event => setRoomIds(Array.from(event.target.selectedOptions, option => option.value))}>
                  {workspace.rooms.map((room: any) => <option key={room.id} value={room.id}>Room {room.roomNumber} · floor {room.floor}</option>)}
                </NativeSelect>
              </Field>
            </div>
          ) : null}
          <Button size="sm" disabled={busy} onClick={save}><Save aria-hidden="true" />Save dispatch policy</Button>
        </div>
      ) : null}
      <ActionMessage feedback={feedback} />
    </div>
  );
}
