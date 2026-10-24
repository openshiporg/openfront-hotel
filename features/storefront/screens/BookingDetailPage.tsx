'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, CalendarPlus, CalendarX2, Check, Copy, CreditCard, KeyRound, Mail, MapPin, MessageCircle, Moon, PenLine, Phone, Printer, RefreshCw, X } from 'lucide-react';
import { formatStayDate, stayCalendar } from '../lib/stay-calendar';
import { GuestFolioPanel } from '../components/GuestFolioPanel';
import { SecurityAuthorizationPanel } from '../components/security-authorization/SecurityAuthorizationPanel';
import { GuestLoyaltyPanel } from '../components/GuestLoyaltyPanel';

import { graphqlClient } from '@/lib/graphql-client';
import { CANCEL_BOOKING, GET_GUEST_BOOKING } from '@/lib/queries';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import { useGuestAccount } from '@/features/storefront/components/GuestAccountProvider';
import type { HotelIdentity } from '@/features/storefront/lib/hotel-settings';
import { operationAttempt } from '@/lib/operationAttempt';
import { calendarDay, stayNights, reservationPresentation, money, paymentStatusLabel } from '../lib/stay-context';
import { BookedStayTermsPanel } from '../components/BookedStayTermsPanel';
import type { StayPriceSummary } from '@/lib/types';
import { modificationDateToIso, safeGuestWorkflowFailure } from '@/features/storefront/lib/qa-workflows';
import { useScrollSpy } from '../lib/use-scroll-spy';
import { Notice, Skeleton, StatePanel } from '../components/ui';
import { StayPicker } from '../components/stay/StayCalendar';
import { propertyToday } from '../lib/calendar';

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
  changeRequest?: GuestChangeRequest | null;
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

interface GuestChangeRequest {
  id: string;
  status: 'pending' | 'approved' | 'declined' | string;
  requestedCheckInDate?: string | null;
  requestedCheckOutDate?: string | null;
  guestMessage?: string | null;
  propertyNote?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
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
      changeRequest { id status requestedCheckInDate requestedCheckOutDate guestMessage propertyNote createdAt resolvedAt }
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

const SECTIONS = [['stay', 'Your stay'], ['statement', 'Statement'], ['manage', 'Manage'], ['arrival', 'Arrival & help']] as const;

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

function statusTone(status: string) {
  if (status === 'confirmed' || status === 'checked_in') return 'sf-badge--success';
  if (status === 'pending' || status === 'cancellation_pending') return 'sf-badge--warn';
  if (status === 'cancelled' || status === 'no_show') return 'sf-badge--danger';
  return '';
}

function CopyReference({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return <span className="sf-code"><span aria-label="Confirmation number">{value}</span>
    <button type="button" className="sf-noprint" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => undefined); }}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  </span>;
}

