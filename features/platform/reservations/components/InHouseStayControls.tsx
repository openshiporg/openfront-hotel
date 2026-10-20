'use client';

import React from 'react';
import { History, KeyRound, LogOut, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { ActionMessage, Field, FieldInput, FormGrid, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { Disclosure, SubSection } from '@/features/platform/components/Surface';
import { formatDateTime, formatMoney } from '@/features/platform/lib/format';
import { amendReservationStayAction, getStayRegisterAction, updateStayRegisterAction, getInHouseUpgradeOptions } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type Register = { roomMoves?: Array<{ fromRoomId: string | null; toRoomId: string; effectiveAt: string }>; occupants: Array<{ id: string; name: string; departedAt?: string }>; keys: Array<{ reference: string; occupantId: string; returnedAt?: string; retiredAt?: string; retirementReason?: string }> };

/**
 * Departure repricing, in-stay upgrades, the occupant register and manual key
 * custody for one checked-in reservation.
 */
export function InHouseStayControls({ bookingId, checkInDate, checkOutDate, onSaved }: { bookingId: string; checkInDate: string; checkOutDate: string; onSaved?: () => Promise<void> | void }) {
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
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    getStayRegisterAction(bookingId).then(setRegister).catch(error => setFeedback({ tone: 'error', text: error.message }));
  }, [bookingId]);
  // When the reservation is reloaded with a new departure, follow it and drop upgrade
  // choices that were priced for the old dates.
  React.useEffect(() => {
    setDeparture(checkOutDate.slice(0, 10));
    setSavedDeparture(checkOutDate.slice(0, 10));
    setUpgradeOptions(null);
  }, [checkInDate, checkOutDate]);

  async function command(action: string, input: { name?: string; occupantId?: string; keyReference?: string } = {}) {
    const intent = JSON.stringify({ bookingId, action, ...input }); setBusy(true); setFeedback(null);
    try {
      const attempt = await operationAttempt('stay-register', intent);
      unwrapAction(await updateStayRegisterAction({ bookingId, action, ...input, idempotencyKey: attempt.key }));
      attempt.complete();
      setRegister(await getStayRegisterAction(bookingId));
      setFeedback({ tone: 'success', text: 'Stay register saved.' });
      if (action === 'add_occupant') setName('');
      if (action === 'issue_key') setKeyReference('');
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Registration could not be saved. Retry the same command.' });
    } finally { setBusy(false); }
  }

  async function amend(commercialMove = false) {
    const intent = { bookingId, departure, approvalId, waiverReason, ...(commercialMove ? { upgrade } : {}) }; setBusy(true); setFeedback(null);
    try {
      const attempt = await operationAttempt('in-house-stay', intent);
      const result = unwrapAction(await amendReservationStayAction(bookingId, checkInDate, `${departure}T00:00:00.000Z`, attempt.key, approvalId || undefined, waiverReason || undefined, commercialMove ? upgrade : undefined));
      setSavedDeparture(String(result.checkOutDate).slice(0, 10));
      setDeparture(String(result.checkOutDate).slice(0, 10));
      // Upgrade choices depend on the stay dates and room type, which may just have changed.
      setUpgradeOptions(null);
      setFeedback({ tone: 'success', text: `Stay saved. New total: ${formatMoney(Number(result.totalAmount))}. Review the folio for settlement or guest credit.` });
      attempt.complete();
      await onSaved?.();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Departure could not be saved.' });
    } finally { setBusy(false); }
  }

  const loadUpgradeOptions = () => {
    if (upgradeOptions) return;
    getInHouseUpgradeOptions(checkInDate, checkOutDate).then(setUpgradeOptions).catch(error => setFeedback({ tone: 'error', text: error.message }));
  };

  const activeOccupants = register.occupants.filter(item => !item.departedAt);
  const outstandingKeys = register.keys.filter(key => !key.returnedAt && !key.retiredAt);
  const occupantName = (id: string) => register.occupants.find(item => item.id === id)?.name || 'Unknown occupant';
  const hasHistory = register.keys.some(key => key.retiredAt || key.returnedAt) || register.occupants.some(item => item.departedAt) || Boolean(register.roomMoves?.length);

  return (
    <div className="space-y-6">
      <ActionMessage feedback={feedback} />

      <SubSection title="Departure date" description="Shorten or extend the stay. Closed business dates keep their original charges.">
        <FormGrid columns={2}>
          <Field label="New departure" htmlFor={`departure-${bookingId}`}>
            <FieldInput id={`departure-${bookingId}`} aria-label="New departure date" type="date" value={departure} onChange={event => setDeparture(event.target.value)} />
          </Field>
          <Field label="Waiver reason" htmlFor={`waiver-${bookingId}`} hint="Required when reducing booked charges.">
            <FieldInput id={`waiver-${bookingId}`} aria-label="Reason for reducing booked charges" placeholder="Reason for operator waiver" value={waiverReason} onChange={event => setWaiverReason(event.target.value)} />
          </Field>
          <Field label="Approval ID" htmlFor={`waiver-approval-${bookingId}`} optional hint="Needed when the reduction meets the property threshold.">
            <FieldInput id={`waiver-approval-${bookingId}`} aria-label="Early departure write-off approval ID" placeholder="Independent approval ID" value={approvalId} onChange={event => setApprovalId(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button type="button" size="sm" disabled={busy || departure === savedDeparture} onClick={() => amend()}>Reprice remaining stay</Button>
          </div>
        </FormGrid>
        <FormNote>An unused-night credit is an operator waiver, not an automatic guest refund entitlement. The server states the exact approval amount when one is required, and credits still go through the refund workflow.</FormNote>
      </SubSection>

      <Disclosure title="Upgrade room type during this stay" description="Keep the same departure date and move the guest to a ready room of a new type." onOpen={loadUpgradeOptions}>
        <div className="space-y-3">
          <FormNote>Open and future service nights use the selected room and rate; closed nights keep their original price. Return issued keys before moving. The original cancellation, deposit and security terms remain.</FormNote>
          <FormGrid columns={3}>
            <Field label="Room type" htmlFor={`upgrade-type-${bookingId}`}>
              <NativeSelect id={`upgrade-type-${bookingId}`} aria-label="Upgrade room type" value={upgrade.roomTypeId} onChange={event => setUpgrade({ roomTypeId: event.target.value, ratePlanId: '', targetRoomId: '' })}>
                <option value="">{upgradeOptions ? 'Select room type' : 'Loading…'}</option>
                {upgradeOptions?.roomTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Nightly rate plan" htmlFor={`upgrade-rate-${bookingId}`}>
              <NativeSelect id={`upgrade-rate-${bookingId}`} aria-label="Upgrade rate plan" value={upgrade.ratePlanId} onChange={event => setUpgrade({ ...upgrade, ratePlanId: event.target.value })}>
                <option value="">Select rate plan</option>
                {upgradeOptions?.roomTypes.find(type => type.id === upgrade.roomTypeId)?.ratePlans.map(rate => <option key={rate.id} value={rate.id}>{rate.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Ready destination room" htmlFor={`upgrade-room-${bookingId}`}>
              <NativeSelect id={`upgrade-room-${bookingId}`} aria-label="Upgrade physical room" value={upgrade.targetRoomId} onChange={event => setUpgrade({ ...upgrade, targetRoomId: event.target.value })}>
                <option value="">Select room</option>
                {upgradeOptions?.rooms.filter(room => room.roomType.id === upgrade.roomTypeId && ['vacant', 'inspected'].includes(room.status)).map(room => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}
              </NativeSelect>
            </Field>
          </FormGrid>
          <Button type="button" size="sm" disabled={busy || departure !== savedDeparture || !upgrade.targetRoomId || !upgrade.ratePlanId} onClick={() => amend(true)}>Reprice remaining nights and move guest</Button>
          {departure !== savedDeparture ? <FormNote>Save or reset the departure change before upgrading.</FormNote> : null}
        </div>
      </Disclosure>

      <SubSection title="Registered occupants" description="Everyone staying in the room. Record departures as people leave.">
        <div className="flex gap-2">
          <FieldInput aria-label="Occupant full name" placeholder="Occupant full name" value={name} onChange={event => setName(event.target.value)} />
          <Button type="button" size="sm" className="h-9" disabled={busy || !name.trim()} onClick={() => command('add_occupant', { name })}><UserPlus aria-hidden="true" />Register</Button>
        </div>
        {activeOccupants.length ? (
          <ul className="divide-y rounded-md border">
            {activeOccupants.map(item => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate font-medium">{item.name}</span>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => command('remove_occupant', { occupantId: item.id })}><LogOut aria-hidden="true" />Record departure</Button>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">No occupants registered yet.</p>}
      </SubSection>

      <SubSection title="Manual keys" description="Staff custody of physical keys. This does not program or revoke door access.">
        <FormGrid columns={2}>
          <Field label="Key holder" htmlFor={`key-holder-${bookingId}`}>
            <NativeSelect id={`key-holder-${bookingId}`} aria-label="Key holder" value={holder} onChange={event => setHolder(event.target.value)}>
              <option value="">Select registered occupant</option>
              {activeOccupants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Key tag / reference" htmlFor={`key-ref-${bookingId}`} hint="Never record a door code.">
            <div className="flex gap-2">
              <FieldInput id={`key-ref-${bookingId}`} aria-label="Manual key reference" placeholder="Tag or reference" value={keyReference} onChange={event => setKeyReference(event.target.value)} />
              <Button type="button" size="sm" className="h-9" disabled={busy || !holder || !keyReference.trim()} onClick={() => command('issue_key', { occupantId: holder, keyReference })}><KeyRound aria-hidden="true" />Issue</Button>
            </div>
          </Field>
        </FormGrid>
        {outstandingKeys.length ? (
          <div className="space-y-2">
            <Field label="Lost key reason" htmlFor={`lost-key-${bookingId}`} hint="Required before marking a key lost; maintenance/rekey work will be recorded.">
              <FieldInput id={`lost-key-${bookingId}`} aria-label="Lost key reason" placeholder="Reason if a key is lost" value={lostKeyReason} onChange={event => setLostKeyReason(event.target.value)} />
            </Field>
            <ul className="divide-y rounded-md border">
              {outstandingKeys.map(key => (
                <li key={`${key.reference}:${key.occupantId}`} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0"><span className="font-mono text-xs">{key.reference}</span><span className="text-muted-foreground"> · {occupantName(key.occupantId)}</span></span>
                  <span className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => command('return_key', { keyReference: key.reference })}>Record return</Button>
                    <Button type="button" size="sm" variant="ghost" className="text-rose-700 hover:text-rose-800 dark:text-rose-400" disabled={busy || !lostKeyReason.trim()} onClick={() => command('retire_key', { keyReference: key.reference, name: lostKeyReason })}>Lost / rekey</Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="text-xs text-muted-foreground">No keys outstanding.</p>}
      </SubSection>

      <Disclosure title="Registration and room history" icon={History} description="Departed occupants, returned or retired keys and room moves.">
        {hasHistory ? (
          <ul className="space-y-2 text-sm">
            {register.keys.filter(key => key.retiredAt).map((key, index) => <li key={`retired:${index}`}><span className="font-mono text-xs">{key.reference}</span> retired {formatDateTime(key.retiredAt)} · {key.retirementReason}; repair/inspection required.</li>)}
            {register.occupants.filter(item => item.departedAt).map(item => <li key={item.id}>{item.name} departed {formatDateTime(item.departedAt)}</li>)}
            {register.keys.filter(key => key.returnedAt).map((key, index) => <li key={`${key.reference}:${index}`}><span className="font-mono text-xs">{key.reference}</span> returned {formatDateTime(key.returnedAt)}</li>)}
            {register.roomMoves?.map((move, index) => <li key={index}>{formatDateTime(move.effectiveAt)}: {move.fromRoomId || 'Unassigned'} → {move.toRoomId}</li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
      </Disclosure>
    </div>
  );
}
