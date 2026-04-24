import { Building2, CircleCheck, Package } from 'lucide-react';

export interface HotelTemplate {
  name: string;
  description: string;
  icon: React.ReactNode;
  roomTypes: string[];
  rooms: string[];
  ratePlans: string[];
  seasonalRates: string[];
  guests: string[];
  bookings: string[];
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
    description: 'Create a demo-ready hotel with room types, rates, guests, bookings, inventory, and metrics.',
    icon: <Building2 className="h-5 w-5" />,
    roomTypes: ['Classic Queen', 'Deluxe King', 'Family Suite'],
    rooms: ['101', '102', '103', '201', '202', '203', '301', '302'],
    ratePlans: ['Classic Flexible', 'Deluxe Flexible', 'Bed & Breakfast', 'Family Escape'],
    seasonalRates: ['Spring City Weekend', 'Family Break Offer'],
    guests: ['ava.carter@example.com', 'liam.brooks@example.com', 'sofia.martinez@example.com'],
    bookings: ['ava-deluxe-weekend', 'liam-classic-business', 'sofia-family-break'],
    inventory: ['classic-2026-03-18', 'deluxe-2026-03-18', 'family-2026-04-03'],
    dailyMetrics: ['2026-03-10T00:00:00.000Z', '2026-03-11T00:00:00.000Z'],
    displayNames: {
      roomTypes: ['Classic Queen', 'Deluxe King', 'Family Suite'],
      rooms: ['Room 101', 'Room 102', 'Room 103', 'Room 201', 'Room 202', 'Room 203', 'Room 301', 'Room 302'],
      ratePlans: ['Classic Flexible', 'Deluxe Flexible', 'Bed & Breakfast', 'Family Escape'],
      seasonalRates: ['Spring City Weekend', 'Family Break Offer'],
      guests: ['Ava Carter', 'Liam Brooks', 'Sofia Martinez'],
      bookings: ['Ava Carter · Deluxe King · Mar 18–20', 'Liam Brooks · Classic Queen · Mar 12–13', 'Sofia Martinez · Family Suite · Apr 3–6'],
      inventory: ['Classic Queen · Mar 18', 'Deluxe King · Mar 18', 'Family Suite · Apr 3'],
      dailyMetrics: ['Metrics · Mar 10', 'Metrics · Mar 11'],
    },
  },
  minimal: {
    name: 'Basic Setup',
    description: 'Create the minimum linked hotel data needed to inspect the PMS and test booking flows.',
    icon: <Package className="h-5 w-5" />,
    roomTypes: ['Classic Queen'],
    rooms: ['101', '102'],
    ratePlans: ['Classic Flexible'],
    seasonalRates: [],
    guests: ['ava.carter@example.com'],
    bookings: ['ava-deluxe-weekend'],
    inventory: ['classic-2026-03-18'],
    dailyMetrics: ['2026-03-10T00:00:00.000Z'],
    displayNames: {
      roomTypes: ['Classic Queen'],
      rooms: ['Room 101', 'Room 102'],
      ratePlans: ['Classic Flexible'],
      seasonalRates: [],
      guests: ['Ava Carter'],
      bookings: ['Ava Carter · Deluxe King · Mar 18–20'],
      inventory: ['Classic Queen · Mar 18'],
      dailyMetrics: ['Metrics · Mar 10'],
    },
  },
  custom: {
    name: 'Custom Setup',
    description: 'Paste a hotel onboarding JSON payload tailored to your property and demo data needs.',
    icon: <CircleCheck className="h-5 w-5" />,
    roomTypes: ['Classic Queen'],
    rooms: ['101', '102'],
    ratePlans: ['Classic Flexible'],
    seasonalRates: [],
    guests: ['ava.carter@example.com'],
    bookings: ['ava-deluxe-weekend'],
    inventory: ['classic-2026-03-18'],
    dailyMetrics: ['2026-03-10T00:00:00.000Z'],
    displayNames: {
      roomTypes: ['Classic Queen'],
      rooms: ['Room 101', 'Room 102'],
      ratePlans: ['Classic Flexible'],
      seasonalRates: [],
      guests: ['Ava Carter'],
      bookings: ['Ava Carter · Deluxe King · Mar 18–20'],
      inventory: ['Classic Queen · Mar 18'],
      dailyMetrics: ['Metrics · Mar 10'],
    },
  },
};

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 1,
    type: 'roomTypes',
    label: 'Room Types',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.roomTypes,
  },
  {
    id: 2,
    type: 'rooms',
    label: 'Rooms',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.rooms,
  },
  {
    id: 3,
    type: 'ratePlans',
    label: 'Rate Plans',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.ratePlans,
  },
  {
    id: 4,
    type: 'seasonalRates',
    label: 'Seasonal Rates',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.seasonalRates,
  },
  {
    id: 5,
    type: 'guests',
    label: 'Guests',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.guests,
  },
  {
    id: 6,
    type: 'bookings',
    label: 'Sample Reservations',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.bookings,
  },
  {
    id: 7,
    type: 'inventory',
    label: 'Availability Snapshots',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.inventory,
  },
  {
    id: 8,
    type: 'dailyMetrics',
    label: 'Daily Metrics',
    getItemsFn: (template) => HOTEL_TEMPLATES[template].displayNames.dailyMetrics,
  },
];
