import {
  BedDouble,
  BarChart3,
  ClipboardList,
  CreditCard,
  DoorOpen,
  Hotel,
  LucideIcon,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';

export interface PlatformNavItem {
  title: string;
  href: string;
  color: string;
  description: string;
  icon: LucideIcon;
  group?: string;
}

export interface PlatformNavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: PlatformNavItem[];
}

export const platformNavItems: PlatformNavItem[] = [
  { title: 'Front Desk', href: '/platform/front-desk', color: 'blue', description: 'Manage arrivals, departures, check-ins, and in-house guests.', icon: DoorOpen, group: 'standalone' },
  { title: 'Reservations', href: '/platform/reservations', color: 'indigo', description: 'Calendar, booking visibility, and reservation management.', icon: ClipboardList, group: 'standalone' },
  { title: 'Housekeeping', href: '/platform/housekeeping', color: 'emerald', description: 'Track room turnover, inspections, and room readiness.', icon: Sparkles, group: 'standalone' },
  { title: 'Analytics', href: '/platform/analytics', color: 'purple', description: 'Occupancy, booking pace, channel mix, and revenue signals.', icon: BarChart3, group: 'standalone' },

  { title: 'Rooms', href: '/platform/rooms', color: 'sky', description: 'View and manage room inventory and room records.', icon: BedDouble, group: 'inventory' },
  { title: 'Rate Plans', href: '/platform/rate-plans', color: 'teal', description: 'Configure pricing, stay rules, and bookable hotel rates.', icon: Hotel, group: 'inventory' },
  { title: 'Guests', href: '/platform/guests', color: 'violet', description: 'Review guest profiles, stay history, and contact details.', icon: Users, group: 'guest-ops' },
  { title: 'Payments', href: '/platform/payments', color: 'amber', description: 'Track booking payments, refunds, and reconciliation.', icon: CreditCard, group: 'guest-ops' },
  { title: 'Channels', href: '/platform/channels', color: 'cyan', description: 'Monitor OTA/channel connectivity, mapping, and sync health.', icon: ShieldCheck, group: 'operations' },
  { title: 'Maintenance', href: '/platform/maintenance', color: 'orange', description: 'Manage room issues, maintenance requests, and outages.', icon: Wrench, group: 'operations' },
  { title: 'Payment Providers', href: '/platform/payment-providers', color: 'slate', description: 'Configure Stripe, PayPal, and custom payment adapters.', icon: CreditCard, group: 'integrations' },
];

export const platformStandaloneItems = platformNavItems.filter((item) => item.group === 'standalone');

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'inventory', title: 'Inventory', icon: BedDouble, items: platformNavItems.filter((i) => i.group === 'inventory') },
  { id: 'guest-ops', title: 'Guest Operations', icon: Users, items: platformNavItems.filter((i) => i.group === 'guest-ops') },
  { id: 'operations', title: 'Operations', icon: ClipboardList, items: platformNavItems.filter((i) => i.group === 'operations') },
  { id: 'integrations', title: 'Integrations', icon: ShieldCheck, items: platformNavItems.filter((i) => i.group === 'integrations') },
];

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.map((item) => ({
    ...item,
    href: `${basePath}${item.href}`,
  }));
}
