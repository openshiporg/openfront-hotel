'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Menu, Phone, UserRound, X } from 'lucide-react';
import { useHotelSettings } from '../HotelSettingsProvider';
import { useGuestAccount } from '../GuestAccountProvider';
import { StayLink, useStay } from '../StayProvider';
import { calendarDay } from '../../lib/stay-context';
import { rangeLabel } from '../../lib/calendar';
import type { HotelLogo } from '../../lib/hotel-settings';
import { DEFAULT_STORE_LOGO_ICON, effectiveStoreLogoHue } from '@/features/platform/property/lib/store-logo';

const primary = [
  { href: '/rooms', label: 'Rooms & suites' },
  { href: '/amenities', label: 'The house' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/location', label: 'Location' },
];
const secondary = [
  { href: '/bookings/lookup', label: 'Find a reservation' },
  { href: '/contact', label: 'Contact the house' },
  { href: '/policies', label: 'Stay policies' },
];

/**
 * The one brand lockup for header, menu and footer. A saved logo was sanitized
 * by the settings mutation and again on the public projection; without one the
 * Galileo library default renders. A saved logo colour also sets the page accent.
 */
export function Wordmark({ name, logo }: { name: string; logo?: HotelLogo }) {
  return <span className="sf-wordmark">
    <span className="sf-wordmark__logo" style={{ filter: `hue-rotate(${effectiveStoreLogoHue(logo?.icon, logo?.color)}deg)` }} dangerouslySetInnerHTML={{ __html: logo?.icon || DEFAULT_STORE_LOGO_ICON }} aria-hidden="true" />
    <span className="sf-wordmark__name">{name}</span>
  </span>;
}

export function SiteHeader() {
  const identity = useHotelSettings();
  const { account } = useGuestAccount();
  const accountLabel = account ? 'Account' : 'Sign in';
  const pathname = usePathname() || '/';
  const { stay } = useStay();
  const drawer = useRef<HTMLDialogElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const overlay = pathname === '/';

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => { drawer.current?.close(); }, [pathname]);

  const dates = new URLSearchParams(stay);
  const arrival = dates.get('checkIn') || '';
  const departure = dates.get('checkOut') || '';
  const guests = Number(dates.get('adults') || 2) + Number(dates.get('children') || 0);
  const hasStay = calendarDay(arrival) && calendarDay(departure) && arrival < departure;
  const showStay = hasStay && !pathname.startsWith('/booking/') && !pathname.startsWith('/book');
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`) ? 'page' as const : undefined;
  const phone = identity.phone.replace(/[^+\d]/g, '');

  return <header className="sf-header" data-overlay={overlay} data-scrolled={scrolled}>
    <a className="sf-skip" href="#storefront-content">Skip to content</a>
    <div className="sf-wrap sf-header__row">
      <Link href="/" aria-label={`${identity.name} home`}><Wordmark name={identity.name} logo={identity.logo} /></Link>
      <nav className="sf-nav" aria-label="Primary">
        {primary.map(link => <StayLink key={link.href} href={link.href} aria-current={current(link.href)}>{link.label}</StayLink>)}
      </nav>
      <div className="sf-header__actions">
        {showStay && <StayLink className="sf-staypill" href="/rooms#results" aria-label={`Your stay: ${rangeLabel(arrival, departure)}, ${guests} guests. Review rooms for these dates.`}>
          <CalendarDays aria-hidden="true" /><b>{rangeLabel(arrival, departure)}</b><span aria-hidden="true">·</span>{guests} {guests === 1 ? 'guest' : 'guests'}
        </StayLink>}
        <Link className="sf-header__manage" href="/account" aria-current={current('/account')}><UserRound aria-hidden="true" />{accountLabel}</Link>
        <StayLink className="sf-btn sf-btn--sm sf-header__book" href="/rooms">Book a room</StayLink>
        <button type="button" className="sf-menu-btn" aria-label="Open menu" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><Menu aria-hidden="true" /></button>
      </div>
    </div>
    <dialog ref={drawer} className="sf-drawer sf-portal" aria-label="Menu" onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="sf-drawer__inner">
        <div className="sf-drawer__top">
          <Link href="/" onClick={() => drawer.current?.close()}><Wordmark name={identity.name} logo={identity.logo} /></Link>
          <button type="button" className="sf-iconbtn" aria-label="Close menu" onClick={() => drawer.current?.close()} autoFocus><X aria-hidden="true" /></button>
        </div>
        {hasStay && <StayLink href="/rooms#results" className="sf-staypill" onClick={() => drawer.current?.close()}>
          <CalendarDays aria-hidden="true" /><b>{rangeLabel(arrival, departure)}</b> · {guests} {guests === 1 ? 'guest' : 'guests'}
        </StayLink>}
        <nav className="sf-drawer__primary" aria-label="Explore">
          {primary.map(link => <StayLink key={link.href} href={link.href} aria-current={current(link.href)} onClick={() => drawer.current?.close()}>{link.label}<ArrowUpRight aria-hidden="true" /></StayLink>)}
        </nav>
        <nav className="sf-drawer__secondary" aria-label="Your stay">
          <Link href="/account" aria-current={current('/account')} onClick={() => drawer.current?.close()}>{account ? 'Your account' : 'Sign in or create an account'}</Link>
          {secondary.map(link => <StayLink key={link.href} href={link.href} aria-current={current(link.href)} onClick={() => drawer.current?.close()}>{link.label}</StayLink>)}
        </nav>
        <div className="sf-drawer__foot">
          <StayLink href="/rooms" className="sf-btn sf-btn--lg sf-btn--block" onClick={() => drawer.current?.close()}>Find a room</StayLink>
          {phone && <a className="sf-btn sf-btn--ghost sf-btn--block" href={`tel:${phone}`}><Phone aria-hidden="true" />Call {identity.phone}</a>}
          <p className="sf-fine">Check-in from {identity.checkIn} · Check-out by {identity.checkOut}</p>
        </div>
      </div>
    </dialog>
  </header>;
}
