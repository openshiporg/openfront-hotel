'use client';
import { formatStayDate } from '@/lib/hotelCalendarDate';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BedDouble, CalendarDays, CalendarPlus, Mail, ReceiptText, ShieldCheck } from 'lucide-react';

import {
  lookupBookingAction,
  type BookingLookupActionState,
} from '@/features/storefront/actions/guest-search';
import { GuestSearchStatus } from '@/features/storefront/components/GuestSearchStatus';
import { GuestSearchSubmitButton } from '@/features/storefront/components/GuestSearchSubmitButton';
import { GuestPortalNav } from '@/features/storefront/components/GuestPortalNav';
import { paymentStatusLabel } from '@/features/storefront/lib/stay-context';

interface LookupBooking {
  id: string;
  confirmationNumber: string;
  guestName: string;
  guestEmail?: string | null;
  checkInDate: string;
  checkOutDate: string;
  status?: string | null;
  paymentStatus?: string | null;
  refundPendingMinor?: number | null;
  totalAmount?: number | null;
  roomAssignments?: Array<{
    roomType?: { name: string } | null;
    roomNumber?: string | null;
  }>;
}

const initialState: BookingLookupActionState = {
  status: 'idle',
  message: '',
  booking: null,
  formData: { confirmationNumber: '', email: '' },
};

const BENEFITS = [
  { icon: ReceiptText, title: 'Dates & statement', copy: 'See your stay details, recorded rate terms and the current balance.' },
  { icon: CalendarPlus, title: 'Plan around it', copy: 'Add the stay to your calendar and keep arrival details close.' },
  { icon: Mail, title: 'Ask for a change', copy: 'Send a change request or review cancellation terms before deciding.' },
];

export default function BookingLookupPage() {
  const router = useRouter();
  const confirmationRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const resultRef = React.useRef<HTMLHeadingElement>(null);
  const [state, formAction] = React.useActionState(lookupBookingAction, initialState);
  const result = state.booking as LookupBooking | null;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (confirmationRef.current && !confirmationRef.current.value) {
      confirmationRef.current.value = params.get('confirmation') || '';
    }
    if (emailRef.current && !emailRef.current.value) {
      emailRef.current.value = params.get('email') || '';
    }
  }, []);

  // The status line announces the match; move focus to the reservation it found.
  React.useEffect(() => {
    if (state.status !== 'matched' || !result) return;
    resultRef.current?.focus({ preventScroll: false });
  }, [result, state.status]);

  const assignment = result?.roomAssignments?.[0];

  return (
    <div className="sf-wrap sf-section--tight">
      <div className="sf-split" style={{ alignItems: 'start' }}>
        <header className="sf-stack" style={{ '--stack': '18px', paddingTop: 'clamp(8px, 3vw, 32px)' } as React.CSSProperties}>
          <p className="sf-eyebrow">Manage your stay</p>
          <h1 className="sf-h1">Your stay, <em>in one place.</em></h1>
          <p className="sf-lead">Use your confirmation number and the email on the reservation to view stay details, add the stay to your calendar, or request changes.</p>
          <GuestPortalNav current="/bookings/lookup" />
          <ul className="sf-stack" style={{ '--stack': '18px', listStyle: 'none', padding: 0, marginTop: 36 } as React.CSSProperties}>
            {BENEFITS.map(item => <li key={item.title} className="sf-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 16 }}>
              <span className="sf-feature__icon" style={{ flex: 'none' }}><item.icon aria-hidden="true" /></span>
              <span><b className="sf-h4">{item.title}</b><span className="sf-muted sf-small" style={{ display: 'block', marginTop: 2 }}>{item.copy}</span></span>
            </li>)}
          </ul>
        </header>

        <div className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
          <form action={formAction} className="sf-float sf-pad-lg sf-stack" style={{ '--stack': '20px' } as React.CSSProperties}>
            <div>
              <p className="sf-eyebrow sf-eyebrow--plain" style={{ gap: 8 }}><ShieldCheck aria-hidden="true" style={{ width: 16 }} /> Secure reservation lookup</p>
              <p className="sf-muted sf-small" style={{ marginTop: 8 }}>Your confirmation number starts with BK- and is shown on your reservation page and in your confirmation email.</p>
            </div>

            <label className="sf-field" htmlFor="confirmationNumber">
              <span className="sf-label">Confirmation number</span>
              <input
                key={`confirmation-${state.status}-${state.formData.confirmationNumber}`}
                ref={confirmationRef}
                id="confirmationNumber"
                name="confirmationNumber"
                maxLength={80}
                defaultValue={state.formData.confirmationNumber}
                placeholder="BK-XXXX-XXXX"
                className="sf-input sf-input--code"
                required
                autoComplete="off"
              />
            </label>

            <label className="sf-field" htmlFor="email">
              <span className="sf-label">Email address</span>
              <input
                key={`email-${state.status}-${state.formData.email}`}
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                maxLength={254}
                defaultValue={state.formData.email}
                placeholder="you@example.com"
                className="sf-input"
                required
                autoComplete="email"
              />
              <span className="sf-hint">Use the email recorded on your reservation. The property verifies both details before giving this browser access.</span>
            </label>

            <GuestSearchStatus state={{ phase: state.status, message: state.message, value: result }} />

            <GuestSearchSubmitButton idleLabel="Find reservation" pendingLabel="Searching…" />
            <p className="sf-fine" style={{ display: 'flex', gap: 8 }}><CalendarDays aria-hidden="true" style={{ width: 15, flex: 'none', marginTop: 2 }} />With a guest account, every stay you book or find is kept in one place. <Link href="/account" className="sf-link" style={{ minHeight: 0, fontSize: 'inherit' }}>Sign in or create an account</Link></p>
          </form>

          {result ? (
            <section className="sf-card sf-pad sf-updated" aria-label="Matched reservation">
              <div className="sf-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="sf-stack" style={{ '--stack': '8px', minWidth: 0 } as React.CSSProperties}>
                  <div className="sf-row" style={{ gap: 8 }}>
                    {result.status ? <span className="sf-badge sf-badge--accent sf-badge--dot">{result.status.replaceAll('_', ' ')}</span> : null}
                    {paymentStatusLabel(result.paymentStatus, result.refundPendingMinor) ? <span className="sf-badge">{paymentStatusLabel(result.paymentStatus, result.refundPendingMinor)}</span> : null}
                  </div>
                  <h2 ref={resultRef} tabIndex={-1} className="sf-h3">{result.guestName}</h2>
                  <p className="sf-code" style={{ width: 'fit-content', paddingRight: 14 }}>{result.confirmationNumber}</p>
                  <p className="sf-row sf-small sf-muted" style={{ gap: 8 }}><CalendarDays aria-hidden="true" style={{ width: 16 }} />
                    {formatStayDate(result.checkInDate, { month: 'short', day: 'numeric', year: 'numeric' })} &mdash; {formatStayDate(result.checkOutDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="sf-row sf-small sf-muted" style={{ gap: 8 }}><BedDouble aria-hidden="true" style={{ width: 16 }} />
                    {assignment?.roomType?.name || 'Room type pending'}
                    {assignment?.roomNumber ? ` · Room ${assignment.roomNumber}` : ''}
                  </p>
                </div>
              </div>
              <div className="sf-row" style={{ marginTop: 18 }}>
                <button type="button" className="sf-btn" onClick={() => router.push(`/booking/${encodeURIComponent(result.id)}`)}>
                  Open booking <ArrowRight className="sf-btn__go" aria-hidden="true" />
                </button>
                <Link href="/account" className="sf-btn sf-btn--ghost">View all stays</Link>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
