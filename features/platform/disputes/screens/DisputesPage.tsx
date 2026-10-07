'use client';
import { useEffect, useRef, useState } from 'react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDisputesWorkspace, recordDisputeEvidence } from '../actions';
export function DisputesPage() {
  const [cases, setCases] = useState<any[]>([]); const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const attempt = useRef<{ id: string; note: string; key: string } | null>(null);
  const reload = async () => setCases((await getDisputesWorkspace()).disputes);
  useEffect(() => { void reload().catch(() => setError('Disputes could not be loaded.')); }, []);
  const save = async (id: string) => { if (busy) return; setBusy(true); setError(''); try {
    if (!attempt.current || attempt.current.id !== id || attempt.current.note !== note) attempt.current = { id, note, key: crypto.randomUUID() };
    await recordDisputeEvidence({ id, note, idempotencyKey: attempt.current.key }); attempt.current = null; setNote(''); await reload();
  } catch { setError('Evidence note was not recorded. Retry the same attempt.'); } finally { setBusy(false); } };
  return <PageContainer header={<><h1 className="text-2xl font-semibold">Payment disputes</h1><p>Verified Stripe events link cases to captured payments. Record the evidence history here; submit evidence in the provider dashboard.</p></>}>
    {error && <p role="alert">{error}</p>}<Label htmlFor="dispute-evidence">Evidence note / provider submission reference</Label><Input id="dispute-evidence" value={note} onChange={e => setNote(e.target.value)} />
    {cases.map(dispute => <article className="my-4 rounded border p-4" key={dispute.id}><h2 className="font-semibold">{dispute.providerDisputeId} — {dispute.status}</h2><p>{new Intl.NumberFormat('en-US', { style: 'currency', currency: dispute.currencyCode }).format(dispute.amountMinor / 100)} — {dispute.reason}</p><p>Evidence deadline: {dispute.evidenceDueBy || 'Not supplied'}</p>
      <a className="underline" target="_blank" rel="noreferrer" href={`https://dashboard.stripe.com/payments/${encodeURIComponent(dispute.providerPaymentId)}`}>Open captured payment in Stripe</a>
      <ul>{dispute.evidenceNotes.map((entry: any, index: number) => <li key={index}>{entry.recordedAt}: {entry.note}</li>)}</ul><Button disabled={busy || !note.trim()} onClick={() => void save(dispute.id)}>Record evidence note</Button>
    </article>)}{!cases.length && <p>No verified dispute cases have been received.</p>}
  </PageContainer>;
}
