export const HOTEL_ONBOARDING_ARRAY_SECTIONS = [
  'roomTypes',
  'rooms',
  'ratePlans',
  'seasonalRates',
  'guests',
  'bookings',
  'bookingPayments',
  'housekeepingTasks',
  'maintenanceRequests',
  'channels',
  'channelReservations',
  'channelSyncEvents',
  'loyaltyTransactions',
  'inventory',
  'dailyMetrics',
] as const;

export const HOTEL_ONBOARDING_SECTIONS = [
  'hotelSettings',
  ...HOTEL_ONBOARDING_ARRAY_SECTIONS,
] as const;

const ALLOWED_AMENITIES = new Set([
  'wifi', 'tv', 'minibar', 'balcony', 'coffee_maker', 'safe', 'bathtub', 'shower',
  'ac', 'heating', 'desk', 'iron', 'hair_dryer', 'room_service', 'ocean_view',
  'city_view', 'garden_view', 'kitchenette', 'jacuzzi', 'fireplace', 'rain_shower',
  'premium_linens', 'blackout_drapes', 'sitting_area', 'breakfast_available',
  'accessible', 'courtyard_view', 'heritage_details',
]);
const BED_CONFIGURATIONS = new Set(['king', 'queen', 'double_queen', 'twin', 'double_twin', 'king_sofa', 'queen_sofa', 'suite']);
const ROOM_STATUSES = new Set(['vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order']);
const RATE_STATUSES = new Set(['active', 'inactive', 'draft']);
const CANCELLATION_POLICIES = new Set(['flexible', 'moderate', 'strict', 'non_refundable']);
const MEAL_PLANS = new Set(['room_only', 'breakfast', 'half_board', 'full_board', 'all_inclusive']);
const BOOKING_STATUSES = new Set(['pending', 'confirmed', 'checked_in', 'checked_out', 'cancellation_pending', 'cancelled', 'no_show']);
const PAYMENT_STATUSES = new Set(['unpaid', 'partial', 'paid', 'refunded']);
const BOOKING_SOURCES = new Set(['direct', 'website', 'phone', 'walk_in', 'ota', 'corporate', 'group']);
const HOUSEKEEPING_TYPES = new Set(['checkout_clean', 'stayover_clean', 'deep_clean', 'maintenance', 'inspection', 'turn_down']);
const HOUSEKEEPING_STATUSES = new Set(['pending', 'in_progress', 'completed', 'inspection_needed', 'on_hold']);
const MAINTENANCE_CATEGORIES = new Set(['plumbing', 'electrical', 'hvac', 'furniture', 'appliance', 'structural', 'cleaning', 'other']);
const MAINTENANCE_PRIORITIES = new Set(['low', 'medium', 'high', 'emergency']);
const MAINTENANCE_STATUSES = new Set(['reported', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled']);

export type HotelOnboardingValidation =
  | { success: true; data: Record<string, any> }
  | { success: false; errors: string[] };

function record(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, path: string, errors: string[], max = 320) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    errors.push(`${path} must be a non-empty string no longer than ${max} characters.`);
  }
}

const MAX_MINOR_UNITS = 2_147_483_647;
const OCCUPYING_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'checked_in', 'cancellation_pending']);

/** Whole cents within the stored Int32 range, or null. */
function exactMinorUnits(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const minor = Math.round(value * 100);
  return Math.abs(value * 100 - minor) < 1e-6 && minor <= MAX_MINOR_UNITS ? minor : null;
}

function wholeCents(value: unknown, path: string, errors: string[]) {
  const minor = exactMinorUnits(value);
  if (minor === null) errors.push(`${path} must be an amount in whole cents, no more than 21474836.47.`);
  return minor;
}

function calendarDay(value: unknown) {
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

function finiteNumber(value: unknown, path: string, errors: string[], options: { min?: number; integer?: boolean } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (options.integer && !Number.isInteger(value)) || (options.min !== undefined && value < options.min)) {
    errors.push(`${path} must be ${options.integer ? 'an integer' : 'a finite number'}${options.min !== undefined ? ` of at least ${options.min}` : ''}.`);
  }
}

function enumValue(value: unknown, path: string, allowed: Set<string>, errors: string[]) {
  if (typeof value !== 'string' || !allowed.has(value)) errors.push(`${path} contains an unsupported value.`);
}

