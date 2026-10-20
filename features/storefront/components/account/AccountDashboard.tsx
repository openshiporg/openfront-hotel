'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, LogOut, Moon, Search } from 'lucide-react';
import { formatStayDate } from '@/lib/hotelCalendarDate';
import { changeGuestPasswordAction, loadMoreGuestStaysAction, signOutGuestAccountAction, updateGuestProfileAction, type AccountFormState } from '../../actions/account';
import type { GuestAccount, GuestAccountBooking } from '../../lib/guest-account-types';
import { bookingGroup, money, reservationPresentation } from '../../lib/stay-context';
import { GuestSearchSubmitButton } from '../GuestSearchSubmitButton';
import { Notice } from '../ui';

const idle: AccountFormState = { status: 'idle', message: '' };
const groups = [
  { id: 'upcoming', label: 'Upcoming', empty: 'No upcoming stays yet.' },
  { id: 'past', label: 'Past', empty: 'Your completed stays will appear here.' },
  { id: 'cancelled', label: 'Cancelled', empty: 'No cancelled stays.' },
] as const;

function statusTone(status?: string | null) {
  if (status === 'confirmed' || status === 'checked_in') return 'sf-badge--success';
  if (status === 'pending' || status === 'cancellation_pending') return 'sf-badge--warn';
  if (status === 'cancelled' || status === 'no_show') return 'sf-badge--danger';
  return '';
}

type StaysPage = { bookings: GuestAccountBooking[]; total: number };

