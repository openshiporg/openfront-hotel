'use client';
import { useCallback, useEffect, useState } from 'react';
import { Award } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operationAttempt } from '@/lib/operationAttempt';
import { cn } from '@/lib/utils';
import { ActionMessage, Field, FieldInput, FormNote, type Feedback } from '@/features/platform/components/Form';
import { Callout } from '@/features/platform/components/Surface';
import { formatMoneyMinor, formatStay } from '@/features/platform/lib/format';
import { getLoyaltyAccount, redeemLoyaltyPoints } from '../actions';

type Account = { enabled: boolean; balance: number; canRedeem: boolean; policy: { earnMinorPerPoint: number; redeemMinorPerPoint: number; minimumRedemptionPoints: number } | null; entries: Array<{ id: string; points: number; type: string; description: string; createdAt: string }> };

/**
 * Operator view of a stay's loyalty ledger. The guest-facing storefront keeps
 * its own LoyaltyPanel; both use the same account and redemption commands.
 */
export function LoyaltyStayPanel({ bookingId }: { bookingId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [points, setPoints] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setAccount(await getLoyaltyAccount(bookingId)); }
    catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to load loyalty account.' }); }
  }, [bookingId]);
  useEffect(() => { refresh(); }, [refresh]);

  async function redeem() {
    setBusy(true); setFeedback(null);
    try {
      const request = { bookingId, points: Number(points) };
      const attempt = await operationAttempt('loyalty-redemption', request);
      const result = await redeemLoyaltyPoints(bookingId, request.points, attempt.key);
      attempt.complete(); setPoints(''); await refresh();
      setFeedback({ tone: 'success', text: `${result.pointsRedeemed} points applied as ${formatMoneyMinor(result.amountMinor)} folio credit.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Redemption was not saved; retry the same request.' });
    } finally { setBusy(false); }
  }

  if (!account) {
    return feedback ? <ActionMessage feedback={feedback} /> : <div className="h-24 animate-pulse rounded-lg bg-muted/60" role="status" aria-label="Loading loyalty account" />;
  }

  const creditPreview = account.policy && Number(points) > 0 ? formatMoneyMinor(Number(points) * account.policy.redeemMinorPerPoint) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3">
        <span className="grid size-10 place-items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"><Award className="size-5" aria-hidden="true" /></span>
        <div>
          <p className="text-2xl font-semibold tabular-nums leading-7">{account.balance.toLocaleString('en-US')}</p>
          <p className="text-xs text-muted-foreground">available points</p>
        </div>
      </div>

      {account.enabled && account.policy ? (
        <FormNote>
          Earn one point per {formatMoneyMinor(account.policy.earnMinorPerPoint)} of net settled payments, capped at eligible room charges, at completed checkout. Redeem at {formatMoneyMinor(account.policy.redeemMinorPerPoint)} per point against an in-house, guest-paid folio. Tax, fees, group master billing and redeemed value do not earn points. Successful refunds may reduce earned points, including a negative balance if points were already used.
        </FormNote>
      ) : <Callout tone="neutral">Loyalty earning and redemption are not enabled. Existing ledger history is retained.</Callout>}

      {account.canRedeem ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Points to redeem" htmlFor={`loyalty-points-${bookingId}`} className="sm:w-48">
              <FieldInput id={`loyalty-points-${bookingId}`} type="number" min={account.policy?.minimumRedemptionPoints || 1} step="1" value={points} onChange={event => setPoints(event.target.value)} />
            </Field>
            <Button type="button" size="sm" className="h-9" disabled={busy || !points || Number(points) > account.balance} onClick={redeem}>Apply to current folio</Button>
            {creditPreview ? <span className="pb-2 text-xs text-muted-foreground">≈ {creditPreview} credit</span> : null}
          </div>
          <FormNote>Minimum {account.policy?.minimumRedemptionPoints} points; credit cannot exceed posted charges due. Redemptions are final folio credits.</FormNote>
        </div>
      ) : null}

      <ActionMessage feedback={feedback} />

      <div className="space-y-2">
        <p className="text-sm font-semibold">Recent points history</p>
        {account.entries.length ? (
          <ul className="divide-y rounded-lg border text-sm">
            {account.entries.map(entry => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{entry.description}</span>
                  <span className="text-xs text-muted-foreground">{entry.createdAt ? formatStay(entry.createdAt) : '—'}</span>
                </span>
                <span className={cn('shrink-0 font-medium tabular-nums', entry.points > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>{entry.points > 0 ? '+' : ''}{entry.points}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground">No points activity yet.</p>}
      </div>
    </div>
  );
}

export default LoyaltyStayPanel;
