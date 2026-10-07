'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatStayDate, stayCalendar } from '../lib/stay-calendar';
import { GuestFolioPanel } from '../components/GuestFolioPanel';
import { SecurityAuthorizationPanel } from '../components/security-authorization/SecurityAuthorizationPanel';
import LoyaltyPanel from '@/features/platform/loyalty/components/LoyaltyPanel';

import { graphqlClient } from '@/lib/graphql-client';
import { CANCEL_BOOKING, GET_GUEST_BOOKING } from '@/lib/queries';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import type { HotelIdentity } from '@/features/storefront/lib/hotel-settings';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { operationAttempt } from '@/lib/operationAttempt';
import { calendarDay, stayNights, reservationPresentation, money } from '../lib/stay-context';
import { storefrontAccentCssVariables } from '../lib/storefront-theme';
import { BookedStayTermsPanel } from '../components/BookedStayTermsPanel';
import type { StayPriceSummary } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { modificationDateToIso, safeGuestWorkflowFailure } from '@/features/storefront/lib/qa-workflows';

interface Booking {
  id: string;
  confirmationNumber: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  numberOfAdults: number;
  numberOfChildren?: number;
  numberOfNights: number;
  roomRate?: number | null;
  taxAmount?: number | null;
  feesAmount?: number | null;
  totalAmount: number | null;
  roomRateMinor?: number | null;
  taxAmountMinor?: number | null;
  feesAmountMinor?: number | null;
  totalAmountMinor?: number | null;
  balanceDue?: number | null;
  balanceDueMinor?: number | null;
  currencyCode?: string | null;
  bookedStayTerms?: StayPriceSummary | null;
  status: string;
  paymentStatus?: string;
  refundPendingMinor?: number;
  specialRequests?: string;
  confirmationDeliveryStatus?: string | null;
  updateDeliveryStatus?: string | null;
  cancellationDeliveryStatus?: string | null;
  roomAssignments?: Array<{
    id: string;
    roomType?: {
      id: string;
      name: string;
      thumbnail?: string | null;
      roomImages?: Array<{
        id: string;
        image?: { url?: string | null; } | null;
        url?: string | null;
        imagePath?: string | null;
        altText?: string | null;
        caption?: string | null;
        order?: number | null;
        isPrimary?: boolean | null;
      }>;
    };
    roomNumber?: string | null;
    ratePerNight?: number;
  }>;
}

interface BookingResponse {
  booking: Booking;
}

const REQUEST_BOOKING_MODIFICATION = `
  mutation RequestBookingModification(
    $bookingId: ID!
    $guestEmail: String!
    $requestedCheckInDate: DateTime
    $requestedCheckOutDate: DateTime
    $message: String
  ) {
    requestBookingModification(
      bookingId: $bookingId
      guestEmail: $guestEmail
      requestedCheckInDate: $requestedCheckInDate
      requestedCheckOutDate: $requestedCheckOutDate
      message: $message
    ) {
      id
      status
    }
  }
`;

interface CancellationQuote {
  canCancel: boolean;
  policy: string;
  summary: string;
  refundableMinor: number;
  cancellationFeeMinor: number;
  capturedMinor: number;
  currencyCode: string;
  fullRefundDeadline?: string | null;
}

const GET_CANCELLATION_QUOTE = `
  query GuestCancellationQuote($bookingId: ID!) {
    guestCancellationQuote(bookingId: $bookingId) {
      canCancel policy summary refundableMinor cancellationFeeMinor capturedMinor currencyCode fullRefundDeadline
    }
  }
`;