export default function BookingDetailPage() {
  const identity = useHotelSettings();
  const { account } = useGuestAccount();
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
  const active = useScrollSpy(SECTIONS.map(([id]) => id), Boolean(booking));
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
      const result = await graphqlClient.request<{ requestBookingModification: { id: string; changeRequest?: GuestChangeRequest | null; }; }>(REQUEST_BOOKING_MODIFICATION, { bookingId: booking.id, guestEmail: booking.guestEmail, requestedCheckInDate: modificationDateToIso(arrival), requestedCheckOutDate: modificationDateToIso(departure), message: message || null });
      const request = result.requestBookingModification?.changeRequest;
      if (!request?.id) throw new Error('Missing request acknowledgement');
      setBooking(previous => previous ? { ...previous, changeRequest: request } : previous);
      setModificationSuccess('Change request sent for property review. Your current dates stay in effect until the property confirms a change.');
      setShowModifyDialog(false); setModificationForm({ requestedCheckInDate: '', requestedCheckOutDate: '', message: '' });
      void refreshBooking();
    } catch {
      void refreshBooking();
      setModificationError('We could not confirm the change request. Your stay has not been shown as changed. Contact the property to check whether the request was received before submitting it again.');
    }
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
  if (loading) return <div className="sf-wrap sf-section--tight" role="status" aria-label="Loading your private reservation">
    <Skeleton height={14} width={140} /><div style={{ height: 24 }} />
    <Skeleton height={360} radius={22} /><div style={{ height: 24 }} /><Skeleton height={200} radius={22} />
  </div>;
  if (!booking) return <StatePanel role="alert" icon={KeyRound} eyebrow="Your reservation" title="Let’s find your stay."
    actions={<><Link href="/bookings/lookup" className="sf-btn">Verify reservation</Link><button type="button" className="sf-btn sf-btn--ghost" onClick={refreshBooking} disabled={refreshing}><RefreshCw aria-hidden="true" />{refreshing ? 'Checking…' : 'Try again'}</button><Link href="/contact" className="sf-link">Get help</Link></>}>
    {error || safeGuestWorkflowFailure('booking')} Verify your reservation again with its confirmation number and booking email.
  </StatePanel>;
  const presentation = reservationPresentation(booking.status, booking.refundPendingMinor);
  const canRequest = ['pending', 'confirmed'].includes(booking.status);
  const changePending = booking.changeRequest?.status === 'pending';
  const activeStay = ['confirmed', 'checked_in'].includes(booking.status);
  const assignment = booking.roomAssignments?.[0];
  const phone = identity.phone.replace(/[^+\d]/g, '');
  const partyLabel = `${booking.numberOfAdults} ${booking.numberOfAdults === 1 ? 'adult' : 'adults'}${booking.numberOfChildren ? `, ${booking.numberOfChildren} ${booking.numberOfChildren === 1 ? 'child' : 'children'}` : ''}`;
  return <div className="sf-wrap" style={{ paddingBottom: 'clamp(56px, 8vw, 96px)' }}>
    <div className="sf-pagehead" style={{ paddingBottom: 24 }}>
      {account ? <Link href="/account" className="sf-link sf-link--back sf-noprint"><ArrowLeft aria-hidden="true" />Your stays</Link>
        : <Link href="/bookings/lookup" className="sf-link sf-link--back sf-noprint"><ArrowLeft aria-hidden="true" />Find a reservation</Link>}
    </div>

    <article className="sf-card sf-pass" aria-labelledby="reservation-title">
      <div className="sf-pass__info">
        <div className="sf-row" style={{ justifyContent: 'space-between' }}>
          <span className={`sf-badge sf-badge--dot ${statusTone(booking.status)}`}>{presentation.label}</span>
          <button type="button" onClick={refreshBooking} disabled={refreshing} className="sf-btn sf-btn--ghost sf-btn--sm sf-noprint"><RefreshCw aria-hidden="true" className={refreshing ? 'sf-spinner' : undefined} />{refreshing ? 'Refreshing…' : 'Refresh status'}</button>
        </div>
        <div className="sf-stack" style={{ '--stack': '12px' } as React.CSSProperties}>
          <h1 id="reservation-title" className="sf-h1">{presentation.title}</h1>
          <p className="sf-lead">{presentation.copy}</p>
        </div>
        <div className="sf-pass__dates">
          <div className="sf-pass__date"><small>Arrival</small><b>{formatStayDate(booking.checkInDate, { month: 'short', day: 'numeric' })}</b><span>{formatStayDate(booking.checkInDate, { weekday: 'long' })} · from {identity.checkIn}</span></div>
          <div className="sf-pass__nights"><span><Moon aria-hidden="true" style={{ width: 14, display: 'inline', verticalAlign: '-2px' }} /> {booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}</span></div>
          <div className="sf-pass__date"><small>Departure</small><b>{formatStayDate(booking.checkOutDate, { month: 'short', day: 'numeric' })}</b><span>{formatStayDate(booking.checkOutDate, { weekday: 'long' })} · by {identity.checkOut}</span></div>
        </div>
        <div className="sf-row" style={{ gap: 10 }}>
          <CopyReference value={booking.confirmationNumber} />
          <span className="sf-badge"><CreditCard aria-hidden="true" />Payment: {paymentStatusLabel(booking.paymentStatus, booking.refundPendingMinor) || 'not available'}</span>
        </div>
      </div>
      <div className="sf-pass__media">
        <img src={primaryRoomImage(assignment?.roomType)} alt={assignment?.roomType?.roomImages?.[0]?.altText || assignment?.roomType?.name || 'Reserved accommodation'} />
        <div className="sf-media__badges" style={{ top: 'auto', bottom: 16 }}><span className="sf-badge sf-badge--onphoto">{assignment?.roomType?.name || 'Accommodation'}{assignment?.roomNumber ? ` · Room ${assignment.roomNumber}` : ''}</span></div>
      </div>
    </article>

    <div className="sf-stack" style={{ '--stack': '12px', marginTop: 20 } as React.CSSProperties}>
      {error && <Notice tone="warn" role="alert">{error} The details below are from the last successful refresh.</Notice>}
      {booking.status === 'pending' && <Notice tone="warn" title="Still awaiting confirmation">
        <p>Room availability and payment must be checked again by the reservation service. If you already paid, review the statement and refresh before retrying payment.</p>
        <div className="sf-row"><Link href={`/book?bookingId=${encodeURIComponent(booking.id)}`} className="sf-btn sf-btn--sm">Review existing booking payment</Link></div>
      </Notice>}
      {booking.status === 'confirmed' && typeof booking.balanceDue === 'number' && booking.balanceDue > 0 && <Notice tone="accent" title="A balance remains on this reservation." className="sf-noprint">
        <p>The reservation currently shows {bookingAmount(booking.balanceDueMinor, booking.balanceDue, booking.currencyCode)} remaining. Review the statement, then check the current collectible amount before continuing payment.</p>
        <div className="sf-row"><Link href={`/book?bookingId=${encodeURIComponent(booking.id)}`} className="sf-btn sf-btn--sm sf-btn--ghost">Check current payment amount</Link></div>
      </Notice>}
      {Boolean(booking.refundPendingMinor) && <Notice tone="info" role="status" title="Refund awaiting settlement">{bookingAmount(booking.refundPendingMinor, null, booking.currencyCode)} has not yet been recorded as a completed refund. Check your statement or contact the property.</Notice>}
      {booking.changeRequest && !['cancelled', 'cancellation_pending', 'no_show'].includes(booking.status) && <ChangeRequestNotice request={booking.changeRequest} />}
      {!account && <Notice tone="accent" title="Keep this stay in a guest account" className="sf-noprint">
        <p>Create an account with {booking.guestEmail ? 'this reservation’s email' : 'your booking email'} and this stay is added to it, along with your future bookings.</p>
        <div className="sf-row">
          <Link href={`/account?mode=create&next=${encodeURIComponent(`/booking/${booking.id}`)}${booking.guestEmail ? `&email=${encodeURIComponent(booking.guestEmail)}` : ''}`} className="sf-btn sf-btn--sm">Create an account</Link>
          <Link href={`/account?next=${encodeURIComponent(`/booking/${booking.id}`)}${booking.guestEmail ? `&email=${encodeURIComponent(booking.guestEmail)}` : ''}`} className="sf-link">Sign in</Link>
        </div>
      </Notice>}
    </div>

    <nav aria-label="Reservation sections" className="sf-tabs sf-noprint" style={{ marginTop: 28, marginInline: 'calc(var(--sf-gutter) * -1)', paddingInline: 'var(--sf-gutter)' }}>
      <div className="sf-tabs__row">{SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined}>{label}</a>)}</div>
    </nav>

    <div className="sf-reservation" style={{ paddingTop: 32 }}>
      <div style={{ minWidth: 0 }}>
        <section id="stay" className="sf-block">
          <div className="sf-block__head"><p className="sf-eyebrow">The essentials</p><h2 className="sf-h2">Your dates, <em>your room.</em></h2></div>
          <dl className="sf-dl">
            <div><dt>Arrival</dt><dd>{formatStayDate(booking.checkInDate)}</dd></div>
            <div><dt>Departure</dt><dd>{formatStayDate(booking.checkOutDate)}</dd></div>
            <div><dt>Length of stay</dt><dd>{booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}</dd></div>
            <div><dt>Party</dt><dd>{partyLabel}</dd></div>
            <div><dt>Guest</dt><dd>{booking.guestName}</dd></div>
            <div><dt>Booking contact</dt><dd style={{ overflowWrap: 'anywhere' }}>{booking.guestEmail || 'Held by the property'}{booking.guestPhone && <span style={{ display: 'block', fontWeight: 400 }}>{booking.guestPhone}</span>}</dd></div>
            {booking.roomAssignments?.length ? booking.roomAssignments.map(item => <div key={item.id}><dt>Accommodation</dt><dd>{item.roomType?.name || 'Accommodation'}{item.roomNumber && <span style={{ display: 'block', fontWeight: 400 }}>Room {item.roomNumber}</span>}</dd></div>)
              : <div><dt>Accommodation</dt><dd style={{ fontWeight: 400 }}>Room assignment details are not available. Contact the property for help.</dd></div>}
          </dl>
          {booking.specialRequests && <div className="sf-panel sf-pad" style={{ marginTop: 22 }}>
            <h3 className="sf-h4">Your requests</h3>
            <p className="sf-muted" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{booking.specialRequests}</p>
            <p className="sf-fine" style={{ marginTop: 10 }}>Requests are subject to confirmation by the property.</p>
          </div>}
          <div style={{ marginTop: 28 }}>
            {booking.bookedStayTerms ? <BookedStayTermsPanel terms={booking.bookedStayTerms} /> : <section aria-label="Recorded booking amounts" className="sf-card sf-pad">
              <div className="sf-bill__total" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}><b>Recorded booking total<small>From the saved booking record, not a current quote</small></b><span className="sf-amount">{bookingAmount(booking.totalAmountMinor, booking.totalAmount, booking.currencyCode)}</span></div>
              <p className="sf-fine" style={{ marginTop: 12 }}>The original rate breakdown is unavailable. Payments and the current balance are shown separately.</p>
              <div className="sf-bill" style={{ marginTop: 10 }}>
                {(booking.roomRateMinor != null || booking.roomRate != null) && <div className="sf-bill__row"><span>Recorded room subtotal</span><span>{bookingAmount(booking.roomRateMinor, booking.roomRate, booking.currencyCode)}</span></div>}
                {(booking.taxAmountMinor != null || booking.taxAmount != null) && <div className="sf-bill__row"><span>Recorded taxes</span><span>{bookingAmount(booking.taxAmountMinor, booking.taxAmount, booking.currencyCode)}</span></div>}
                {(booking.feesAmountMinor != null || booking.feesAmount != null) && <div className="sf-bill__row"><span>Recorded fees</span><span>{bookingAmount(booking.feesAmountMinor, booking.feesAmount, booking.currencyCode)}</span></div>}
              </div>
            </section>}
          </div>
        </section>

        <GuestFolioPanel bookingId={booking.id} refreshKey={revision} />

        <section id="manage" className="sf-block sf-noprint">
          <div className="sf-block__head"><p className="sf-eyebrow">Trip tools</p><h2 className="sf-h2">Make a plan. <em>Keep it close.</em></h2></div>
          {modificationSuccess && <Notice tone="success" role="status" className="sf-noprint">{modificationSuccess}</Notice>}
          <div className="sf-actions">
            <button type="button" className="sf-action" onClick={() => window.print()}><Printer aria-hidden="true" /><span>Print stay details<small>Reservation and statement</small></span></button>
            {activeStay && <button type="button" className="sf-action" onClick={() => generateCalendarFile(booking, identity)}><CalendarPlus aria-hidden="true" /><span>Add to calendar<small>Download an .ics file</small></span></button>}
            {canRequest && <>
              {changePending ? <div className="sf-action" aria-disabled="true"><PenLine aria-hidden="true" /><span>Change request pending<small>Waiting for the property to review</small></span></div> : <Dialog.Root open={showModifyDialog} onOpenChange={open => { if (modifyFlight.current) return; setShowModifyDialog(open); if (open) setModificationError(''); }}>
                <Dialog.Trigger asChild><button type="button" className="sf-action"><PenLine aria-hidden="true" /><span>Request a change<small>Reviewed by the property</small></span></button></Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="sf-overlay" />
                  <Dialog.Content className="sf-dialog sf-portal">
                    <div className="sf-dialog__head">
                      <div><Dialog.Title className="sf-h3">Request a stay change</Dialog.Title><Dialog.Description>The property reviews your request against availability and rate terms. Your current dates remain in effect until a change is confirmed.</Dialog.Description></div>
                      <Dialog.Close className="sf-iconbtn" aria-label="Close" disabled={isRequestingModification}><X aria-hidden="true" /></Dialog.Close>
                    </div>
                    <form onSubmit={handleRequestModification} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
                      <fieldset disabled={isRequestingModification} className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
                        <legend className="sf-sr">Requested change</legend>
                        <div className="sf-field">
                          <span className="sf-label">Requested dates <small>(optional)</small></span>
                          <div className="sf-stay-frame">
                            <StayPicker labels={{ checkIn: 'Arrival', checkOut: 'Departure' }} checkIn={modificationForm.requestedCheckInDate} checkOut={modificationForm.requestedCheckOutDate} today={propertyToday(identity.timeZone)}
                              onChange={range => setModificationForm(previous => ({ ...previous, requestedCheckInDate: range.checkIn, requestedCheckOutDate: range.checkOut }))} />
                          </div>
                        </div>
                        <label className="sf-field" htmlFor="modificationMessage"><span className="sf-label">What would you like to change?</span><textarea id="modificationMessage" rows={4} maxLength={4000} value={modificationForm.message} onChange={event => setModificationForm(previous => ({ ...previous, message: event.target.value }))} className="sf-textarea" /></label>
                      </fieldset>
                      {modificationError && <Notice tone="danger" role="alert">{modificationError}</Notice>}
                      <div className="sf-row">
                        <button type="submit" disabled={isRequestingModification} className="sf-btn">{isRequestingModification ? 'Sending request…' : 'Send change request'}</button>
                        <button type="button" disabled={isRequestingModification} onClick={() => setShowModifyDialog(false)} className="sf-btn sf-btn--ghost">Close</button>
                      </div>
                    </form>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>}
              <Dialog.Root open={showCancelDialog} onOpenChange={open => { if (cancelFlight.current) return; setShowCancelDialog(open); if (open) void loadCancellationQuote(); }}>
                <Dialog.Trigger asChild><button type="button" className="sf-action sf-action--danger"><CalendarX2 aria-hidden="true" /><span>Review cancellation<small>See the current terms first</small></span></button></Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="sf-overlay" />
                  <Dialog.Content className="sf-dialog sf-portal">
                    <div className="sf-dialog__head">
                      <div><Dialog.Title className="sf-h3">Review before cancelling</Dialog.Title><Dialog.Description>These are the current terms for this reservation. A cancellation may leave a fee or balance due. A refund is complete only after settlement is recorded.</Dialog.Description></div>
                      <Dialog.Close className="sf-iconbtn" aria-label="Close" disabled={isCancelling}><X aria-hidden="true" /></Dialog.Close>
                    </div>
                    <div className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
                      {quoteLoading ? <div role="status" aria-label="Checking your cancellation terms" className="sf-stack"><Skeleton height={18} /><Skeleton height={110} radius={14} /></div> : cancellationQuote ? <>
                        <p>{cancellationQuote.summary}</p>
                        {cancellationQuote.fullRefundDeadline && Number.isFinite(Date.parse(cancellationQuote.fullRefundDeadline)) && <p className="sf-small sf-muted"><b>Full-refund deadline:</b> <time dateTime={cancellationQuote.fullRefundDeadline}>{propertyDeadline(cancellationQuote.fullRefundDeadline, identity.timeZone)}</time>.</p>}
                        <dl className="sf-dl sf-panel" style={{ padding: '4px 18px' }}>
                          <div><dt>Estimated refund</dt><dd>{money(cancellationQuote.refundableMinor, cancellationQuote.currencyCode)}</dd></div>
                          <div><dt>Cancellation fee</dt><dd>{money(cancellationQuote.cancellationFeeMinor, cancellationQuote.currencyCode)}</dd></div>
                          <div><dt>Captured payments</dt><dd>{money(cancellationQuote.capturedMinor, cancellationQuote.currencyCode)}</dd></div>
                        </dl>
                        {!cancellationQuote.canCancel && <Notice tone="warn">Online cancellation is not available for the current reservation state. Contact the property for help.</Notice>}
                      </> : null}
                      {cancelError && <Notice tone="danger" role="alert">{cancelError}</Notice>}
                      {!cancellationQuote && !quoteLoading && <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" onClick={loadCancellationQuote}><RefreshCw aria-hidden="true" />Retry policy check</button>}
                      <div className="sf-row">
                        <button type="button" className="sf-btn sf-btn--ghost" disabled={isCancelling} onClick={() => setShowCancelDialog(false)}>Keep reservation</button>
                        <button type="button" className="sf-btn sf-btn--danger" disabled={isCancelling || quoteLoading || !cancellationQuote?.canCancel} onClick={handleCancelBooking}>{isCancelling ? 'Processing request…' : 'Confirm cancellation'}</button>
                      </div>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </>}
            <Link href="/contact?subject=modification" className="sf-action"><MessageCircle aria-hidden="true" /><span>Ask the property<small>Send the team a note</small></span></Link>
          </div>
          <p className="sf-fine" style={{ marginTop: 16 }}>{canRequest ? 'A change request does not alter your booking immediately. Review cancellation terms separately before making a final decision.' : 'For this reservation status, contact the property about changes or arrival arrangements.'}</p>
          <div className="sf-stack" style={{ '--stack': '14px', marginTop: 28 } as React.CSSProperties}>
            <GuestLoyaltyPanel bookingId={booking.id} />
            <SecurityAuthorizationPanel bookingId={booking.id} />
          </div>
        </section>

        <section id="arrival" className="sf-block">
          <div className="sf-block__head"><p className="sf-eyebrow">Arrival & help</p><h2 className="sf-h2">Before <em>you arrive.</em></h2></div>
          <div className="sf-times" style={{ maxWidth: 520 }}><div><small>Check-in from</small><b>{identity.checkIn}</b></div><div><small>Check-out by</small><b>{identity.checkOut}</b></div></div>
          <p className="sf-body" style={{ marginTop: 16 }}>Published arrival time: {identity.checkIn}. Departure: {identity.checkOut}. Contact the property to confirm special arrangements.</p>
          {identity.hours && <p className="sf-body" style={{ marginTop: 8 }}>{identity.hours}</p>}
          <p className="sf-fine" style={{ marginTop: 10 }}>The property’s current guidance is shown here. For terms specific to your reservation, contact the team with reference {booking.confirmationNumber}.</p>
          <div className="sf-row sf-noprint" style={{ marginTop: 16, gap: '8px 24px' }}><Link href="/location" className="sf-link">Plan your arrival</Link><Link href="/policies" className="sf-link">Read about rates and policies</Link></div>
        </section>
        <p className="sf-fine" style={{ borderTop: '1px solid var(--line)', paddingTop: 20 }}>Confirmation email delivery: {booking.confirmationDeliveryStatus?.replaceAll('_', ' ') || 'not recorded'}. Email delivery does not determine your reservation or payment status.</p>
      </div>

      <aside className="sf-reservation__aside" aria-label={`Contact ${identity.name}`}>
        <div className="sf-card sf-pad sf-stack" style={{ '--stack': '14px' } as React.CSSProperties}>
          <p className="sf-eyebrow sf-eyebrow--plain">Your hosts</p>
          <h2 className="sf-h3">{identity.name}</h2>
          {identity.address.line1 && <p className="sf-row sf-small sf-muted" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><MapPin aria-hidden="true" style={{ width: 16, flex: 'none', marginTop: 3 }} /><span>{identity.address.line1}{identity.address.line2 && <><br />{identity.address.line2}</>}</span></p>}
          {phone && <a href={`tel:${phone}`} className="sf-btn sf-btn--ghost sf-btn--block sf-noprint"><Phone aria-hidden="true" />{identity.phone}</a>}
          {identity.email && <a href={`mailto:${identity.email}`} className="sf-btn sf-btn--soft sf-btn--block sf-noprint" style={{ whiteSpace: 'normal' }}><Mail aria-hidden="true" />Email the property</a>}
          <Link href="/location" className="sf-link sf-noprint">Plan your arrival</Link>
        </div>
      </aside>
    </div>
  </div>;
}

