'use client';
import { useState } from 'react';
import { Unlink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { ActionMessage, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { Disclosure } from '@/features/platform/components/Surface';
import { formatMoneyMinor } from '@/features/platform/lib/format';
import { detachGroupBooking } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

/** Detach a guest-paid reservation from its group contract and reprice it independently. */
export default function GroupRecontract({ bookingId, arrival, departure, roomTypes, onSaved }: { bookingId: string; arrival: string; departure: string; roomTypes: Array<{ id: string; name: string; ratePlans: Array<{ id: string; name: string }> }>; onSaved: () => void }) {
  const [start, setStart] = useState(arrival.slice(0, 10));
  const [end, setEnd] = useState(departure.slice(0, 10));
  const [type, setType] = useState('');
  const [rate, setRate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save() {
    setBusy(true); setFeedback(null);
    try {
      const input = { bookingId, checkInDate: `${start}T00:00:00.000Z`, checkOutDate: `${end}T00:00:00.000Z`, roomTypeId: type, ratePlanId: rate, reason };
      const attempt = await operationAttempt('group-recontract', input);
      const result = unwrapAction(await detachGroupBooking({ ...input, idempotencyKey: attempt.key })); attempt.complete();
      setFeedback({ tone: 'success', text: `Independent reservation saved at ${formatMoneyMinor(result.totalAmountMinor)}.` }); onSaved();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Recontract failed; the original group commitment remains.' });
    } finally { setBusy(false); }
  }

  return (
    <Disclosure title="Leave group and reprice independently" icon={Unlink} className="bg-muted/10">
      <div className="space-y-4">
        <FormNote>The reservation leaves its negotiated contract and its allotment returns to the group. The new stay must fit remaining public inventory; current standard rate, deposit and security terms apply. Refund any amount exceeding the new total first.</FormNote>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Arrival" htmlFor={`recontract-in-${bookingId}`}><FieldInput id={`recontract-in-${bookingId}`} aria-label="Independent arrival" type="date" value={start} onChange={event => setStart(event.target.value)} /></Field>
          <Field label="Departure" htmlFor={`recontract-out-${bookingId}`}><FieldInput id={`recontract-out-${bookingId}`} aria-label="Independent departure" type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field>
          <Field label="Room type" htmlFor={`recontract-type-${bookingId}`}>
            <NativeSelect id={`recontract-type-${bookingId}`} aria-label="Independent room type" value={type} onChange={event => { setType(event.target.value); setRate(''); }}><option value="">Select</option>{roomTypes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect>
          </Field>
          <Field label="Rate plan" htmlFor={`recontract-rate-${bookingId}`}>
            <NativeSelect id={`recontract-rate-${bookingId}`} aria-label="Independent rate plan" value={rate} onChange={event => setRate(event.target.value)}><option value="">Select</option>{roomTypes.find(item => item.id === type)?.ratePlans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect>
          </Field>
        </div>
        <Field label="Guest agreement and reason" htmlFor={`recontract-reason-${bookingId}`}><FieldInput id={`recontract-reason-${bookingId}`} aria-label="Guest agreement and recontract reason" value={reason} onChange={event => setReason(event.target.value)} /></Field>
        <Button size="sm" disabled={busy || !start || !end || !type || !rate || !reason.trim()} onClick={save}>Return allotment and reprice stay</Button>
        <ActionMessage feedback={feedback} />
      </div>
    </Disclosure>
  );
}
