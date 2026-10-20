'use client';
import * as React from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { graphqlClient } from '@/lib/graphql-client';
import { operationAttempt } from '@/lib/operationAttempt';
import { money } from '../../lib/stay-context';
import { stripeAppearance } from '../../lib/stripe-appearance';
import { useHotelSettings } from '../HotelSettingsProvider';
import { Notice } from '../ui';
const query = 'query($bookingId:ID!){hotelSecurityAuthorization(bookingId:$bookingId) bookingPaymentProviders{id code publicClientKey}}';
const mutation = 'mutation($input:JSON!){manageHotelSecurityAuthorization(input:$input)}';

function holdTone(status?: string) {
  if (status === 'requires_capture' || status === 'succeeded') return 'sf-badge--success';
  if (status === 'canceled') return '';
  if (status) return 'sf-badge--warn';
  return '';
}

function AuthorizeCard({ onDone }: { onDone: () => Promise<void> }) {
  const stripe = useStripe(); const elements = useElements(); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  return <form className="sf-stack" style={{ '--stack': '14px' } as React.CSSProperties} onSubmit={async event => { event.preventDefault(); if (!stripe || !elements) return; setBusy(true); setError(''); try { const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: 'if_required' }); if (result.error) throw new Error(result.error.message || 'Card authorization failed.'); await onDone(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authorization needs attention.'); } finally { setBusy(false); } }}>
    <PaymentElement />
    <button className="sf-btn sf-btn--block" disabled={!stripe || busy}><ShieldCheck aria-hidden="true" />{busy ? 'Authorizing…' : 'Authorize card hold'}</button>
    {error && <Notice tone="danger" role="alert">{error}</Notice>}
  </form>;
}

export function SecurityAuthorizationPanel({ bookingId }: { bookingId: string }) {
  const { accentPreset, logo } = useHotelSettings();
  const [data, setData] = React.useState<any>(null); const [secret, setSecret] = React.useState(''); const [publicKey, setPublicKey] = React.useState(''); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const load = React.useCallback(async () => { const result = await graphqlClient.request<any>(query, { bookingId }); setData(result.hotelSecurityAuthorization); setPublicKey(result.bookingPaymentProviders.find((item: any) => item.code === 'pp_stripe_stripe')?.publicClientKey || ''); setLoadFailed(false); }, [bookingId]);
  const retryLoad = React.useCallback(async () => { setBusy(true); setError(''); try { await load(); } catch { setLoadFailed(true); setError('The card hold could not be loaded.'); } finally { setBusy(false); } }, [load]);
  React.useEffect(() => { void retryLoad(); }, [retryLoad]);
  const stripe = React.useMemo(() => publicKey ? loadStripe(publicKey) : null, [publicKey]);
  async function run(action: string) { setBusy(true); setError(''); try { const payload = { bookingId, action }; const attempt = await operationAttempt('security-guest', payload); const result = await graphqlClient.request<any>(mutation, { input: { ...payload, idempotencyKey: attempt.key } }); setSecret(result.manageHotelSecurityAuthorization.clientSecret || ''); await load(); attempt.complete(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The card hold could not be reconciled.'); } finally { setBusy(false); } }
  if (data && !data.configuredAmountMinor && !data.authorization) return null;
  const status: string | undefined = data?.authorization?.status;
  const amountMinor = Number(data?.authorization?.amountMinor || data?.configuredAmountMinor || 0);
  const expires = data?.authorization?.expiresAt ? new Date(data.authorization.expiresAt) : null;
  // The hold is USD-only on the server; see manageHotelSecurityAuthorization.
  return <section className="sf-card sf-pad sf-extra" aria-labelledby={`security-${bookingId}`}>
    <div className="sf-extra__head">
      <span className="sf-feature__icon"><ShieldCheck aria-hidden="true" /></span>
      <div className="sf-extra__title">
        <h3 id={`security-${bookingId}`} className="sf-h4">Security card authorization</h3>
        <p className="sf-fine">A temporary hold, separate from your booking payment</p>
      </div>
      {data && <p className="sf-extra__figure"><b className="sf-amount">{money(amountMinor, 'USD')}</b><span className={`sf-badge ${holdTone(status)}`}>{status?.replaceAll('_', ' ') || 'Not authorized'}</span></p>}
    </div>
    <p className="sf-muted sf-small">The property can release the hold or apply an approved charge already recorded on your folio.</p>
    {expires && Number.isFinite(expires.getTime()) && <p className="sf-fine">Provider capture deadline: <time dateTime={data.authorization.expiresAt}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(expires)}</time></p>}
    {data && !data.canInitiate && !data.authorization && data.unavailableReason && <p className="sf-fine">{data.unavailableReason}</p>}
    <div className="sf-row">
      {data?.canInitiate && <button type="button" className="sf-btn sf-btn--sm" disabled={busy} onClick={() => void run('initiate')}>{busy ? 'Preparing…' : 'Prepare card authorization'}</button>}
      {data?.authorization && <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" disabled={busy} onClick={() => void run('sync')}><RefreshCw aria-hidden="true" className={busy ? 'sf-spinner' : undefined} />Refresh hold status</button>}
      {loadFailed && <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" disabled={busy} onClick={() => void retryLoad()}><RefreshCw aria-hidden="true" className={busy ? 'sf-spinner' : undefined} />Try again</button>}
    </div>
    {secret && stripe && <div className="sf-paybox"><Elements stripe={stripe} options={{ clientSecret: secret, appearance: stripeAppearance(accentPreset, logo) }}><AuthorizeCard onDone={() => run('sync')} /></Elements></div>}
    {error && <Notice tone="danger" role="alert">{error}</Notice>}
  </section>;
}
