'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarClock, ChevronDown, ChevronRight, Clock, Info, MessageCircle, RefreshCw, Tag, TriangleAlert, Utensils } from 'lucide-react';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_ROOM_TYPE, GET_STOREFRONT_QUOTE } from '@/lib/queries';
import type { RatePlan, RoomType } from '@/lib/types';
import type { StayQuote } from '../lib/quote';
import { roomCopy, roomImages } from '@/lib/hotel-storefront';
import { StayEstimate, StayPrice } from '../components/StayPrice';
import { roomSearchValidationMessage, selectInitialPublicRatePlan, safeQuoteFailureMessage } from '../lib/qa-workflows';
import { cancellationHeadline, cancellationTerms, mealPlanLabel, money, nightMoney, stayNights } from '../lib/stay-context';
import { addDays, dayParts, propertyToday } from '../lib/calendar';
import { useScrollSpy } from '../lib/use-scroll-spy';
import { useRateCalendar } from '../lib/use-rate-calendar';
import { useStayAvailability } from '../lib/use-stay-availability';
import { useStay } from '../components/StayProvider';
import { useHotelSettings } from '../components/HotelSettingsProvider';
import { MAX_ONLINE_NIGHTS, StayPicker } from '../components/stay/StayCalendar';
import { GuestStepper } from '../components/stay/GuestStepper';
import { RoomGallery } from '../components/room/RoomGallery';
import { RoomFacts } from '../components/room/RoomCard';
import { AmenityList } from '../components/room/AmenityIcon';
import { Notice, Skeleton, StatePanel } from '../components/ui';

type StayForm = { checkIn: string; checkOut: string; adults: string; children: string; ratePlanId: string; promoCode: string };
const SECTIONS = [['overview', 'Overview'], ['rate-plans', 'Rates'], ['amenities', 'Amenities'], ['good-to-know', 'Good to know']] as const;

function formFromQuery(query: string): StayForm {
  const source = new URLSearchParams(query);
  return { checkIn: source.get('checkIn') || '', checkOut: source.get('checkOut') || '', adults: source.get('adults') || '2', children: source.get('children') || '0', ratePlanId: source.get('ratePlanId') || '', promoCode: source.get('promoCode') || '' };
}

function preflightMessage(form: StayForm, room: RoomType, plan: RatePlan | undefined, today: string) {
  const validation = roomSearchValidationMessage(form.checkIn, form.checkOut, form.adults, form.children);
  if (validation) return validation;
  if (!form.checkIn || !form.checkOut) return 'Choose arrival and departure dates for a full stay price.';
  if (form.checkIn < today) return 'Choose a check-in date from today onward.';
  if (!plan) return 'No published rate is available. Contact the property for help reserving this room.';
  if (stayNights(form.checkIn, form.checkOut) < plan.minimumStay) return `This rate requires at least ${plan.minimumStay} nights. Choose another rate or extend your stay.`;
  if (Number(form.adults) + Number(form.children) > room.maxOccupancy) return `This room accommodates up to ${room.maxOccupancy} guests. Adjust your party or compare other rooms.`;
  if (plan.isPromotional && !form.promoCode.trim()) return 'Enter the promotion code for this rate.';
  return '';
}

export default function RoomDetailPage() {
  const route = useParams<{ slug: string }>(); const search = useSearchParams(); const [revision, setRevision] = useState(0);
  const slug = route?.slug || ''; const query = search?.toString() || '';
  return <RoomDetailContent key={`${slug}:${revision}`} slug={slug} query={query} onRetry={() => setRevision(value => value + 1)} />;
}

