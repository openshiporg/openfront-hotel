import Link from 'next/link';

const LINKS = [
  { href: '/bookings/lookup', label: 'Find stay', title: 'Find a reservation' },
  { href: '/account', label: 'Account', title: 'Your account' },
  { href: '/contact', label: 'Contact', title: 'Contact the house' },
] as const;

export function GuestPortalNav({ current }: { current: '/bookings/lookup' | '/account' }) {
  return <nav aria-label="Guest portal" className="sf-segment sf-segment--fill" style={{ marginTop: 28 }}>
    {LINKS.map(link => <Link key={link.href} href={link.href} aria-current={link.href === current ? 'page' : undefined} className="sf-segment__link" title={link.title}>{link.label}</Link>)}
  </nav>;
}
