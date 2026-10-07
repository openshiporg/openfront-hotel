import {
  BedDouble,
  BarChart3,
  Blocks,
  ClipboardList,
  CreditCard,
  DoorOpen,
  Hotel,
  LucideIcon,
  ReceiptText,
  Send,
  ShieldCheck,
  Sparkles,
  Settings2,
  Users,
  Wrench,
} from 'lucide-react';

export type PlatformPermission = 'canAccessDashboard' | 'canManageGuestPrivacy' | 'canApproveHotelExceptions' | 'canManageRooms' | 'canManageBookings' | 'canManageHousekeeping' | 'canManageGuests' | 'canManagePayments' | 'canManageAudit' | 'canManageIntegrations' | 'canManageOnboarding';

export interface PlatformNavItem {
  title: string;
  href: string;
  color: string;
  description: string;
  icon: LucideIcon;
  group?: string;
  permission?: PlatformPermission;
  permissions?: PlatformPermission[];
  anyPermissions?: PlatformPermission[];
}

export interface PlatformNavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: PlatformNavItem[];
}

export interface PlatformNavigationUser {
  role?: Partial<Record<PlatformPermission, boolean>>;
}

export const platformNavItems: PlatformNavItem[] = [
  { title: 'Front Desk', href: '/platform/front-desk', color: 'blue', description: 'Manage arrivals, departures, check-ins, and in-house guests.', icon: DoorOpen, group: 'standalone', permission: 'canManageBookings' },
  { title: 'Reservations', href: '/platform/reservations', color: 'indigo', description: 'Calendar, booking visibility, and reservation management.', icon: ClipboardList, group: 'standalone', permission: 'canManageBookings' },
  { title: 'Housekeeping', href: '/platform/housekeeping', color: 'emerald', description: 'Track room turnover, inspections, and room readiness.', icon: Sparkles, group: 'standalone', permission: 'canManageHousekeeping' },
  { title: 'Reports', href: '/platform/analytics', color: 'purple', description: 'Source-derived occupancy, revenue, tax, payment, refund, and folio reports.', icon: BarChart3, group: 'standalone', permission: 'canManageBookings' },

  { title: 'Property Settings', href: '/platform/property', color: 'slate', description: 'Configure launch identity, contact details, stay times, tax, fees, currency, and storefront media.', icon: Settings2, group: 'inventory', permission: 'canManageOnboarding' },
  { title: 'Rooms', href: '/platform/rooms', color: 'sky', description: 'View and manage room inventory and room records.', icon: BedDouble, group: 'inventory', permission: 'canManageRooms' },
  { title: 'Rate Plans', href: '/platform/rate-plans', color: 'teal', description: 'Configure pricing, stay rules, and bookable hotel rates.', icon: Hotel, group: 'inventory', permission: 'canManageRooms' },
  { title: 'Guests', href: '/platform/guests', color: 'violet', description: 'Review guest profiles, stay history, and contact details.', icon: Users, group: 'guest-ops', permission: 'canManageGuests' },
  { title: 'Payments', href: '/platform/payments', color: 'amber', description: 'Track booking payments, refunds, and reconciliation.', icon: CreditCard, group: 'guest-ops', permission: 'canManagePayments' },
  { title: 'Payouts', href: '/platform/payouts', color: 'amber', description: 'Reconcile reviewed settlement statements and bank references.', icon: ReceiptText, group: 'guest-ops', permission: 'canManagePayments' },
  { title: 'Receivables', href: '/platform/receivables', color: 'amber', description: 'Company accounts, direct billing, invoices and collections.', icon: ReceiptText, group: 'guest-ops', permission: 'canManagePayments' },
  { title: 'Disputes', href: '/platform/disputes', color: 'amber', description: 'Review provider dispute notices and evidence handoff.', icon: ShieldCheck, group: 'guest-ops', permission: 'canManagePayments' },
  { title: 'Security', href: '/platform/security', color: 'slate', description: 'Manage your second factor and recovery codes.', icon: ShieldCheck, group: 'guest-ops', permission: 'canAccessDashboard' },
  { title: 'Cashier', href: '/platform/cashier', color: 'amber', description: 'Open shifts, record cash movements and reconcile closing counts.', icon: ReceiptText, group: 'guest-ops', permission: 'canManagePayments' },
  { title: 'Approvals', href: '/platform/approvals', color: 'violet', description: 'Request or independently review financial and rate publication exceptions.', icon: ShieldCheck, group: 'guest-ops', anyPermissions: ['canManagePayments', 'canManageRooms', 'canApproveHotelExceptions'] },
  { title: 'Guest Governance', href: '/platform/guest-governance', color: 'violet', description: 'Review privacy requests, consent, identity evidence and independent approvals.', icon: ShieldCheck, group: 'guest-ops', permission: 'canManageGuestPrivacy' },
  { title: 'Folios', href: '/platform/folios', color: 'stone', description: 'Review append-only reservation charges, settlements, and corrections.', icon: ReceiptText, group: 'guest-ops', permission: 'canManagePayments' },
  { title: 'Channel Bridge', href: '/platform/channels', color: 'cyan', description: 'Inspect the experimental P2 HTTPS bridge; keep channels disabled for supported launch.', icon: ShieldCheck, group: 'operations', permissions: ['canManageBookings', 'canManageIntegrations'] },
  { title: 'Group Blocks', href: '/platform/groups', color: 'zinc', description: 'Manage contracted room blocks, rooming lists and master folios when enabled.', icon: Blocks, group: 'operations', permission: 'canManageBookings' },
  { title: 'Maintenance', href: '/platform/maintenance', color: 'orange', description: 'Manage room issues, maintenance requests, and outages.', icon: Wrench, group: 'operations', permission: 'canManageRooms' },
  { title: 'Payment Providers', href: '/platform/payment-providers', color: 'slate', description: 'Inspect environment-backed Stripe, PayPal, and manual payment adapters.', icon: CreditCard, group: 'integrations', permission: 'canManagePayments' },
  { title: 'Outbox & DLQ', href: '/platform/outbox', color: 'rose', description: 'Inspect delivery/refund failures and authorize replay.', icon: Send, group: 'integrations', permission: 'canManageAudit' },
];

export const platformStandaloneItems = platformNavItems.filter((item) => item.group === 'standalone');

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'inventory', title: 'Inventory', icon: BedDouble, items: platformNavItems.filter((i) => i.group === 'inventory') },
  { id: 'guest-ops', title: 'Guest Operations', icon: Users, items: platformNavItems.filter((i) => i.group === 'guest-ops') },
  { id: 'operations', title: 'Operations', icon: ClipboardList, items: platformNavItems.filter((i) => i.group === 'operations') },
  { id: 'integrations', title: 'Integrations', icon: ShieldCheck, items: platformNavItems.filter((i) => i.group === 'integrations') },
];

export function getPlatformNavItemsWithBasePath(
  basePath: string,
  user?: PlatformNavigationUser | null
) {
  return platformNavItems
    .filter((item) => {
      const required = item.permissions || (item.permission ? [item.permission] : []);
      return required.every((permission) => Boolean(user?.role?.[permission])) && (!item.anyPermissions || item.anyPermissions.some(permission => Boolean(user?.role?.[permission])));
    })
    .map((item) => ({
      ...item,
      href: `${basePath}${item.href}`,
    }));
}
