'use client';

import Link from 'next/link';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';

export function Footer() {
  const identity = useHotelSettings();

  return (
    <footer className="lodging-surface-night border-t border-[color-mix(in_oklch,var(--lodging-paper)_12%,transparent)]">
      <div data-qa-layout="storefront-footer-grid" className="lodging-container grid min-w-0 gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="min-w-0 space-y-6">
          <p className="lodging-serif text-[clamp(2rem,4vw,3rem)] leading-none text-[color-mix(in_oklch,var(--lodging-paper)_94%,white)]">
            {identity.name}
          </p>
          <p className="max-w-md text-[color-mix(in_oklch,var(--lodging-paper)_68%,white)] leading-7">
            {identity.tagline}. Reservations, guest requests, and changes stay with the property team—not a marketplace.
          </p>
        </div>

        <div className="grid min-w-0 gap-8 sm:grid-cols-2">
          <div className="min-w-0 space-y-3 text-sm leading-6 text-[color-mix(in_oklch,var(--lodging-paper)_72%,white)]">
            <p className="lodging-eyebrow text-[color-mix(in_oklch,var(--lodging-accent)_80%,white)]">Visit</p>
            <p>{identity.address.line1}</p>
            <p>{identity.address.line2}</p>
          </div>
          <div className="min-w-0 space-y-3 text-sm leading-6 text-[color-mix(in_oklch,var(--lodging-paper)_72%,white)]">
            <p className="lodging-eyebrow text-[color-mix(in_oklch,var(--lodging-accent)_80%,white)]">Concierge</p>
            <a href={`tel:${identity.phone.replace(/\D/g, '')}`} className="block [overflow-wrap:anywhere] hover:text-white">
              {identity.phone}
            </a>
            <a href={`mailto:${identity.email}`} className="block [overflow-wrap:anywhere] hover:text-white">
              {identity.email}
            </a>
            <p>{identity.hours}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-[color-mix(in_oklch,var(--lodging-paper)_10%,transparent)]">
        <div className="lodging-container flex flex-col gap-4 py-6 text-xs text-[color-mix(in_oklch,var(--lodging-paper)_55%,white)] sm:flex-row sm:items-center sm:justify-between">
          <p>Check-in {identity.checkIn} · Check-out {identity.checkOut}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/rooms" className="hover:text-white">
              Rooms
            </Link>
            <Link href="/bookings/lookup" className="hover:text-white">
              Booking lookup
            </Link>
            <Link href="/contact" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
