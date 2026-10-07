'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRoomOutagesAction, updateRoomOutageAction } from '../actions';

type Outage = { id: string; roomId: string; startDate: string; endDate: string; reason: string; status: string };
export function RoomOutageControls({ rooms }: { rooms: Array<{ id: string; roomNumber: string }> }) {
  const [outages, setOutages] = React.useState<Outage[]>([]);
  const [roomId, setRoomId] = React.useState(''), [start, setStart] = React.useState(''), [end, setEnd] = React.useState(''), [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false);
  const keys = React.useRef(new Map<string, string>());
  React.useEffect(() => { getRoomOutagesAction().then(setOutages).catch(error => setMessage(error.message)); }, []);
  async function save(action: 'schedule' | 'cancel', outage?: Outage) {
    const input = { action, roomId: outage?.roomId || roomId, outageId: outage?.id, startDate: start ? `${start}T00:00:00.000Z` : undefined, endDate: end ? `${end}T00:00:00.000Z` : undefined, reason };
    const intent = JSON.stringify(input); if (!keys.current.has(intent)) keys.current.set(intent, crypto.randomUUID());
    setBusy(true); setMessage('');
    try { setOutages(await updateRoomOutageAction({ ...input, idempotencyKey: keys.current.get(intent)! })); keys.current.delete(intent); setMessage('Room outage saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save outage.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded border p-4"><summary className="cursor-pointer font-medium">Planned room outages</summary><div className="mt-3 grid gap-3 md:grid-cols-4">
    <select aria-label="Outage room" className="rounded border p-2" value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">Select room</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.roomNumber}</option>)}</select>
    <Input aria-label="Outage start date" type="date" value={start} onChange={event => setStart(event.target.value)} /><Input aria-label="Outage end date (exclusive)" type="date" value={end} onChange={event => setEnd(event.target.value)} /><Input aria-label="Outage reason" placeholder="Reason for outage or return" value={reason} onChange={event => setReason(event.target.value)} />
    <Button type="button" disabled={busy || !roomId || !start || !end || !reason.trim()} onClick={() => save('schedule')}>Schedule outage</Button>
  </div><p className="mt-2 text-sm">Inventory is withheld for each night from start through the night before end. Only room managers can schedule or return outage capacity.</p>
    {outages.filter(item => item.status === 'scheduled').map(item => <div key={item.id} className="mt-2 flex items-center justify-between gap-2 text-sm"><span>Room {rooms.find(room => room.id === item.roomId)?.roomNumber || item.roomId}: {item.startDate.slice(0, 10)} – {item.endDate.slice(0, 10)} · {item.reason}</span><Button type="button" variant="outline" size="sm" disabled={busy || !reason.trim()} onClick={() => save('cancel', item)}>Return capacity</Button></div>)}
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </details>;
}
