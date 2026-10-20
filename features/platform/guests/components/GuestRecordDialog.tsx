'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionMessage, Field, FieldInput, FieldTextarea, FormGrid, feedbackFromError, type Feedback } from '@/features/platform/components/Form';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';
import { updateGuestProfileAction } from '../actions';
import type { Guest } from './GuestProfile';

type GuestRecordField = 'firstName' | 'lastName' | 'email' | 'phone' | 'company' | 'address1' | 'address2' | 'city' | 'state' | 'postalCode' | 'country' | 'specialNotes';
const CONTACT_FIELDS: Array<{ field: GuestRecordField; label: string; type?: string; autoComplete?: string; optional?: boolean }> = [
  { field: 'firstName', label: 'First name', autoComplete: 'off' },
  { field: 'lastName', label: 'Last name', autoComplete: 'off' },
  { field: 'email', label: 'Email', type: 'email', autoComplete: 'off' },
  { field: 'phone', label: 'Phone', type: 'tel', autoComplete: 'off', optional: true },
  { field: 'company', label: 'Company', optional: true },
  { field: 'address1', label: 'Address', optional: true },
  { field: 'address2', label: 'Address line 2', optional: true },
  { field: 'city', label: 'City', optional: true },
  { field: 'state', label: 'State or region', optional: true },
  { field: 'postalCode', label: 'Postal code', optional: true },
  { field: 'country', label: 'Country', optional: true },
];

/** Edit a guest's contact details and service notes in place ("notes" mode shows only the notes). */
export function GuestRecordDialog({ guest, mode, onClose, onSaved }: { guest: Guest; mode: 'record' | 'notes' | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<Record<GuestRecordField, string>>(() => initial(guest));
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  React.useEffect(() => { if (mode) { setForm(initial(guest)); setFeedback(null); } }, [mode, guest]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setFeedback(null);
    try {
      const changed = Object.fromEntries((Object.keys(form) as GuestRecordField[])
        .filter(field => (mode === 'notes' ? field === 'specialNotes' : true) && form[field] !== String((guest as any)[field] || ''))
        .map(field => [field, form[field]]));
      if (Object.keys(changed).length) unwrapAction(await updateGuestProfileAction(guest.id, changed));
      onSaved();
    } catch (error) {
      setFeedback(feedbackFromError(error, 'The guest record was not saved.'));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={mode !== null} onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{mode === 'notes' ? 'Service notes' : 'Edit guest record'}</DialogTitle>
        <DialogDescription>{mode === 'notes' ? 'Preferences and service context the team should see before this guest arrives.' : 'Contact details and service notes. Identity documents and consent are managed in Guest governance.'}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5">
        {mode === 'record' && <FormGrid columns={2}>
          {CONTACT_FIELDS.map(item => <Field key={item.field} label={item.label} htmlFor={`guest-${item.field}`} optional={item.optional}>
            <FieldInput id={`guest-${item.field}`} type={item.type || 'text'} autoComplete={item.autoComplete} required={!item.optional} value={form[item.field]} onChange={event => setForm(previous => ({ ...previous, [item.field]: event.target.value }))} />
          </Field>)}
        </FormGrid>}
        <Field label="Service notes" htmlFor="guest-specialNotes" optional>
          <FieldTextarea id="guest-specialNotes" rows={mode === 'notes' ? 8 : 4} maxLength={4000} autoFocus={mode === 'notes'} value={form.specialNotes} onChange={event => setForm(previous => ({ ...previous, specialNotes: event.target.value }))} />
        </Field>
        <ActionMessage feedback={feedback} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function initial(guest: Guest): Record<GuestRecordField, string> {
  const value = (field: GuestRecordField) => String((guest as any)[field] || '');
  return { firstName: value('firstName'), lastName: value('lastName'), email: value('email'), phone: value('phone'), company: value('company'), address1: value('address1'), address2: value('address2'), city: value('city'), state: value('state'), postalCode: value('postalCode'), country: value('country'), specialNotes: value('specialNotes') };
}
