'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Phone, ShieldCheck, User, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/rooms', label: 'Rooms & suites' },
    { href: '/amenities', label: 'Amenities' },
    { href: '/location', label: 'Location' },
    { href: '/contact', label: 'Contact' },
  ];

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-[color:color-mix(in_oklab,white_82%,oklch(0.95_0.02_82))]/95 backdrop-blur-xl">
      <div className="border-b border-black/5 bg-[color:color-mix(in_oklab,white_70%,oklch(0.9_0.03_80))]">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[0.72rem] font-medium tracking-[0.14em] text-[color:oklch(0.42_0.03_58)] uppercase">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Book direct for flexible changes and front-desk support.
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5" />
            Reservations: (555) 123-4567
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="min-w-0 transition-opacity hover:opacity-80">
            <div className="hotel-kicker mb-1">Openfront Hotel</div>
            <div className="text-2xl font-semibold tracking-[-0.04em] text-[color:oklch(0.22_0.02_58)]">
              Grand Hotel
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'text-[color:oklch(0.32_0.07_47)]'
                    : 'text-[color:oklch(0.36_0.03_58)] hover:text-[color:oklch(0.3_0.06_45)]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" asChild className="hotel-link h-10 rounded-full px-4 text-sm font-medium hover:bg-transparent">
              <Link href="/bookings/lookup">Find a reservation</Link>
            </Button>
            <Button
              asChild
              className="h-10 rounded-full bg-[color:oklch(0.34_0.08_45)] px-5 text-sm font-medium text-white shadow-sm transition hover:bg-[color:oklch(0.3_0.08_42)]"
            >
              <Link href="/rooms">Book direct</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-[color:oklch(0.84_0.02_75)] bg-white/80">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-2xl">
                <DropdownMenuItem asChild>
                  <Link href="/account">My account</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/bookings/lookup">Find my booking</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/signin">Staff sign in</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:oklch(0.84_0.02_75)] bg-white/80 md:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="hotel-surface mt-4 rounded-3xl p-5 md:hidden">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium ${
                    isActive(link.href)
                      ? 'text-[color:oklch(0.32_0.07_47)]'
                      : 'text-[color:oklch(0.36_0.03_58)]'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-black/5 pt-4">
                <Button asChild className="h-11 rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]">
                  <Link href="/rooms" onClick={() => setMobileMenuOpen(false)}>
                    Book direct
                  </Link>
                </Button>
                <Button variant="ghost" asChild className="justify-start rounded-full">
                  <Link href="/bookings/lookup" onClick={() => setMobileMenuOpen(false)}>
                    Find a reservation
                  </Link>
                </Button>
                <Button variant="ghost" asChild className="justify-start rounded-full">
                  <Link href="/account" onClick={() => setMobileMenuOpen(false)}>
                    My account
                  </Link>
                </Button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
