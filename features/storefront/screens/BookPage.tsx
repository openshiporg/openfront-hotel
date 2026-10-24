'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { ArrowLeft, ArrowRight, Check, CreditCard, ExternalLink, Lock, Moon, RefreshCw, TriangleAlert, Users, Wallet } from 'lucide-react';
import { graphqlClient } from '@/lib/graphql-client';
import { CREATE_STOREFRONT_BOOKING, GET_BOOKING_PAYMENT_PROVIDERS, GET_ROOM_TYPE, GET_STOREFRONT_QUOTE, GET_GUEST_BOOKING, INITIATE_BOOKING_PAYMENT_SESSION } from '@/lib/queries';
import type { Booking, RoomType } from '@/lib/types';
import { selectDisplayedStayPrice, type StayQuote } from '../lib/quote';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import { operationAttempt } from '@/lib/operationAttempt';
import { formatStayDate } from '@/lib/hotelCalendarDate';
import { StripeCheckoutForm } from '@/components/booking/StripeCheckoutForm';
import { useHotelSettings } from '../components/HotelSettingsProvider';
import { useGuestAccount } from '../components/GuestAccountProvider';
import { StayPrice } from '../components/StayPrice';
import { Notice, Skeleton, StatePanel } from '../components/ui';
import { money, reservationPresentation } from '../lib/stay-context';
import { ratePlanStayMessage, roomSearchValidationMessage, selectInitialPublicRatePlan, safeQuoteFailureMessage } from '../lib/qa-workflows';
import { propertyToday } from '../lib/calendar';
import { stripeAppearance } from '../lib/stripe-appearance';
import { settleBookingPayment } from '../lib/payment-settlement';
interface Provider { id: string; name: string; code: string; displayName?: string | null; publicClientKey?: string | null }
interface Session { id: string; amount: number; clientSecret?: string | null; approveLink?: string | null }