function RoomDetailContent({ slug, query, onRetry }: { slug: string; query: string; onRetry: () => void }) {
  const { setStay } = useStay(); const identity = useHotelSettings();
  const today = useMemo(() => propertyToday(identity.timeZone), [identity.timeZone]);
  const [room, setRoom] = useState<RoomType | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [form, setForm] = useState<StayForm>(() => formFromQuery(query));
  const [quote, setQuote] = useState<StayQuote | null>(null); const [quotedKey, setQuotedKey] = useState('');
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null); const [attempt, setAttempt] = useState(0);
  const [guestsOpen, setGuestsOpen] = useState(false); const [promoOpen, setPromoOpen] = useState(() => Boolean(formFromQuery(query).promoCode));
  const written = useRef(query); const quoteSequence = useRef(0);
  const [month, setMonth] = useState(''); const [preview, setPreview] = useState('');
  const active = useScrollSpy(SECTIONS.map(([id]) => id), Boolean(room));

  useEffect(() => {
    let current = true;
    graphqlClient.request<{ roomType: RoomType | null }>(GET_ROOM_TYPE, { id: slug }).then(data => {
      if (!current) return;
      setRoom(data.roomType);
      if (!data.roomType) setError('This room is not available in the collection.');
      else { const plan = selectInitialPublicRatePlan(data.roomType.ratePlans, new URLSearchParams(written.current).get('ratePlanId')); setForm(previous => ({ ...previous, ratePlanId: plan?.id || '' })); }
    }).catch(() => { if (current) setError('We could not load this room. Please try again.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [slug]);

  // Navigation from elsewhere (not our own URL sync) restarts the stay choices.
  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    const next = formFromQuery(query);
    setForm(previous => ({ ...next, ratePlanId: next.ratePlanId || previous.ratePlanId }));
  }, [query]);

  const plan = room?.ratePlans?.find(item => item.id === form.ratePlanId);
  const formKey = JSON.stringify(form);
  const message = room ? preflightMessage(form, room, plan, today) : '';
  const current = Boolean(quote && quotedKey === formKey);
  const failed = failure?.key === formKey ? failure.message : '';
  const pricing = Boolean(room && !message && !current && !failed);

  useEffect(() => {
    // Every change of choices, valid or not, retires any quote still in flight.
    const sequence = ++quoteSequence.current;
    if (!room || !plan || message) return;
    const request: StayForm = JSON.parse(formKey);
    const timer = window.setTimeout(() => {
      graphqlClient.request<{ storefrontQuote: StayQuote }>(GET_STOREFRONT_QUOTE, { roomTypeId: room.id, ratePlanId: plan.id, checkInDate: `${request.checkIn}T00:00:00Z`, checkOutDate: `${request.checkOut}T00:00:00Z`, numberOfAdults: Number(request.adults), numberOfChildren: Number(request.children), promoCode: request.promoCode.trim() || null })
        .then(data => {
          if (sequence !== quoteSequence.current) return;
          setQuote(data.storefrontQuote); setQuotedKey(formKey);
          const params = new URLSearchParams(written.current);
          Object.entries(request).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
          written.current = params.toString(); setStay(written.current);
          window.history.replaceState(window.history.state, '', `/rooms/${slug}?${written.current}${window.location.hash}`);
        })
        .catch(() => { if (sequence === quoteSequence.current) setFailure({ key: formKey, message: safeQuoteFailureMessage() }); });
    }, 320);
    return () => { window.clearTimeout(timer); if (sequence === quoteSequence.current) quoteSequence.current += 1; };
  }, [room, plan, message, formKey, attempt, slug, setStay]);

  const update = (key: keyof StayForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const bookingParams = new URLSearchParams(query); Object.entries(form).forEach(([key, value]) => value ? bookingParams.set(key, value) : bookingParams.delete(key)); bookingParams.set('roomTypeId', slug);
  const promoIgnored = Boolean(current && quote?.promoCodeApplied === false && form.promoCode.trim());
  if (promoIgnored) bookingParams.delete('promoCode');

  // Nightly charges for the month on screen, from the same quote contract the booking uses.
  const adults = Number(form.adults); const children = Number(form.children);
  const rates = useRateCalendar(room && plan && month && Number.isInteger(adults) && adults >= 1 && Number.isInteger(children) && children >= 0 && adults + children <= room.maxOccupancy && !(plan.isPromotional && !form.promoCode.trim())
    ? { roomTypeId: room.id, ratePlanId: plan.id, minimumStay: plan.minimumStay || 1, maxNights: MAX_ONLINE_NIGHTS, adults, children, promoCode: plan.isPromotional ? form.promoCode : '', month, today }
    : null);
  // Sold-out nights for this room type, from live inventory.
  const availability = useStayAvailability(room && month ? { roomTypeId: room.id, month, today } : null);
  const nightPrices = useMemo(() => {
    const prices: Record<string, string> = {};
    if (rates?.currencyCode) Object.entries(rates.prices).forEach(([date, amount]) => { prices[date] = nightMoney(amount, rates.currencyCode); });
    // The quote for the chosen stay is the authority for its own nights.
    if (quote?.nightlyRates && quote.ratePlanId === form.ratePlanId && quote.checkInDate.slice(0, 10) === form.checkIn && quote.checkOutDate.slice(0, 10) === form.checkOut) {
      quote.nightlyRates.forEach(night => { prices[night.date] = nightMoney(night.amountMinor, quote.currencyCode); });
    }
    return Object.keys(prices).length ? prices : undefined;
  }, [rates, quote, form.ratePlanId, form.checkIn, form.checkOut]);
  // Oil's provisional bill while a check-out is previewed; only when every night is priced.
  const estimate = useMemo(() => {
    if (!rates?.currencyCode || !form.checkIn || form.checkOut || !preview || preview <= form.checkIn) return null;
    const nights: Array<{ date: string; amountMinor: number }> = [];
    for (let day = form.checkIn; day < preview; day = addDays(day, 1)) {
      const amountMinor = rates.prices[day];
      if (amountMinor === undefined) return null;
      nights.push({ date: day, amountMinor });
    }
    return { nights, currencyCode: rates.currencyCode, checkOut: preview };
  }, [rates, form.checkIn, form.checkOut, preview]);

  if (loading) return <div className="sf-wrap" role="status" aria-label="Opening the room">
    <div className="sf-pagehead"><Skeleton height={14} width={160} /><div style={{ height: 18 }} /><Skeleton height={64} width="45%" /></div>
    <Skeleton height={480} radius={28} />
  </div>;
  if (error || !room) return <StatePanel role="alert" icon={TriangleAlert} eyebrow="Rooms & suites" title="The room could not be opened." actions={<><button type="button" className="sf-btn" onClick={onRetry}><RefreshCw aria-hidden="true" />Try again</button><Link href={`/rooms?${query}`} className="sf-link">Return to rooms</Link></>}>{error}</StatePanel>;

  const nights = stayNights(form.checkIn, form.checkOut);
  const guests = Number(form.adults) + Number(form.children);
  const average = current && quote && quote.nights > 0 ? money(Math.round(quote.roomSubtotalMinor / quote.nights), quote.currencyCode) : '';
  const estimatedAverage = estimate ? money(Math.round(estimate.nights.reduce((sum, night) => sum + night.amountMinor, 0) / estimate.nights.length), estimate.currencyCode) : '';
  const base = plan && Number.isSafeInteger(plan.baseRateMinor) && plan.currencyCode ? money(plan.baseRateMinor!, plan.currencyCode) : '';
  const peek: { nights: Array<{ date: string; amountMinor: number }>; currencyCode: string } = current && quote?.nightlyRates?.length ? { nights: quote.nightlyRates, currencyCode: quote.currencyCode } : estimate ? { nights: estimate.nights, currencyCode: estimate.currencyCode } : { nights: [], currencyCode: '' };
  const ctaLabel = !form.checkIn ? 'Choose your dates' : !form.checkOut ? 'Choose a check-out date' : pricing ? 'Checking your stay…' : 'Review the details above';

  return <div className="sf-has-mobilebar">
    <div className="sf-wrap">
      <header className="sf-pagehead" style={{ paddingBottom: 28 }}>
        <nav className="sf-crumbs" aria-label="Breadcrumb"><Link href={`/rooms?${query}`} className="sf-link sf-link--back" style={{ minHeight: 0 }}><ArrowLeft aria-hidden="true" />Rooms & suites</Link><ChevronRight aria-hidden="true" /><span aria-current="page">{room.name}</span></nav>
        <div className="sf-pagehead__row">
          <div>
            <p className="sf-eyebrow">{room.eyebrow || 'Your room at the house'}</p>
            <h1 className="sf-h1" style={{ marginTop: 14 }}>{room.name}</h1>
          </div>
          <RoomFacts room={room} />
        </div>
      </header>
      <section id="photos"><h2 className="sf-sr">Room photographs</h2><RoomGallery images={roomImages(room)} roomName={room.name} /></section>
    </div>
    <nav className="sf-tabs" aria-label="Room sections" style={{ marginTop: 28 }}>
      <div className="sf-wrap sf-tabs__row">{SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined}>{label}</a>)}<a href="#rates">Dates & price</a></div>
    </nav>
    <div className="sf-wrap sf-checkout" style={{ paddingBlock: 'clamp(32px, 5vw, 56px)' }}>
      <div style={{ minWidth: 0 }}>
        <section id="overview" className="sf-block">
          <div className="sf-block__head"><p className="sf-eyebrow">A space of your own</p><h2 className="sf-h2">The room, <em>in detail.</em></h2></div>
          <p className="sf-lead">{roomCopy(room)}</p>
          {room.viewDescription && room.viewDescription !== roomCopy(room) && <p className="sf-body" style={{ marginTop: 14 }}>{room.viewDescription}</p>}
        </section>

        <section id="rate-plans" className="sf-block" aria-labelledby="rate-plans-title">
          <div className="sf-block__head"><p className="sf-eyebrow">Rates</p><h2 id="rate-plans-title" className="sf-h2">Choose <em>your rate.</em></h2><p className="sf-muted">Each rate sets its own meals, minimum stay and cancellation terms. The price on the right updates as you choose.</p></div>
          {room.ratePlans?.length ? <fieldset className="sf-stack" style={{ '--stack': '10px' } as React.CSSProperties}>
            <legend className="sf-sr">Rate plan</legend>
            {room.ratePlans.map(rate => <label key={rate.id} className="sf-choice">
              <input type="radio" name="ratePlan" value={rate.id} checked={form.ratePlanId === rate.id} onChange={() => { update('ratePlanId', rate.id); if (rate.isPromotional) setPromoOpen(true); }} />
              <span className="sf-choice__body">
                <span className="sf-choice__title"><span>{rate.name}</span>{Number.isSafeInteger(rate.baseRateMinor) && rate.currencyCode && <span className="sf-num sf-muted" style={{ fontWeight: 500 }}>{money(rate.baseRateMinor!, rate.currencyCode)} <small>base / night</small></span>}</span>
                {rate.description && <span className="sf-choice__meta">{rate.description}</span>}
                <span className="sf-choice__tags">
                  <span className="sf-badge"><CalendarClock aria-hidden="true" />{cancellationHeadline(rate.cancellationPolicy)}</span>
                  {rate.mealPlan && <span className="sf-badge"><Utensils aria-hidden="true" />{mealPlanLabel(rate.mealPlan)}</span>}
                  {rate.minimumStay > 1 && <span className="sf-badge"><Clock aria-hidden="true" />{rate.minimumStay}-night minimum</span>}
                  {rate.isPromotional && <span className="sf-badge sf-badge--accent"><Tag aria-hidden="true" />Promotion code required</span>}
                </span>
              </span>
            </label>)}
          </fieldset> : <Notice tone="warn" title="No published rate is available.">Contact the property for help reserving this room.</Notice>}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="sf-link" aria-expanded={promoOpen} aria-controls="promo-field" onClick={() => setPromoOpen(value => !value)}><Tag aria-hidden="true" />{plan?.isPromotional ? 'Promotion code (required for this rate)' : 'Have a promotion code?'}<ChevronDown aria-hidden="true" style={{ transform: promoOpen ? 'rotate(180deg)' : undefined }} /></button>
            {promoOpen && <label id="promo-field" className="sf-field" style={{ maxWidth: 360, marginTop: 8 }}><span className="sf-label">Promotion code <small>{plan?.isPromotional ? '(required)' : '(optional)'}</small></span><input className="sf-input sf-input--code" autoComplete="off" value={form.promoCode} maxLength={100} onChange={event => update('promoCode', event.target.value)} aria-describedby={promoIgnored ? 'promo-note' : undefined} />{promoIgnored && <span id="promo-note" className="sf-hint" role="status">This code doesn’t apply to the {quote?.ratePlanName} rate. The price shown is the regular rate.</span>}</label>}
          </div>
        </section>

        <section id="amenities" className="sf-block" aria-labelledby="amenities-title">
          <div className="sf-block__head"><p className="sf-eyebrow">In the room</p><h2 id="amenities-title" className="sf-h2">Comforts, <em>considered.</em></h2></div>
          {room.amenities?.length ? <AmenityList amenities={room.amenities} /> : <p className="sf-muted">Contact the property for a full list of room amenities.</p>}
        </section>

        <section id="good-to-know" className="sf-block" aria-labelledby="good-to-know-title">
          <div className="sf-block__head"><p className="sf-eyebrow">Before you book</p><h2 id="good-to-know-title" className="sf-h2">Good <em>to know.</em></h2></div>
          <div className="sf-features" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
            <article className="sf-feature"><span className="sf-feature__icon"><Clock aria-hidden="true" /></span><h3 className="sf-h4">Arrival & departure</h3><div className="sf-times"><div><small>Check-in from</small><b>{identity.checkIn}</b></div><div><small>Check-out by</small><b>{identity.checkOut}</b></div></div><p className="sf-fine">Local property time.</p></article>
            <article className="sf-feature"><span className="sf-feature__icon"><CalendarClock aria-hidden="true" /></span><h3 className="sf-h4">{plan ? `Cancellation · ${plan.name}` : 'Cancellation'}</h3><p className="sf-muted sf-small">{cancellationTerms(plan?.cancellationPolicy)}</p><Link href="/policies" className="sf-link">Booking & stay policies</Link></article>
            <article className="sf-feature"><span className="sf-feature__icon"><MessageCircle aria-hidden="true" /></span><h3 className="sf-h4">A particular requirement?</h3><p className="sf-muted sf-small">Confirm accessibility, bedding requests, and any arrangements essential to your stay before booking.</p><Link className="sf-link" href="/contact?subject=Room%20requirements">Ask the property</Link></article>
          </div>
        </section>
      </div>

      <aside id="rates" className="sf-checkout__aside sf-checkout__aside--tall" aria-label="Dates and price" style={{ order: 0 }}>
        <div className="sf-float sf-bookcard">
          <div className="sf-bookcard__price" aria-live="polite">
            {average ? <><span key={average} className="sf-amount sf-updated">{average}</span><span>avg. per night · before tax</span></>
              : estimatedAverage ? <><span key={estimatedAverage} className="sf-amount sf-updated">{estimatedAverage}</span><span>est. avg. per night · {estimate!.nights.length} {estimate!.nights.length === 1 ? 'night' : 'nights'}</span></>
                : base ? <><span className="sf-amount">{base}</span><span>base rate / night · varies by date</span></>
                  : <span className="sf-h4">Live rates for your dates</span>}
          </div>
          <StayPicker checkIn={form.checkIn} checkOut={form.checkOut} today={today} minNights={plan?.minimumStay || 1} nightPrices={nightPrices} availability={availability}
            onViewChange={setMonth} onPreview={setPreview}
            onChange={range => setForm(previous => ({ ...previous, ...range }))} />
          <div className="sf-bookcard__guests">
            <button type="button" className="sf-stepper" style={{ width: '100%' }} aria-expanded={guestsOpen} onClick={() => setGuestsOpen(value => !value)}>
              <span className="sf-stepper__label" style={{ textAlign: 'left' }}><b>Guests</b><small>{form.adults} {form.adults === '1' ? 'adult' : 'adults'}{Number(form.children) ? ` · ${form.children} ${form.children === '1' ? 'child' : 'children'}` : ''} · sleeps up to {room.maxOccupancy}</small></span>
              <ChevronDown aria-hidden="true" style={{ width: 18, transform: guestsOpen ? 'rotate(180deg)' : undefined, transition: 'transform var(--sf-mid) var(--sf-ease)' }} />
            </button>
            {guestsOpen && <GuestStepper value={{ adults: Number(form.adults), children: Number(form.children) }} maxGuests={room.maxOccupancy} onChange={value => setForm(previous => ({ ...previous, adults: String(value.adults), children: String(value.children) }))} />}
          </div>
          <div aria-live="polite">
            {current && quote ? <StayPrice quote={quote} />
              : estimate ? <StayEstimate nights={estimate.nights} currencyCode={estimate.currencyCode} checkIn={form.checkIn} checkOut={estimate.checkOut} />
              : pricing ? quote ? <StayPrice quote={quote} stale /> : <div className="sf-stack" role="status" aria-label="Checking availability and the full stay price"><Skeleton height={18} width="60%" /><Skeleton height={44} /><Skeleton height={18} /><Skeleton height={36} width="50%" /></div>
                : failed ? <Notice tone="danger" role="alert" title="We couldn’t price that stay.">{failed}<div className="sf-row"><button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" onClick={() => { setFailure(null); setAttempt(value => value + 1); }}><RefreshCw aria-hidden="true" />Try again</button></div></Notice>
                  : <Notice tone="accent" role="status">{message || 'Choose your dates for a full stay price.'}</Notice>}
          </div>
          {current && quote ? <Link href={`/book?${bookingParams}`} className="sf-btn sf-btn--lg sf-btn--block sf-btn--split">Reserve this stay <ArrowRight className="sf-btn__go" aria-hidden="true" /></Link>
            : <button type="button" className="sf-btn sf-btn--lg sf-btn--block" disabled>{ctaLabel}</button>}
          <p className="sf-fine" style={{ display: 'flex', gap: 8 }}><Info aria-hidden="true" style={{ width: 15, flex: 'none', marginTop: 2 }} />No payment is taken on this page. Availability and price are checked again when you reserve.</p>
        </div>
      </aside>
    </div>

    <div className="sf-mobilebar sf-noprint" role="region" aria-label="Your stay">
      {/* Oil's phone night peek: the first nights of the stay, priced, above the total. */}
      <div className="sf-mobilebar__nights" aria-live="polite">
        {peek.nights.length ? peek.nights.slice(0, 5).map(night => <span key={night.date}>{dayParts(night.date).weekday} {dayParts(night.date).day} <b>{money(night.amountMinor, peek.currencyCode)}</b></span>)
          : <span>{form.checkIn ? 'Choose a check-out to see each night’s charge here.' : 'Choose your dates to see each night’s charge here.'}</span>}
      </div>
      <div className="sf-mobilebar__row">
        <div className="sf-mobilebar__price">
          {current && quote ? <><span><b>{money(quote.totalAmountMinor, quote.currencyCode)}</b> <small>/ {quote.nights} {quote.nights === 1 ? 'night' : 'nights'} · {guests} {guests === 1 ? 'guest' : 'guests'}</small></span><a href="#rates">View price details</a></>
            : <><span><b>{nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Your stay'}</b></span><small>{pricing ? 'Checking the full price…' : message || 'Choose dates for a price'}</small></>}
        </div>
        {current && quote ? <Link href={`/book?${bookingParams}`} className="sf-btn">Reserve <ArrowRight className="sf-btn__go" aria-hidden="true" /></Link> : <a href="#rates" className="sf-btn">{form.checkIn && form.checkOut ? 'Review' : 'Choose dates'}</a>}
      </div>
    </div>
  </div>;
}
