import { Building2, CircleCheck, Package } from 'lucide-react';

export interface HotelTemplate {
  name: string;
  description: string;
  icon: React.ReactNode;
  hotelSettings: string[];
  roomTypes: string[];
  rooms: string[];
  ratePlans: string[];
  seasonalRates: string[];
  guests: string[];
  bookings: string[];
  bookingPayments: string[];
  housekeepingTasks: string[];
  maintenanceRequests: string[];
  channels: string[];
  channelReservations: string[];
  channelSyncEvents: string[];
  loyaltyTransactions: string[];
  inventory: string[];
  dailyMetrics: string[];
  displayNames: Record<string, string[]>;
}

export interface SectionDefinition {
  id: number;
  type: string;
  label: string;
  getItemsFn: (template: 'full' | 'minimal' | 'custom') => string[];
}

export const HOTEL_TEMPLATES: Record<'full' | 'minimal' | 'custom', HotelTemplate> = {
  full: {
    name: 'Complete Setup',
    description: 'Create a linked demonstration property with rooms, rates, guests, bookings, payments, housekeeping, and disabled channel examples.',
    icon: <Building2 className="h-5 w-5" />,
    hotelSettings: ['The Alder House'],
    roomTypes: ['Classic Queen', 'Deluxe King', 'Family Suite'],
    rooms: ['101', '102', '103', '201', '202', '203', '301', '302'],
    ratePlans: ['Classic Flexible', 'Deluxe Flexible', 'Bed & Breakfast', 'Family Escape'],
    seasonalRates: ['Spring City Weekend', 'Family Break Offer'],
    guests: ['ava.carter@example.com', 'liam.brooks@example.com', 'sofia.martinez@example.com'],
    bookings: ['ava-deluxe-weekend', 'liam-classic-business', 'sofia-family-break'],
    bookingPayments: ['ava-deposit', 'liam-checkin-balance'],
    housekeepingTasks: ['hk-room-103', 'hk-room-203-follow-up'],
    maintenanceRequests: ['maint-203-hvac', 'maint-102-lamp'],
    channels: ['booking-com', 'expedia'],
    channelReservations: ['bookingcom-ava', 'expedia-family'],
    channelSyncEvents: ['bookingcom-sync-ok', 'expedia-sync-warning'],
    loyaltyTransactions: ['ava-gold-bonus', 'liam-stay-credit'],
    inventory: ['classic-2026-03-18', 'deluxe-2026-03-18', 'family-2026-04-03'],
    dailyMetrics: [],
    displayNames: {
      hotelSettings: ['The Alder House'],
      roomTypes: ['Classic Queen', 'Deluxe King', 'Family Suite'],
      rooms: ['Room 101', 'Room 102', 'Room 103', 'Room 201', 'Room 202', 'Room 203', 'Room 301', 'Room 302'],
      ratePlans: ['Classic Flexible', 'Deluxe Flexible', 'Bed & Breakfast', 'Family Escape'],
      seasonalRates: ['Spring City Weekend', 'Family Break Offer'],
      guests: ['Ava Carter', 'Liam Brooks', 'Sofia Martinez'],
      bookings: ['Ava Carter · Deluxe King · Mar 18–20', 'Liam Brooks · Classic Queen · Mar 12–13', 'Sofia Martinez · Family Suite · Apr 3–6'],
      bookingPayments: ['Ava Carter deposit', 'Liam Brooks balance payment'],
      housekeepingTasks: ['Room 103 checkout clean', 'Room 203 maintenance follow-up'],
      maintenanceRequests: ['203 HVAC inspection', '102 desk lamp replacement'],
      channels: ['Booking.com', 'Expedia'],
      channelReservations: ['Booking.com · Ava Carter', 'Expedia · Sofia Martinez'],
      channelSyncEvents: ['Booking.com inventory push', 'Expedia reservation pull'],
      loyaltyTransactions: ['Ava Carter bonus points', 'Liam Brooks stay credit'],
      inventory: ['Classic Queen · Mar 18', 'Deluxe King · Mar 18', 'Family Suite · Apr 3'],
      dailyMetrics: [],
    },
  },
  minimal: {
    name: 'Basic Setup',
    description: 'Create the smallest linked property dataset that still exercises rooms, rates, a booking, payment, housekeeping, maintenance, a disabled channel example, and loyalty.',
    icon: <Package className="h-5 w-5" />,
    hotelSettings: ['The Alder House'],
    roomTypes: ['Classic Queen', 'Deluxe King'],
    rooms: ['101', '102', '103', '201', '203'],
    ratePlans: ['Classic Flexible', 'Deluxe Flexible'],
    seasonalRates: ['Spring City Weekend'],
    guests: ['ava.carter@example.com'],
    bookings: ['ava-deluxe-weekend'],
    bookingPayments: ['ava-deposit'],
    housekeepingTasks: ['hk-room-103'],
    maintenanceRequests: ['maint-203-hvac'],
    channels: ['booking-com'],
    channelReservations: ['bookingcom-ava'],
    channelSyncEvents: ['bookingcom-sync-ok'],
    loyaltyTransactions: ['ava-gold-bonus'],
    inventory: ['classic-2026-03-18', 'deluxe-2026-03-18'],
    dailyMetrics: [],
    displayNames: {
      hotelSettings: ['The Alder House'],
      roomTypes: ['Classic Queen', 'Deluxe King'],
      rooms: ['Room 101', 'Room 102', 'Room 103', 'Room 201', 'Room 203'],
      ratePlans: ['Classic Flexible', 'Deluxe Flexible'],
      seasonalRates: ['Spring City Weekend'],
      guests: ['Ava Carter'],
      bookings: ['Ava Carter · Deluxe King · Mar 18–20'],
      bookingPayments: ['Ava Carter deposit'],
      housekeepingTasks: ['Room 103 checkout clean'],
      maintenanceRequests: ['203 HVAC inspection'],
      channels: ['Booking.com'],
      channelReservations: ['Booking.com · Ava Carter'],
      channelSyncEvents: ['Booking.com inventory push'],
      loyaltyTransactions: ['Ava Carter bonus points'],
      inventory: ['Classic Queen · Mar 18', 'Deluxe King · Mar 18'],
      dailyMetrics: [],
    },
  },
  custom: {
    name: 'Custom Setup',
    description: 'Paste a hotel onboarding JSON payload tailored to your property and sample data needs.',
    icon: <CircleCheck className="h-5 w-5" />,
    hotelSettings: ['The Alder House'],
    roomTypes: ['Classic Queen', 'Deluxe King'],
    rooms: ['101', '102', '103', '201', '203'],
    ratePlans: ['Classic Flexible', 'Deluxe Flexible'],
    seasonalRates: ['Spring City Weekend'],
    guests: ['ava.carter@example.com'],
    bookings: ['ava-deluxe-weekend'],
    bookingPayments: ['ava-deposit'],
    housekeepingTasks: ['hk-room-103'],
    maintenanceRequests: ['maint-203-hvac'],
    channels: ['booking-com'],
    channelReservations: ['bookingcom-ava'],
    channelSyncEvents: ['bookingcom-sync-ok'],
    loyaltyTransactions: ['ava-gold-bonus'],
    inventory: ['classic-2026-03-18', 'deluxe-2026-03-18'],
    dailyMetrics: [],
    displayNames: {
      hotelSettings: ['The Alder House'],
      roomTypes: ['Classic Queen', 'Deluxe King'],
      rooms: ['Room 101', 'Room 102', 'Room 103', 'Room 201', 'Room 203'],
      ratePlans: ['Classic Flexible', 'Deluxe Flexible'],
      seasonalRates: ['Spring City Weekend'],
      guests: ['Ava Carter'],
      bookings: ['Ava Carter · Deluxe King · Mar 18–20'],
      bookingPayments: ['Ava Carter deposit'],
      housekeepingTasks: ['Room 103 checkout clean'],
      maintenanceRequests: ['203 HVAC inspection'],
      channels: ['Booking.com'],
      channelReservations: ['Booking.com · Ava Carter'],
      channelSyncEvents: ['Booking.com inventory push'],
      loyaltyTransactions: ['Ava Carter bonus points'],
      inventory: ['Classic Queen · Mar 18', 'Deluxe King · Mar 18'],
      dailyMetrics: [],
    },
  },
};

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: 1, type: 'hotelSettings', label: 'Hotel Identity', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.hotelSettings },
  { id: 2, type: 'roomTypes', label: 'Room Types & Amenities', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.roomTypes },
  { id: 3, type: 'rooms', label: 'Physical Rooms', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.rooms },
  { id: 4, type: 'ratePlans', label: 'Rate Plans & Policies', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.ratePlans },
  { id: 5, type: 'seasonalRates', label: 'Seasonal Rates', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.seasonalRates },
  { id: 6, type: 'guests', label: 'Guests', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.guests },
  { id: 7, type: 'bookings', label: 'Direct-booking & PMS Reservations', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.bookings },
  { id: 8, type: 'bookingPayments', label: 'Booking Payments', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.bookingPayments },
  { id: 9, type: 'housekeepingTasks', label: 'Housekeeping Tasks', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.housekeepingTasks },
  { id: 10, type: 'maintenanceRequests', label: 'Maintenance Requests', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.maintenanceRequests },
  { id: 11, type: 'channels', label: 'Channels', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.channels },
  { id: 12, type: 'channelReservations', label: 'Channel Reservations', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.channelReservations },
  { id: 13, type: 'channelSyncEvents', label: 'Channel Sync Events', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.channelSyncEvents },
  { id: 14, type: 'loyaltyTransactions', label: 'Loyalty Transactions', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.loyaltyTransactions },
  { id: 15, type: 'inventory', label: 'Room Inventory Controls', getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.inventory },
];
