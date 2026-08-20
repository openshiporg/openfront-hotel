'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';

const navLinks = [
  { href: '/rooms', label: 'Rooms' },
  { href: '/amenities', label: 'Amenities' },
  { href: '/location', label: 'Location' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const identity = useHotelSettings();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = pathname === '/';

  useEffect(() => {
    // Reset navigation state when route changes; this is an intentional UI sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-colors duration-300 ${
        isHome
          ? 'border-transparent bg-[color-mix(in_oklch,var(--lodging-night)_92%,transparent)] text-[color-mix(in_oklch,var(--lodging-paper)_92%,white)] backdrop-blur-md'
          : 'border-[var(--lodging-rule)] bg-[color-mix(in_oklch,var(--lodging-paper)_94%,white)] text-[var(--lodging-ink)] backdrop-blur-md'
      }`}
    >
      <div className="lodging-container flex items-center justify-between gap-6 py-4 md:py-5">
        <Link
          href="/"
          className="lodging-serif min-w-0 text-[clamp(1.35rem,2.5vw,1.75rem)] leading-none transition-opacity hover:opacity-80"
        >
          {identity.name}
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const active = pathname === link.href || (pathname?.startsWith(`${link.href}/`) ?? false);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`lodging-eyebrow transition-colors ${
                  active
                    ? isHome
                      ? 'text-[var(--lodging-accent-pale)]'
                      : 'text-[var(--lodging-accent-deep)]'
                    : isHome
                      ? 'text-[color-mix(in_oklch,var(--lodging-paper)_72%,white)] hover:text-white'
                      : 'text-[var(--lodging-ink-muted)] hover:text-[var(--lodging-ink)]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link
            href="/bookings/lookup"
            className={`lodging-eyebrow transition-colors ${
              isHome
                ? 'text-[color-mix(in_oklch,var(--lodging-paper)_72%,white)] hover:text-white'
                : 'text-[var(--lodging-ink-muted)] hover:text-[var(--lodging-ink)]'
            }`}
          >
            Manage stay
          </Link>
          <Link
            href="/rooms"
            className={`lodging-button min-h-0 py-2.5 ${
              isHome ? 'bg-[var(--lodging-accent-deep)] hover:bg-[var(--lodging-accent)]' : ''
            }`}
          >
            Reserve
          </Link>
        </div>

        <button
          type="button"
          className={`inline-flex h-10 w-10 items-center justify-center border lg:hidden ${
            isHome ? 'border-white/25 text-white' : 'border-[var(--lodging-rule)] text-[var(--lodging-ink)]'
          }`}
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <nav
          className={`border-t px-5 py-5 lg:hidden ${
            isHome
              ? 'border-white/15 bg-[var(--lodging-night)]'
              : 'border-[var(--lodging-rule)] bg-[var(--lodging-paper)]'
          }`}
          aria-label="Mobile"
        >
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="lodging-eyebrow">
                {link.label}
              </Link>
            ))}
            <Link href="/bookings/lookup" className="lodging-eyebrow">
              Manage stay
            </Link>
            <Link href="/rooms" className="lodging-button w-fit">
              Reserve
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
