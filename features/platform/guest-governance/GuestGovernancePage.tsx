'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { applyGuestGovernance, loadGuestGovernance, searchGovernanceGuests } from './actions';

const commands = {
  consent: { title: 'Record or revoke consent', fields: [['purpose', 'Purpose (email_marketing for promotional email)'], ['version', 'Privacy notice version'], ['status', 'granted or revoked'], ['evidenceRef', 'Evidence reference']] },
  legal_hold: { title: 'Place or release legal hold', fields: [['holdId', 'Hold reference'], ['active', 'true to hold, false to release'], ['reason', 'Hold or release reason']] },
  retention_policy: { title: 'Record reviewed retention policy', fields: [['retentionDays', 'Retention days after last departure'], ['policyReference', 'Reviewed policy or jurisdiction reference']] },
  document_register: { title: 'Record identity verification', fields: [['documentType', 'passport, id_card, drivers_license, or other'], ['documentNumber', 'Document number'], ['issuingCountry', 'Issuing country'], ['expiryDate', 'Expiry date (optional YYYY-MM-DD)'], ['verified', 'true if verified, false otherwise'], ['evidenceRef', 'Verification evidence reference']] },
  subject_request: { title: 'Open verified subject request', fields: [['type', 'export or anonymize'], ['identityVerified', 'true after verifying the subject'], ['evidenceRef', 'Subject verification reference']] },
  subject_fulfilled: { title: 'Fulfill pending subject request', fields: [['requestId', 'Request ID from the request list']] },
  merge: { title: 'Merge verified duplicate profile', fields: [['targetGuestId', 'Target guest ID'], ['evidenceRef', 'Verified identity matching evidence']] },
  unmerge: { title: 'Restore original profile mapping', fields: [['mergeId', 'Merge ID from history'], ['evidenceRef', 'Reason for restoring the original profile']] },
} as const;

export default function GuestGovernancePage() {
  const [search, setSearch] = React.useState(''); const [guests, setGuests] = React.useState<any[]>([]); const [record, setRecord] = React.useState<any>(null);
  const [command, setCommand] = React.useState<keyof typeof commands>('consent'); const [values, setValues] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false); const attempt = React.useRef({ signature: '', key: '' });
  async function run(operation: () => Promise<void>) { setBusy(true); setMessage(''); try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation failed.'); } finally { setBusy(false); } }
  async function submit() {
    const payload: Record<string, unknown> = { ...values };
    for (const key of ['active', 'verified', 'identityVerified']) if (key in payload) {
      if (!['true', 'false'].includes(values[key])) throw new Error(`${key} must be true or false.`);
      payload[key] = values[key] === 'true';
    }
    if ('retentionDays' in payload) payload.retentionDays = Number(values.retentionDays);
    const signature = JSON.stringify({ guestId: record.guest.id, command, payload });
    if (attempt.current.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    setRecord(await applyGuestGovernance(record.guest.id, command, payload, attempt.current.key));
    attempt.current = { signature: '', key: '' }; setValues({}); setMessage('Recorded with an audit entry.');
  }
  async function download() {
    const request = [...record.governance.requests].reverse().find((item: any) => item.type === 'export' && item.status === 'completed');
    if (!request) throw new Error('Complete a verified export request before downloading.');
    const exported = await applyGuestGovernance(record.guest.id, 'subject_export', { requestId: request.requestId }, crypto.randomUUID());
    setRecord(exported);
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `guest-subject-export-${record.guest.id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">Guest privacy and registration</h1><p className="text-muted-foreground">Verify the person&apos;s identity before acting. Retention decisions must follow the property&apos;s reviewed policy. Financial and immutable audit evidence is preserved.</p></div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void run(async () => setGuests(await searchGovernanceGuests(search))); }}><div><Label htmlFor="privacy-search">Guest name or email</Label><Input id="privacy-search" value={search} onChange={event => setSearch(event.target.value)} minLength={2} required /></div><Button disabled={busy}>Find guest</Button></form>
    <div className="flex flex-wrap gap-2">{guests.map(guest => <Button key={guest.id} variant="outline" disabled={busy} onClick={() => void run(async () => setRecord(await loadGuestGovernance(guest.id)))}>{guest.firstName} {guest.lastName} · {guest.email}</Button>)}</div>
    <p role="status" aria-live="polite">{message}</p>
    {record && <>
      <Card><CardHeader><CardTitle>{record.guest.firstName} {record.guest.lastName}</CardTitle></CardHeader><CardContent><p>{record.guest.email} · Guest ID {record.guest.id}</p><p>{record.governance.holds.length} active holds · Retention: {record.governance.retentionDays === null ? 'not configured' : `${record.governance.retentionDays} days`}</p><Button className="mt-3" variant="outline" disabled={busy} onClick={() => void run(download)}>Download verified subject export</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Governed action</CardTitle></CardHeader><CardContent><form className="max-w-2xl space-y-4" onSubmit={event => { event.preventDefault(); void run(submit); }}>
        <div><Label htmlFor="privacy-command">Action</Label><select id="privacy-command" className="block w-full rounded-md border bg-background p-2" value={command} onChange={event => { setCommand(event.target.value as keyof typeof commands); setValues({}); }}>{Object.entries(commands).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select></div>
        {commands[command].fields.map(([key, label]) => <div key={key}><Label htmlFor={`privacy-${key}`}>{label}</Label><Input id={`privacy-${key}`} type={key === 'documentNumber' ? 'password' : 'text'} autoComplete="off" value={values[key] || ''} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} required={key !== 'expiryDate'} /></div>)}
        {command === 'subject_fulfilled' ? <p className="text-sm text-muted-foreground">Anonymization removes profile identifiers and document records after retention and hold checks; it does not delete the financial ledger or restricted audit history.</p> : null}
        <Button disabled={busy}>{busy ? 'Recording…' : 'Record action'}</Button>
      </form></CardContent></Card>
      <Card><CardHeader><CardTitle>Requests, consent and registration history</CardTitle></CardHeader><CardContent className="space-y-3">{record.history.map((event: any) => <div key={event.id} className="rounded-md border p-3"><p className="font-medium">{event.action.replaceAll('_', ' ')} · {String(event.occurredAt).slice(0, 10)}</p><dl className="break-words text-sm">{Object.entries(event.evidence || {}).filter(([key]) => key !== 'bookingIds').map(([key, value]) => <div key={key}><dt className="inline font-medium">{key}: </dt><dd className="inline">{String(value)}</dd></div>)}</dl></div>)}{!record.history.length && <p>No governed actions have been recorded.</p>}</CardContent></Card>
    </>}
  </main>;
}
