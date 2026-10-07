'use client';
import { formatStayDate } from '@/lib/hotelCalendarDate';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, CalendarDays, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

import { useToast } from '@/components/ui/use-toast';
import {
  lookupBookingAction,
  type BookingLookupActionState,
} from '@/features/storefront/actions/guest-search';
import { GuestSearchStatus } from '@/features/storefront/components/GuestSearchStatus';
import { GuestSearchSubmitButton } from '@/features/storefront/components/GuestSearchSubmitButton';

interface LookupBooking {
  id: string;
  confirmationNumber: string;
  guestName: string;
  guestEmail?: string | null;
  checkInDate: string;
  checkOutDate: string;
  status?: string | null;
  paymentStatus?: string | null;
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

export default function BookingLookupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirmationRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
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

  React.useEffect(() => {
    if (state.status !== 'matched' || !result) return;
    toast({ title: 'Reservation found', description: 'You can now view the full stay details.' });
  }, [result, state.formData.email, state.status, toast]);

  const assignment = result?.roomAssignments?.[0];

  return (
    <main className="lodging-page min-h-screen">
      <div className="lodging-container max-w-3xl py-12 md:py-16">
        <header className="hotel-page-head">
          <p className="lodging-eyebrow mb-4 text-[var(--lodging-accent-deep)]">Manage your stay</p>
          <h1 className="lodging-display">Your stay starts here.</h1>
          <p className="lodging-lead mx-auto mt-5 max-w-xl">
            Use your confirmation number and the email on the reservation to view stay details, add the stay to your calendar, or request changes.
          </p>
        </header>
        <nav aria-label="Guest portal" className="hotel-subnav mb-8"><Link href="/bookings/lookup" aria-current="page">Find a reservation</Link><Link href="/account">Verified stays</Link><Link href="/contact">Contact the house</Link></nav>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form action={formAction} className="lodging-surface min-w-0 space-y-6 p-6 md:p-8">
            <div>
              <p className="lodging-eyebrow mb-2 flex items-center gap-2 text-[var(--lodging-accent-deep)]">
                <Search className="h-4 w-4" /> Reservation lookup
              </p>
              <p className="text-sm leading-6 text-[var(--lodging-ink-muted)]">
                Your confirmation number starts with BK- and appears in your booking confirmation email.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmationNumber" className="lodging-label">Confirmation number</label>
              <input
                key={`confirmation-${state.status}-${state.formData.confirmationNumber}`}
                ref={confirmationRef}
                id="confirmationNumber"
                name="confirmationNumber"
                maxLength={80}
                defaultValue={state.formData.confirmationNumber}
                placeholder="BK-XXXX-XXXX"
                className="lodging-input uppercase"
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="lodging-label">Email address</label>
              <input
                key={`email-${state.status}-${state.formData.email}`}
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                maxLength={254}
                defaultValue={state.formData.email}
                placeholder="you@example.com"
                className="lodging-input"
                required
                autoComplete="email"
              />
            </div>

            <GuestSearchStatus state={{ phase: state.status, message: state.message, value: result }} />

            <GuestSearchSubmitButton idleLabel="Find reservation" pendingLabel="Searching…" />
          </form>

          <div className="lodging-surface min-w-0 space-y-5 p-6 md:p-8">
            <p className="lodging-eyebrow flex items-center gap-2 text-[var(--lodging-accent-deep)]">
              <ShieldCheck className="h-4 w-4" /> Secure access
            </p>
            <div className="space-y-4 text-sm leading-7 text-[var(--lodging-ink-muted)]">
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lodging-ink-faint)]" />
                <p>Use the email recorded on your reservation. The property verifies both details before giving this browser access.</p>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lodging-ink-faint)]" />
                <p>The guest portal brings together reservations you have verified in this browser.</p>
              </div>
            </div>
            <Link href="/account" className="lodging-button-ghost inline-flex">
              Open guest portal
            </Link>
          </div>
        </div>

        {result ? (
          <section className="lodging-surface mt-8 p-6 md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="lodging-title text-[clamp(1.25rem,2vw,1.5rem)]">{result.guestName}</h2>
                  {result.status ? <span className="lodging-pill lodging-pill-accent">{result.status.replace('_', ' ')}</span> : null}
                  {result.paymentStatus ? <span className="lodging-pill">{result.paymentStatus.replace('_', ' ')}</span> : null}
                </div>
                <p className="lodging-serif text-sm text-[var(--lodging-ink-faint)]">{result.confirmationNumber}</p>
                <p className="text-sm text-[var(--lodging-ink-muted)]">
                  {formatStayDate(result.checkInDate, { month: "short", day: "numeric", year: "numeric" })} &mdash; {formatStayDate(result.checkOutDate, { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-sm text-[var(--lodging-ink-muted)]">
                  {assignment?.roomType?.name || 'Room type pending'}
                  {assignment?.roomNumber ? ` · Room ${assignment.roomNumber}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Link href="/account" className="lodging-button-ghost">View all stays</Link>
                <button type="button" className="lodging-button" onClick={() => router.push(`/booking/${encodeURIComponent(result.id)}`)}>
                  Open booking <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
