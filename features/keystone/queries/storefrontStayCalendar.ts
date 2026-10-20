import { getHotelAvailability } from '../inventory/roomAvailability';
import { enforceAbuseLimit } from '../lib/abuseControl';

/**
 * Night-by-night availability for the public stay date picker. Only an open or
 * sold-out flag per night leaves the server, never room counts. Without a room
 * type a night is open when any room type still has a room for it. The live
 * quote remains the booking authority; this only shapes which dates can be picked.
 */
async function storefrontStayCalendar(
  _root: unknown,
  { roomTypeId, fromDate, toDate }: { roomTypeId?: string | null; fromDate: string; toDate: string },
  context: any,
) {
  await enforceAbuseLimit(context, { scope: 'storefront-stay-calendar', identity: roomTypeId || 'any', limit: 60, windowMs: 60_000 });
  const rows = await getHotelAvailability(context, { roomTypeId: roomTypeId || undefined, checkInDate: fromDate, checkOutDate: toDate });
  const nights = new Map<string, boolean>();
  for (const roomType of rows) {
    for (const night of roomType.availabilityByDay) nights.set(night.date, Boolean(nights.get(night.date)) || night.available > 0);
  }
  return [...nights].map(([date, available]) => ({ date, available }));
}

export default storefrontStayCalendar;
