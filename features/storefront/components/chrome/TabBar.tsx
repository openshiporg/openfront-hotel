'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BriefcaseBusiness, House, MessageCircle, Search, UserRound } from 'lucide-react';
import { useGuestAccount } from '../GuestAccountProvider';
import { StayLink } from '../StayProvider';

/** Phone navigation: the app-style tab bar along the bottom edge. Hidden from tablet width up. */
export function TabBar() {
  const pathname = usePathname() || '/';
  const { account } = useGuestAccount();
  const at = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)) ? 'page' as const : undefined;
  const tabs = [
    { href: '/', label: 'Home', icon: House, stay: false },
    { href: '/rooms', label: 'Search', icon: Search, stay: true },
    { href: '/bookings/lookup', label: 'Trips', icon: BriefcaseBusiness, stay: false },
    { href: '/contact', label: 'Contact', icon: MessageCircle, stay: false },
    { href: '/account', label: account ? 'Profile' : 'Sign in', icon: UserRound, stay: false },
  ];
  return <nav className="sf-tabbar sf-noprint" aria-label="Quick links">
    {tabs.map(({ href, label, icon: Icon, stay }) => {
      const body = <><Icon aria-hidden="true" /><span>{label}</span></>;
      return stay
        ? <StayLink key={href} href={href} aria-current={at(href)}>{body}</StayLink>
        : <Link key={href} href={href} aria-current={at(href)}>{body}</Link>;
    })}
  </nav>;
}