function validDate(value: unknown, path: string, errors: string[]) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) errors.push(`${path} must be an ISO-compatible date.`);
}

function assertUnique(rows: any[], section: string, keyFor: (row: any) => unknown, errors: string[]) {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const value = String(keyFor(row) ?? '').trim().toLowerCase();
    if (!value) errors.push(`${section}[${index}] requires a stable identity.`);
    else if (seen.has(value)) errors.push(`${section} contains duplicate identity "${value}".`);
    else seen.add(value);
  });
}

function assertReference(value: unknown, values: Set<string>, path: string, errors: string[]) {
  if (typeof value !== 'string' || !values.has(value)) errors.push(`${path} does not reference an item in this onboarding payload.`);
}

function rejectUnknownKeys(value: Record<string, any>, allowed: readonly string[], path: string, errors: string[]) {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length) errors.push(`${path} contains unsupported fields: ${unknown.join(', ')}.`);
}

export function validateHotelOnboardingData(value: unknown): HotelOnboardingValidation {
  const errors: string[] = [];
  if (!record(value)) return { success: false, errors: ['Hotel onboarding data must be a JSON object.'] };
  let encoded = '';
  try { encoded = JSON.stringify(value); } catch { return { success: false, errors: ['Hotel onboarding data must be JSON serializable.'] }; }
  if (encoded.length > 250_000) errors.push('Hotel onboarding data must be no larger than 250000 encoded characters.');

  const allowed = new Set<string>(HOTEL_ONBOARDING_SECTIONS);
  const unknownSections = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownSections.length) errors.push(`Unsupported onboarding sections: ${unknownSections.join(', ')}.`);

  if (!record(value.hotelSettings)) errors.push('hotelSettings must be an object.');
  for (const section of HOTEL_ONBOARDING_ARRAY_SECTIONS) {
    const rows = value[section];
    if (!Array.isArray(rows)) errors.push(`${section} must be an array.`);
    else if (rows.length > 500) errors.push(`${section} may contain at most 500 items.`);
    else if (rows.some((row) => !record(row))) errors.push(`${section} may contain only objects.`);
  }
  if (errors.length) return { success: false, errors };

  const data = value as Record<string, any>;
  const settings = data.hotelSettings;
  rejectUnknownKeys(settings, ['propertyName', 'tagline', 'contactEmail', 'contactPhone', 'addressLine1', 'addressLine2', 'frontDeskCopy', 'checkInTime', 'checkOutTime', 'timeZone', 'currencyCode', 'taxRateBasisPoints', 'serviceFeeMinor', 'storefrontAccentPreset', 'heroImagePath', 'heroImageAltText', 'heroImageCaption', 'amenityImagePath', 'amenityImageAltText', 'amenityImageCaption', 'locationImagePath', 'locationImageAltText', 'locationImageCaption', 'logoIcon', 'logoColor'], 'hotelSettings', errors);
  // Logo: a library icon id (resolved and sanitized at setup) and a hue rotation in degrees.
  if (settings.logoIcon !== undefined && (typeof settings.logoIcon !== 'string' || settings.logoIcon.length > 100_000)) errors.push('hotelSettings.logoIcon must be a logo library id or SVG document.');
  if (settings.logoColor !== undefined && !Number.isFinite(Number.parseFloat(String(settings.logoColor)))) errors.push('hotelSettings.logoColor must be a hue in degrees.');
  requiredText(settings.propertyName, 'hotelSettings.propertyName', errors, 200);
  requiredText(settings.contactEmail, 'hotelSettings.contactEmail', errors, 320);
  if (typeof settings.contactEmail === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail)) errors.push('hotelSettings.contactEmail must be a valid email address.');
  requiredText(settings.contactPhone, 'hotelSettings.contactPhone', errors, 80);
  requiredText(settings.addressLine1, 'hotelSettings.addressLine1', errors, 250);
  requiredText(settings.checkInTime, 'hotelSettings.checkInTime', errors, 20);
  requiredText(settings.checkOutTime, 'hotelSettings.checkOutTime', errors, 20);
  if (settings.timeZone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: settings.timeZone }).format(new Date(0)); }
    catch { errors.push('hotelSettings.timeZone must be a valid IANA time zone.'); }
  }
  if (settings.currencyCode !== 'USD') errors.push('hotelSettings.currencyCode must be USD for the bounded release.');
  finiteNumber(settings.taxRateBasisPoints, 'hotelSettings.taxRateBasisPoints', errors, { min: 0, integer: true });
  if (Number(settings.taxRateBasisPoints) > 10_000) errors.push('hotelSettings.taxRateBasisPoints may not exceed 10000.');
  finiteNumber(settings.serviceFeeMinor, 'hotelSettings.serviceFeeMinor', errors, { min: 0, integer: true });
  if (!['brass', 'forest', 'harbor', 'claret'].includes(settings.storefrontAccentPreset)) errors.push('hotelSettings.storefrontAccentPreset is unsupported.');

  assertUnique(data.roomTypes, 'roomTypes', (row) => row.name, errors);
  assertUnique(data.rooms, 'rooms', (row) => row.roomNumber, errors);
  assertUnique(data.ratePlans, 'ratePlans', (row) => row.name, errors);
  assertUnique(data.seasonalRates, 'seasonalRates', (row) => row.name, errors);
  assertUnique(data.guests, 'guests', (row) => row.email, errors);
  for (const section of ['bookings', 'bookingPayments', 'housekeepingTasks', 'maintenanceRequests', 'channels', 'channelReservations', 'channelSyncEvents', 'loyaltyTransactions', 'inventory']) {
    assertUnique(data[section], section, (row) => row.key, errors);
  }

  const roomTypes = new Set<string>(data.roomTypes.map((row: any) => row.name));
  const rooms = new Map<string, string>(data.rooms.map((row: any) => [row.roomNumber, row.roomType]));
  const guests = new Set<string>(data.guests.map((row: any) => row.email));
  const bookings = new Set<string>(data.bookings.map((row: any) => row.key));
  const channels = new Set<string>(data.channels.map((row: any) => row.name));

  data.roomTypes.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['name', 'description', 'shortDescription', 'eyebrow', 'viewDescription', 'baseRate', 'currencyCode', 'maxOccupancy', 'bedConfiguration', 'amenities', 'squareFeet', 'roomImages'], `roomTypes[${index}]`, errors);
    requiredText(row.name, `roomTypes[${index}].name`, errors, 200);
    if (row.description !== undefined && (typeof row.description !== 'string' || row.description.length > 5_000)) errors.push(`roomTypes[${index}].description must be plain text of at most 5000 characters.`);
    wholeCents(row.baseRate, `roomTypes[${index}].baseRate`, errors);
    finiteNumber(row.maxOccupancy, `roomTypes[${index}].maxOccupancy`, errors, { min: 1, integer: true });
    enumValue(row.bedConfiguration, `roomTypes[${index}].bedConfiguration`, BED_CONFIGURATIONS, errors);
    if (!Array.isArray(row.amenities) || row.amenities.some((amenity: unknown) => typeof amenity !== 'string' || !ALLOWED_AMENITIES.has(amenity))) errors.push(`roomTypes[${index}].amenities contains an unsupported amenity.`);
    if (row.currencyCode !== undefined && row.currencyCode !== 'USD') errors.push(`roomTypes[${index}].currencyCode must be USD.`);
    if (row.roomImages !== undefined && (!Array.isArray(row.roomImages) || row.roomImages.length > 20)) errors.push(`roomTypes[${index}].roomImages must be a bounded array.`);
    else (row.roomImages || []).forEach((image: any, imageIndex: number) => {
      if (!record(image)) errors.push(`roomTypes[${index}].roomImages[${imageIndex}] must be an object.`);
      else rejectUnknownKeys(image, ['key', 'imagePath', 'altText', 'caption', 'order', 'isPrimary'], `roomTypes[${index}].roomImages[${imageIndex}]`, errors);
    });
  });

  data.rooms.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'roomNumber', 'roomType', 'floor', 'status', 'notes'], `rooms[${index}]`, errors);
    requiredText(row.roomNumber, `rooms[${index}].roomNumber`, errors, 50);
    assertReference(row.roomType, roomTypes, `rooms[${index}].roomType`, errors);
    enumValue(row.status, `rooms[${index}].status`, ROOM_STATUSES, errors);
    finiteNumber(row.floor, `rooms[${index}].floor`, errors, { min: 0, integer: true });
  });

  data.ratePlans.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'name', 'description', 'roomType', 'baseRate', 'currencyCode', 'seasonalAdjustments', 'minimumStay', 'maximumStay', 'advanceBookingMin', 'advanceBookingMax', 'cancellationPolicy', 'mealPlan', 'validFrom', 'validTo', 'applicableDays', 'status', 'isPublic', 'isPromotional', 'promoCode', 'priority'], `ratePlans[${index}]`, errors);
    requiredText(row.name, `ratePlans[${index}].name`, errors, 200);
    assertReference(row.roomType, roomTypes, `ratePlans[${index}].roomType`, errors);
    wholeCents(row.baseRate, `ratePlans[${index}].baseRate`, errors);
    finiteNumber(row.minimumStay, `ratePlans[${index}].minimumStay`, errors, { min: 1, integer: true });
    if (row.maximumStay !== undefined) finiteNumber(row.maximumStay, `ratePlans[${index}].maximumStay`, errors, { min: row.minimumStay || 1, integer: true });
    enumValue(row.cancellationPolicy, `ratePlans[${index}].cancellationPolicy`, CANCELLATION_POLICIES, errors);
    enumValue(row.mealPlan, `ratePlans[${index}].mealPlan`, MEAL_PLANS, errors);
    enumValue(row.status, `ratePlans[${index}].status`, RATE_STATUSES, errors);
    if (row.currencyCode !== undefined && row.currencyCode !== 'USD') errors.push(`ratePlans[${index}].currencyCode must be USD.`);
  });

  data.seasonalRates.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'name', 'roomType', 'startDate', 'endDate', 'priceAdjustment', 'priceMultiplier', 'minimumStay', 'priority', 'isActive'], `seasonalRates[${index}]`, errors);
    assertReference(row.roomType, roomTypes, `seasonalRates[${index}].roomType`, errors);
    validDate(row.startDate, `seasonalRates[${index}].startDate`, errors);
    validDate(row.endDate, `seasonalRates[${index}].endDate`, errors);
    if (Date.parse(row.endDate) < Date.parse(row.startDate)) errors.push(`seasonalRates[${index}] ends before it starts.`);
    finiteNumber(row.priceMultiplier, `seasonalRates[${index}].priceMultiplier`, errors, { min: 0 });
  });

  data.guests.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'firstName', 'lastName', 'email', 'phone', 'nationality', 'preferences', 'loyaltyNumber', 'loyaltyTier', 'communicationPreferences', 'company', 'specialNotes', 'isVip', 'totalStays', 'totalSpent', 'lastStayAt', 'loyaltyPoints'], `guests[${index}]`, errors);
    requiredText(row.firstName, `guests[${index}].firstName`, errors, 100);
    requiredText(row.lastName, `guests[${index}].lastName`, errors, 100);
    requiredText(row.email, `guests[${index}].email`, errors, 320);
    if (row.communicationPreferences?.emailMarketing === true || row.communicationPreferences?.newsletterSubscribed === true) errors.push(`guests[${index}] cannot import promotional consent without versioned evidence; record consent after setup.`);
  });

  data.bookings.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'guestEmail', 'guestName', 'roomType', 'ratePlan', 'roomNumber', 'checkInDate', 'checkOutDate', 'numberOfGuests', 'numberOfAdults', 'numberOfChildren', 'roomRate', 'taxAmount', 'feesAmount', 'totalAmount', 'depositAmount', 'balanceDue', 'currencyCode', 'status', 'paymentStatus', 'source', 'specialRequests'], `bookings[${index}]`, errors);
    assertReference(row.guestEmail, guests, `bookings[${index}].guestEmail`, errors);
    assertReference(row.roomType, roomTypes, `bookings[${index}].roomType`, errors);
    if (!data.ratePlans.some((rate: any) => rate.name === row.ratePlan && rate.roomType === row.roomType)) errors.push(`bookings[${index}].ratePlan must reference a compatible rate plan.`);
    assertReference(row.roomNumber, new Set(rooms.keys()), `bookings[${index}].roomNumber`, errors);
    if (rooms.get(row.roomNumber) !== row.roomType) errors.push(`bookings[${index}] assigns a room from a different room type.`);
    validDate(row.checkInDate, `bookings[${index}].checkInDate`, errors);
    validDate(row.checkOutDate, `bookings[${index}].checkOutDate`, errors);
    if (Date.parse(row.checkOutDate) <= Date.parse(row.checkInDate)) errors.push(`bookings[${index}] must check out after check-in.`);
    enumValue(row.status, `bookings[${index}].status`, BOOKING_STATUSES, errors);
    enumValue(row.paymentStatus, `bookings[${index}].paymentStatus`, PAYMENT_STATUSES, errors);
    enumValue(row.source, `bookings[${index}].source`, BOOKING_SOURCES, errors);
    const [room, tax, fees, total, deposit, balance] = ['roomRate', 'taxAmount', 'feesAmount', 'totalAmount', 'depositAmount', 'balanceDue']
      .map((amount) => wholeCents(row[amount], `bookings[${index}].${amount}`, errors));
    if (room !== null && tax !== null && fees !== null && total !== null && room + tax + fees !== total) errors.push(`bookings[${index}] total does not equal room rate, tax, and fees.`);
    if (total !== null && deposit !== null && balance !== null && (deposit > total || total - deposit !== balance)) errors.push(`bookings[${index}] balance does not equal total less deposit.`);
    finiteNumber(row.numberOfAdults, `bookings[${index}].numberOfAdults`, errors, { min: 1, integer: true });
    finiteNumber(row.numberOfChildren, `bookings[${index}].numberOfChildren`, errors, { min: 0, integer: true });
    if (Number(row.numberOfGuests) !== Number(row.numberOfAdults) + Number(row.numberOfChildren)) errors.push(`bookings[${index}] guest counts are inconsistent.`);
    const roomType = data.roomTypes.find((type: any) => type.name === row.roomType);
    if (roomType && Number(row.numberOfGuests) > Number(roomType.maxOccupancy)) errors.push(`bookings[${index}] has more guests than ${row.roomType} sleeps.`);
  });

  data.bookingPayments.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'bookingKey', 'providerCode', 'amount', 'currency', 'paymentType', 'paymentMethod', 'status', 'description'], `bookingPayments[${index}]`, errors);
    assertReference(row.bookingKey, bookings, `bookingPayments[${index}].bookingKey`, errors);
    requiredText(row.providerCode, `bookingPayments[${index}].providerCode`, errors, 100);
    if (row.providerCode !== 'pp_manual_manual') errors.push(`bookingPayments[${index}].providerCode must use the operator-recorded demo provider.`);
    wholeCents(row.amount, `bookingPayments[${index}].amount`, errors);
    if (row.currency !== 'USD') errors.push(`bookingPayments[${index}].currency must be USD.`);
  });

  data.housekeepingTasks.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'roomNumber', 'taskType', 'status', 'priority', 'notes'], `housekeepingTasks[${index}]`, errors);
    assertReference(row.roomNumber, new Set(rooms.keys()), `housekeepingTasks[${index}].roomNumber`, errors);
    enumValue(row.taskType, `housekeepingTasks[${index}].taskType`, HOUSEKEEPING_TYPES, errors);
    enumValue(row.status, `housekeepingTasks[${index}].status`, HOUSEKEEPING_STATUSES, errors);
  });
  data.maintenanceRequests.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'roomNumber', 'title', 'description', 'category', 'priority', 'status', 'notes'], `maintenanceRequests[${index}]`, errors);
    assertReference(row.roomNumber, new Set(rooms.keys()), `maintenanceRequests[${index}].roomNumber`, errors);
    enumValue(row.category, `maintenanceRequests[${index}].category`, MAINTENANCE_CATEGORIES, errors);
    enumValue(row.priority, `maintenanceRequests[${index}].priority`, MAINTENANCE_PRIORITIES, errors);
    enumValue(row.status, `maintenanceRequests[${index}].status`, MAINTENANCE_STATUSES, errors);
  });

  data.channels.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'name', 'channelType', 'isActive', 'commission', 'syncInventory', 'syncRates', 'syncStatus', 'syncErrors', 'mappingRules', 'credentials'], `channels[${index}]`, errors);
    if (row.isActive !== false || row.syncInventory !== false || row.syncRates !== false || String(row.credentials?.mode || '').toLowerCase() === 'live') {
      errors.push(`channels[${index}] must remain a disabled demonstration channel; configure live delivery through Channel settings.`);
    }
  });
  data.channelReservations.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'channel', 'bookingKey', 'roomType', 'externalId', 'guestName', 'guestEmail', 'checkInDate', 'checkOutDate', 'totalAmount', 'commission', 'channelStatus'], `channelReservations[${index}]`, errors);
    assertReference(row.channel, channels, `channelReservations[${index}].channel`, errors);
    assertReference(row.bookingKey, bookings, `channelReservations[${index}].bookingKey`, errors);
    assertReference(row.roomType, roomTypes, `channelReservations[${index}].roomType`, errors);
  });
  data.channelSyncEvents.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'channel', 'channelName', 'action', 'status', 'message', 'errorMessage', 'attempts', 'occurredAt', 'payload'], `channelSyncEvents[${index}]`, errors);
    assertReference(row.channel, channels, `channelSyncEvents[${index}].channel`, errors);
  });
  data.loyaltyTransactions.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'guestEmail', 'bookingKey', 'points', 'type', 'description'], `loyaltyTransactions[${index}]`, errors);
    assertReference(row.guestEmail, guests, `loyaltyTransactions[${index}].guestEmail`, errors);
    assertReference(row.bookingKey, bookings, `loyaltyTransactions[${index}].bookingKey`, errors);
  });
  data.inventory.forEach((row: any, index: number) => {
    rejectUnknownKeys(row, ['key', 'label', 'roomType', 'date', 'totalRooms', 'bookedRooms', 'blockedRooms'], `inventory[${index}]`, errors);
    assertReference(row.roomType, roomTypes, `inventory[${index}].roomType`, errors);
    validDate(row.date, `inventory[${index}].date`, errors);
    for (const count of ['totalRooms', 'bookedRooms', 'blockedRooms']) finiteNumber(row[count], `inventory[${index}].${count}`, errors, { min: 0, integer: true });
    if (Number(row.bookedRooms) + Number(row.blockedRooms) > Number(row.totalRooms)) errors.push(`inventory[${index}] books or blocks more rooms than exist.`);
  });
  if (data.dailyMetrics.length) errors.push('dailyMetrics is derived operational reporting and must remain empty.');

  // One physical room cannot hold two stays on the same night.
  const occupying = data.bookings.filter((row: any) => OCCUPYING_BOOKING_STATUSES.has(row.status));
  occupying.forEach((row: any, index: number) => {
    for (const other of occupying.slice(index + 1)) {
      if (other.roomNumber !== row.roomNumber) continue;
      if (calendarDay(row.checkInDate) < calendarDay(other.checkOutDate) && calendarDay(other.checkInDate) < calendarDay(row.checkOutDate)) {
        errors.push(`Bookings ${row.key} and ${other.key} overlap in room ${row.roomNumber}.`);
      }
    }
    const room = data.rooms.find((candidate: any) => candidate.roomNumber === row.roomNumber);
    if (room?.status === 'out_of_order') errors.push(`Booking ${row.key} is assigned to room ${row.roomNumber}, which is out of order.`);
  });

  // Setup only completes for a property guests can book.
  const sellable = data.ratePlans.some((rate: any) => {
    if (rate.status !== 'active') return false;
    const type = data.roomTypes.find((candidate: any) => candidate.name === rate.roomType);
    const hasPhoto = Array.isArray(type?.roomImages) && type.roomImages.some((image: any) => typeof image?.imagePath === 'string' && image.imagePath.trim());
    const hasRoom = data.rooms.some((room: any) => room.roomType === rate.roomType && room.status !== 'out_of_order');
    return hasPhoto && hasRoom;
  });
  if (!sellable) errors.push('Add at least one room type with a photo, a room that is not out of order, and an active rate plan.');

  return errors.length ? { success: false, errors } : { success: true, data };
}

export function assertHotelOnboardingData(value: unknown): Record<string, any> {
  const result = validateHotelOnboardingData(value);
  if (!result.success) throw new Error(result.errors.slice(0, 8).join('\n'));
  return result.data;
}
