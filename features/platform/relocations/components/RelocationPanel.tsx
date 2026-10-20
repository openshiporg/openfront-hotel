'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { cn } from '@/lib/utils';
import { ActionMessage, Field, FieldInput, FormGrid, FormNote, type Feedback } from '@/features/platform/components/Form';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { getRelocation, updateRelocation } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const empty = { propertyName: '', contact: '', confirmation: '', costDollars: '', guestAgreement: '', followUp: '', costEvidence: '' };
const STEPS = ['requested', 'arranged', 'transferred', 'completed'] as const;
const FIELDS = [
  ['propertyName', 'Receiving property and address'],
  ['contact', 'Receiving property contact'],
  ['confirmation', 'Receiving reservation confirmation'],
  ['guestAgreement', 'Guest agreement and transportation plan'],
  ['followUp', 'Guest arrival and follow-up evidence'],
  ['costEvidence', 'Cost settlement reference or no-cost explanation'],
] as const;

/** Evidence trail for walking a guest to another property. */
export default function RelocationPanel({ bookingId }: { bookingId: string }) {
  const [form, setForm] = useState(empty);
  const [state, setState] = useState<{ revision: number; status: string } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRelocation(bookingId).then(value => { if (value) { setState(value); setForm({ ...value, costDollars: (value.costMinor / 100).toFixed(2) }); } }).catch(error => setFeedback({ tone: 'error', text: error.message }));
  }, [bookingId]);

  async function save(status: string) {
    setBusy(true); setFeedback(null);
    try {
      const input = { ...form, bookingId, status, expectedRevision: state?.revision || 0, costMinor: Math.round(Number(form.costDollars || 0) * 100) };
      const attempt = await operationAttempt('relocation', input);
      const result = unwrapAction(await updateRelocation({ ...input, idempotencyKey: attempt.key }));
      attempt.complete(); setState(result); setFeedback({ tone: 'success', text: 'Relocation evidence saved.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Relocation evidence could not be saved.' });
    } finally { setBusy(false); }
  }

  const next = !state ? 'requested' : state.status === 'requested' ? 'arranged' : state.status === 'arranged' ? 'transferred' : state.status === 'transferred' ? 'completed' : null;
  const currentIndex = state ? STEPS.indexOf(state.status as typeof STEPS[number]) : -1;
  const locked = state?.status === 'completed';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Relocation progress">
          {STEPS.map((step, index) => {
            const done = index <= currentIndex;
            return (
              <li key={step} className="flex items-center gap-1.5">
                <span className={cn('grid size-5 place-items-center rounded-full border text-[10px] font-semibold tabular-nums', done ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground')}>
                  {done ? <Check className="size-3" aria-hidden="true" /> : index + 1}
                </span>
                <span className={cn('capitalize', done ? 'font-medium text-foreground' : 'text-muted-foreground')}>{step}</span>
                {index < STEPS.length - 1 ? <span className="mx-1 h-px w-4 bg-border" aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ol>
        {state ? <StatusPill kind="relocation" value={state.status} /> : <StatusPill tone="neutral" label="Not started" />}
      </div>

      <FormNote>Record a manually arranged receiving property and the guest&apos;s agreement. The local reservation keeps its room nights until normal cancellation or departure completes. External accommodation cost is staff evidence; settle it through the property&apos;s expense process.</FormNote>

      <FormGrid columns={2}>
        {FIELDS.map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`relocation-${key}-${bookingId}`}>
            <FieldInput id={`relocation-${key}-${bookingId}`} aria-label={label} value={form[key]} disabled={locked} onChange={event => setForm({ ...form, [key]: event.target.value })} />
          </Field>
        ))}
        <Field label="Relocation cost (USD)" htmlFor={`relocation-cost-${bookingId}`}>
          <FieldInput id={`relocation-cost-${bookingId}`} aria-label="Relocation cost USD" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={form.costDollars} disabled={locked} onChange={event => setForm({ ...form, costDollars: event.target.value })} />
        </Field>
      </FormGrid>

      <div className="flex flex-wrap items-center gap-3">
        {next ? <Button type="button" size="sm" disabled={busy} onClick={() => save(next)}>Record as {next}</Button> : <p className="text-sm text-muted-foreground">Relocation completed. Evidence is locked.</p>}
      </div>
      <ActionMessage feedback={feedback} />
    </div>
  );
}
