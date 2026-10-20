'use client';
import * as React from 'react';
import { History, Package, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ActionMessage, Field, FieldInput, FormNote, NativeSelect, type Feedback } from '@/features/platform/components/Form';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { DetailList, Disclosure } from '@/features/platform/components/Surface';
import { formatDateTime, formatMoneyMinor, humanize } from '@/features/platform/lib/format';
import { loadMaintenanceCommercial, saveMaintenanceCommercial } from './commercialActions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const fields: Record<string, Array<[string, string]>> = {
  plan: [['vendorName', 'Vendor or internal team'], ['vendorReference', 'Work-order or vendor reference'], ['dueAt', 'Repair deadline with time zone (2026-09-10T15:00:00-04:00)']],
  acknowledge: [],
  order_part: [['partId', 'Unique part line reference'], ['description', 'Part description'], ['quantity', 'Whole quantity'], ['unitCostMinor', 'Unit cost in minor units']],
  part_status: [['partId', 'Part line reference'], ['status', 'received, used, cancelled or returned']],
  labor: [['laborCostMinor', 'Total labor cost in minor units']],
};
const COMMAND_LABELS: Record<string, string> = { plan: 'Plan vendor & deadline', acknowledge: 'Acknowledge work order', order_part: 'Order a part', part_status: 'Update part status', labor: 'Record labor cost' };

/** Vendor, deadline, parts and labor facts for one maintenance request. Loads on expand. */
export default function MaintenanceCommercialPanel({ requestId }: { requestId: string }) {
  const [record, setRecord] = React.useState<any>(null);
  const [command, setCommand] = React.useState('plan');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const attempt = React.useRef({ signature: '', key: '' });

  async function run(fn: () => Promise<void>) {
    setBusy(true); setFeedback(null);
    try { await fn(); } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Work-order details failed.' }); } finally { setBusy(false); }
  }
  async function save() {
    const payload: any = { ...values, reason, expectedRevision: record.commercial.revision };
    for (const field of ['quantity', 'unitCostMinor', 'laborCostMinor']) if (field in payload) payload[field] = Number(payload[field]);
    const signature = JSON.stringify({ requestId, command, payload });
    if (attempt.current.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    setRecord(unwrapAction(await saveMaintenanceCommercial(requestId, command, payload, attempt.current.key)));
    attempt.current = { signature: '', key: '' }; setValues({}); setReason('');
    setFeedback({ tone: 'success', text: 'Work-order change recorded.' });
  }
  const load = () => { if (!record && !busy) void run(async () => setRecord(await loadMaintenanceCommercial(requestId))); };

  return (
    <Disclosure title="Work order" description="Vendor, repair deadline, parts and labor" icon={Truck} onOpen={load} badge={record?.overdue ? <StatusPill tone="danger" label="Overdue" /> : null} className="bg-muted/10">
      {!record ? (
        feedback ? <ActionMessage feedback={feedback} /> : <div className="h-20 animate-pulse rounded-md bg-muted/60" role="status" aria-label="Loading work order" />
      ) : (
        <div className="space-y-5">
          <DetailList
            columns={3}
            items={[
              { label: 'Vendor', value: record.commercial.vendorName || 'Not assigned' },
              { label: 'Reference', value: record.commercial.vendorReference || '—' },
              { label: 'Due', value: record.commercial.dueAt ? <span className={record.overdue ? 'text-rose-700 dark:text-rose-400' : undefined}>{formatDateTime(record.commercial.dueAt)}</span> : 'Not set' },
              { label: 'Acknowledged', value: record.commercial.acknowledgedAt ? formatDateTime(record.commercial.acknowledgedAt) : 'Not yet' },
              { label: 'Recorded labor + used parts', value: <span className="tabular-nums">{formatMoneyMinor(Number(record.actualCostMinor || 0))}</span> },
            ]}
          />
          {record.commercial.parts.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {record.commercial.parts.map((part: any) => (
                <li key={part.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2"><Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{part.description}</span><span className="font-mono text-xs text-muted-foreground">{part.id}</span></span>
                  <span className="flex items-center gap-2 text-xs"><span className="tabular-nums">{part.quantity} × {formatMoneyMinor(Number(part.unitCostMinor || 0))}</span><StatusPill tone={part.status === 'used' || part.status === 'received' ? 'success' : part.status === 'cancelled' || part.status === 'returned' ? 'neutral' : 'info'} label={humanize(part.status)} /></span>
                </li>
              ))}
            </ul>
          ) : null}
          <FormNote>Staff-recorded work-order facts. This does not send an order, pay a vendor, or release a room — the inspection workflow still controls availability.</FormNote>

          <form className="space-y-4 rounded-lg border p-4" onSubmit={event => { event.preventDefault(); void run(save); }}>
            <Field label="Change" htmlFor={`commercial-command-${requestId}`} className="max-w-sm">
              <NativeSelect id={`commercial-command-${requestId}`} value={command} onChange={event => { setCommand(event.target.value); setValues({}); }}>
                {Object.keys(fields).map(value => <option value={value} key={value}>{COMMAND_LABELS[value] || humanize(value)}</option>)}
              </NativeSelect>
            </Field>
            {fields[command].length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {fields[command].map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`${requestId}-${key}`}>
                    <FieldInput id={`${requestId}-${key}`} value={values[key] || ''} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} required />
                  </Field>
                ))}
              </div>
            ) : null}
            <Field label="Evidence reference or change reason" htmlFor={`${requestId}-evidence`}><FieldInput id={`${requestId}-evidence`} value={reason} onChange={event => setReason(event.target.value)} required /></Field>
            <Button size="sm" disabled={busy}>Record work-order change</Button>
          </form>
          <ActionMessage feedback={feedback} />

          {record.history.length ? (
            <Disclosure title="Change history" icon={History} badge={<span className="text-xs text-muted-foreground">{record.history.length}</span>}>
              <ol className="space-y-2 text-sm">
                {record.history.map((row: any, index: number) => <li key={index} className="flex flex-wrap gap-x-2"><span className="text-xs text-muted-foreground">{formatDateTime(row.occurredAt)}</span><span className="font-medium">{humanize(row.action)}</span><span className="text-muted-foreground">{row.reason}</span></li>)}
              </ol>
            </Disclosure>
          ) : null}
        </div>
      )}
    </Disclosure>
  );
}
