'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Calendar as CalendarIcon,
  Users,
  Mail,
  Phone,
  FileText,
  Printer,
  Download,
  MapPin,
  Edit,
  X as XIcon,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { graphqlClient } from '@/lib/graphql-client';
import { CANCEL_BOOKING, GET_GUEST_BOOKING } from '@/lib/queries';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import type { HotelIdentity } from '@/features/storefront/lib/hotel-settings';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  roomRate?: number;
  taxAmount?: number;
  feesAmount?: number;
  totalAmount: number;
  status: string;
  paymentStatus?: string;
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
        image?: { url?: string | null } | null;
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

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancellation_pending: 'Cancellation pending',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

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

function statusPillClass(status: string) {
  if (status === 'cancelled') return 'lodging-pill lodging-pill-danger';
  if (status === 'confirmed' || status === 'checked_in') return 'lodging-pill lodging-pill-accent';
  return 'lodging-pill';
}

function formatMoney(value?: number | null) {
  if (value === undefined || value === null) return null;
  return value.toFixed(2);
}

// Generate .ics calendar file for the stay
const generateCalendarFile = (booking: Booking, identity: HotelIdentity) => {
  const startDate = format(parseISO(booking.checkInDate), "yyyyMMdd'T'150000");
  const endDate = format(parseISO(booking.checkOutDate), "yyyyMMdd'T'110000");

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${identity.name}//Booking Confirmation//EN
BEGIN:VEVENT
UID:booking-${booking.id}@grandhotel.com
DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss")}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${identity.name} stay - ${booking.confirmationNumber}
DESCRIPTION:Booking confirmation for ${booking.guestName}.\\nConfirmation: ${booking.confirmationNumber}\\nGuests: ${booking.numberOfGuests}
LOCATION:${identity.address.line1}, ${identity.address.line2}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="lodging-eyebrow mb-1.5 text-[0.625rem]">{label}</p>
      <div className="text-[var(--lodging-ink)] leading-6">{children}</div>
    </div>
  );
}