function BookContent() {
  const params = useSearchParams(); const router = useRouter(); const identity = useHotelSettings(); const { account } = useGuestAccount(); const originalQuery = params?.toString() || '';
  const [resumeId] = useState(() => params?.get('bookingId') || '');
  const roomTypeId = params?.get('roomTypeId') || ''; const checkIn = params?.get('checkIn') || ''; const checkOut = params?.get('checkOut') || ''; const adults = params?.get('adults') || '2'; const children = params?.get('children') || '0'; const requestedRate = params?.get('ratePlanId') || ''; const promoCode = params?.get('promoCode') || '';
  const [room, setRoom] = useState<RoomType | null>(null); const [quote, setQuote] = useState<StayQuote | null>(null); const [bookedTerms, setBookedTerms] = useState<Booking['bookedStayTerms']>(null); const [held, setHeld] = useState<Booking | null>(null); const [bookingId, setBookingId] = useState(resumeId); const [reference, setReference] = useState(''); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [selectionError, setSelectionError] = useState(false); const [revision, setRevision] = useState(0);
  const [providers, setProviders] = useState<Provider[]>([]); const [providerCode, setProviderCode] = useState(''); const [providerError, setProviderError] = useState(''); const [session, setSession] = useState<Session | null>(null); const [paymentError, setPaymentError] = useState(''); const [busy, setBusy] = useState(false); const [confirming, setConfirming] = useState(false); const actionLock = useRef(false); const confirmationLock = useRef(false); const [accepted, setAccepted] = useState(false); const [verification, setVerification] = useState<'idle' | 'checking' | 'unknown'>('idle');
  // Signed-in guests book with their account details filled in; they can still edit them.
  const [form, setForm] = useState(() => ({ guestName: resumeId ? '' : account?.name || '', guestEmail: resumeId ? '' : account?.email || '', guestPhone: resumeId ? '' : account?.phone || '', specialRequests: '' }));
  const selectedProvider = providers.find(provider => provider.code === providerCode); const stripe = useMemo(() => session?.clientSecret && selectedProvider?.code === 'pp_stripe_stripe' && selectedProvider.publicClientKey ? loadStripe(selectedProvider.publicClientKey) : null, [session?.clientSecret, selectedProvider]);
  useEffect(() => {
    let active = true; setLoading(true); setLoadError(''); setSelectionError(false);
    async function load() {
      try {
        if (resumeId) { const data = await graphqlClient.request<{ booking: Booking | null }>(GET_GUEST_BOOKING, { bookingId: resumeId }); if (!data.booking) throw new Error('access'); if (!active) return; setHeld(data.booking); setBookedTerms(data.booking.bookedStayTerms || null); setReference(data.booking.confirmationNumber); setRoom(data.booking.roomAssignments?.[0]?.roomType || null); setForm({ guestName: data.booking.guestName, guestEmail: data.booking.guestEmail, guestPhone: data.booking.guestPhone || '', specialRequests: data.booking.specialRequests || '' }); }
        else {
          const invalid = roomSearchValidationMessage(checkIn, checkOut, adults, children); if (invalid || !roomTypeId || !checkIn || !checkOut) { if (active) { setLoadError(invalid || 'Choose a room and stay dates before reserving.'); setSelectionError(true); } return; }
          const data = await graphqlClient.request<{ roomType: RoomType }>(GET_ROOM_TYPE, { id: roomTypeId }); const plan = selectInitialPublicRatePlan(data.roomType?.ratePlans, requestedRate); if (!plan) throw new Error('rate'); const ruleMessage = ratePlanStayMessage(plan, checkIn, checkOut, propertyToday(identity.timeZone)); if (ruleMessage) { if (active) { setLoadError(ruleMessage); setSelectionError(true); } return; } const priced = await graphqlClient.request<{ storefrontQuote: StayQuote }>(GET_STOREFRONT_QUOTE, { roomTypeId, ratePlanId: plan.id, checkInDate: `${checkIn}T00:00:00Z`, checkOutDate: `${checkOut}T00:00:00Z`, numberOfAdults: Number(adults), numberOfChildren: Number(children), promoCode: promoCode.trim() || null }); if (active) { setRoom(data.roomType); setQuote(priced.storefrontQuote); }
        }
        const methods = await graphqlClient.request<{ bookingPaymentProviders: Provider[] }>(GET_BOOKING_PAYMENT_PROVIDERS); if (!active) return; const available = (methods.bookingPaymentProviders || []).filter(provider => provider.code === 'pp_paypal_paypal' || (provider.code === 'pp_stripe_stripe' && provider.publicClientKey)); setProviders(available); setProviderCode(current => available.some(item => item.code === current) ? current : available[0]?.code || ''); setProviderError(available.length ? '' : 'Online payment is unavailable. Contact the property before reserving.');
      } catch { if (active) setLoadError(resumeId ? 'This reservation cannot be opened in this guest session. Use secure lookup to restore access.' : safeQuoteFailureMessage()); } finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [resumeId, roomTypeId, requestedRate, checkIn, checkOut, adults, children, promoCode, revision, identity.timeZone]);
  const keepReservation = (id: string) => { setBookingId(id); const next = new URLSearchParams(window.location.search); next.set('bookingId', id); window.history.replaceState(null, '', `/book?${next}`); };
  const startPayment = async (event: React.FormEvent) => {
    event.preventDefault(); if (actionLock.current || confirmationLock.current) return; if (!providerCode || (!bookingId && !accepted)) return; actionLock.current = true; setBusy(true); setPaymentError('');
    let currentId = bookingId;
    try {
      if (!currentId) {
        if (!quote) throw new Error('quote');
        const bookingData = { ...form, guestName: form.guestName.trim(), guestEmail: form.guestEmail.trim(), guestPhone: form.guestPhone.trim(), checkInDate: `${checkIn}T00:00:00Z`, checkOutDate: `${checkOut}T00:00:00Z`, numberOfAdults: Number(adults), numberOfChildren: Number(children), roomTypeId, ratePlanId: quote.ratePlanId, quoteToken: quote.quoteToken, promoCode: promoCode.trim() || null };
        const { quoteToken: _signedQuote, ...attemptPayload } = bookingData; const attempt = await operationAttempt('guest-booking', attemptPayload);
        const result = await graphqlClient.request<{ createStorefrontBooking: Booking }>(CREATE_STOREFRONT_BOOKING, { data: { ...bookingData, idempotencyKey: attempt.key } });
        const created = result.createStorefrontBooking; currentId = created.id; keepReservation(currentId); setHeld(created); setBookedTerms(created.bookedStayTerms || null); setRoom(created.roomAssignments?.[0]?.roomType || room); setReference(created.confirmationNumber);
      }
      const origin = window.location.origin; const cancel = new URLSearchParams(window.location.search); cancel.set('bookingId', currentId);
      const result = await graphqlClient.request<{ initiateBookingPaymentSession: Session }>(INITIATE_BOOKING_PAYMENT_SESSION, { bookingId: currentId, paymentProviderCode: providerCode, returnUrl: `${origin}/${providerCode === 'pp_paypal_paypal' ? 'paypal' : 'stripe'}/return?bookingId=${encodeURIComponent(currentId)}`, cancelUrl: `${origin}/book?${cancel}` });
      const next = result.initiateBookingPaymentSession; if (!next?.id || !Number.isInteger(next.amount) || next.amount < 0) throw new Error('session'); if (providerCode === 'pp_paypal_paypal' && !next.approveLink || providerCode === 'pp_stripe_stripe' && !next.clientSecret) throw new Error('provider'); setSession(next);
    } catch { setPaymentError(currentId ? 'Payment could not be started for this reservation. It may have expired or its balance may have changed. Check reservation status before trying another payment.' : 'We could not complete this reservation request. Check the current rate and availability, then retry with the same details. If you already received a booking reference, use secure lookup.'); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const completePayment = async (providerPaymentId: string) => {
    if (confirmationLock.current || !bookingId || !session) return; confirmationLock.current = true; setConfirming(true); setPaymentError(''); setVerification('checking'); try {
      const outcome = await settleBookingPayment({ bookingId, paymentSessionId: session.id, providerPaymentId, balanceBeforeMinor: typeof held?.balanceDueMinor === 'number' ? held.balanceDueMinor : null });
      // The destination reads authoritative reservation and financial status, including compensation.
      if (outcome === 'settled') { router.push(`/booking/${encodeURIComponent(bookingId)}`); return; }
      setVerification('unknown');
    } finally { confirmationLock.current = false; setConfirming(false); }
  };

  if (loading) return <div className="sf-wrap sf-section--tight" role="status" aria-label="Preparing your stay details">
    <Skeleton height={14} width={220} /><div style={{ height: 28 }} />
    <div className="sf-checkout"><div className="sf-stack"><Skeleton height={56} width="60%" /><Skeleton height={52} /><Skeleton height={52} /><Skeleton height={120} /></div><Skeleton height={520} radius={22} /></div>
  </div>;
  if (loadError) return <StatePanel role="alert" icon={TriangleAlert} eyebrow="Your reservation" title="Let’s check the details."
    actions={<>{!selectionError && <button type="button" className="sf-btn" onClick={() => setRevision(value => value + 1)}><RefreshCw aria-hidden="true" />Try again</button>}<Link href={resumeId ? '/bookings/lookup' : `/rooms?${originalQuery}`} className="sf-link">{resumeId ? 'Secure booking lookup' : 'Review rooms & dates'}</Link></>}>{loadError}</StatePanel>;

  const arrival = held?.checkInDate || checkIn; const departure = held?.checkOutDate || checkOut; const canPay = !held || held.status === 'pending' || held.status === 'confirmed'; const displayedTerms = selectDisplayedStayPrice(bookingId, quote, bookedTerms); const paymentCurrency = displayedTerms?.currencyCode || held?.currencyCode || 'USD';
  const roomHref = `/rooms/${room?.id || roomTypeId}?${originalQuery}`;
  const guestCount = held?.numberOfGuests || Number(adults) + Number(children);
  const nights = displayedTerms?.nights || held?.numberOfNights || 0;
  const presentation = held ? reservationPresentation(held.status) : null;
  // Dates outside the current year carry it; within the year it is noise.
  const otherYear = String(departure).slice(0, 4) !== propertyToday(identity.timeZone).slice(0, 4);

  return <div className="sf-wrap" style={{ paddingBottom: 'clamp(56px, 8vw, 96px)' }}>
    <header className="sf-pagehead" style={{ paddingBottom: 'clamp(24px, 3vw, 36px)' }}>
      <ol className="sf-steps" aria-label="Booking steps">
        <li data-step="done"><Link href={roomHref}><i><Check aria-hidden="true" /></i>Room & rate</Link></li>
        <li data-step="current" aria-current="step"><span><i>2</i>Guest & payment</span></li>
        <li data-step="upcoming"><span><i>3</i>Reservation status</span></li>
      </ol>
      <div style={{ marginTop: 'clamp(24px, 4vw, 44px)' }}>
        <p className="sf-eyebrow">{bookingId ? 'Continue your reservation' : 'Direct reservation'}</p>
        <h1 className="sf-h1" style={{ marginTop: 14 }}>{bookingId ? <>Reservation <em>{reference || bookingId}</em></> : <>Your stay <em>starts here.</em></>}</h1>
        <p className="sf-lead" style={{ marginTop: 16 }}>{bookingId ? 'Review its current status before continuing payment.' : 'Review the full stay price and rate terms, then enter the details of the lead guest.'}</p>
      </div>
    </header>

    <div className="sf-checkout">
      <div style={{ minWidth: 0 }}>
        {held && presentation && <Notice tone={held.status === 'confirmed' ? 'success' : 'accent'} title={presentation.label} className="sf-noprint">
          <p>{presentation.copy}</p>
          <div className="sf-row"><Link href={`/booking/${held.id}`} className="sf-link">Open reservation & statement <ExternalLink aria-hidden="true" /></Link></div>
        </Notice>}
        {canPay && <>
          {!account && !bookingId && <p className="sf-small sf-muted sf-noprint" style={{ marginBottom: 18 }}>Have a guest account? <Link className="sf-link" style={{ minHeight: 0, fontSize: 'inherit' }} href={`/account?next=${encodeURIComponent(`/book?${originalQuery}`)}`}>Sign in</Link> to fill in your details and keep this stay with your account.</p>}
          <form id="hotel-guest-form" onSubmit={startPayment} style={{ marginTop: held ? 28 : 0 }}>
            <fieldset disabled={Boolean(bookingId) || busy} className="sf-formsection">
              <legend className="sf-formsection__head" style={{ float: 'left', width: '100%', marginBottom: 20 }}><i>01</i><span className="sf-h3">Lead guest</span></legend>
              <div className="sf-formgrid" style={{ clear: 'both' }}>
                {([['guestName', 'Full name', 'text', 'name'], ['guestEmail', 'Email address', 'email', 'email'], ['guestPhone', 'Phone number', 'tel', 'tel']] as const).map(([name, label, type, autoComplete]) => <label key={name} className={`sf-field ${name === 'guestName' ? 'sf-span' : ''}`}>
                  <span className="sf-label">{label}</span>
                  <input className="sf-input" name={name} type={type} autoComplete={autoComplete} required maxLength={name === 'guestName' ? 120 : 254} value={form[name]} onChange={event => setForm(previous => ({ ...previous, [name]: event.target.value }))} />
                </label>)}
                <label className="sf-field sf-span">
                  <span className="sf-label">Special requests <small>(optional)</small></span>
                  <textarea className="sf-textarea" rows={3} maxLength={2000} value={form.specialRequests} onChange={event => setForm(previous => ({ ...previous, specialRequests: event.target.value }))} />
                  <span className="sf-hint">Requests are subject to the property’s confirmation. For requirements essential to your stay, <Link className="sf-link" style={{ minHeight: 0, fontSize: 'inherit' }} href="/contact">contact the property</Link> before reserving.</span>
                </label>
              </div>
            </fieldset>

            <fieldset disabled={busy || confirming || Boolean(session)} className="sf-formsection">
              <legend className="sf-formsection__head" style={{ float: 'left', width: '100%', marginBottom: 20 }}><i>02</i><span className="sf-h3">Payment method</span></legend>
              <div className="sf-stack" style={{ '--stack': '10px', clear: 'both' } as React.CSSProperties}>
                {providers.map(provider => <label className="sf-choice" key={provider.id} style={{ alignItems: 'center' }}>
                  <input type="radio" name="paymentProvider" checked={providerCode === provider.code} onChange={() => { setProviderCode(provider.code); setPaymentError(''); }} style={{ marginTop: 0 }} />
                  <span className="sf-pay-provider"><span className="sf-choice__title">{provider.displayName || provider.name}</span>{provider.code === 'pp_paypal_paypal' ? <Wallet aria-hidden="true" /> : <CreditCard aria-hidden="true" />}</span>
                </label>)}
                {providerError && <Notice tone="warn" role="alert">{providerError}<div className="sf-row"><Link className="sf-link" href="/contact">Contact the property</Link></div></Notice>}
              </div>
            </fieldset>

            {!bookingId && <div className="sf-formsection">
              <label className="sf-check"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I have reviewed the full stay price, payment amounts and cancellation terms for the selected rate. <Link href="/policies" target="_blank">Booking policies (new tab)</Link></span></label>
            </div>}
            {!session && <button className="sf-btn sf-btn--lg sf-btn--block sf-btn--split" disabled={busy || !providerCode || (!bookingId && !accepted)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Lock aria-hidden="true" />{busy ? 'Preparing secure payment…' : bookingId ? 'Check current amount & continue' : 'Continue to secure payment'}</span>
              {!busy && <ArrowRight className="sf-btn__go" aria-hidden="true" />}
            </button>}
          </form>
          {bookingId && held?.status === 'pending' && <Notice tone="info" className="sf-noprint" title="This reservation is not confirmed yet."><p>It is subject to the latest availability and payment checks. A pending booking or an open payment form is not confirmation.</p><div className="sf-row"><Link href={`/booking/${bookingId}`} className="sf-link">Check reservation status <ExternalLink aria-hidden="true" /></Link></div></Notice>}
          {bookingId && !held && <Notice tone="warn" className="sf-noprint" title="We couldn’t check this reservation’s status."><p>Refresh the page, or open the reservation to see its current status before paying.</p><div className="sf-row"><Link href={`/booking/${bookingId}`} className="sf-link">Check reservation status <ExternalLink aria-hidden="true" /></Link></div></Notice>}
          {session && <section aria-label="Secure payment" className="sf-paybox" style={{ marginTop: 20 }}>
            <div className="sf-bill__total" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}><b>Payment amount<small>Due now</small></b><span className="sf-amount">{money(session.amount, paymentCurrency)}</span></div>
            {session.approveLink ? <a className="sf-btn sf-btn--lg sf-btn--block" href={session.approveLink}>Continue to PayPal <ArrowRight className="sf-btn__go" aria-hidden="true" /></a>
              : verification !== 'idle' ? null
              : stripe && session.clientSecret ? <Elements stripe={stripe} options={{ clientSecret: session.clientSecret, appearance: stripeAppearance(identity.accentPreset, identity.logo) }}><StripeCheckoutForm amount={session.amount / 100} currencyCode={paymentCurrency} bookingId={bookingId} paymentSessionId={session.id} onSuccess={completePayment} onError={setPaymentError} /></Elements>
                : <p role="status" className="sf-muted">Preparing the secure payment form…</p>}
            {confirming && <p role="status" className="sf-muted">Verifying payment and reservation status… Keep this page open and don’t pay again.</p>}
            {verification === 'unknown' && <Notice tone="accent" role="status" title="Payment submitted. Confirmation is still in progress.">
              <p>Your payment was submitted, but the reservation hasn’t shown it yet. Don’t pay again. Open your reservation in a minute: the payment and confirmation will appear there.</p>
              <div className="sf-row"><Link href={`/booking/${encodeURIComponent(bookingId)}`} className="sf-btn sf-btn--sm">Open reservation status</Link></div>
            </Notice>}
          </section>}
        </>}
        {paymentError && <Notice tone="danger" role="alert" className="sf-noprint" title="Payment needs attention">
          <p>{paymentError}</p>
          <div className="sf-row">{bookingId ? <Link className="sf-btn sf-btn--sm" href={`/booking/${bookingId}`}>Review reservation status</Link> : <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" onClick={() => { setAccepted(false); setRevision(value => value + 1); }}><RefreshCw aria-hidden="true" />Refresh price & availability</button>}<Link className="sf-link" href="/bookings/lookup">Find a reservation</Link></div>
        </Notice>}
      </div>

      <aside className="sf-checkout__aside" aria-label="Your stay">
        <div className="sf-card sf-summary">
          {room && <div className="sf-summary__media"><img src={primaryRoomImage(room)} alt={room.name} /></div>}
          <div className="sf-summary__body">
            <div>
              <p className="sf-eyebrow sf-eyebrow--plain">Your stay</p>
              <h2 className="sf-h3" style={{ marginTop: 6 }}>{room?.name || 'Your room'}</h2>
            </div>
            <div className="sf-stayline">
              <div><small>Check-in</small><b>{formatStayDate(arrival, { weekday: 'short', month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) })}</b><span>From {identity.checkIn}</span></div>
              <div className="sf-stayline__mid"><Moon aria-hidden="true" />{nights ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}</div>
              <div><small>Check-out</small><b>{formatStayDate(departure, { weekday: 'short', month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) })}</b><span>By {identity.checkOut}</span></div>
            </div>
            <p className="sf-row sf-small sf-muted" style={{ gap: 8 }}><Users aria-hidden="true" style={{ width: 16 }} />{guestCount} {guestCount === 1 ? 'guest' : 'guests'} in one room</p>
            {displayedTerms ? <StayPrice quote={displayedTerms} paymentAmountMinor={session?.amount} /> : held && <section aria-label="Recorded booking total" className="sf-bill">
              <div className="sf-bill__row"><span>Taxes included</span><span>{money(held.taxAmountMinor ?? Math.round((held.taxAmount || 0) * 100), paymentCurrency)}</span></div>
              <div className="sf-bill__row"><span>Fees included</span><span>{money(held.feesAmountMinor ?? Math.round((held.feesAmount || 0) * 100), paymentCurrency)}</span></div>
              <div className="sf-bill__total"><b>Recorded stay total</b><span className="sf-amount">{money(held.totalAmountMinor ?? Math.round((held.totalAmount || 0) * 100), paymentCurrency)}</span></div>
              <p className="sf-fine" style={{ marginTop: 12 }}>The original rate breakdown is unavailable. These are persisted booking amounts, not a current quote. The current collectible amount is checked before payment; review your reservation for recorded rate terms and statement.</p>
            </section>}
            <Link href={roomHref} className="sf-link sf-link--back sf-noprint"><ArrowLeft aria-hidden="true" />Review room details</Link>
          </div>
        </div>
      </aside>
    </div>
  </div>;
}
export default function BookPage() { return <Suspense fallback={<div className="sf-wrap sf-section" role="status"><Skeleton height={56} width="50%" /></div>}><BookContent /></Suspense>; }