export function AccountDashboard({ account, stays }: { account: GuestAccount; stays: StaysPage | null }) {
  const [tab, setTab] = React.useState<(typeof groups)[number]['id']>('upcoming');
  const [profileState, saveProfile] = React.useActionState(updateGuestProfileAction, idle);
  const [passwordState, changePassword] = React.useActionState(changeGuestPasswordAction, idle);
  const [bookings, setBookings] = React.useState<GuestAccountBooking[] | null>(stays?.bookings ?? null);
  const [total, setTotal] = React.useState(stays?.total ?? 0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  React.useEffect(() => { setBookings(stays?.bookings ?? null); setTotal(stays?.total ?? 0); }, [stays]);
  const active = groups.find(group => group.id === tab) || groups[0];
  const visible = (bookings || []).filter(booking => bookingGroup(booking.status) === active.id);
  const loaded = bookings?.length ?? 0;

  async function loadMore() {
    if (!bookings || loadingMore) return;
    setLoadingMore(true); setMoreError(false);
    try {
      const page = await loadMoreGuestStaysAction(bookings.length);
      if (!page) { setMoreError(true); return; }
      const known = new Set(bookings.map(booking => booking.id));
      setBookings([...bookings, ...page.bookings.filter(booking => !known.has(booking.id))]);
      setTotal(page.total);
    } catch { setMoreError(true); }
    finally { setLoadingMore(false); }
  }

  // Arrow keys, Home and End move between the stay tabs; only the selected tab is a Tab stop.
  function onTabKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = groups.findIndex(group => group.id === tab);
    const target = event.key === 'ArrowRight' ? (index + 1) % groups.length
      : event.key === 'ArrowLeft' ? (index - 1 + groups.length) % groups.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : -1;
    if (target < 0) return;
    event.preventDefault();
    setTab(groups[target].id);
    tabRefs.current[groups[target].id]?.focus();
  }

  return <div className="sf-stack" style={{ '--stack': 'clamp(40px, 6vw, 64px)', marginTop: 'clamp(32px, 5vw, 48px)' } as React.CSSProperties}>
    <section aria-labelledby="stays-title">
      <div className="sf-row" style={{ justifyContent: 'space-between', marginBottom: 22 }}>
        <h2 id="stays-title" className="sf-h3">Your stays</h2>
        <div className="sf-segment" role="tablist" aria-label="Stays">
          {groups.map(group => <button key={group.id} ref={element => { tabRefs.current[group.id] = element; }} type="button" role="tab" id={`stays-tab-${group.id}`} aria-controls="stays-panel" aria-selected={tab === group.id} tabIndex={tab === group.id ? 0 : -1} onKeyDown={onTabKey} onClick={() => setTab(group.id)}>{group.label}<span>{(bookings || []).filter(booking => bookingGroup(booking.status) === group.id).length}</span></button>)}
        </div>
      </div>
      {bookings === null && <Notice tone="warn" role="alert">Your stays couldn’t be loaded just now. Refresh the page to try again.</Notice>}
      <div id="stays-panel" role="tabpanel" tabIndex={0} aria-labelledby={`stays-tab-${active.id}`}>
        {bookings !== null && visible.length === 0 ? <div className="sf-empty">
          <h3 className="sf-h3">{active.empty}</h3>
          <p className="sf-muted">Stays you book while signed in appear here. To add one booked without an account, find it with its confirmation number.</p>
          <div className="sf-row">
            <Link href="/bookings/lookup" className="sf-btn sf-btn--ghost"><Search aria-hidden="true" />Find a reservation</Link>
            <Link href="/rooms" className="sf-btn">Book a room</Link>
          </div>
        </div> : visible.map(booking => <article key={booking.id} className="sf-card sf-staycard">
          <div className="sf-staycard__cal" aria-hidden="true">
            <small>{formatStayDate(booking.checkInDate, { month: 'short' })}</small>
            <b>{formatStayDate(booking.checkInDate, { day: 'numeric' })}</b>
            <span>{formatStayDate(booking.checkInDate, { weekday: 'short' })}</span>
          </div>
          <div className="sf-stack" style={{ '--stack': '6px', minWidth: 0 } as React.CSSProperties}>
            <div className="sf-row" style={{ gap: 10 }}>
              <h3 className="sf-h4" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.03em' }}>{booking.confirmationNumber}</h3>
              <span className={`sf-badge sf-badge--dot ${statusTone(booking.status)}`}>{reservationPresentation(booking.status).label}</span>
            </div>
            <p className="sf-muted sf-small">{booking.roomAssignments?.[0]?.roomType?.name ? `${booking.roomAssignments[0].roomType.name} · ` : ''}{formatStayDate(booking.checkInDate, { month: 'short', day: 'numeric', year: 'numeric' })} → {formatStayDate(booking.checkOutDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <p className="sf-row sf-fine" style={{ gap: 6 }}><Moon aria-hidden="true" style={{ width: 14 }} />{booking.numberOfNights} {booking.numberOfNights === 1 ? 'night' : 'nights'}{typeof booking.totalAmountMinor === 'number' ? ` · ${money(booking.totalAmountMinor, booking.currencyCode || 'USD')}` : ''}</p>
          </div>
          <Link href={`/booking/${encodeURIComponent(booking.id)}`} className="sf-btn sf-btn--ghost">Manage stay <ArrowRight className="sf-btn__go" aria-hidden="true" /></Link>
        </article>)}
      </div>
      {bookings !== null && total > loaded && <div className="sf-row" style={{ justifyContent: 'space-between', marginTop: 22 }}>
        <p className="sf-fine" role="status">Showing {loaded} of {total} stays</p>
        <button type="button" className="sf-btn sf-btn--ghost" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more stays'}</button>
      </div>}
      {moreError && <Notice tone="warn" role="alert">More stays couldn’t be loaded just now. Try again.</Notice>}
    </section>

    <div className="sf-split" style={{ alignItems: 'start' }}>
      <section className="sf-panel sf-pad-lg" aria-labelledby="profile-title">
        <h2 id="profile-title" className="sf-h3" style={{ marginBottom: 20 }}>Your details</h2>
        <form action={saveProfile} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
          <label className="sf-field" htmlFor="profile-name">
            <span className="sf-label">Full name</span>
            <input id="profile-name" name="name" type="text" autoComplete="name" required maxLength={120} defaultValue={account.name} className="sf-input" />
          </label>
          <label className="sf-field" htmlFor="profile-email">
            <span className="sf-label">Email</span>
            <input id="profile-email" type="email" value={account.email} readOnly disabled className="sf-input" />
            <span className="sf-hint">To change the email on your account, contact the property.</span>
          </label>
          <label className="sf-field" htmlFor="profile-phone">
            <span className="sf-label">Phone <small>(optional)</small></span>
            <input id="profile-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={account.phone || ''} className="sf-input" />
          </label>
          {profileState.status !== 'idle' && <Notice tone={profileState.status === 'success' ? 'success' : 'danger'} role={profileState.status === 'success' ? 'status' : 'alert'}>{profileState.message}</Notice>}
          <GuestSearchSubmitButton idleLabel="Save details" pendingLabel="Saving…" />
        </form>
      </section>
      <section className="sf-panel sf-pad-lg" aria-labelledby="password-title">
        <h2 id="password-title" className="sf-h3" style={{ marginBottom: 20 }}>Password</h2>
        <form action={changePassword} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
          <label className="sf-field" htmlFor="current-password">
            <span className="sf-label">Current password</span>
            <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1000} className="sf-input" />
          </label>
          <label className="sf-field" htmlFor="new-password">
            <span className="sf-label">New password</span>
            <input id="new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={1000} className="sf-input" />
            <span className="sf-hint">At least 10 characters. You’ll sign in again afterwards.</span>
          </label>
          <label className="sf-field" htmlFor="confirm-new-password">
            <span className="sf-label">Confirm new password</span>
            <input id="confirm-new-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={1000} className="sf-input" />
          </label>
          {passwordState.status === 'error' && <Notice tone="danger" role="alert">{passwordState.message}</Notice>}
          <GuestSearchSubmitButton idleLabel="Change password" pendingLabel="Changing password…" />
        </form>
      </section>
    </div>

    <form action={signOutGuestAccountAction}>
      <button type="submit" className="sf-btn sf-btn--ghost"><LogOut aria-hidden="true" />Sign out</button>
    </form>
  </div>;
}
