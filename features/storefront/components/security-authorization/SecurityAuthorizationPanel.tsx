'use client';
import * as React from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { graphqlClient } from '@/lib/graphql-client';
import { operationAttempt } from '@/lib/operationAttempt';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
const query = 'query($bookingId:ID!){hotelSecurityAuthorization(bookingId:$bookingId) bookingPaymentProviders{id code publicClientKey}}';
const mutation = 'mutation($input:JSON!){manageHotelSecurityAuthorization(input:$input)}';
function AuthorizeCard({ onDone }: { onDone: () => Promise<void> }) {
  const stripe = useStripe(); const elements = useElements(); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  return <form className="space-y-3" onSubmit={async event => { event.preventDefault(); if (!stripe || !elements) return; setBusy(true); setError(''); try { const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: 'if_required' }); if (result.error) throw new Error(result.error.message || 'Card authorization failed.'); await onDone(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authorization needs attention.'); } finally { setBusy(false); } }}><PaymentElement /><Button disabled={!stripe || busy}>{busy ? 'Authorizing…' : 'Authorize card hold'}</Button>{error && <p role="alert">{error}</p>}</form>;
}
export function SecurityAuthorizationPanel({ bookingId }: { bookingId: string }) {
  const [data, setData] = React.useState<any>(null); const [secret, setSecret] = React.useState(''); const [publicKey, setPublicKey] = React.useState(''); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => { const result = await graphqlClient.request<any>(query, { bookingId }); setData(result.hotelSecurityAuthorization); setPublicKey(result.bookingPaymentProviders.find((item: any) => item.code === 'pp_stripe_stripe')?.publicClientKey || ''); }, [bookingId]);
  React.useEffect(() => { void load().catch(() => setError('Security authorization could not be loaded.')); }, [load]);
  const stripe = React.useMemo(() => publicKey ? loadStripe(publicKey) : null, [publicKey]);
  async function run(action: string) { setBusy(true); setError(''); try { const payload = { bookingId, action }; const attempt = await operationAttempt('security-guest', payload); const result = await graphqlClient.request<any>(mutation, { input: { ...payload, idempotencyKey: attempt.key } }); setSecret(result.manageHotelSecurityAuthorization.clientSecret || ''); await load(); attempt.complete(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The card hold could not be reconciled.'); } finally { setBusy(false); } }
  if (data && !data.configuredAmountMinor && !data.authorization) return null;
  return <Card><CardHeader><CardTitle>Security card authorization</CardTitle></CardHeader><CardContent className="space-y-3"><p>A temporary card hold is separate from your booking payment. The property can release it or apply an approved charge already recorded on your folio.</p>{data && <p>Amount ${((data.authorization?.amountMinor || data.configuredAmountMinor) / 100).toFixed(2)} · {data.authorization?.status?.replaceAll('_', ' ') || 'Not authorized'}</p>}{data?.authorization?.expiresAt && <p>Provider capture deadline: {new Date(data.authorization.expiresAt).toLocaleString()}</p>}<div className="flex gap-2"><Button disabled={busy || !data?.available} onClick={() => void run('initiate')}>Prepare card authorization</Button>{data?.authorization && <Button variant="outline" disabled={busy} onClick={() => void run('sync')}>Refresh hold status</Button>}</div>{secret && stripe && <Elements stripe={stripe} options={{ clientSecret: secret }}><AuthorizeCard onDone={() => run('sync')} /></Elements>}{error && <p role="alert" className="text-destructive">{error}</p>}</CardContent></Card>;
}
