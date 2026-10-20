'use client';
import React from 'react';
import { CalendarOff, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ActionMessage, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { WorkspaceEmpty, WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatStayRange } from '@/features/platform/lib/format';
import { getRoomOutagesAction, updateRoomOutageAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type Outage = { id: string; roomId: string; startDate: string; endDate: string; reason: string; status: string };

/** Planned outages withhold sellable inventory for a room over a date range. */
export function RoomOutageControls({ rooms }: { rooms: Array<{ id: string; roomNumber: string }> }) {
  const [outages, setOutages] = React.useState<Outage[] | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [roomId, setRoomId] = React.useState('');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);
  const keys = React.useRef(new Map<string, string>());

  const load = React.useCallback(() => {
    setLoadError('');
    getRoomOutagesAction().then(setOutages).catch(error => setLoadError(error instanceof Error ? error.message : 'Scheduled outages could not be loaded.'));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function save(action: 'schedule' | 'cancel', outage?: Outage) {
    const input = { action, roomId: outage?.roomId || roomId, outageId: outage?.id, startDate: start ? `${start}T00:00:00.000Z` : undefined, endDate: end ? `${end}T00:00:00.000Z` : undefined, reason };
    const intent = JSON.stringify(input); if (!keys.current.has(intent)) keys.current.set(intent, crypto.randomUUID());
    setBusy(true); setFeedback(null);
    try {
      setOutages(unwrapAction(await updateRoomOutageAction({ ...input, idempotencyKey: keys.current.get(intent)! })));
      keys.current.delete(intent);
      setFeedback({ tone: 'success', text: action === 'schedule' ? 'Room outage scheduled.' : 'Capacity returned to inventory.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to save outage.' });
    } finally { setBusy(false); }
  }

  const scheduled = (outages || []).filter(item => item.status === 'scheduled');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Field label="Room" htmlFor="outage-room">
            <NativeSelect id="outage-room" aria-label="Outage room" value={roomId} onChange={event => setRoomId(event.target.value)}>
              <option value="">Select room</option>
              {rooms.map(room => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Reason" htmlFor="outage-reason" hint="Also required when returning capacity.">
            <FieldInput id="outage-reason" aria-label="Outage reason" placeholder="Reason for outage or return" value={reason} onChange={event => setReason(event.target.value)} />
          </Field>
          <Field label="First night out" htmlFor="outage-start">
            <FieldInput id="outage-start" aria-label="Outage start date" type="date" value={start} onChange={event => setStart(event.target.value)} />
          </Field>
          <Field label="Back in service" htmlFor="outage-end" hint="Exclusive end date.">
            <FieldInput id="outage-end" aria-label="Outage end date (exclusive)" type="date" value={end} onChange={event => setEnd(event.target.value)} />
          </Field>
        </div>
        <Button type="button" size="sm" disabled={busy || !roomId || !start || !end || !reason.trim()} onClick={() => save('schedule')}><CalendarOff aria-hidden="true" />Schedule outage</Button>
        <FormNote>Inventory is withheld for each night from the first night through the night before the return date. Only room managers can schedule or return outage capacity.</FormNote>
        <ActionMessage feedback={feedback} />
      </div>

      <div className="min-w-0 space-y-3">
        <p className="text-sm font-semibold">Scheduled outages <span className="font-normal text-muted-foreground">({scheduled.length})</span></p>
        {scheduled.length ? (
          <ul className="divide-y rounded-lg border">
            {scheduled.map(item => (
              <li key={item.id} className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">Room {rooms.find(room => room.id === item.roomId)?.roomNumber || item.roomId}<span className="font-normal text-muted-foreground"> · {formatStayRange(item.startDate, item.endDate)}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={busy || !reason.trim()} title={reason.trim() ? undefined : 'Enter a reason first'} onClick={() => save('cancel', item)}><Undo2 aria-hidden="true" />Return capacity</Button>
              </li>
            ))}
          </ul>
        ) : loadError ? (
          <WorkspaceError title="Scheduled outages unavailable" message={loadError} onRetry={load} />
        ) : outages === null ? (
          <WorkspaceLoading label="Loading scheduled outages" rows={2} />
        ) : (
          <div className="rounded-lg border border-dashed"><WorkspaceEmpty compact icon={CalendarOff} title="No scheduled outages" description="Rooms taken out of service for a date range appear here." /></div>
        )}
      </div>
    </div>
  );
}
