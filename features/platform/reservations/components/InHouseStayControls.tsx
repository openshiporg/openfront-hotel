'use client';
import React from 'react';
import { operationAttempt } from '@/lib/operationAttempt';
import LoyaltyPanel from '@/features/platform/loyalty/components/LoyaltyPanel';
import { StayServiceDesk } from '@/features/platform/stay-service/components/StayServiceDesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { amendReservationStayAction, getStayRegisterAction, updateStayRegisterAction, getInHouseUpgradeOptions } from '../actions';

type Register = { roomMoves?: Array<{ fromRoomId: string | null; toRoomId: string; effectiveAt: string }>; occupants: Array<{ id: string; name: string; departedAt?: string }>; keys: Array<{ reference: string; occupantId: string; returnedAt?: string; retiredAt?: string; retirementReason?: string }> };

export function InHouseStayControls({ bookingId, checkInDate, checkOutDate }: { bookingId: string; checkInDate: string; checkOutDate: string }) {
  const [upgrade, setUpgrade] = React.useState({ roomTypeId: '', ratePlanId: '', targetRoomId: '' });
  const [upgradeOptions, setUpgradeOptions] = React.useState<{ roomTypes: Array<{ id: string; name: string; ratePlans: Array<{ id: string; name: string }> }>; rooms: Array<{ id: string; roomNumber: string; status: string; roomType: { id: string } }> } | null>(null);
  const [departure, setDeparture] = React.useState(checkOutDate.slice(0, 10));
  const [savedDeparture, setSavedDeparture] = React.useState(checkOutDate.slice(0, 10));
  const [register, setRegister] = React.useState<Register>({ occupants: [], keys: [] });
  const [waiverReason, setWaiverReason] = React.useState('');
  const [approvalId, setApprovalId] = React.useState('');
  const [name, setName] = React.useState('');
  const [lostKeyReason, setLostKeyReason] = React.useState('');
  const [holder, setHolder] = React.useState('');
  const [keyReference, setKeyReference] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { getStayRegisterAction(bookingId).then(setRegister).catch(error => setMessage(error.message)); }, [bookingId]);
  async function command(action: string, input: { name?: string; occupantId?: string; keyReference?: string } = {}) {
    const intent = JSON.stringify({ bookingId, action, ...input }); setBusy(true); setMessage('');
    try {
      const attempt = await operationAttempt('stay-register', intent);
      await updateStayRegisterAction({ bookingId, action, ...input, idempotencyKey: attempt.key });
      attempt.complete();
      setRegister(await getStayRegisterAction(bookingId));
      setMessage('Stay register saved.'); if (action === 'add_occupant') setName('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Registration could not be saved. Retry the same command.'); }
    finally { setBusy(false); }
  }
  async function amend(commercialMove = false) {
    const intent = { bookingId, departure, approvalId, waiverReason, ...(commercialMove ? { upgrade } : {}) }; setBusy(true); setMessage('');
    try {
      const attempt = await operationAttempt('in-house-stay', intent);
      const result = await amendReservationStayAction(bookingId, checkInDate, `${departure}T00:00:00.000Z`, attempt.key, approvalId || undefined, waiverReason || undefined, commercialMove ? upgrade : undefined);
      setSavedDeparture(String(result.checkOutDate).slice(0, 10));
      setMessage(`Departure saved. Repriced total: ${Number(result.totalAmount).toFixed(2)}. Review the folio for settlement or guest credit.`);
      attempt.complete();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Departure could not be saved.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded border p-2 text-sm"><summary className="cursor-pointer">Stay dates, occupants and manual keys</summary>
    <div className="mt-3 space-y-3">
      <label className="block">Departure date<Input aria-label="New departure date" type="date" value={departure} onChange={event => setDeparture(event.target.value)} /></label>
      <Input aria-label="Reason for reducing booked charges" placeholder="Reason for operator waiver of booked charges" value={waiverReason} onChange={event => setWaiverReason(event.target.value)} />
      <Input aria-label="Early departure write-off approval ID" placeholder="Independent approval ID for any reduction of booked charges" value={approvalId} onChange={event => setApprovalId(event.target.value)} />
      <Button type="button" size="sm" disabled={busy || departure === savedDeparture} onClick={() => amend()}>Reprice remaining stay</Button>
      <p>Closed business dates retain their original charges. An unused-night credit is an operator waiver, not an automatic guest refund entitlement. A reason is required; the property’s configured threshold determines independent approval. The server states the exact approval amount when required. Credits still require the refund workflow.</p>
      <details onToggle={event => { if (event.currentTarget.open && !upgradeOptions) getInHouseUpgradeOptions(checkInDate, checkOutDate).then(setUpgradeOptions).catch(error => setMessage(error.message)); }}><summary>Upgrade room type during this stay</summary><p>Keep the same departure date. Open and future service nights use the selected room and rate; closed nights keep their original price. Return issued keys before moving. The original cancellation, deposit and security terms remain.</p><div className="my-2 grid gap-2"><select aria-label="Upgrade room type" value={upgrade.roomTypeId} onChange={event => setUpgrade({ roomTypeId: event.target.value, ratePlanId: '', targetRoomId: '' })}><option value="">New room type</option>{upgradeOptions?.roomTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select><select aria-label="Upgrade rate plan" value={upgrade.ratePlanId} onChange={event => setUpgrade({ ...upgrade, ratePlanId: event.target.value })}><option value="">New nightly rate plan</option>{upgradeOptions?.roomTypes.find(type => type.id === upgrade.roomTypeId)?.ratePlans.map(rate => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</select><select aria-label="Upgrade physical room" value={upgrade.targetRoomId} onChange={event => setUpgrade({ ...upgrade, targetRoomId: event.target.value })}><option value="">Ready destination room</option>{upgradeOptions?.rooms.filter(room => room.roomType.id === upgrade.roomTypeId && ['vacant', 'inspected'].includes(room.status)).map(room => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}</select><Button disabled={busy || departure !== savedDeparture || !upgrade.targetRoomId || !upgrade.ratePlanId} onClick={() => amend(true)}>Reprice remaining nights and move guest</Button></div></details>
      <div className="flex gap-2"><Input aria-label="Occupant full name" placeholder="Occupant full name" value={name} onChange={event => setName(event.target.value)} /><Button type="button" size="sm" disabled={busy || !name.trim()} onClick={() => command('add_occupant', { name })}>Register</Button></div>
      {register.occupants.filter(item => !item.departedAt).map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.name}</span><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => command('remove_occupant', { occupantId: item.id })}>Record departure</Button></div>)}
      <select aria-label="Key holder" className="w-full rounded border p-2" value={holder} onChange={event => setHolder(event.target.value)}><option value="">Select registered occupant</option>{register.occupants.filter(item => !item.departedAt).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <div className="flex gap-2"><Input aria-label="Manual key reference" placeholder="Key tag/reference (never a door code)" value={keyReference} onChange={event => setKeyReference(event.target.value)} /><Button type="button" size="sm" disabled={busy || !holder || !keyReference.trim()} onClick={() => command('issue_key', { occupantId: holder, keyReference })}>Issue</Button></div>
      <Input aria-label="Lost key reason" placeholder="Reason if a key is lost; maintenance/rekey work will be recorded" value={lostKeyReason} onChange={event => setLostKeyReason(event.target.value)} />
      {register.keys.filter(key => !key.returnedAt && !key.retiredAt).map(key => <div key={`${key.reference}:${key.occupantId}`} className="flex items-center justify-between"><span>Outstanding key: {key.reference}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => command('return_key', { keyReference: key.reference })}>Record return</Button><Button type="button" size="sm" variant="outline" disabled={busy || !lostKeyReason.trim()} onClick={() => command('retire_key', { keyReference: key.reference, name: lostKeyReason })}>Lost / rekey required</Button></div>)}
      <details><summary>Registration and room history</summary>{register.keys.filter(key => key.retiredAt).map((key, index) => <p key={`retired:${index}`}>Key {key.reference}: retired {new Date(key.retiredAt!).toLocaleString()} · {key.retirementReason}; repair/inspection required.</p>)}{register.occupants.filter(item => item.departedAt).map(item => <p key={item.id}>{item.name}: departed {new Date(item.departedAt!).toLocaleString()}</p>)}{register.keys.filter(key => key.returnedAt).map((key, index) => <p key={`${key.reference}:${index}`}>Key {key.reference}: returned {new Date(key.returnedAt!).toLocaleString()}</p>)}{register.roomMoves?.map((move, index) => <p key={index}>{new Date(move.effectiveAt).toLocaleString()}: {move.fromRoomId || 'Unassigned'} → {move.toRoomId}</p>)}</details>
      <p>This register records staff handling of physical keys. It does not program or revoke door access.</p>
      <StayServiceDesk bookingId={bookingId} />
      <LoyaltyPanel bookingId={bookingId} />
      {message && <p role="status">{message}</p>}
    </div>
  </details>;
}