export default function BookingDetailPage() {
  const identity = useHotelSettings();
  const params = useParams();
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [cancellationQuote, setCancellationQuote] = React.useState<CancellationQuote | null>(null);
  const [showModifyDialog, setShowModifyDialog] = React.useState(false);
  const [isRequestingModification, setIsRequestingModification] = React.useState(false);
  const [modificationError, setModificationError] = React.useState<string | null>(null);
  const [modificationSuccess, setModificationSuccess] = React.useState<string | null>(null);
  const [modificationForm, setModificationForm] = React.useState({
    requestedCheckInDate: '',
    requestedCheckOutDate: '',
    message: '',
  });

  const bookingId = params?.id as string;

  React.useEffect(() => {
    const fetchBooking = async () => {
      try {
        setLoading(true);
        const data = await graphqlClient.request<BookingResponse>(GET_GUEST_BOOKING, { bookingId });

        if (data.booking) {
          setBooking(data.booking);
          if (['pending', 'confirmed'].includes(data.booking.status)) {
            const quote = await graphqlClient.request<{ guestCancellationQuote: CancellationQuote }>(GET_CANCELLATION_QUOTE, { bookingId });
            setCancellationQuote(quote.guestCancellationQuote);
          }
          setError(null);
        } else {
          setError(safeGuestWorkflowFailure('booking'));
        }
      } catch {
        setError(safeGuestWorkflowFailure('booking'));
      } finally {
        setLoading(false);
      }
    };

    if (bookingId) {
      fetchBooking();
    }
  }, [bookingId]);

  const handlePrint = () => window.print();
  const handleCalendarDownload = () => booking && generateCalendarFile(booking, identity);

  const handleRequestModification = async () => {
    if (!booking || isRequestingModification) return;

    setIsRequestingModification(true);
    setModificationError(null);

    try {
      if (!booking.guestEmail) throw new Error('A verified booking email is required.');
      await graphqlClient.request(REQUEST_BOOKING_MODIFICATION, {
        bookingId: booking.id,
        guestEmail: booking.guestEmail,
        requestedCheckInDate: modificationDateToIso(modificationForm.requestedCheckInDate),
        requestedCheckOutDate: modificationDateToIso(modificationForm.requestedCheckOutDate),
        message: modificationForm.message.trim() || null,
      });
      setShowModifyDialog(false);
      setModificationForm({ requestedCheckInDate: '', requestedCheckOutDate: '', message: '' });
      setModificationSuccess('Your change request was sent to the front desk for review.');
    } catch (error) {
      setModificationError(
        error instanceof Error && /YYYY-MM-DD|valid calendar date/.test(error.message)
          ? error.message
          : safeGuestWorkflowFailure('modification'),
      );
    } finally {
      setIsRequestingModification(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!booking || isCancelling) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const response = await graphqlClient.request<{ cancelBooking: Booking }>(CANCEL_BOOKING, {
        bookingId: booking.id,
        refundReason: 'Guest requested cancellation',
        idempotencyKey: crypto.randomUUID(),
      });

      setBooking({
        ...booking,
        status: response.cancelBooking.status,
        paymentStatus: response.cancelBooking.paymentStatus,
      });
      setShowCancelDialog(false);
    } catch {
      setCancelError('Unable to cancel this booking. Please review the policy or contact the front desk.');
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <main className="lodging-page min-h-screen">
        <div className="lodging-container max-w-3xl py-16">
          <Skeleton className="lodging-surface mb-8 h-10 w-1/2 rounded-[var(--radius-sm)]" />
          <Skeleton className="lodging-surface mb-4 h-64 w-full rounded-[var(--radius-sm)]" />
          <Skeleton className="lodging-surface h-48 w-full rounded-[var(--radius-sm)]" />
        </div>
      </main>
    );
  }

  if (error || !booking) {
    return (
      <main className="lodging-page min-h-screen">
        <div className="lodging-container max-w-2xl py-24 text-center">
          <p className="lodging-eyebrow mb-4 text-[var(--lodging-danger)]">Reservation</p>
          <h1 className="lodging-headline mb-4">Reservation unavailable.</h1>
          <p role="alert" className="lodging-lead mx-auto mb-10 max-w-md">
            {error || safeGuestWorkflowFailure('booking')} If you have a confirmation number, use booking lookup to verify the stay again.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/bookings/lookup" className="lodging-button">Find your booking</Link>
            <Link href="/" className="lodging-button-ghost">Back to home</Link>
          </div>
        </div>
      </main>
    );
  }

  const canCancel = booking.status === 'confirmed' || booking.status === 'pending';
  const isCancelled = booking.status === 'cancelled';
  const isCancellationPending = booking.status === 'cancellation_pending';
  const roomCharges = formatMoney(booking.roomRate);
  const taxes = formatMoney(booking.taxAmount);
  const fees = formatMoney(booking.feesAmount);
  const total = formatMoney(booking.totalAmount);

  return (
    <main className="lodging-page min-h-screen">
      <div className="lodging-container max-w-3xl py-12 md:py-16">
        <Link href="/rooms" className="lodging-link inline-flex items-center gap-2 print:hidden">
          <ArrowLeft className="h-4 w-4" /> Back to rooms
        </Link>

        <header className="mt-8 border-b border-[var(--lodging-rule)] pb-8 text-center">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center border border-[var(--lodging-rule-strong)] rounded-full">
            <CheckCircle2 className="h-6 w-6 text-[var(--lodging-accent-deep)]" />
          </div>
          <p className="lodging-eyebrow mb-3 text-[var(--lodging-accent-deep)]">
            {isCancelled ? 'Reservation cancelled' : 'Reservation confirmed'}
          </p>
          <h1 className="lodging-display">
            {isCancelled ? 'Your stay is released.' : 'Your stay is reserved.'}
          </h1>
          <p className="lodging-lead mx-auto mt-5 max-w-md">
            Confirmation <span className="lodging-serif text-[var(--lodging-ink)]">{booking.confirmationNumber}</span> is saved in this secure reservation portal.
            {booking.confirmationDeliveryStatus ? ` Email delivery is ${booking.confirmationDeliveryStatus.replaceAll('_', ' ')}.` : ' Email delivery has not been recorded yet.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className={statusPillClass(booking.status)}>{STATUS_LABELS[booking.status] || booking.status}</span>
            {booking.paymentStatus ? (
              <span className="lodging-pill">{booking.paymentStatus.replace('_', ' ')}</span>
            ) : null}
          </div>
        </header>

        {/* Stay essentials */}
        <section className="border-b border-[var(--lodging-rule)] py-10">
          <div className="lodging-grid-break mb-8">
            <p className="lodging-eyebrow min-w-0 self-end">Stay essentials</p>
            <h2 className="lodging-headline min-w-0 self-end">Dates, guests, and room.</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-5">
              <DetailRow label="Check-in">
                {format(parseISO(booking.checkInDate), 'EEEE, MMMM dd, yyyy')}
                <span className="block text-sm text-[var(--lodging-ink-faint)]">After {identity.checkIn}</span>
              </DetailRow>
              <DetailRow label="Check-out">
                {format(parseISO(booking.checkOutDate), 'EEEE, MMMM dd, yyyy')}
                <span className="block text-sm text-[var(--lodging-ink-faint)]">Before {identity.checkOut}</span>
              </DetailRow>
              <DetailRow label="Length of stay">
                {booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}
              </DetailRow>
            </div>
            <div className="space-y-5">
              <DetailRow label="Guest name">{booking.guestName}</DetailRow>
              <DetailRow label="Guests">
                {booking.numberOfGuests}
                <span className="text-[var(--lodging-ink-faint)]">
                  {' '}({booking.numberOfAdults} {booking.numberOfAdults === 1 ? 'adult' : 'adults'}
                  {booking.numberOfChildren && booking.numberOfChildren > 0
                    ? `, ${booking.numberOfChildren} ${booking.numberOfChildren === 1 ? 'child' : 'children'}`
                    : ''})
                </span>
              </DetailRow>
              <DetailRow label="Contact">
                {booking.guestEmail ? <a href={`mailto:${booking.guestEmail}`} className="block hover:text-[var(--lodging-accent-deep)]">{booking.guestEmail}</a> : null}
                {booking.guestPhone ? <a href={`tel:${booking.guestPhone.replace(/\D/g, '')}`} className="block hover:text-[var(--lodging-accent-deep)]">{booking.guestPhone}</a> : null}
                {!booking.guestEmail && !booking.guestPhone ? <span className="text-[var(--lodging-ink-faint)]">Contact held by the front desk</span> : null}
              </DetailRow>
            </div>
          </div>
        </section>

        {/* Room details */}
        {booking.roomAssignments && booking.roomAssignments.length > 0 ? (
          <section className="border-b border-[var(--lodging-rule)] py-10">
            <p className="lodging-eyebrow mb-6">Accommodation</p>
            <div className="space-y-6">
              {booking.roomAssignments.map((assignment) => (
                <div key={assignment.id} className="lodging-surface grid gap-5 p-5 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] sm:items-center sm:p-6">
                  <div className="aspect-[4/3] overflow-hidden bg-[var(--lodging-paper-3)]">
                    <img
                      src={primaryRoomImage(assignment.roomType)}
                      alt={assignment.roomType?.roomImages?.[0]?.altText || `${assignment.roomType?.name || 'Hotel room'} accommodation`}
                      className="lodging-image h-full w-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="lodging-title text-[clamp(1.25rem,2vw,1.5rem)]">{assignment.roomType?.name || 'Room type'}</h3>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--lodging-ink-muted)]">
                      {assignment.roomNumber ? <span>Room {assignment.roomNumber}</span> : null}
                      {assignment.ratePerNight ? (
                        <span>${assignment.ratePerNight.toFixed(2)} / night</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Special requests */}
        {booking.specialRequests ? (
          <section className="border-b border-[var(--lodging-rule)] py-10">
            <p className="lodging-eyebrow mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Special requests
            </p>
            <p className="max-w-xl leading-7 text-[var(--lodging-ink-muted)]">{booking.specialRequests}</p>
          </section>
        ) : null}

        {/* Payment summary */}
        <section className="border-b border-[var(--lodging-rule)] py-10">
          <p className="lodging-eyebrow mb-6">Payment summary</p>
          <div className="space-y-3 text-[var(--lodging-ink-muted)]">
            {roomCharges ? (
              <div className="flex justify-between"><span>Room charges</span><span className="text-[var(--lodging-ink)]">${roomCharges}</span></div>
            ) : null}
            {taxes && parseFloat(taxes) > 0 ? (
              <div className="flex justify-between"><span>Taxes</span><span className="text-[var(--lodging-ink)]">${taxes}</span></div>
            ) : null}
            {fees && parseFloat(fees) > 0 ? (
              <div className="flex justify-between"><span>Fees</span><span className="text-[var(--lodging-ink)]">${fees}</span></div>
            ) : null}
            <div className="lodging-divider my-4" />
            <div className="flex items-baseline justify-between">
              <span className="lodging-serif text-[clamp(1.25rem,2vw,1.5rem)] text-[var(--lodging-ink)]">Total</span>
              <span className="lodging-serif text-[clamp(1.5rem,2.5vw,2rem)] text-[var(--lodging-ink)]">${total}</span>
            </div>
            {booking.paymentStatus !== 'paid' ? (
              <p className="mt-4 border-l-2 border-[var(--lodging-accent)] pl-4 text-sm leading-6 text-[var(--lodging-ink-muted)]">
                Payment will be collected by the front desk according to your selected rate plan. Reference your confirmation number on arrival.
              </p>
            ) : null}
          </div>
        </section>

        {/* Actions */}
        <section className="flex flex-wrap gap-3 py-10 print:hidden">
          <button type="button" onClick={handlePrint} className="lodging-button-ghost">
            <Printer className="h-4 w-4" /> Print
          </button>
          <button type="button" onClick={handleCalendarDownload} className="lodging-button-ghost">
            <Download className="h-4 w-4" /> Add to calendar
          </button>
          <Link href="/rooms" className="lodging-button">Browse more rooms</Link>
        </section>

        {modificationSuccess ? (
          <p role="status" aria-live="polite" className="border-l-2 border-[var(--lodging-accent)] py-2 pl-4 text-sm text-[var(--lodging-accent-deep)]">
            {modificationSuccess}
          </p>
        ) : null}

        {/* Modify / cancel */}
        {canCancel ? (
          <section className="flex flex-col gap-4 border-t border-[var(--lodging-rule)] py-10 sm:flex-row print:hidden">
            <Dialog
              open={showModifyDialog}
              onOpenChange={(open) => {
                setShowModifyDialog(open);
                if (open) {
                  setModificationError(null);
                  setModificationSuccess(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <button type="button" className="lodging-button-ghost flex-1">
                  <Edit className="h-4 w-4" /> Request changes
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-[var(--radius-sm)] border-[var(--lodging-rule)] bg-[var(--lodging-paper)]">
                <DialogHeader>
                  <DialogTitle className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">Request a stay change</DialogTitle>
                  <DialogDescription className="lodging-lead">
                    Tell the front desk what you would like to change. A staff member reviews availability before anything is confirmed.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5 pt-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="requestedCheckInDate" className="lodging-label">Requested check-in</label>
                      <input
                        id="requestedCheckInDate"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="YYYY-MM-DD"
                        pattern="\\d{4}-\\d{2}-\\d{2}"
                        value={modificationForm.requestedCheckInDate}
                        onChange={(event) => setModificationForm((prev) => ({ ...prev, requestedCheckInDate: event.target.value }))}
                        className="lodging-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="requestedCheckOutDate" className="lodging-label">Requested check-out</label>
                      <input
                        id="requestedCheckOutDate"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="YYYY-MM-DD"
                        pattern="\\d{4}-\\d{2}-\\d{2}"
                        value={modificationForm.requestedCheckOutDate}
                        onChange={(event) => setModificationForm((prev) => ({ ...prev, requestedCheckOutDate: event.target.value }))}
                        className="lodging-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="modificationMessage" className="lodging-label">Message</label>
                    <textarea
                      id="modificationMessage"
                      value={modificationForm.message}
                      onChange={(event) => setModificationForm((prev) => ({ ...prev, message: event.target.value }))}
                      placeholder="Add a night, move to next weekend, adjoining rooms, late arrival..."
                      rows={4}
                      className="lodging-textarea"
                    />
                  </div>
                  {modificationError ? (
                    <p role="alert" className="text-sm text-[var(--lodging-danger)]">{modificationError}</p>
                  ) : null}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" className="lodging-button-ghost" onClick={() => setShowModifyDialog(false)} disabled={isRequestingModification}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="lodging-button"
                      onClick={handleRequestModification}
                      disabled={isRequestingModification || (!modificationForm.requestedCheckInDate && !modificationForm.requestedCheckOutDate && !modificationForm.message)}
                    >
                      {isRequestingModification ? 'Sending...' : 'Send request'}
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <DialogTrigger asChild>
                <button type="button" className="lodging-button-ghost flex-1 border-[color-mix(in_oklch,var(--lodging-danger)_45%,transparent)] text-[var(--lodging-danger)] hover:border-[var(--lodging-danger)]">
                  <XIcon className="h-4 w-4" /> Cancel stay
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-[var(--radius-sm)] border-[var(--lodging-rule)] bg-[var(--lodging-paper)]">
                <DialogHeader>
                  <DialogTitle className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">Cancel your reservation?</DialogTitle>
                  <DialogDescription className="lodging-lead">
                    This immediately releases your room back to inventory.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 pt-2">
                  {cancellationQuote ? (
                    <div className="space-y-2 border-l-2 border-[var(--lodging-accent)] pl-4 text-sm leading-6 text-[var(--lodging-ink-muted)]">
                      <p>{cancellationQuote.summary}</p>
                      <p><strong>Refund:</strong> {new Intl.NumberFormat('en-US', { style: 'currency', currency: cancellationQuote.currencyCode }).format(cancellationQuote.refundableMinor / 100)}</p>
                      <p><strong>Policy fee:</strong> {new Intl.NumberFormat('en-US', { style: 'currency', currency: cancellationQuote.currencyCode }).format(cancellationQuote.cancellationFeeMinor / 100)} <span className="text-muted-foreground">(any unpaid portion remains due)</span></p>
                    </div>
                  ) : <p className="text-sm text-[var(--lodging-ink-muted)]">No captured payment is recorded; cancellation releases the room without inventing a refund.</p>}
                  {cancelError ? <p className="text-sm text-[var(--lodging-danger)]">{cancelError}</p> : null}
                  <div className="flex justify-end gap-3">
                    <button type="button" className="lodging-button-ghost" onClick={() => setShowCancelDialog(false)} disabled={isCancelling}>
                      Keep my booking
                    </button>
                    <button type="button" className="lodging-button bg-[var(--lodging-danger)] hover:bg-[var(--lodging-danger)]" onClick={handleCancelBooking} disabled={isCancelling}>
                      {isCancelling ? 'Cancelling...' : 'Confirm cancellation'}
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {isCancellationPending ? (
          <section className="border-t border-[var(--lodging-rule)] py-8 print:hidden">
            <p className="lodging-eyebrow text-[var(--lodging-accent-deep)]">Cancellation processing</p>
            <p className="lodging-lead mt-2">The room is no longer available for check-in. Provider refund work is queued with retry evidence; the final cancellation email is sent after settlement completes.</p>
          </section>
        ) : null}

        {/* Hotel contact — real identity */}
        <section className="grid gap-6 border-t border-[var(--lodging-rule)] py-10 print:hidden md:grid-cols-2">
          <div className="lodging-surface p-6">
            <p className="lodging-eyebrow mb-4 flex items-center gap-2 text-[var(--lodging-accent-deep)]">
              <Phone className="h-4 w-4" /> Front desk
            </p>
            <p className="lodging-serif text-2xl text-[var(--lodging-ink)]">{identity.name}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lodging-ink-muted)]">{identity.address.line1}</p>
            <p className="text-sm leading-6 text-[var(--lodging-ink-muted)]">{identity.address.line2}</p>
            <div className="mt-4 space-y-1 text-sm">
              <a href={`tel:${identity.phone.replace(/\D/g, '')}`} className="flex items-center gap-2 text-[var(--lodging-accent-deep)] hover:underline">
                <Phone className="h-3.5 w-3.5" /> {identity.phone}
              </a>
              <a href={`mailto:${identity.email}`} className="flex items-center gap-2 text-[var(--lodging-accent-deep)] hover:underline">
                <Mail className="h-3.5 w-3.5" /> {identity.email}
              </a>
            </div>
          </div>
          <div className="lodging-surface p-6">
            <p className="lodging-eyebrow mb-4 flex items-center gap-2 text-[var(--lodging-accent-deep)]">
              <MapPin className="h-4 w-4" /> Arrival
            </p>
            <p className="text-sm leading-7 text-[var(--lodging-ink-muted)]">
              Check-in opens at {identity.checkIn} and check-out is by {identity.checkOut}. The front desk is staffed {identity.hours.replace('Front desk · ', '')}.
            </p>
            <Link href="/location" className="lodging-link mt-5 inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Directions & neighborhood
            </Link>
          </div>
        </section>

        {/* Policies — real, no fabricated prices */}
        <section className="lodging-surface mb-4 p-6 print:hidden">
          <p className="lodging-eyebrow mb-4">Policies</p>
          <div className="space-y-4 text-sm leading-7 text-[var(--lodging-ink-muted)]">
            <p>
              <span className="lodging-serif text-[var(--lodging-ink)]">Schedule.</span> Check-in is available after {identity.checkIn}; check-out is by {identity.checkOut}. Late requests are subject to availability.
            </p>
            <p>
              <span className="lodging-serif text-[var(--lodging-ink)]">Cancellation.</span> {cancellationQuote?.summary || 'The cancellation terms snapshotted with the booked rate are applied by the reservation service.'}
            </p>
            <p>
              <span className="lodging-serif text-[var(--lodging-ink)]">Requirements.</span> A valid government photo ID and the credit card used for booking must be presented at check-in.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
