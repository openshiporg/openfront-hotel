'use client';
import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { ActionMessage, Field, FieldInput, FieldTextarea, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { Disclosure } from '@/features/platform/components/Surface';
import { humanize } from '@/features/platform/lib/format';
import { saveChannelDraftAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const LABELS = {
  name: 'Channel name',
  channelId: 'Existing channel ID',
  expectedVersion: 'Current mapping version',
  apiBaseUrl: 'HTTPS bridge base URL',
  accessToken: 'Access token',
  webhookSecret: 'Webhook signing secret',
} as const;

/** Encrypted, inactive channel draft for partner review. Never activates distribution. */
export function ChannelDraftForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', channelId: '', channelType: 'ota', expectedVersion: '0', apiBaseUrl: '', accessToken: '', webhookSecret: '', roomTypes: '{}' });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFeedback(null);
    try {
      const input = { ...form, expectedVersion: Number(form.expectedVersion), roomTypes: JSON.parse(form.roomTypes) };
      const attempt = await operationAttempt('channel-draft', input);
      const result = unwrapAction(await saveChannelDraftAction({ ...input, idempotencyKey: attempt.key })); attempt.complete();
      setForm(current => ({ ...current, channelId: result.channelId, expectedVersion: String(result.version), accessToken: '', webhookSecret: '' }));
      setFeedback({ tone: 'success', text: `Draft version ${result.version} stored. This does not activate distribution.` }); await onSaved();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Draft could not be saved.' });
    } finally { setBusy(false); }
  }

  const input = (key: keyof typeof LABELS, hint?: string, mono?: boolean) => (
    <Field label={LABELS[key]} htmlFor={`channel-${key}`} hint={hint} optional={key === 'channelId'}>
      <FieldInput id={`channel-${key}`} type={key === 'accessToken' || key === 'webhookSecret' ? 'password' : 'text'} autoComplete="off" className={mono ? 'font-mono' : undefined} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
    </Field>
  );

  return (
    <Disclosure title="Configure an encrypted channel draft" description="Prepare mappings and credentials for partner review. Drafts stay inactive." icon={KeyRound}>
      <form onSubmit={save} className="space-y-5">
        <FormNote>The HTTPS base URL admits only its own origin for future outbound sync. Each save replaces both secret fields; an empty secret leaves an incomplete, inactive draft. Activation requires a maintained adapter contract.</FormNote>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {input('name')}
          <Field label="Channel type" htmlFor="channel-type">
            <NativeSelect id="channel-type" value={form.channelType} onChange={event => setForm(current => ({ ...current, channelType: event.target.value }))}>
              {['ota', 'gds', 'direct', 'metasearch'].map(type => <option key={type} value={type}>{type === 'ota' || type === 'gds' ? type.toUpperCase() : humanize(type)}</option>)}
            </NativeSelect>
          </Field>
          {input('apiBaseUrl', undefined, true)}
          {input('channelId', 'Leave blank to create a new draft.', true)}
          {input('expectedVersion', 'Guards against overwriting a newer draft.')}
          <div className="hidden lg:block" aria-hidden="true" />
          {input('accessToken')}
          {input('webhookSecret')}
        </div>
        <Field label="Room type mappings" htmlFor="channel-mappings" hint="JSON object: external room code → local room type ID.">
          <FieldTextarea id="channel-mappings" spellCheck={false} className="font-mono text-xs" value={form.roomTypes} onChange={event => setForm(current => ({ ...current, roomTypes: event.target.value }))} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy}><Save aria-hidden="true" />Save inactive draft</Button>
        </div>
        <ActionMessage feedback={feedback} />
      </form>
    </Disclosure>
  );
}
