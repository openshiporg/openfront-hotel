'use client';
import Link from 'next/link';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import { StayLink } from '@/features/storefront/components/StayProvider';
export function Footer() {
  const identity = useHotelSettings();
  return <footer className="hotel-footer"><div className="lodging-container">
    <div data-qa-layout="storefront-footer-grid" className="hotel-footer-grid"><div><p className="lodging-eyebrow">Until your next visit</p><p className="lodging-serif hotel-footer-name">{identity.name}</p><p>{identity.tagline}</p></div>
      <div><h2>Explore the house</h2><StayLink href="/rooms">Rooms & suites</StayLink><StayLink href="/amenities">Amenities</StayLink><StayLink href="/gallery">Photographs</StayLink><StayLink href="/location">Location & arrival</StayLink></div>
      <div><h2>Your stay</h2><Link href="/bookings/lookup">Find a reservation</Link><Link href="/account">Verified stays</Link><Link href="/policies">Stay information & policies</Link><StayLink href="/contact">Contact the house</StayLink></div>
      <div><h2>Find us</h2>{identity.address.line1 ? <p>{identity.address.line1}<br />{identity.address.line2}</p> : <p>Contact details will appear when published by the property.</p>}{identity.phone && <a href={`tel:${identity.phone.replace(/[^+\d]/g, '')}`}>{identity.phone}</a>}{identity.email && <a href={`mailto:${identity.email}`}>{identity.email}</a>}{identity.hours && <p>{identity.hours}</p>}</div>
    </div><div className="hotel-footer-bottom"><p>Direct reservations with {identity.name}</p><p>Arrival {identity.checkIn} · Departure {identity.checkOut}</p></div>
  </div></footer>;
}
