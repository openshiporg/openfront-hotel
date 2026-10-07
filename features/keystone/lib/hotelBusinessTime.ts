import { HOTEL_PROPERTY_KEY } from './hotelLifecycle';

export const HOTEL_BUSINESS_DATE_LOCK = `hotel-business-date:${HOTEL_PROPERTY_KEY}`;

export async function lockHotelBusinessDate(prisma: any) {
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', HOTEL_BUSINESS_DATE_LOCK);
}

export function validatePropertyTimeZone(value: unknown) {
  const zone = String(value || '').trim();
  if (!zone || zone.length > 100) throw new Error('A property IANA time zone is required.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); }
  catch { throw new Error('Property time zone is invalid.'); }
  return zone;
}

function parts(instant: Date, timeZone: string) {
  const fields = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  return Object.fromEntries(fields.map(field => [field.type, field.value]));
}

/** Room nights/business dates are calendar labels, represented as UTC midnight, never local instants. */
export function propertyCalendarDate(now: Date, timeZone: string) {
  const p = parts(now, validatePropertyTimeZone(timeZone));
  return new Date(`${p.year}-${p.month}-${p.day}T00:00:00.000Z`);
}

/** True when a scheduled service date has already fallen behind the property's local calendar date. */
export function isPastPropertyCalendarDate(serviceDate: string | Date, now: Date, timeZone: string) {
  const scheduled = new Date(serviceDate);
  if (Number.isNaN(scheduled.getTime())) throw new Error('Service date is invalid.');
  scheduled.setUTCHours(0, 0, 0, 0);
  return scheduled.getTime() < propertyCalendarDate(now, timeZone).getTime();
}

function businessDayKey(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Business date is invalid.');
  return date.toISOString().slice(0, 10);
}

export function assertCheckInOnOpenBusinessDate(arrivalDate: string | Date, currentBusinessDate: string | Date) {
  const arrivalDay = businessDayKey(arrivalDate);
  const businessDay = businessDayKey(currentBusinessDate);
  if (arrivalDay !== businessDay) {
    throw new Error(`Check-in is only allowed on the reservation arrival business date ${arrivalDay}; current business date is ${businessDay}.`);
  }
}

export function assertCheckoutDateReached(checkOutDate: string | Date, currentBusinessDate: string | Date) {
  const departureDay = businessDayKey(checkOutDate);
  const businessDay = businessDayKey(currentBusinessDate);
  if (departureDay > businessDay) {
    throw new Error(`Check-out cannot precede reservation departure business date ${departureDay}. For an early departure, amend the in-house stay first so future reservation snapshots are superseded or reconciled.`);
  }
}

/** Resolve arrival policy once at booking. Reject nonexistent local times; repeated times use the earlier instant. */
export function propertyArrivalInstant(day: string | Date, time: string, zone: string) {
  const date = new Date(day).toISOString().slice(0, 10);
  const match = String(time).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) throw new Error('Property arrival time is invalid.');
  let hour = Number(match[1]); const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) throw new Error('Property arrival time is invalid.');
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  const timeZone = validatePropertyTimeZone(zone);
  const wall = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00.000Z`);
  const offsets = new Set<number>();
  for (const delta of [-86_400_000, 0, 86_400_000]) {
    const sample = new Date(wall + delta); const p = parts(sample, timeZone);
    offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`) - sample.getTime());
  }
  const candidates = [...offsets].map(offset => new Date(wall - offset)).filter(candidate => {
    const p = parts(candidate, timeZone);
    return `${p.year}-${p.month}-${p.day}` === date && Number(p.hour) === hour && Number(p.minute) === minute;
  }).sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length) throw new Error('Arrival time does not exist on this date in the property time zone.');
  return candidates[0];
}

export async function currentPostingDate(prisma: any, requested?: string | Date | null) {
  await lockHotelBusinessDate(prisma);
  const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
  if (!clock) throw new Error('Property business date is not configured.');
  const current = new Date(clock.currentBusinessDate);
  const day = requested ? new Date(requested) : current;
  if (Number.isNaN(day.getTime())) throw new Error('serviceDate must be a valid date.');
  day.setUTCHours(0, 0, 0, 0);
  if (day.getTime() !== current.getTime()) throw new Error('Post to the current business date; prior-period corrections require a current-day reasoned reversal.');
  return day;
}
