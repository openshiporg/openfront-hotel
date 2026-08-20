'use client';

import * as React from 'react';
import Link from 'next/link';
import { format, parseISO, isPast, isFuture } from 'date-fns';
import {
  User,
  Calendar,
  CheckCircle2,
  XCircle,
  LogOut,
  ChevronRight,
  History,
  Star,
} from 'lucide-react';

import { Booking } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  lookupAccountAction,
  type AccountLookupActionState,
} from '@/features/storefront/actions/guest-search';
import { GuestSearchStatus } from '@/features/storefront/components/GuestSearchStatus';
import { GuestSearchSubmitButton } from '@/features/storefront/components/GuestSearchSubmitButton';

function statusPill(status: string | null) {
  if (status === 'cancelled' || status === 'no_show') return 'lodging-pill lodging-pill-danger';
  if (status === 'confirmed' || status === 'checked_in') return 'lodging-pill lodging-pill-accent';
  return 'lodging-pill';
}

function statusLabel(status: string | null) {
  if (!status) return 'Unknown';
  return status.replace('_', ' ');
}

function StatCard({
  icon: Icon,
  count,
  label,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
}) {
  return (
    <div className="lodging-surface flex items-center gap-4 p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--lodging-rule)] rounded-full text-[var(--lodging-accent-deep)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="lodging-serif text-3xl leading-none text-[var(--lodging-ink)]">{count}</p>
        <p className="lodging-eyebrow mt-1.5 text-[0.625rem]">{label}</p>
      </div>
    </div>
  );
}

const initialState: AccountLookupActionState = {
  status: 'idle',
  message: '',
  bookings: null,
  formData: { email: '' },
};

