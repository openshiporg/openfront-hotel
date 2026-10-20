'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Award, ChevronDown, RefreshCw } from 'lucide-react';
import { getLoyaltyAccount } from '@/features/platform/loyalty/actions';
import { money } from '../lib/stay-context';
import { Skeleton } from './ui';

type StayLoyalty = { enabled: boolean; stayPoints: number; policy: { earnMinorPerPoint: number; redeemMinorPerPoint: number; minimumRedemptionPoints: number } | null; entries: Array<{ id: string; points: number; type: string; description: string; createdAt: string }> };

function entryDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : String(value || '').slice(0, 10);
}

/**
 * Loyalty points recorded against this reservation. A guest's full balance and
 * redemptions stay with the front desk, which can confirm who owns a guest profile.
 */
export function GuestLoyaltyPanel({ bookingId }: { bookingId: string }) {
  const id = useId();
  const [account, setAccount] = useState<StayLoyalty | null>(null);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try { setAccount(await getLoyaltyAccount(bookingId)); setLoadError(''); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load loyalty points.'); }
  }, [bookingId]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (loadError && !account) return <section className="sf-card sf-pad sf-extra" aria-labelledby={`${id}-title`}>
    <div className="sf-extra__head">
      <span className="sf-feature__icon"><Award aria-hidden="true" /></span>
      <div className="sf-extra__title"><h3 id={`${id}-title`} className="sf-h4">Loyalty points</h3><p className="sf-fine">{loadError}</p></div>
      <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" onClick={() => void refresh()}><RefreshCw aria-hidden="true" />Retry</button>
    </div>
  </section>;
  if (!account) return <div className="sf-card sf-pad sf-stack" role="status" aria-label="Loading loyalty points"><Skeleton height={20} width="40%" /><Skeleton height={14} width="70%" /></div>;
  // No programme and nothing recorded for this stay: nothing for the guest to act on.
  if (!account.enabled && !account.entries.length) return null;

  const policy = account.enabled ? account.policy : null;
  return <section className="sf-card sf-pad sf-extra" aria-labelledby={`${id}-title`}>
    <div className="sf-extra__head">
      <span className="sf-feature__icon"><Award aria-hidden="true" /></span>
      <div className="sf-extra__title">
        <h3 id={`${id}-title`} className="sf-h4">Loyalty points</h3>
        <p className="sf-fine">{policy ? 'Earned at checkout on settled room charges' : 'Earning and redemption are paused'}</p>
      </div>
      <p className="sf-extra__figure"><b className="sf-amount">{account.stayPoints.toLocaleString('en-US')}</b><span>{Math.abs(account.stayPoints) === 1 ? 'point' : 'points'} from this stay</span></p>
    </div>

    {policy ? <>
      <dl className="sf-extra__facts">
        <div><dt>Earn</dt><dd>1 point per {money(policy.earnMinorPerPoint, 'USD')} settled</dd></div>
        <div><dt>Redeem</dt><dd>{money(policy.redeemMinorPerPoint, 'USD')} folio credit per point</dd></div>
      </dl>
      <p className="sf-fine">Points are earned on net settled payments, capped at eligible room charges, when checkout is completed. Tax, fees, group master billing and redeemed value do not earn points. Successful refunds may reduce earned points.</p>
      <p className="sf-fine">To check your full balance or use points against your folio, ask the front desk during your stay.</p>
    </> : <p className="sf-muted sf-small">Loyalty earning and redemption are not enabled. Points already recorded are kept.</p>}

    {account.entries.length > 0 && <details className="sf-disclosure">
      <summary>Points from this stay <ChevronDown aria-hidden="true" /></summary>
      <ul className="sf-ledger">
        {account.entries.map(entry => <li key={entry.id}>
          <time dateTime={entry.createdAt}>{entryDate(entry.createdAt)}</time>
          <span>{entry.description}</span>
          <b data-sign={entry.points > 0 ? 'credit' : 'debit'}>{entry.points > 0 ? '+' : ''}{entry.points.toLocaleString('en-US')}</b>
        </li>)}
      </ul>
    </details>}
  </section>;
}
