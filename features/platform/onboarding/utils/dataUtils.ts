import { HOTEL_TEMPLATES } from '../config/templates';

export function getItemsFromJsonData(jsonData: any, sectionType: string): string[] {
  if (!jsonData) return [];

  switch (sectionType) {
    case 'hotelSettings':
      return jsonData.hotelSettings?.propertyName
        ? [jsonData.hotelSettings.propertyName]
        : [];
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
    case 'bookingPayments':
      return (jsonData.bookingPayments || []).map((payment: any) => payment.label || payment.key || payment.paymentReference || 'Booking Payment');
    case 'housekeepingTasks':
      return (jsonData.housekeepingTasks || []).map((task: any) => task.label || `Room ${task.roomNumber || 'Unknown'} ${task.taskType || 'Task'}`);
    case 'maintenanceRequests':
      return (jsonData.maintenanceRequests || []).map((request: any) => request.label || request.title || 'Maintenance Request');
    case 'channels':
      return (jsonData.channels || []).map((channel: any) => channel.name || channel.code || 'Channel');
    case 'channelReservations':
      return (jsonData.channelReservations || []).map((reservation: any) => reservation.label || reservation.externalId || reservation.guestName || 'Channel Reservation');
    case 'channelSyncEvents':
      return (jsonData.channelSyncEvents || []).map((event: any) => event.label || `${event.channelName || 'Channel'} ${event.action || 'sync'}`);
    case 'loyaltyTransactions':
      return (jsonData.loyaltyTransactions || []).map((transaction: any) => transaction.label || transaction.description || 'Loyalty Transaction');
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
    hotelSettings: seedData.hotelSettings,
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
    bookingPayments: (seedData.bookingPayments || []).filter((payment: any) =>
      tpl.bookingPayments.includes(payment.key)
    ),
    housekeepingTasks: (seedData.housekeepingTasks || []).filter((task: any) =>
      tpl.housekeepingTasks.includes(task.key)
    ),
    maintenanceRequests: (seedData.maintenanceRequests || []).filter((request: any) =>
      tpl.maintenanceRequests.includes(request.key)
    ),
    channels: (seedData.channels || []).filter((channel: any) =>
      tpl.channels.includes(channel.key)
    ),
    channelReservations: (seedData.channelReservations || []).filter((reservation: any) =>
      tpl.channelReservations.includes(reservation.key)
    ),
    channelSyncEvents: (seedData.channelSyncEvents || []).filter((event: any) =>
      tpl.channelSyncEvents.includes(event.key)
    ),
    loyaltyTransactions: (seedData.loyaltyTransactions || []).filter((transaction: any) =>
      tpl.loyaltyTransactions.includes(transaction.key)
    ),
    inventory: (seedData.inventory || []).filter((inventory: any) =>
      tpl.inventory.includes(inventory.key)
    ),
    dailyMetrics: (seedData.dailyMetrics || []).filter((metric: any) =>
      tpl.dailyMetrics.includes(metric.date)
    ),
  };
}