/** A deadline instant in the property's own time zone, as the rest of the site shows times. */
function propertyDeadline(instant: string, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  try { return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone || 'UTC' }).format(new Date(instant)); }
  catch { return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(instant)); }
}

function ChangeRequestNotice({ request }: { request: GuestChangeRequest }) {
  const dates = request.requestedCheckInDate && request.requestedCheckOutDate
    ? `${formatStayDate(request.requestedCheckInDate)} to ${formatStayDate(request.requestedCheckOutDate)}`
    : null;
  const sent = request.createdAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(request.createdAt)) : null;
  if (request.status === 'pending') return <Notice tone="info" role="status" title="Change request pending review">
    <p>{dates ? `Requested dates: ${dates}.` : 'Your requested change is with the property.'}{sent ? ` Sent ${sent}.` : ''} Your current dates stay in effect until the property confirms a change.</p>
    {request.guestMessage && <p className="sf-small sf-muted" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.guestMessage}</p>}
  </Notice>;
  const approved = request.status === 'approved';
  return <Notice tone={approved ? 'success' : 'warn'} title={approved ? 'Change request approved' : 'Change request declined'}>
    <p>{approved ? `The property approved your request${dates ? ` for ${dates}` : ''}. The dates and amounts above are the updated reservation.` : 'The property could not make this change. Your reservation dates are unchanged.'}</p>
    {request.propertyNote && <p className="sf-small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Note from the property: {request.propertyNote}</p>}
  </Notice>;
}
