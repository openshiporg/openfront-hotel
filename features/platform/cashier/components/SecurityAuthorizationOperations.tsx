'use client';
import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, LockKeyhole, RefreshCw, Unlock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { graphqlClient } from '@/lib/graphql-client';
import { operationAttempt } from '@/lib/operationAttempt';
import { ActionMessage, Field, FieldInput, FormNote, type Feedback } from '@/features/platform/components/Form';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { CopyId, DetailList, Panel, PanelBody, PanelHeader } from '@/features/platform/components/Surface';
import { formatDateTime, formatMoneyMinor, humanize, previewMinor } from '@/features/platform/lib/format';

/** Card-hold (security deposit) authorization for a reservation: reconcile, release or capture. */
export function SecurityAuthorizationOperations({ bookingId }: { bookingId: string }) {
  const [data, setData] = React.useState<any>(null);
  const [amount, setAmount] = React.useState('');
  const [approvalId, setApprovalId] = React.useState('');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await graphqlClient.request<any>('query($bookingId:ID!){hotelSecurityAuthorization(bookingId:$bookingId)}', { bookingId });
    setData(result.hotelSecurityAuthorization);
  }, [bookingId]);
  React.useEffect(() => { void load().catch(() => setFeedback({ tone: 'error', text: 'Security authorization could not be loaded.' })); }, [load]);

  async function run(action: string) {
    setBusy(true); setFeedback(null);
    try {
      const payload = { action, bookingId, amountMinor: action === 'capture' ? Number(amount) : 0, approvalId };
      const attempt = await operationAttempt('security-operator', payload);
      await graphqlClient.request('mutation($input:JSON!){manageHotelSecurityAuthorization(input:$input)}', { input: { ...payload, idempotencyKey: attempt.key } });
      await load(); attempt.complete();
      setFeedback({ tone: 'success', text: 'Provider evidence reconciled. Authorization alone is not received money.' });
    } catch (cause) {
      setFeedback({ tone: 'error', text: cause instanceof Error ? cause.message : 'Security operation failed.' });
    } finally { setBusy(false); }
  }

  if (!data?.authorization) return feedback?.tone === 'error' ? <ActionMessage feedback={feedback} /> : null;
  const authorization = data.authorization;
  const amountPreview = previewMinor(amount);

  return (
    <Panel>
      <PanelHeader
        title="Security authorization"
        description="Card hold placed for incidentals. Capture requires an independent approval for the exact amount."
        icon={LockKeyhole}
        actions={<StatusPill tone={authorization.status === 'authorized' ? 'info' : authorization.status === 'captured' ? 'success' : 'neutral'} label={humanize(authorization.status)} />}
      />
      <PanelBody className="space-y-5">
        <DetailList
          columns={3}
          items={[
            { label: 'Held amount', value: <span className="tabular-nums">{formatMoneyMinor(authorization.amountMinor)}</span> },
            { label: 'Provider deadline', value: authorization.expiresAt ? formatDateTime(authorization.expiresAt) : '—' },
            { label: 'Approval target', value: <CopyId value={authorization.id} /> },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Capture amount (minor units)" htmlFor={`capture-${bookingId}`} hint={amountPreview ? `= ${amountPreview}` : 'Cannot exceed actual posted folio charges.'}>
            <FieldInput id={`capture-${bookingId}`} aria-label="Security capture amount in minor units" type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="e.g. 5000" />
          </Field>
          <Field label="Capture approval ID" htmlFor={`capture-approval-${bookingId}`} hint={<>Request one in <Link href="/dashboard/platform/approvals" target="_blank" className="underline underline-offset-2">Approvals <ExternalLink className="inline size-3" aria-hidden="true" /></Link></>}>
            <FieldInput id={`capture-approval-${bookingId}`} aria-label="Security capture approval ID" value={approvalId} onChange={event => setApprovalId(event.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('sync')}><RefreshCw aria-hidden="true" />Reconcile</Button>
          <Button size="sm" variant="outline" disabled={busy || !data.operator} onClick={() => void run('release')}><Unlock aria-hidden="true" />Release hold</Button>
          <Button size="sm" disabled={busy || !data.operator || !approvalId || !amount} onClick={() => void run('capture')}>Capture approved charges</Button>
        </div>
        {!data.operator ? <FormNote>Release and capture require payment operator permission.</FormNote> : null}
        <ActionMessage feedback={feedback} />
      </PanelBody>
    </Panel>
  );
}
