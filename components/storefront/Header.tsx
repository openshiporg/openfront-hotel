'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import { StayLink, useStay } from '@/features/storefront/components/StayProvider';
import { calendarDay } from '@/features/storefront/lib/stay-context';
import { formatStayDate } from '@/lib/hotelCalendarDate';
const links = [{ href: '/rooms', label: 'Rooms & suites' }, { href: '/amenities', label: 'The house' }, { href: '/gallery', label: 'Gallery' }, { href: '/location', label: 'Location' }];
export function Header() {
  const identity = useHotelSettings(); const pathname = usePathname(); const { stay } = useStay();
  const [menu,setMenu]=useState({path:pathname,open:false});const open=menu.path===pathname&&menu.open;const setOpen=(value:boolean)=>setMenu({path:pathname,open:value}); const toggle = useRef<HTMLButtonElement>(null);
  const dates = new URLSearchParams(stay); const arrival = dates.get('checkIn') || ''; const departure = dates.get('checkOut') || '';
  return <header className="hotel-header" onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
    <a className="hotel-skip" href="#storefront-content">Skip to content</a>
    <div className="lodging-container hotel-header-row">
      <Link href="/" className="hotel-wordmark lodging-serif">{identity.name}</Link>
      <nav className="hotel-desktop-nav" aria-label="Primary">{links.map(link => <StayLink key={link.href} href={link.href} aria-current={pathname === link.href || pathname?.startsWith(`${link.href}/`) ? 'page' : undefined}>{link.label}</StayLink>)}</nav>
      <div className="hotel-header-actions"><Link className="hotel-manage-link" href="/bookings/lookup">Manage stay</Link><StayLink className="lodging-button" href="/rooms">Reserve <span aria-hidden="true">↗</span></StayLink>
      <button ref={toggle} type="button" className="hotel-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="hotel-mobile-menu" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button></div>
    </div>
    {open && <nav id="hotel-mobile-menu" className="hotel-mobile-nav lodging-container" aria-label="Mobile">{[...links, { href: '/bookings/lookup', label: 'Find a reservation' }, { href: '/account', label: 'Verified stays' }, { href: '/contact', label: 'Contact the house' }, { href: '/policies', label: 'Stay information & policies' }].map(link => <StayLink key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} onClick={() => setOpen(false)}>{link.label}<span aria-hidden="true">↗</span></StayLink>)}</nav>}
    {calendarDay(arrival) && calendarDay(departure) && pathname !== '/' && !pathname?.startsWith('/booking/') && <div className="hotel-stay-strip"><div className="lodging-container"><span>Your stay · {formatStayDate(arrival, { month: 'short', day: 'numeric' })} – {formatStayDate(departure, { month: 'short', day: 'numeric' })} · {Number(dates.get('adults') || 2) + Number(dates.get('children') || 0)} guests</span><StayLink href="/rooms#choose-dates">Edit stay</StayLink></div></div>}
  </header>;
}