export default function AccountPage() {
  const { toast } = useToast();
  const emailRef = React.useRef<HTMLInputElement>(null);
  const [state, formAction] = React.useActionState(lookupAccountAction, initialState);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [guestInfo, setGuestInfo] = React.useState<{ email: string; name: string } | null>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem('openfront_guest_context');
    if (!saved || !emailRef.current?.value) {
      try {
        const parsed = saved ? JSON.parse(saved) : null;
        if (emailRef.current && parsed?.email) emailRef.current.value = parsed.email;
      } catch {
        // Ignore stale local convenience state; server action verification is authoritative.
      }
    }
  }, []);

  React.useEffect(() => {
    if (state.status !== 'matched' || !state.bookings?.length) return;
    const loadedBookings = state.bookings as unknown as Booking[];
    const firstName = loadedBookings[0].guestName?.split(' ')[0] || 'Guest';
    setBookings(loadedBookings);
    setGuestInfo({ email: state.formData.email, name: firstName });
    setIsLoggedIn(true);
    localStorage.setItem(
      'openfront_guest_context',
      JSON.stringify({ email: state.formData.email, name: loadedBookings[0]?.guestName || firstName }),
    );
    toast({ title: 'Welcome back', description: 'Your verified reservations are loaded.' });
  }, [state.bookings, state.formData.email, state.status, toast]);

  const handleLogout = () => {
    localStorage.removeItem('openfront_guest_context');
    setIsLoggedIn(false);
    setBookings([]);
    setGuestInfo(null);
    if (emailRef.current) emailRef.current.value = '';
    toast({ title: 'Signed out', description: 'You have been signed out of the guest portal.' });
  };

  const upcomingBookings = bookings.filter(
    (b) => isFuture(parseISO(b.checkInDate)) && b.status !== 'cancelled'
  );
  const pastBookings = bookings.filter(
    (b) => isPast(parseISO(b.checkOutDate)) || b.status === 'checked_out'
  );
  const cancelledBookings = bookings.filter((b) => b.status === 'cancelled');

  if (!isLoggedIn) {
    return (
      <main className="lodging-page min-h-screen">
        <div className="lodging-container max-w-md py-20 md:py-28">
          <div className="lodging-surface p-8 md:p-10">
            <div className="mb-8 flex h-14 w-14 items-center justify-center border border-[var(--lodging-rule)] rounded-full text-[var(--lodging-accent-deep)]">
              <User className="h-7 w-7" />
            </div>
            <p className="lodging-eyebrow mb-3 text-[var(--lodging-accent-deep)]">Guest portal</p>
            <h1 className="lodging-headline mb-3">Access your stays.</h1>
            <p className="lodging-lead mb-8">
              Verify one reservation first, then use its email to view bookings available in your secure guest session.
            </p>

            <form action={formAction} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="lodging-label">Email address</label>
                <input
                  key={`email-${state.status}-${state.formData.email}`}
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  defaultValue={state.formData.email}
                  className="lodging-input"
                  required
                />
              </div>
              <GuestSearchStatus state={{ phase: state.status, message: state.message, value: state.bookings }} />
              <GuestSearchSubmitButton idleLabel="Find my reservations" pendingLabel="Locating profile…" />
            </form>

            <div className="lodging-divider my-8" />
            <p className="mb-4 text-center text-sm text-[var(--lodging-ink-faint)]">
              Only have a confirmation number?
            </p>
            <Link href="/bookings/lookup" className="lodging-button-ghost w-full justify-center">
              Search by confirmation number
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="lodging-page min-h-screen">
      <div className="lodging-container max-w-4xl py-12 md:py-16">
        <header className="mb-10 flex flex-col justify-between gap-6 border-b border-[var(--lodging-rule)] pb-8 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="lodging-eyebrow mb-2 text-[var(--lodging-accent-deep)]">Guest portal</p>
            <h1 className="lodging-display">Welcome back, {guestInfo?.name?.split(' ')[0]}.</h1>
            <p className="lodging-lead mt-3">{guestInfo?.email}</p>
          </div>
          <button type="button" onClick={handleLogout} className="lodging-button-ghost shrink-0">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </header>

        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          <StatCard icon={Calendar} count={upcomingBookings.length} label="Upcoming stays" />
          <StatCard icon={CheckCircle2} count={pastBookings.length} label="Completed stays" />
          <StatCard icon={Star} count={bookings.length} label="Lifetime visits" />
        </div>

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="lodging-surface mb-8 flex h-auto w-full justify-start gap-1 rounded-[var(--radius-sm)] border border-[var(--lodging-rule)] bg-[var(--lodging-paper)] p-1">
            <TabsTrigger
              value="upcoming"
              className="rounded-[var(--radius-sm)] px-5 py-2 data-[state=active]:bg-[var(--lodging-night)] data-[state=active]:text-[color-mix(in_oklch,var(--lodging-paper)_95%,white)]"
            >
              Upcoming
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="rounded-[var(--radius-sm)] px-5 py-2 data-[state=active]:bg-[var(--lodging-night)] data-[state=active]:text-[color-mix(in_oklch,var(--lodging-paper)_95%,white)]"
            >
              Past
            </TabsTrigger>
            <TabsTrigger
              value="cancelled"
              className="rounded-[var(--radius-sm)] px-5 py-2 data-[state=active]:bg-[var(--lodging-night)] data-[state=active]:text-[color-mix(in_oklch,var(--lodging-paper)_95%,white)]"
            >
              Cancelled
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {upcomingBookings.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No upcoming reservations"
                copy="Ready to plan your next stay?"
                actionHref="/rooms"
                actionLabel="Browse rooms"
              />
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past">
            {pastBookings.length === 0 ? (
              <EmptyState icon={History} title="No past stays" copy="Your completed stays will appear here." />
            ) : (
              <div className="space-y-4">
                {pastBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cancelled">
            {cancelledBookings.length === 0 ? (
              <EmptyState icon={XCircle} title="No cancelled reservations" copy="Cancelled bookings will appear here." />
            ) : (
              <div className="space-y-4">
                {cancelledBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function EmptyState({
  icon: Icon,
  title,
  copy,
  actionHref,
  actionLabel,
}: {
  icon: React.ElementType;
  title: string;
  copy: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="lodging-surface py-16 text-center">
      <Icon className="mx-auto mb-5 h-10 w-10 text-[var(--lodging-ink-faint)]" />
      <h3 className="lodging-title text-[clamp(1.25rem,2vw,1.5rem)]">{title}</h3>
      <p className="lodging-lead mx-auto mt-2 max-w-sm">{copy}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="lodging-button mt-8 inline-flex">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <div className="lodging-surface p-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h3 className="lodging-serif text-lg text-[var(--lodging-ink)]">{booking.confirmationNumber}</h3>
            <span className={statusPill(booking.status)}>{statusLabel(booking.status)}</span>
          </div>
          <div className="grid grid-cols-2 gap-5 text-sm md:grid-cols-4">
            <div>
              <p className="lodging-eyebrow mb-1 text-[0.6rem]">Check-in</p>
              <p className="text-[var(--lodging-ink)]">{format(parseISO(booking.checkInDate), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <p className="lodging-eyebrow mb-1 text-[0.6rem]">Check-out</p>
              <p className="text-[var(--lodging-ink)]">{format(parseISO(booking.checkOutDate), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <p className="lodging-eyebrow mb-1 text-[0.6rem]">Duration</p>
              <p className="text-[var(--lodging-ink)]">
                {booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}
              </p>
            </div>
            <div>
              <p className="lodging-eyebrow mb-1 text-[0.6rem]">Total</p>
              <p className="text-[var(--lodging-ink)]">${(booking.totalAmount || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
        <Link
          href={`/booking/${booking.id}`}
          className="lodging-button-ghost shrink-0"
        >
          View reservation <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