// Generate .ics calendar file for the stay
const generateCalendarFile = (booking: Booking, identity: HotelIdentity) => {
  const icsContent = stayCalendar(booking, identity);

  const blob = new Blob([icsContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stay-${booking.confirmationNumber}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

function bookingAmount(minor: number | null | undefined, major: number | null | undefined, currencyCode: string | null | undefined) {
  if (!/^[A-Z]{3}$/.test(String(currencyCode || ''))) return 'Amount unavailable';
  const amountMinor = Number.isSafeInteger(minor) && Number(minor) >= 0
    ? Number(minor)
    : typeof major === 'number' && Number.isFinite(major) && major >= 0
      ? Math.round(major * 100)
      : null;
  if (amountMinor === null || !Number.isSafeInteger(amountMinor)) return 'Amount unavailable';
  try { return money(amountMinor, currencyCode!); } catch { return 'Amount unavailable'; }
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <div className="min-w-0">
      <dt className="lodging-eyebrow mb-1.5 text-[0.625rem]">{label}</dt>
      <dd className="text-[var(--lodging-ink)] leading-6">{children}</dd>
    </div>
  );
}

export default function BookingDetailPage() {
  const identity = useHotelSettings();
  const params = useParams();
  const bookingId = typeof params?.id === 'string' ? params.id : '';
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const requestSequence = React.useRef(0);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const cancelFlight = React.useRef(false);
  const [cancelError, setCancelError] = React.useState('');
  const [cancellationQuote, setCancellationQuote] = React.useState<CancellationQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const quoteSequence = React.useRef(0);
  const [showModifyDialog, setShowModifyDialog] = React.useState(false);
  const [isRequestingModification, setIsRequestingModification] = React.useState(false);
  const modifyFlight = React.useRef(false);
  const [modificationError, setModificationError] = React.useState('');
  const [modificationSuccess, setModificationSuccess] = React.useState('');
  const [modificationForm, setModificationForm] = React.useState({ requestedCheckInDate: '', requestedCheckOutDate: '', message: '' });
  const refreshBooking = React.useCallback(async () => {
    const sequence = ++requestSequence.current;
    setRefreshing(true); setError('');
    try {
      const data = await graphqlClient.request<BookingResponse>(GET_GUEST_BOOKING, { bookingId });
      if (!data.booking) throw new Error('Unavailable reservation');
      if (sequence === requestSequence.current) { setBooking(data.booking); setRevision(value => value + 1); }
    } catch {
      if (sequence === requestSequence.current) setError(safeGuestWorkflowFailure('booking'));
    } finally {
      if (sequence === requestSequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, [bookingId]);
  React.useEffect(() => {
    setBooking(null); setLoading(true);
    if (bookingId) void refreshBooking(); else { setLoading(false); setError(safeGuestWorkflowFailure('booking')); }
    return () => { requestSequence.current += 1; };
  }, [bookingId, refreshBooking]);
  async function loadCancellationQuote() {
    const sequence = ++quoteSequence.current;
    setCancellationQuote(null); setCancelError(''); setQuoteLoading(true);
    try {
      const result = await graphqlClient.request<{ guestCancellationQuote: CancellationQuote; }>(GET_CANCELLATION_QUOTE, { bookingId });
      if (!result.guestCancellationQuote) throw new Error('Missing cancellation quote');
      if (sequence === quoteSequence.current) setCancellationQuote(result.guestCancellationQuote);
    } catch { if (sequence === quoteSequence.current) setCancelError('The current cancellation terms could not be loaded. Retry to review them before cancelling.'); }
    finally { if (sequence === quoteSequence.current) setQuoteLoading(false); }
  }
  async function handleRequestModification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking || modifyFlight.current) return;
    const arrival = modificationForm.requestedCheckInDate;
    const departure = modificationForm.requestedCheckOutDate;
    const message = modificationForm.message.trim();
    if ((arrival || departure) && (!calendarDay(arrival) || !calendarDay(departure))) { setModificationError('Choose both requested arrival and departure dates.'); return; }
    if (arrival && (stayNights(arrival, departure) < 1 || stayNights(arrival, departure) > 31)) { setModificationError('Choose a departure after arrival, for a stay of no more than 31 nights.'); return; }
    if (!arrival && !message) { setModificationError('Enter requested dates or describe the change.'); return; }
    modifyFlight.current = true; setIsRequestingModification(true); setModificationError('');
    try {
      if (!booking.guestEmail) throw new Error('Guest email unavailable');
      const result = await graphqlClient.request<{ requestBookingModification: { id: string; status: string; }; }>(REQUEST_BOOKING_MODIFICATION, { bookingId: booking.id, guestEmail: booking.guestEmail, requestedCheckInDate: modificationDateToIso(arrival), requestedCheckOutDate: modificationDateToIso(departure), message: message || null });
      if (!result.requestBookingModification?.id) throw new Error('Missing request acknowledgement');
      setModificationSuccess(`Change request recorded (${result.requestBookingModification.status.replaceAll('_', ' ')}). Your current reservation dates remain in effect until the property confirms a change.`);
      setShowModifyDialog(false); setModificationForm({ requestedCheckInDate: '', requestedCheckOutDate: '', message: '' });
    } catch { setModificationError('We could not confirm the change request. Your stay has not been shown as changed. Contact the property to check whether the request was received before submitting it again.'); }
    finally { modifyFlight.current = false; setIsRequestingModification(false); }
  }
  async function handleCancelBooking() {
    if (!booking || cancelFlight.current || quoteLoading || !cancellationQuote?.canCancel) return;
    cancelFlight.current = true; setIsCancelling(true); setCancelError('');
    try {
      const payload = { bookingId: booking.id, refundReason: 'Guest requested cancellation' };
      const attempt = await operationAttempt('cancel-booking', payload);
      const result = await graphqlClient.request<{ cancelBooking: Booking; }>(CANCEL_BOOKING, { ...payload, idempotencyKey: attempt.key });
      if (!result.cancelBooking?.status) throw new Error('Missing cancellation acknowledgement');
      setBooking(previous => previous ? { ...previous, status: result.cancelBooking.status, paymentStatus: result.cancelBooking.paymentStatus } : previous);
      attempt.complete(); setShowCancelDialog(false); setCancellationQuote(null); setRevision(value => value + 1);
      await refreshBooking();
    } catch { setCancelError('Cancellation could not be confirmed. Retry this request or refresh your reservation to check its status. Contact the property if it remains unclear.'); }
    finally { cancelFlight.current = false; setIsCancelling(false); }
  }
  if (loading) return <main className="lodging-container py-16" aria-busy="true">
    <p role="status" className="mb-6">Loading your private reservation…</p>
    <Skeleton className="h-48 w-full" />
    <Skeleton className="mt-6 h-48 w-full" />
  </main>;
  if (!booking) return <main className="lodging-container py-16">
    <div className="max-w-2xl">
      <p className="lodging-eyebrow mb-3">Your reservation</p>
      <h1 className="lodging-display">Let’s find your stay.</h1>
      <p role="alert" className="lodging-lead mt-6">{error || safeGuestWorkflowFailure('booking')} Verify your reservation again with its confirmation number and booking email.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/bookings/lookup" className="lodging-button">Verify reservation</Link>
        <button className="lodging-button-ghost" onClick={refreshBooking} disabled={refreshing}>{refreshing ? 'Checking…' : 'Try again'}</button>
        <Link href="/contact" className="lodging-button-ghost">Get help</Link>
      </div>
    </div>
  </main>;
  const presentation = reservationPresentation(booking.status, booking.refundPendingMinor);
  const canRequest = ['pending', 'confirmed'].includes(booking.status);
  const activeStay = ['confirmed', 'checked_in'].includes(booking.status);
  const portalStyle = storefrontAccentCssVariables(identity.accentPreset) as React.CSSProperties;
  return <main className="lodging-container py-12 md:py-16">
    <div className="max-w-5xl mx-auto">
      <Link href="/account" className="lodging-link print:hidden">← Verified stays</Link>
      <header className="hotel-page-head mt-8">
        <p className="lodging-eyebrow">{presentation.label}</p>
        <h1 className="lodging-display">{presentation.title}</h1>
        <p className="lodging-lead">{presentation.copy}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="lodging-pill">Reference {booking.confirmationNumber}</span>
          <span className="lodging-pill">Payment: {booking.paymentStatus?.replaceAll('_', ' ') || 'not available'}</span>
          <button type="button" onClick={refreshBooking} disabled={refreshing} className="lodging-button-ghost print:hidden">{refreshing ? 'Refreshing…' : 'Refresh status'}</button>
        </div>
      </header>
      {error && <p role="alert" className="hotel-notice my-5">{error} The details below are from the last successful refresh.</p>}
      <nav aria-label="Reservation sections" className="hotel-subnav print:hidden">
        <a href="#stay">Your stay</a>
        <a href="#statement">Statement</a>
        <a href="#manage">Manage</a>
        <a href="#arrival">Arrival & help</a>
      </nav>
      {booking.status === 'pending' && <div className="hotel-notice my-6">
        <h2 className="lodging-title mb-3">Still awaiting confirmation</h2>
        <p className="mb-4">Room availability and payment must be checked again by the reservation service. If you already paid, review the statement and refresh before retrying payment.</p>
        <Link href={`/book?bookingId=${encodeURIComponent(booking.id)}`} className="lodging-button-ghost">Review existing booking payment</Link>
      </div>}
      {booking.status === 'confirmed' && typeof booking.balanceDue === 'number' && booking.balanceDue > 0 && <div className="hotel-notice my-6 print:hidden">
        <h2 className="lodging-title mb-3">A balance remains on this reservation.</h2>
        <p className="mb-4">The reservation currently shows {bookingAmount(booking.balanceDueMinor, booking.balanceDue, booking.currencyCode)} remaining. Review the statement, then check the current collectible amount before continuing payment.</p>
        <Link href={`/book?bookingId=${encodeURIComponent(booking.id)}`} className="lodging-button-ghost">Check current payment amount</Link>
      </div>}
      <section id="stay" className="border-b border-[var(--lodging-rule)] py-10 scroll-mt-28">
        <p className="lodging-eyebrow mb-3">The essentials</p>
        <h2 className="lodging-headline mb-8">Your dates, your room.</h2>
        <div className="grid gap-8 md:grid-cols-2">
          <dl className="grid gap-6 sm:grid-cols-2">
            <DetailRow label="Arrival">{formatStayDate(booking.checkInDate)}</DetailRow>
            <DetailRow label="Departure">{formatStayDate(booking.checkOutDate)}</DetailRow>
            <DetailRow label="Length of stay">{booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}</DetailRow>
            <DetailRow label="Party">{booking.numberOfAdults} {booking.numberOfAdults === 1 ? 'adult' : 'adults'}{booking.numberOfChildren ? `, ${booking.numberOfChildren} ${booking.numberOfChildren === 1 ? 'child' : 'children'}` : ''}</DetailRow>
            <DetailRow label="Guest">{booking.guestName}</DetailRow>
            <DetailRow label="Booking contact">
              <span className="break-words">{booking.guestEmail || 'Held by the property'}</span>{booking.guestPhone && <span className="block">{booking.guestPhone}</span>}</DetailRow>
          </dl>
          <div className="space-y-5">{booking.roomAssignments?.length ? booking.roomAssignments.map(assignment => <article key={assignment.id} className="lodging-surface overflow-hidden">
            <img src={primaryRoomImage(assignment.roomType)} alt={assignment.roomType?.roomImages?.[0]?.altText || assignment.roomType?.name || 'Reserved accommodation'} className="aspect-[16/9] w-full object-cover" />
            <div className="p-5">
              <h3 className="lodging-title">{assignment.roomType?.name || 'Accommodation'}</h3>{assignment.roomNumber && <p className="mt-2 text-sm">Room {assignment.roomNumber}</p>}</div>
          </article>) : <p className="hotel-notice">Room assignment details are not available. Contact the property for help.</p>}</div>
        </div>{booking.specialRequests && <div className="mt-8 border-t border-[var(--lodging-rule)] pt-6">
          <h3 className="lodging-title mb-3">Your requests</h3>
          <p className="whitespace-pre-wrap break-words">{booking.specialRequests}</p>
          <p className="text-sm mt-3">Requests are subject to confirmation by the property.</p>
        </div>}</section>
      <section className="py-8">
        {booking.bookedStayTerms ? <BookedStayTermsPanel terms={booking.bookedStayTerms} /> : <section aria-label="Recorded booking amounts" className="lodging-surface space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="lodging-title">Recorded booking total</h2>
            <p className="lodging-headline">{bookingAmount(booking.totalAmountMinor, booking.totalAmount, booking.currencyCode)}</p>
          </div>
          <p className="text-sm leading-6">The original rate breakdown is unavailable. These amounts come from the saved booking record, not a current quote; payments and the current balance are shown separately.</p>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {(booking.roomRateMinor != null || booking.roomRate != null) && <div><dt className="inline">Recorded room subtotal: </dt><dd className="inline">{bookingAmount(booking.roomRateMinor, booking.roomRate, booking.currencyCode)}</dd></div>}
            {(booking.taxAmountMinor != null || booking.taxAmount != null) && <div><dt className="inline">Recorded taxes: </dt><dd className="inline">{bookingAmount(booking.taxAmountMinor, booking.taxAmount, booking.currencyCode)}</dd></div>}
            {(booking.feesAmountMinor != null || booking.feesAmount != null) && <div><dt className="inline">Recorded fees: </dt><dd className="inline">{bookingAmount(booking.feesAmountMinor, booking.feesAmount, booking.currencyCode)}</dd></div>}
          </dl>
        </section>}
      </section>
      <GuestFolioPanel bookingId={booking.id} refreshKey={revision} />
      <section id="manage" className="border-t border-[var(--lodging-rule)] py-10 scroll-mt-28 print:hidden">
        <p className="lodging-eyebrow mb-3">Trip tools</p>
        <h2 className="lodging-headline mb-6">Make a plan. Keep it close.</h2>{modificationSuccess && <p role="status" className="hotel-notice mb-6">{modificationSuccess}</p>}<div className="flex flex-wrap gap-3">
          <button type="button" className="lodging-button-ghost" onClick={() => window.print()}>Print stay details</button>{activeStay && <button type="button" className="lodging-button-ghost" onClick={() => generateCalendarFile(booking, identity)}>Add to calendar</button>}
          {canRequest && <>
            <Dialog open={showModifyDialog} onOpenChange={open => { if (modifyFlight.current) return; setShowModifyDialog(open); if (open) setModificationError(''); }}>
              <DialogTrigger asChild>
                <button type="button" className="lodging-button-ghost">Request a change</button>
              </DialogTrigger>
              <DialogContent className="hotel-storefront max-h-[90dvh] overflow-y-auto rounded-none border-[var(--lodging-rule)] bg-[var(--lodging-paper)]" style={portalStyle}>
                <DialogHeader>
                  <DialogTitle className="lodging-title">Request a stay change</DialogTitle>
                  <DialogDescription>The property reviews your request against availability and rate terms. Your current dates remain in effect until a change is confirmed.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleRequestModification} className="space-y-5">
                  <fieldset disabled={isRequestingModification} className="space-y-5">
                    <legend className="sr-only">Requested change</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="requestedCheckInDate" className="lodging-label">Requested arrival</label>
                        <input id="requestedCheckInDate" type="date" value={modificationForm.requestedCheckInDate} onChange={event => setModificationForm(previous => ({ ...previous, requestedCheckInDate: event.target.value }))} className="lodging-input mt-2" />
                      </div>
                      <div>
                        <label htmlFor="requestedCheckOutDate" className="lodging-label">Requested departure</label>
                        <input id="requestedCheckOutDate" type="date" value={modificationForm.requestedCheckOutDate} onChange={event => setModificationForm(previous => ({ ...previous, requestedCheckOutDate: event.target.value }))} className="lodging-input mt-2" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="modificationMessage" className="lodging-label">What would you like to change?</label>
                      <textarea id="modificationMessage" rows={4} maxLength={4000} value={modificationForm.message} onChange={event => setModificationForm(previous => ({ ...previous, message: event.target.value }))} className="lodging-textarea mt-2" />
                    </div>
                  </fieldset>{modificationError && <p role="alert" className="hotel-notice">{modificationError}</p>}<div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={isRequestingModification} className="lodging-button">{isRequestingModification ? 'Sending request…' : 'Send change request'}</button>
                    <button type="button" disabled={isRequestingModification} onClick={() => setShowModifyDialog(false)} className="lodging-button-ghost">Close</button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={showCancelDialog} onOpenChange={open => { if (cancelFlight.current) return; setShowCancelDialog(open); if (open) void loadCancellationQuote(); }}>
              <DialogTrigger asChild>
                <button type="button" className="lodging-button-ghost">Review cancellation</button>
              </DialogTrigger>
              <DialogContent className="hotel-storefront max-h-[90dvh] overflow-y-auto rounded-none border-[var(--lodging-rule)] bg-[var(--lodging-paper)]" style={portalStyle}>
                <DialogHeader>
                  <DialogTitle className="lodging-title">Review before cancelling</DialogTitle>
                  <DialogDescription>These are the current terms for this reservation. A cancellation may leave a fee or balance due. A refund is complete only after settlement is recorded.</DialogDescription>
                </DialogHeader>{quoteLoading ? <p role="status">Checking your cancellation terms…</p> : cancellationQuote ? <div className="space-y-4">
                  <p>{cancellationQuote.summary}</p>
                  {cancellationQuote.fullRefundDeadline && Number.isFinite(Date.parse(cancellationQuote.fullRefundDeadline)) && <p className="text-sm">
                    <strong>Full-refund deadline:</strong> <time dateTime={cancellationQuote.fullRefundDeadline}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(cancellationQuote.fullRefundDeadline))}</time>. The deadline above is shown in UTC.</p>}
                  <dl className="lodging-surface p-4 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Estimated refund</dt>
                      <dd>{money(cancellationQuote.refundableMinor, cancellationQuote.currencyCode)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Cancellation fee</dt>
                      <dd>{money(cancellationQuote.cancellationFeeMinor, cancellationQuote.currencyCode)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Captured payments</dt>
                      <dd>{money(cancellationQuote.capturedMinor, cancellationQuote.currencyCode)}</dd>
                    </div>
                  </dl>{!cancellationQuote.canCancel && <p className="hotel-notice">Online cancellation is not available for the current reservation state. Contact the property for help.</p>}</div> : null}{cancelError && <p role="alert" className="hotel-notice">{cancelError}</p>}{!cancellationQuote && !quoteLoading && <button type="button" className="lodging-button-ghost" onClick={loadCancellationQuote}>Retry policy check</button>}<div className="flex flex-wrap gap-3">
                  <button type="button" className="lodging-button-ghost" disabled={isCancelling} onClick={() => setShowCancelDialog(false)}>Keep reservation</button>
                  <button type="button" className="lodging-button" disabled={isCancelling || quoteLoading || !cancellationQuote?.canCancel} onClick={handleCancelBooking}>{isCancelling ? 'Processing request…' : 'Confirm cancellation'}</button>
                </div>
              </DialogContent>
            </Dialog>
          </>}
          <Link href="/contact?subject=modification" className="lodging-button-ghost">Ask the property</Link>
        </div>
        <p className="mt-6 text-sm leading-6">{canRequest ? 'A change request does not alter your booking immediately. Review cancellation terms separately before making a final decision.' : 'For this reservation status, contact the property about changes or arrival arrangements.'}</p>
      </section>
      {Boolean(booking.refundPendingMinor) && <div role="status" className="hotel-notice mb-8">Refund awaiting settlement: {bookingAmount(booking.refundPendingMinor, null, booking.currencyCode)}. This amount has not yet been recorded as a completed refund. Check your statement or contact the property.</div>}
      <div className="space-y-6 py-6 print:hidden">
        <LoyaltyPanel bookingId={booking.id} />
        <SecurityAuthorizationPanel bookingId={booking.id} />
      </div>
      <section id="arrival" className="grid gap-8 border-t border-[var(--lodging-rule)] py-10 md:grid-cols-2 scroll-mt-28">
        <div>
          <p className="lodging-eyebrow mb-3">Arrival & help</p>
          <h2 className="lodging-headline mb-5">{identity.name}</h2>{identity.address.line1 && <p>{identity.address.line1}<br />{identity.address.line2}</p>}<div className="mt-4 space-y-3">{identity.phone && <p>
            <a href={`tel:${identity.phone.replace(/[^+\d]/g, '')}`} className="lodging-link">{identity.phone}</a>
          </p>}{identity.email && <p className="break-words">
            <a href={`mailto:${identity.email}`} className="lodging-link">{identity.email}</a>
          </p>}</div>
          <Link href="/location" className="lodging-button-ghost mt-5 print:hidden">Plan your arrival</Link>
        </div>
        <div className="space-y-5">
          <h3 className="lodging-title">Before you arrive</h3>
          <p>Published arrival time: {identity.checkIn}. Departure: {identity.checkOut}. Contact the property to confirm special arrangements.</p>{identity.hours && <p>{identity.hours}</p>}<p className="text-sm">The property’s current guidance is shown here. For terms specific to your reservation, contact the team with reference {booking.confirmationNumber}.</p>
          <Link href="/policies" className="lodging-link print:hidden">Read about rates and policies</Link>
        </div>
      </section>
      <p className="border-t border-[var(--lodging-rule)] pt-6 text-sm text-[var(--lodging-ink-muted)]">Confirmation email delivery: {booking.confirmationDeliveryStatus?.replaceAll('_', ' ') || 'not recorded'}. Email delivery does not determine your reservation or payment status.</p>
    </div>
  </main>;
}
