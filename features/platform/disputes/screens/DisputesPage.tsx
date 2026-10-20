'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarClock, ExternalLink, NotebookPen, RefreshCw, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActionMessage, FieldInput, type Feedback } from '@/features/platform/components/Form';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { Callout, Panel, SectionLabel } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, formatMoneyMinor, humanize } from '@/features/platform/lib/format';
import { getDisputesWorkspace, recordDisputeEvidence } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

const DAY_MS = 86_400_000;
const CLOSED_DISPUTE_STATUSES = new Set(['won', 'lost', 'warning_closed', 'prevented']);
const NEEDS_RESPONSE_STATUSES = new Set(['needs_response', 'warning_needs_response']);

export function DisputesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ id: string; note: string; key: string } | null>(null);

  const reload = async () => { setCases((await getDisputesWorkspace()).disputes); setLoaded(true); };
  useEffect(() => { void reload().catch(() => { setLoaded(true); setFeedback({ tone: 'error', text: 'Disputes could not be loaded.' }); }); }, []);

  const save = async (id: string) => {
    if (busy) return;
    const note = notes[id] || '';
    setBusy(true); setFeedback(null);
    try {
      if (!attempt.current || attempt.current.id !== id || attempt.current.note !== note) attempt.current = { id, note, key: crypto.randomUUID() };
      unwrapAction(await recordDisputeEvidence({ id, note, idempotencyKey: attempt.current.key }));
      attempt.current = null; setNotes(current => ({ ...current, [id]: '' })); await reload();
      setFeedback({ tone: 'success', text: 'Evidence note recorded.' });
    } catch {
      setFeedback({ tone: 'error', text: 'Evidence note was not recorded. Retry the same attempt.' });
    } finally { setBusy(false); }
  };

  // Provider states: won, lost, warning_closed and prevented are closed; needs_response states await evidence.
  const openCases = cases.filter(dispute => !CLOSED_DISPUTE_STATUSES.has(dispute.status));
  const needsResponse = cases.filter(dispute => NEEDS_RESPONSE_STATUSES.has(dispute.status));
  const disputedMinor = openCases.reduce((sum, dispute) => sum + Number(dispute.amountMinor || 0), 0);
  const dueSoon = needsResponse.filter(dispute => dispute.evidenceDueBy && new Date(dispute.evidenceDueBy).getTime() - Date.now() < 3 * DAY_MS && new Date(dispute.evidenceDueBy).getTime() > Date.now());

  return (
    <PlatformPage
      title="Disputes"
      description="Stripe disputes on captured payments. Keep notes on your evidence here, and submit evidence in the Stripe dashboard."
      actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void reload().catch(() => setFeedback({ tone: 'error', text: 'Disputes could not be loaded.' }))}><RefreshCw aria-hidden="true" />Refresh</Button>}
    >
      <StatStrip
        loading={!loaded}
        items={[
          { label: 'Open cases', value: openCases.length, hint: `${cases.length} cases in total` },
          { label: 'Needs response', value: needsResponse.length, tone: needsResponse.length ? 'danger' : 'neutral', hint: 'Evidence not yet submitted' },
          { label: 'Due within 3 days', value: dueSoon.length, tone: dueSoon.length ? 'warning' : 'neutral', hint: 'Provider evidence deadline' },
          { label: 'Amount disputed', value: formatMoneyMinor(disputedMinor, openCases[0]?.currencyCode || 'USD'), hint: 'Across open cases' },
        ]}
      />
      <ActionMessage feedback={feedback} />

      {!loaded ? <WorkspaceLoading label="Loading disputes" rows={3} /> : cases.length === 0 ? (
        <Panel><WorkspaceEmpty icon={ShieldAlert} title="No dispute cases" description="No verified dispute notices have been received from the payment provider." /></Panel>
      ) : (
        <div className="space-y-4">
          {cases.map(dispute => {
            const due = dispute.evidenceDueBy ? new Date(dispute.evidenceDueBy) : null;
            const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / DAY_MS) : null;
            const urgent = daysLeft !== null && daysLeft <= 3;
            return (
              <Panel key={dispute.id}>
                <div className="flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold">{dispute.providerDisputeId}</p>
                      <StatusPill kind="dispute" value={dispute.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{humanize(dispute.reason)}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xl font-semibold tabular-nums">{new Intl.NumberFormat('en-US', { style: 'currency', currency: dispute.currencyCode }).format(dispute.amountMinor / 100)}</p>
                    <p className={cn('inline-flex items-center gap-1 text-xs', urgent ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-muted-foreground')}>
                      <CalendarClock className="size-3" aria-hidden="true" />
                      {due ? `Evidence due ${formatDateTime(dispute.evidenceDueBy)}${daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft}d left` : ''}` : 'No deadline supplied'}
                    </p>
                  </div>
                </div>
                <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-2">
                    <SectionLabel>Evidence history</SectionLabel>
                    {dispute.evidenceNotes.length ? (
                      <ol className="relative space-y-3 border-l pl-4">
                        {dispute.evidenceNotes.map((entry: any, index: number) => (
                          <li key={index} className="relative text-sm">
                            <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-foreground/40 ring-4 ring-card" aria-hidden="true" />
                            <p className="text-xs text-muted-foreground">{formatDateTime(entry.recordedAt)}</p>
                            <p className="[overflow-wrap:anywhere]">{entry.note}</p>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="text-sm text-muted-foreground">No evidence recorded yet.</p>}
                  </div>
                  <div className="min-w-0 space-y-3">
                    <SectionLabel>Record evidence</SectionLabel>
                    <div className="flex gap-2">
                      <FieldInput aria-label={`Evidence note for ${dispute.providerDisputeId}`} placeholder="Evidence note or provider submission reference" value={notes[dispute.id] || ''} onChange={e => setNotes(current => ({ ...current, [dispute.id]: e.target.value }))} />
                      <Button size="sm" className="h-9 shrink-0" disabled={busy || !(notes[dispute.id] || '').trim()} onClick={() => void save(dispute.id)}><NotebookPen aria-hidden="true" />Record</Button>
                    </div>
                    <a className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href={`https://dashboard.stripe.com/payments/${encodeURIComponent(dispute.providerPaymentId)}`}>Open captured payment in Stripe<ExternalLink className="size-3.5" aria-hidden="true" /></a>
                  </div>
                </div>
              </Panel>
            );
          })}
          <Callout tone="neutral">This workspace records evidence history only. Submitting evidence and accepting or contesting a dispute happen in the provider dashboard.</Callout>
        </div>
      )}
    </PlatformPage>
  );
}
