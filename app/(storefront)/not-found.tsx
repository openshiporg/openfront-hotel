import Link from 'next/link';
import { Compass } from 'lucide-react';
import type { Metadata } from 'next';
import { StatePanel } from '@/features/storefront/components/ui';

export const metadata: Metadata = { title: 'Page not found' };
export default function StorefrontNotFound() {
  return <StatePanel icon={Compass} eyebrow="Page not found" title={<>Find your way back <em>to the house.</em></>}
    actions={<><Link href="/rooms" className="sf-btn">Explore rooms</Link><Link href="/bookings/lookup" className="sf-link">Find a reservation</Link></>}>
    This page may have moved. Your reservation can still be found through secure lookup.
  </StatePanel>;
}
