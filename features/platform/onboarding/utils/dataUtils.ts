import { HOTEL_TEMPLATES } from '../config/templates';

export function getItemsFromJsonData(jsonData: any, sectionType: string): string[] {
  if (!jsonData) return [];

  switch (sectionType) {
    case 'roomTypes':
      return (jsonData.roomTypes || []).map((roomType: any) => roomType.name || 'Unknown Room Type');
    case 'rooms':
      return (jsonData.rooms || []).map((room: any) => `Room ${room.roomNumber || 'Unknown'}`);
    case 'ratePlans':
      return (jsonData.ratePlans || []).map((ratePlan: any) => ratePlan.name || 'Unknown Rate Plan');
    case 'seasonalRates':
      return (jsonData.seasonalRates || []).map((seasonalRate: any) => seasonalRate.name || 'Unknown Seasonal Rate');
    case 'guests':
      return (jsonData.guests || []).map((guest: any) => `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || guest.email || 'Unknown Guest');
    case 'bookings':
      return (jsonData.bookings || []).map((booking: any) => booking.label || booking.key || booking.guestName || 'Sample Reservation');
    case 'inventory':
      return (jsonData.inventory || []).map((inventory: any) => inventory.label || `${inventory.roomType || 'Room Type'} · ${inventory.date || 'Date'}`);
    case 'dailyMetrics':
      return (jsonData.dailyMetrics || []).map((metric: any) => metric.label || `Metrics · ${new Date(metric.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    default:
      return [];
  }
}

export function getSeedForTemplate(
  template: 'full' | 'minimal' | 'custom',
  seedData: any
) {
  const templateToUse = template === 'custom' ? 'minimal' : template;
  const tpl = HOTEL_TEMPLATES[templateToUse];

  return {
    roomTypes: (seedData.roomTypes || []).filter((roomType: any) =>
      tpl.roomTypes.includes(roomType.name)
    ),
    rooms: (seedData.rooms || []).filter((room: any) =>
      tpl.rooms.includes(room.roomNumber)
    ),
    ratePlans: (seedData.ratePlans || []).filter((ratePlan: any) =>
      tpl.ratePlans.includes(ratePlan.name)
    ),
    seasonalRates: (seedData.seasonalRates || []).filter((seasonalRate: any) =>
      tpl.seasonalRates.includes(seasonalRate.name)
    ),
    guests: (seedData.guests || []).filter((guest: any) =>
      tpl.guests.includes(guest.email)
    ),
    bookings: (seedData.bookings || []).filter((booking: any) =>
      tpl.bookings.includes(booking.key)
    ),
    inventory: (seedData.inventory || []).filter((inventory: any) =>
      tpl.inventory.includes(inventory.key)
    ),
    dailyMetrics: (seedData.dailyMetrics || []).filter((metric: any) =>
      tpl.dailyMetrics.includes(metric.date)
    ),
  };
}
