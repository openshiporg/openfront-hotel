'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatStayDate } from '@/lib/hotelCalendarDate';
import type { Booking } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { lookupAccountAction, signOutGuestAction, type AccountLookupActionState } from '../actions/guest-search';
import { GuestSearchStatus } from '../components/GuestSearchStatus';
import { GuestSearchSubmitButton } from '../components/GuestSearchSubmitButton';
import { bookingGroup, reservationPresentation } from '../lib/stay-context';

const initialState: AccountLookupActionState = { status: 'idle', message: '', bookings: null, formData: { email: '' } };
const groups = [{ id: 'upcoming', label: 'Current & upcoming', empty: 'No current or upcoming stays in this session.' }, { id: 'past', label: 'Completed', empty: 'Completed stays will appear here.' }, { id: 'cancelled', label: 'Cancelled & other', empty: 'No cancelled, processing or missed stays in this session.' }] as const;

function AccountContent() {
  const router = useRouter();
  const search = useSearchParams();
  const requestedTab = search?.get('tab');
  const tab = groups.some(group => group.id === requestedTab) ? requestedTab! : 'upcoming';
  const emailRef = React.useRef<HTMLInputElement>(null);
  const [state, formAction] = React.useActionState(lookupAccountAction, initialState);
  const [signedOut, setSignedOut] = React.useState(false);
  const signedOutRef = React.useRef(false);
  const [bookings, setBookings] = React.useState<Booking[] | null>(null);
  const [signingOut, setSigningOut] = React.useState(false);
  const signingOutRef = React.useRef(false);
  const [logoutError, setLogoutError] = React.useState('');
  React.useEffect(() => {
    if (signedOutRef.current || state.status !== 'matched' || !state.bookings?.length) return;
    setBookings(state.bookings as unknown as Booking[]);
    setSignedOut(false);
  }, [state]);

  async function handleLogout() {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    signedOutRef.current = true;
    setSigningOut(true);
    setLogoutError('');
    try {
      await signOutGuestAction();
      setSignedOut(true);
      setBookings(null);
      if (emailRef.current) emailRef.current.value = '';
      router.refresh();
    } catch {
      setLogoutError('Sign-out did not complete. Please try again before leaving a shared device.');
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  }

  return <main className="lodging-container py-12 md:py-16">
    <header className="hotel-page-head">
      <p className="lodging-eyebrow">Your guest portal</p>
      <h1 className="lodging-display">{bookings ? 'Your stays, together.' : 'A place for your stay.'}</h1>
      <p className="lodging-lead">{bookings ? 'Review dates, check your statement and request help with a verified reservation.' : 'Verify a reservation with your confirmation number first. Then use its email to open the stays verified in this browser.'}</p>
    </header>
    <nav aria-label="Guest portal" className="hotel-subnav">
      <Link href="/bookings/lookup">Find a reservation</Link>
      <Link href="/account" aria-current="page">Verified stays</Link>
      <Link href="/contact">Contact the house</Link>
    </nav>
    {!bookings ? <div className="grid gap-10 py-10 md:grid-cols-2">
      <section className="lodging-surface p-6 md:p-8">
        <h2 className="lodging-title mb-5">Open verified stays</h2>
        {signedOut && <p role="status" className="hotel-notice mb-5">You are signed out. Verify a reservation again to restore access.</p>}
        <form action={formAction} onSubmit={() => { signedOutRef.current = false; setSignedOut(false); }} className="space-y-5">
          <div>
            <label htmlFor="email" className="lodging-label">Booking email</label>
            <input key={signedOut ? 'email-signed-out' : `email-${state.status}-${state.formData.email}`} ref={emailRef} id="email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={signedOut ? '' : state.formData.email} className="lodging-input mt-2" />
          </div>
          {!signedOut && <GuestSearchStatus state={{ phase: state.status, message: state.message, value: state.bookings }} />}
          <GuestSearchSubmitButton idleLabel="Open my verified stays" pendingLabel="Finding verified stays…" />
        </form>
      </section>
      <aside className="space-y-5 py-4">
        <p className="lodging-eyebrow">First visit to the portal?</p>
        <h2 className="lodging-headline">Start with a reservation.</h2>
        <p className="lodging-lead">Your confirmation number and booking email establish access. This portal lists only reservations verified in your guest session; it is not a complete history of every visit.</p>
        <Link href="/bookings/lookup" className="lodging-button-ghost">Verify a reservation</Link>
      </aside>
    </div> : <section className="py-8">
      <div className="mb-8 flex flex-wrap justify-between items-center gap-4">
        <p className="text-sm">{bookings.length} verified {bookings.length === 1 ? 'reservation' : 'reservations'} in this session</p>
        <button type="button" className="lodging-button-ghost" onClick={handleLogout} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out of guest access'}</button>
      </div>
      {logoutError && <p role="alert" className="hotel-notice mb-6">{logoutError}</p>}
      <Tabs value={tab} onValueChange={value => { const params = new URLSearchParams(search?.toString()); params.set('tab', value); router.push(`/account?${params}`, { scroll: false }); }}>
        <TabsList className="mb-8 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">{groups.map(group => <TabsTrigger key={group.id} value={group.id} className="lodging-button-ghost data-[state=active]:border-[var(--lodging-ink)]">{group.label} ({bookings.filter(booking => bookingGroup(booking.status) === group.id).length})</TabsTrigger>)}</TabsList>
        {groups.map(group => <TabsContent key={group.id} value={group.id}>
          {bookings.filter(booking => bookingGroup(booking.status) === group.id).length === 0 ? <div className="lodging-surface p-8">
            <h2 className="lodging-title">{group.empty}</h2>
            <p className="lodging-lead mt-3">Add another reservation through booking lookup, or explore rooms for your next visit.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/bookings/lookup" className="lodging-button-ghost">Find another stay</Link>
              <Link href="/rooms" className="lodging-button">Explore rooms</Link>
            </div>
          </div> : <div className="space-y-5">{bookings.filter(booking => bookingGroup(booking.status) === group.id).map(booking => <article key={booking.id} className="lodging-surface p-6 md:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="lodging-title">{booking.confirmationNumber}</h2>
              <span className="lodging-pill">{reservationPresentation(booking.status).label}</span>
            </div>
            <dl className="grid gap-6 sm:grid-cols-3">
              <div>
                <dt className="lodging-eyebrow mb-2">Arrival</dt>
                <dd>{formatStayDate(booking.checkInDate, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt className="lodging-eyebrow mb-2">Departure</dt>
                <dd>{formatStayDate(booking.checkOutDate, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt className="lodging-eyebrow mb-2">Stay</dt>
                <dd>{booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}</dd>
              </div>
            </dl>
            <Link href={`/booking/${encodeURIComponent(booking.id)}`} className="lodging-button-ghost mt-6">Manage this reservation</Link>
          </article>)}</div>}
        </TabsContent>)}
      </Tabs>
    </section>}
  </main>;
}
export default function AccountPage() {
  return <React.Suspense fallback={<main className="lodging-container py-16">
    <p role="status">Opening your guest portal…</p>
  </main>}>
    <AccountContent />
  </React.Suspense>;
}
