'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useHotelSettings } from '../HotelSettingsProvider';
import { StayLink } from '../StayProvider';
import { Wordmark } from './SiteHeader';

export function SiteFooter() {
  const identity = useHotelSettings();
  const phone = identity.phone.replace(/[^+\d]/g, '');
  return <footer className="sf-footer">
    <div className="sf-wrap">
      <div className="sf-footer__cta">
        <div className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
          <p className="sf-eyebrow">Until your next visit</p>
          <p className="sf-display">Come and <em>stay a while.</em></p>
        </div>
        <StayLink href="/rooms" className="sf-btn sf-btn--light sf-btn--lg">Check availability <ArrowRight className="sf-btn__go" aria-hidden="true" /></StayLink>
      </div>
      <div className="sf-footer__grid" data-qa-layout="storefront-footer-grid">
        <div className="sf-footer__brand">
          <Wordmark name={identity.name} logo={identity.logo} />
          <p>{identity.tagline}</p>
          <div className="sf-footer__times">
            <div><span>Check-in</span><b>{identity.checkIn}</b></div>
            <div><span>Check-out</span><b>{identity.checkOut}</b></div>
          </div>
        </div>
        <nav aria-label="Explore the house">
          <h2>Explore</h2>
          <ul>
            <li><StayLink href="/rooms">Rooms & suites</StayLink></li>
            <li><StayLink href="/amenities">The house</StayLink></li>
            <li><StayLink href="/gallery">Gallery</StayLink></li>
            <li><StayLink href="/location">Location & arrival</StayLink></li>
          </ul>
        </nav>
        <nav aria-label="Your stay">
          <h2>Your stay</h2>
          <ul>
            <li><Link href="/bookings/lookup">Find a reservation</Link></li>
            <li><Link href="/account">Your account</Link></li>
            <li><Link href="/policies">Stay information & policies</Link></li>
            <li><StayLink href="/contact">Contact the house</StayLink></li>
          </ul>
        </nav>
        <div>
          <h2>Find us</h2>
          <address>
            {identity.address.line1 ? <span>{identity.address.line1}{identity.address.line2 && <><br />{identity.address.line2}</>}</span> : <span>Contact details appear here once published by the property.</span>}
            {phone && <a href={`tel:${phone}`}>{identity.phone}</a>}
            {identity.email && <a href={`mailto:${identity.email}`}>{identity.email}</a>}
            {identity.hours && <span>{identity.hours}</span>}
          </address>
        </div>
      </div>
      <div className="sf-footer__bottom">
        <p>Direct reservations with {identity.name}</p>
        <p>Times shown are local to the property</p>
      </div>
    </div>
  </footer>;
}
