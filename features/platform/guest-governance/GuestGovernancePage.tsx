'use client';

import * as React from 'react';
import { Download, FileClock, Gavel, Search, ShieldCheck, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ActionMessage, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { Callout, CopyId, DetailList, InitialsAvatar, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceEmpty } from '@/features/platform/components/WorkspaceControls';
import { formatStay, humanize } from '@/features/platform/lib/format';
import { applyGuestGovernance, loadGuestGovernance, searchGovernanceGuests } from './actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type FieldSpec = { key: string; label: string; hint?: string; options?: Array<[string, string]>; type?: 'text' | 'date' | 'number' | 'secret'; optional?: boolean };

const BOOL = (yes: string, no: string): Array<[string, string]> => [['true', yes], ['false', no]];

const commands: Record<string, { title: string; description: string; fields: FieldSpec[] }> = {
  consent: { title: 'Record or revoke consent', description: 'Marketing and processing consent with the notice version shown.', fields: [
    { key: 'purpose', label: 'Purpose', hint: 'Use email_marketing for promotional email.' },
    { key: 'version', label: 'Privacy notice version' },
    { key: 'status', label: 'Consent', options: [['granted', 'Granted'], ['revoked', 'Revoked']] },
    { key: 'evidenceRef', label: 'Evidence reference' },
  ] },
  legal_hold: { title: 'Place or release legal hold', description: 'Holds block anonymization and retention deletion.', fields: [
    { key: 'holdId', label: 'Hold reference' },
    { key: 'active', label: 'Hold state', options: BOOL('Place hold', 'Release hold') },
    { key: 'reason', label: 'Hold or release reason' },
  ] },
  retention_policy: { title: 'Record reviewed retention policy', description: 'Days after last departure before profile data may be removed.', fields: [
    { key: 'retentionDays', label: 'Retention days after last departure', type: 'number' },
    { key: 'policyReference', label: 'Reviewed policy or jurisdiction reference' },
  ] },
  document_register: { title: 'Record identity verification', description: 'Document number is stored protected and never shown back.', fields: [
    { key: 'documentType', label: 'Document type', options: [['passport', 'Passport'], ['id_card', 'ID card'], ['drivers_license', "Driver's license"], ['other', 'Other']] },
    { key: 'documentNumber', label: 'Document number', type: 'secret' },
    { key: 'issuingCountry', label: 'Issuing country' },
    { key: 'expiryDate', label: 'Expiry date', type: 'date', optional: true },
    { key: 'verified', label: 'Verification outcome', options: BOOL('Verified', 'Not verified') },
    { key: 'evidenceRef', label: 'Verification evidence reference' },
  ] },
  subject_request: { title: 'Open verified subject request', description: 'Export or anonymize at the guest’s verified request.', fields: [
    { key: 'type', label: 'Request type', options: [['export', 'Export data'], ['anonymize', 'Anonymize profile']] },
    { key: 'identityVerified', label: 'Subject identity', options: BOOL('Verified', 'Not verified') },
    { key: 'evidenceRef', label: 'Subject verification reference' },
  ] },
  subject_fulfilled: { title: 'Fulfill pending subject request', description: 'Completes an open export or anonymization request.', fields: [
    { key: 'requestId', label: 'Request' },
  ] },
  merge: { title: 'Merge verified duplicate profile', description: 'Folds this profile into the target; reversible from history.', fields: [
    { key: 'targetGuestId', label: 'Target guest ID' },
    { key: 'evidenceRef', label: 'Verified identity matching evidence' },
  ] },
  unmerge: { title: 'Restore original profile mapping', description: 'Reverses a recorded merge.', fields: [
    { key: 'mergeId', label: 'Merge ID from history' },
    { key: 'evidenceRef', label: 'Reason for restoring the original profile' },
  ] },
};

export default function GuestGovernancePage() {
  const [search, setSearch] = React.useState('');
  const [guests, setGuests] = React.useState<any[] | null>(null);
  const [record, setRecord] = React.useState<any>(null);
  const [command, setCommand] = React.useState<keyof typeof commands>('consent');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);
  const attempt = React.useRef({ signature: '', key: '' });

  async function run(operation: () => Promise<void>) {
    setBusy(true); setFeedback(null);
    try { await operation(); } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Operation failed.' }); } finally { setBusy(false); }
  }

  async function submit() {
    const payload: Record<string, unknown> = { ...values };
    for (const key of ['active', 'verified', 'identityVerified']) if (key in payload) {
      if (!['true', 'false'].includes(values[key])) throw new Error(`${key} must be true or false.`);
      payload[key] = values[key] === 'true';
    }
    if ('retentionDays' in payload) payload.retentionDays = Number(values.retentionDays);
    const signature = JSON.stringify({ guestId: record.guest.id, command, payload });
    if (attempt.current.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    setRecord(unwrapAction(await applyGuestGovernance(record.guest.id, command, payload, attempt.current.key)));
    attempt.current = { signature: '', key: '' }; setValues({});
    setFeedback({ tone: 'success', text: 'Recorded with an audit entry.' });
  }

  async function download() {
    const request = [...record.governance.requests].reverse().find((item: any) => item.type === 'export' && item.status === 'completed');
    if (!request) throw new Error('Complete a verified export request before downloading.');
    const exported = unwrapAction(await applyGuestGovernance(record.guest.id, 'subject_export', { requestId: request.requestId }, crypto.randomUUID()));
    setRecord(exported);
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `guest-subject-export-${record.guest.id}.json`; link.click(); URL.revokeObjectURL(url);
  }

  const pendingRequests = (record?.governance?.requests || []).filter((item: any) => item.status !== 'completed');
  const hasCompletedExport = (record?.governance?.requests || []).some((item: any) => item.type === 'export' && item.status === 'completed');

  const renderField = (spec: FieldSpec) => {
    const id = `privacy-${spec.key}`;
    const value = values[spec.key] || '';
    const onChange = (next: string) => setValues(current => ({ ...current, [spec.key]: next }));
    if (spec.key === 'requestId' && pendingRequests.length) {
      return (
        <Field key={spec.key} label={spec.label} htmlFor={id}>
          <NativeSelect id={id} value={value} onChange={event => onChange(event.target.value)} required>
            <option value="">Select pending request</option>
            {pendingRequests.map((item: any) => <option key={item.requestId} value={item.requestId}>{humanize(item.type)} · {humanize(item.status)} · {item.requestId}</option>)}
          </NativeSelect>
        </Field>
      );
    }
    if (spec.options) {
      return (
        <Field key={spec.key} label={spec.label} htmlFor={id} hint={spec.hint}>
          <NativeSelect id={id} value={value} onChange={event => onChange(event.target.value)} required={!spec.optional}>
            <option value="">Select…</option>
            {spec.options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
          </NativeSelect>
        </Field>
      );
    }
    return (
      <Field key={spec.key} label={spec.label} htmlFor={id} hint={spec.hint} optional={spec.optional}>
        <FieldInput id={id} type={spec.type === 'secret' ? 'password' : spec.type === 'date' ? 'date' : spec.type === 'number' ? 'number' : 'text'} min={spec.type === 'number' ? 0 : undefined} autoComplete="off" value={value} onChange={event => onChange(event.target.value)} required={!spec.optional} />
      </Field>
    );
  };

  return (
    <PlatformPage
      title="Guest Governance"
      description="Consent, legal holds, retention, identity verification and data requests, each with a full history."
    >
      <Callout tone="info" title="Verify the person before acting">
        Retention decisions must follow the property&apos;s reviewed policy. Financial records and restricted audit history are always preserved.
      </Callout>

      <Panel>
        <PanelHeader title="Find a guest" icon={Search} />
        <PanelBody className="space-y-4">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); void run(async () => setGuests(await searchGovernanceGuests(search))); }}>
            <FieldInput id="privacy-search" aria-label="Guest name or email" placeholder="Guest name or email (2+ characters)" value={search} onChange={event => setSearch(event.target.value)} minLength={2} required className="sm:max-w-md" />
            <Button size="sm" className="h-9" disabled={busy}><Search aria-hidden="true" />Find guest</Button>
          </form>
          {guests ? (
            guests.length ? (
              <ul className="divide-y rounded-lg border">
                {guests.map(guest => {
                  const name = `${guest.firstName || ''} ${guest.lastName || ''}`.trim();
                  const selected = record?.guest?.id === guest.id;
                  return (
                    <li key={guest.id} className="flex items-center gap-3 px-3 py-2.5">
                      <InitialsAvatar name={name || '?'} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name || 'Unnamed guest'}</p><p className="truncate text-xs text-muted-foreground">{guest.email}</p></div>
                      <Button size="sm" variant={selected ? 'secondary' : 'outline'} disabled={busy} onClick={() => void run(async () => { setRecord(await loadGuestGovernance(guest.id)); setValues({}); })}>{selected ? 'Open' : 'Review'}</Button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No guests matched “{search}”.</p>
          ) : null}
        </PanelBody>
      </Panel>

      <ActionMessage feedback={feedback} />

      {record ? (
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <Panel className="xl:sticky xl:top-4">
            <PanelHeader title="Subject" icon={UserRound} />
            <PanelBody className="space-y-4">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={`${record.guest.firstName || ''} ${record.guest.lastName || ''}`} className="size-10 text-xs" />
                <div className="min-w-0"><p className="truncate font-medium">{record.guest.firstName} {record.guest.lastName}</p><p className="truncate text-xs text-muted-foreground">{record.guest.email}</p></div>
              </div>
              <DetailList
                columns={1}
                items={[
                  { label: 'Guest ID', value: <CopyId value={record.guest.id} /> },
                  { label: 'Active legal holds', value: record.governance.holds.length ? <StatusPill tone="warning" label={`${record.governance.holds.length} active`} /> : 'None' },
                  { label: 'Retention', value: record.governance.retentionDays === null ? 'Not configured' : `${record.governance.retentionDays} days after last departure` },
                  { label: 'Subject requests', value: `${record.governance.requests?.length || 0} recorded · ${pendingRequests.length} open` },
                ]}
              />
              <Button size="sm" variant="outline" className="w-full" disabled={busy || !hasCompletedExport} onClick={() => void run(download)}><Download aria-hidden="true" />Download verified export</Button>
              {!hasCompletedExport ? <FormNote>Available after a verified export request is fulfilled.</FormNote> : null}
            </PanelBody>
          </Panel>

          <div className="min-w-0 space-y-6">
            <Panel>
              <PanelHeader title="Governed action" icon={Gavel} description={commands[command].description} />
              <PanelBody>
                <form className="space-y-5" onSubmit={event => { event.preventDefault(); void run(submit); }}>
                  <Field label="Action" htmlFor="privacy-command">
                    <NativeSelect id="privacy-command" value={command} onChange={event => { setCommand(event.target.value as keyof typeof commands); setValues({}); }}>
                      {Object.entries(commands).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}
                    </NativeSelect>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">{commands[command].fields.map(renderField)}</div>
                  {command === 'subject_fulfilled' ? <Callout tone="warning">Anonymization removes profile identifiers and document records after retention and hold checks. It does not delete the financial ledger or restricted audit history.</Callout> : null}
                  <Button size="sm" disabled={busy}><ShieldCheck aria-hidden="true" />{busy ? 'Recording…' : 'Record action'}</Button>
                </form>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="History" icon={FileClock} description="Requests, consent, holds, verification and merges for this profile." />
              {record.history.length ? (
                <ol className="divide-y">
                  {record.history.map((event: any) => (
                    <li key={event.id} className="space-y-2 px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Tag>{humanize(event.action)}</Tag>
                        <span className="text-xs text-muted-foreground">{formatStay(event.occurredAt)}</span>
                      </div>
                      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        {Object.entries(event.evidence || {}).filter(([key]) => key !== 'bookingIds').map(([key, value]) => (
                          <div key={key} className="flex min-w-0 gap-1.5"><dt className="shrink-0 text-muted-foreground">{humanize(key)}:</dt><dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{String(value)}</dd></div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ol>
              ) : <WorkspaceEmpty compact icon={FileClock} title="No governed actions yet" description="Recorded actions will appear here with their evidence." />}
            </Panel>
          </div>
        </div>
      ) : guests ? null : (
        <Panel><WorkspaceEmpty icon={ShieldCheck} title="Search for a guest to begin" description="Governed actions are always recorded against one verified profile." /></Panel>
      )}
    </PlatformPage>
  );
}
