'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { operationAttempt } from '@/lib/operationAttempt';
import { saveChannelDraftAction } from '../actions';

export function ChannelDraftForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', channelId: '', channelType: 'ota', expectedVersion: '0', apiBaseUrl: '', accessToken: '', webhookSecret: '', roomTypes: '{}' });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const input = { ...form, expectedVersion: Number(form.expectedVersion), roomTypes: JSON.parse(form.roomTypes) };
      const attempt = await operationAttempt('channel-draft', input);
      const result = await saveChannelDraftAction({ ...input, idempotencyKey: attempt.key }); attempt.complete();
      setForm(current => ({ ...current, channelId: result.channelId, expectedVersion: String(result.version), accessToken: '', webhookSecret: '' }));
      setMessage(`Draft version ${result.version} stored. This does not activate distribution.`); await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Draft could not be saved.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Configure an encrypted channel draft</summary><p className="my-3 text-sm text-muted-foreground">Prepare mappings and replace credentials for partner review. The HTTPS base URL admits only its own origin for future outbound sync. Each save replaces both secret fields; an empty secret leaves an incomplete, inactive draft. This does not activate distribution; activation requires a maintained adapter contract.</p><form onSubmit={save} className="grid gap-4 md:grid-cols-2">{(['name', 'channelId', 'expectedVersion', 'apiBaseUrl', 'accessToken', 'webhookSecret'] as const).map(key => <div key={key}><Label htmlFor={`channel-${key}`}>{({ name: 'Channel name', channelId: 'Existing channel ID (blank creates)', expectedVersion: 'Current mapping version', apiBaseUrl: 'HTTPS bridge base URL', accessToken: 'Access token', webhookSecret: 'Webhook signing secret' })[key]}</Label><Input id={`channel-${key}`} type={key === 'accessToken' || key === 'webhookSecret' ? 'password' : 'text'} autoComplete="off" value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></div>)}<div><Label htmlFor="channel-type">Channel type</Label><select id="channel-type" value={form.channelType} onChange={event => setForm(current => ({ ...current, channelType: event.target.value }))}>{['ota','gds','direct','metasearch'].map(type => <option key={type}>{type}</option>)}</select></div><div className="md:col-span-2"><Label htmlFor="channel-mappings">Room type mappings (external ID to local room type ID, JSON)</Label><Textarea id="channel-mappings" value={form.roomTypes} onChange={event => setForm(current => ({ ...current, roomTypes: event.target.value }))} /></div><Button disabled={busy}>Save inactive draft</Button><p role="status">{message}</p></form></details>;
}
