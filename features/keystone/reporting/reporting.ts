import { loadRoomOutages, roomOutageOverlaps, type RoomOutage } from '../operations/roomOutages';
import { propertyCalendarDate } from '../lib/hotelBusinessTime';

const DAY_MS = 86_400_000;
const ACTIVE_RESERVATIONS = new Set(['confirmed', 'checked_in', 'checked_out']);
export const REPORTING_SNAPSHOT_VERSION = 1;

export function hotelReportingDayKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

type RevenueTotals = { roomRevenueMinor: number; taxMinor: number; feeMinor: number; totalRevenueMinor: number; paymentsMinor: number; refundsMinor: number };
type RoomTypeCount = { roomTypeId: string | null; count: number };

function roomTypeCountsForBooking(booking: any, dayKey: string): RoomTypeCount[] {
  const roomLines = (booking.lineItems || []).filter((line: any) =>
    line.type === 'room' && line.snapshotStatus !== 'superseded' && hotelReportingDayKey(line.date) === dayKey,
  );
  const assignments = Array.isArray(booking.roomAssignments) ? booking.roomAssignments : [];
  if (assignments.length) {
    const snapshotTypes = [...new Set(roomLines.map((line: any) => line.roomTypeIdSnapshot).filter(Boolean))];
    return assignments.map((assignment: any) => ({
      roomTypeId: assignment.roomTypeId || assignment.roomType?.id || (snapshotTypes.length === 1 ? snapshotTypes[0] : null),
      count: 1,
    }));
  }
  if (roomLines.length) return roomLines.map((line: any) => {
    const count = line.quantity === undefined ? 1 : Number(line.quantity);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Reporting encountered an invalid room-line quantity.');
    return { roomTypeId: line.roomTypeIdSnapshot || null, count };
  });
  // Retain the historic one-room fallback only when no assignment or room-night
  // evidence exists; multi-room records are counted from every assignment above.
  return [{ roomTypeId: booking.roomTypeId || null, count: 1 }];
}

function roomTypeCountTotal(counts: RoomTypeCount[]) {
  return counts.reduce((total, item) => total + item.count, 0);
}

/** Economic corrections retain the original entry's class; tenders are separate. */
export function classifyHotelLedgerEntry(entry: any, currencyCode: string): RevenueTotals {
  if (entry.currencyCode !== currencyCode || !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 || !['debit', 'credit'].includes(entry.direction)) {
    throw new Error('Reporting refused an invalid or mixed-currency folio posting.');
  }
  const result: RevenueTotals = { roomRevenueMinor: 0, taxMinor: 0, feeMinor: 0, totalRevenueMinor: 0, paymentsMinor: 0, refundsMinor: 0 };
  const signed = entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor;
  const kind = entry.entryType === 'reversal'
    ? entry.reverses?.entryType || entry.metadataSnapshot?.reversedEntryType
    : entry.entryType;
  if (kind === 'payment') result.paymentsMinor = -signed;
  else if (kind === 'refund') result.refundsMinor = signed;
  else if (kind === 'transfer') return result; // Internal account movement is not property revenue.
  else if (kind === 'room_charge') result.roomRevenueMinor = signed;
  else if (kind === 'tax') result.taxMinor = signed;
  else if (['fee', 'addon', 'adjustment'].includes(kind)) result.feeMinor = signed;
  else throw new Error('Reporting refused a folio entry without a recognized economic classification.');
  result.totalRevenueMinor = result.roomRevenueMinor + result.taxMinor + result.feeMinor;
  return result;
}

/** Dated inventory is authoritative; current outages are subtracted only once. */
export function hotelAvailableRoomNights(type: any, inventory: any, date: Date, businessDate: Date, outages: RoomOutage[] = []) {
  const historic = hotelReportingDayKey(date) < hotelReportingDayKey(businessDate);
  const rooms = type.rooms.filter((room: any) => !historic || !room.createdAt || new Date(room.createdAt).getTime() < date.getTime() + DAY_MS);
  const total = inventory ? Number(inventory.totalRooms) : rooms.length;
  const datedBlocked = Number(inventory?.blockedRooms || 0);
  const currentBlocked = rooms.filter((room: any) => (!historic && ['maintenance', 'out_of_order'].includes(room.status)) || outages.some(outage => roomOutageOverlaps(outage, room.id, date, new Date(date.getTime() + DAY_MS)))).length;
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(datedBlocked) || datedBlocked < 0) throw new Error('Reporting encountered invalid dated room supply.');
  return Math.max(0, total - Math.max(datedBlocked, currentBlocked));
}

export function buildHotelReportingDay(input: {
  date: Date; businessDate: Date; currencyCode: string; roomTypes: any[]; inventories: any[]; bookings: any[]; entries: any[]; closing?: boolean; outages?: RoomOutage[];
}) {
  const { date, businessDate, currencyCode, roomTypes, inventories, bookings, entries } = input;
  const key = hotelReportingDayKey(date);
  const next = new Date(date.getTime() + DAY_MS);
  const beforeClose = !input.closing && key >= hotelReportingDayKey(businessDate);
  const active = bookings.filter(booking => ACTIVE_RESERVATIONS.has(booking.status));
  const occupied = active.filter(booking => new Date(booking.checkInDate) < next && new Date(booking.checkOutDate) > date &&
    (beforeClose || ['checked_in', 'checked_out'].includes(booking.status)));
  const typeMap = new Map<string, any>(roomTypes.map(type => [type.id, {
    id: type.id, name: type.name,
    availableRoomNights: hotelAvailableRoomNights(type, inventories.find(row => row.roomTypeId === type.id && hotelReportingDayKey(row.date) === key), date, businessDate, input.outages),
    occupiedRoomNights: 0, roomRevenueMinor: 0,
  }]));
  const lineMap = new Map<string, any>();
  for (const booking of bookings) for (const line of booking.lineItems || []) lineMap.set(line.id, line);
  let occupiedRoomNights = 0;
  for (const booking of occupied) {
    const roomCounts = roomTypeCountsForBooking(booking, key);
    occupiedRoomNights += roomTypeCountTotal(roomCounts);
    for (const roomCount of roomCounts) {
      const type = roomCount.roomTypeId ? typeMap.get(roomCount.roomTypeId) : null;
      if (type) type.occupiedRoomNights += roomCount.count;
    }
  }
  const revenue: RevenueTotals = { roomRevenueMinor: 0, taxMinor: 0, feeMinor: 0, totalRevenueMinor: 0, paymentsMinor: 0, refundsMinor: 0 };
  const channelMap = new Map<string, { source: string; bookingIds: string[]; revenueMinor: number }>();
  for (const entry of entries) {
    if (hotelReportingDayKey(entry.serviceDate || entry.postedAt) !== key) continue;
    const classified = classifyHotelLedgerEntry(entry, currencyCode);
    for (const field of Object.keys(revenue) as Array<keyof RevenueTotals>) revenue[field] += classified[field];
    const booking = entry.folio?.booking;
    const sourceLineId = entry.entryType === 'reversal' ? entry.reverses?.sourceId : entry.sourceId;
    const line = lineMap.get(sourceLineId);
    const bookingRoomTypes = booking ? [...new Set(roomTypeCountsForBooking(booking, key).map(item => item.roomTypeId).filter(Boolean))] : [];
    const typeId = line?.roomTypeIdSnapshot || (bookingRoomTypes.length === 1 ? bookingRoomTypes[0] : null);
    if (typeId && typeMap.has(typeId)) typeMap.get(typeId).roomRevenueMinor += classified.roomRevenueMinor;
    if (classified.totalRevenueMinor && booking) {
      const source = booking.source || 'direct';
      const channel: { source: string; bookingIds: string[]; revenueMinor: number } = channelMap.get(source) || { source, bookingIds: [], revenueMinor: 0 };
      if (!channel.bookingIds.includes(booking.id)) channel.bookingIds.push(booking.id);
      channel.revenueMinor += classified.totalRevenueMinor; channelMap.set(source, channel);
    }
  }
  if (Object.values(revenue).some(value => !Number.isSafeInteger(value))) throw new Error('Reporting totals exceed safe integer bounds.');
  const availableRoomNights = [...typeMap.values()].reduce((total, type) => total + type.availableRoomNights, 0);
  return {
    version: REPORTING_SNAPSHOT_VERSION, date: date.toISOString(), currencyCode,
    day: {
      date: date.toISOString(), availableRoomNights, occupiedRoomNights,
      occupancyRate: availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0,
      ...revenue,
      adrMinor: occupiedRoomNights ? Math.round(revenue.roomRevenueMinor / occupiedRoomNights) : 0,
      revparMinor: availableRoomNights ? Math.round(revenue.roomRevenueMinor / availableRoomNights) : 0,
      arrivals: active.filter(booking => hotelReportingDayKey(booking.checkInDate) === key).length,
      departures: active.filter(booking => hotelReportingDayKey(booking.checkOutDate) === key).length,
      newReservations: bookings.filter(booking => hotelReportingDayKey(booking.createdAt) === key).length,
      cancellations: bookings.filter(booking => booking.status !== 'no_show' && booking.cancelledAt && hotelReportingDayKey(booking.cancelledAt) === key).length,
      noShows: bookings.filter(booking => booking.status === 'no_show' && hotelReportingDayKey(booking.checkInDate) === key).length,
    },
    roomTypes: [...typeMap.values()], channels: [...channelMap.values()],
  };
}

export async function loadHotelReportingFacts(prisma: any, start: Date, end: Date) {
  const [settings, clock, roomTypes, inventories, bookings, entries, outages] = await Promise.all([
    prisma.hotelSettings.findUnique({ where: { id: 1 } }),
    prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
    prisma.roomType.findMany({ orderBy: { name: 'asc' }, include: { rooms: true } }),
    prisma.roomInventory.findMany({ where: { date: { gte: start, lt: end } }, orderBy: [{ date: 'asc' }, { roomTypeId: 'asc' }], take: 20_001 }),
    prisma.booking.findMany({
      where: { OR: [{ checkOutDate: { gt: start }, checkInDate: { lt: end } }, { createdAt: { gte: start, lt: end } }, { cancelledAt: { gte: start, lt: end } }, { folio: { entries: { some: { serviceDate: { gte: start, lt: end } } } } }] },
      orderBy: [{ checkInDate: 'asc' }, { id: 'asc' }], take: 5_001,
      include: { roomAssignments: true, lineItems: true },
    }),
    prisma.folioEntry.findMany({
      where: { serviceDate: { gte: start, lt: end } },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }], take: 20_001,
      include: { reverses: { select: { entryType: true, sourceId: true } }, folio: { include: { booking: { select: { id: true, source: true, roomAssignments: { select: { roomTypeId: true } } } } } } },
    }),
    loadRoomOutages(prisma),
  ]);
  if (!settings || !clock) throw new Error('Hotel settings and property business date must be configured.');
  if (inventories.length > 20_000 || bookings.length > 5_000 || entries.length > 20_000) throw new Error('Reporting range exceeds the supported dataset; request a shorter period.');
  return { settings, clock, roomTypes, inventories, bookings, entries, outages };
}

/** Called inside the night-audit transaction after posting and before advance. */
export async function captureHotelReportingDay(prisma: any, businessDate: Date) {
  const end = new Date(businessDate.getTime() + 91 * DAY_MS);
  const facts = await loadHotelReportingFacts(prisma, businessDate, end);
  return {
    ...buildHotelReportingDay({ ...facts, date: businessDate, businessDate, closing: true, currencyCode: facts.settings.currencyCode || 'USD' }),
    demandSnapshot: buildHotelDemandSnapshot(facts, new Date(businessDate.getTime() + DAY_MS), end, businessDate),
  };
}

/** An on-books outlook, separate from posted revenue and preserved only when actually captured. */
export function buildHotelDemandSnapshot(facts: any, start: Date, end: Date, asOfBusinessDate: Date) {
  const currencyCode = facts.settings.currencyCode || 'USD';
  const active = facts.bookings.filter((booking: any) => ['confirmed', 'checked_in'].includes(booking.status) && new Date(booking.checkInDate) < end && new Date(booking.checkOutDate) > start);
  const leadTimes = active.map((booking: any) => Math.max(0, Math.round((new Date(booking.checkInDate).getTime() - propertyCalendarDate(new Date(booking.createdAt), facts.settings.timeZone || 'UTC').getTime()) / DAY_MS)));
  const days: any[] = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
    const date = new Date(cursor); const key = hotelReportingDayKey(date); const next = new Date(cursor + DAY_MS);
    const bookings = active.filter((booking: any) => new Date(booking.checkInDate) < next && new Date(booking.checkOutDate) > date);
    let roomRevenueMinor = 0; let unpricedRoomNights = 0; let onBooksRoomNights = 0;
    for (const booking of bookings) {
      const expectedRoomCount = roomTypeCountTotal(roomTypeCountsForBooking(booking, key));
      onBooksRoomNights += expectedRoomCount;
      const lines = (booking.lineItems || []).filter((line: any) => line.type === 'room' && line.snapshotStatus !== 'superseded' && hotelReportingDayKey(line.date) === key);
      const lineRoomCount = lines.reduce((total: number, line: any) => {
        const quantity = line.quantity === undefined ? 1 : Number(line.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Demand forecast encountered an invalid room-line quantity.');
        return total + quantity;
      }, 0);
      if (!lines.length || lineRoomCount !== expectedRoomCount) {
        unpricedRoomNights += expectedRoomCount;
        continue;
      }
      for (const line of lines) {
        const quantity = line.quantity === undefined ? 1 : Number(line.quantity);
        if (!Number.isSafeInteger(line.totalPrice) || line.totalPrice < 0 || line.currencyCode !== currencyCode) {
          unpricedRoomNights += quantity;
          continue;
        }
        roomRevenueMinor += line.totalPrice;
      }
    }
    if (!Number.isSafeInteger(roomRevenueMinor) || !Number.isSafeInteger(onBooksRoomNights) || !Number.isSafeInteger(unpricedRoomNights)) throw new Error('Demand forecast exceeds safe integer amounts.');
    const availableRoomNights = facts.roomTypes.reduce((total: number, type: any) => total + hotelAvailableRoomNights(type, facts.inventories.find((row: any) => row.roomTypeId === type.id && hotelReportingDayKey(row.date) === key), date, facts.clock.currentBusinessDate, facts.outages), 0);
    days.push({ date: key, onBooksRoomNights, availableRoomNights, roomRevenueMinor, unpricedRoomNights });
  }
  const bands = [{ label: '0–2 days', min: 0, max: 2 }, { label: '3–7 days', min: 3, max: 7 }, { label: '8–30 days', min: 8, max: 30 }, { label: '31+ days', min: 31, max: Infinity }].map(band => ({ label: band.label, reservations: leadTimes.filter((days: number) => days >= band.min && days <= band.max).length }));
  return { version: 1, asOfBusinessDate: hotelReportingDayKey(asOfBusinessDate), capturedAt: new Date().toISOString(), start: hotelReportingDayKey(start), end: hotelReportingDayKey(end), currencyCode, days, leadTime: { reservations: leadTimes.length, averageDays: leadTimes.length ? Math.round(leadTimes.reduce((total: number, days: number) => total + days, 0) / leadTimes.length * 10) / 10 : null, bands } };
}

export function compareHotelDemandSnapshots(current: any, previous: any[], businessDate: Date) {
  const sum = (days: any[], field: string) => days.reduce((total, day) => total + Number(day[field]), 0);
  const totals = { roomNights: sum(current.days, 'onBooksRoomNights'), availableRoomNights: sum(current.days, 'availableRoomNights'), roomRevenueMinor: sum(current.days, 'roomRevenueMinor'), unpricedRoomNights: sum(current.days, 'unpricedRoomNights') };
  const pace = [1, 7, 30].map(daysAgo => {
    const target = hotelReportingDayKey(new Date(businessDate.getTime() - daysAgo * DAY_MS));
    const snapshot = previous.filter(snapshot => snapshot.version === 1 && snapshot.currencyCode === current.currencyCode && snapshot.asOfBusinessDate <= target).sort((left, right) => right.asOfBusinessDate.localeCompare(left.asOfBusinessDate))[0];
    const baselineDays = current.days.map((day: any) => snapshot?.days.find((prior: any) => prior.date === day.date));
    if (!snapshot || !current.days.length || baselineDays.some((day: any) => !day)) return { daysAgo, available: false, asOfBusinessDate: null, priorRoomNights: null, pickupRoomNights: null, pickupRoomRevenueMinor: null };
    const priorRoomNights = sum(baselineDays, 'onBooksRoomNights');
    return { daysAgo, available: true, asOfBusinessDate: snapshot.asOfBusinessDate, priorRoomNights, pickupRoomNights: totals.roomNights - priorRoomNights, pickupRoomRevenueMinor: totals.unpricedRoomNights || sum(baselineDays, 'unpricedRoomNights') ? null : totals.roomRevenueMinor - sum(baselineDays, 'roomRevenueMinor') };
  });
  return { ...current, totals, pace, basis: 'Current confirmed and in-house room-night pricing snapshots. Pending holds, cancelled reservations, no-shows and unpicked group allotments are excluded. Pickup compares the same stay dates against actual preserved close snapshots; it includes cancellations and amendments and is not recognized revenue.' };
}

export async function getHotelOperationalReport(prisma: any, start: Date, end: Date) {
  const [facts, audits, openFolios] = await Promise.all([
    loadHotelReportingFacts(prisma, start, end),
    prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'night_audit', action: 'completed', aggregateId: { gte: hotelReportingDayKey(start), lt: hotelReportingDayKey(end) } }, select: { afterSnapshot: true }, take: 20_001, orderBy: { occurredAt: 'asc' } }),
    prisma.folio.findMany({ where: { status: 'open' }, take: 2_001, include: { entries: { select: { direction: true, amountMinor: true, currencyCode: true } } } }),
  ]);
  if (audits.length > 20_000 || openFolios.length > 2_000) throw new Error('Reporting history exceeds the supported dataset; an archival reporting workflow is required.');
  const snapshots = new Map<string, any>();
  for (const audit of audits) {
    const snapshot = audit.afterSnapshot?.reportingDay;
    if (snapshot?.version === REPORTING_SNAPSHOT_VERSION && snapshot.date) snapshots.set(hotelReportingDayKey(snapshot.date), snapshot);
  }
  const slices = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
    const date = new Date(cursor);
    const frozen = snapshots.get(hotelReportingDayKey(date));
    const snapshot = frozen || buildHotelReportingDay({ ...facts, date, businessDate: facts.clock.currentBusinessDate, currencyCode: facts.settings.currencyCode || 'USD' });
    if (snapshot.currencyCode !== (facts.settings.currencyCode || 'USD')) throw new Error('Historical reporting currency differs from the current property currency.');
    slices.push(snapshot);
  }
  const days = slices.map(slice => slice.day);
  const sum = (field: string) => days.reduce((total, value) => total + Number(value[field] || 0), 0);
  const availableRoomNights = sum('availableRoomNights'); const occupiedRoomNights = sum('occupiedRoomNights'); const roomRevenueMinor = sum('roomRevenueMinor');
  const channels = new Map<string, any>(); const roomTypes = new Map<string, any>();
  for (const slice of slices) {
    for (const channel of slice.channels) {
      const aggregate = channels.get(channel.source) || { source: channel.source, bookingIds: new Set<string>(), revenueMinor: 0 };
      for (const id of channel.bookingIds) aggregate.bookingIds.add(id);
      aggregate.revenueMinor += channel.revenueMinor; channels.set(channel.source, aggregate);
    }
    for (const type of slice.roomTypes) {
      const aggregate = roomTypes.get(type.id) || { id: type.id, name: type.name, availableRoomNights: 0, occupiedRoomNights: 0, roomRevenueMinor: 0 };
      for (const field of ['availableRoomNights', 'occupiedRoomNights', 'roomRevenueMinor']) aggregate[field] += type[field];
      roomTypes.set(type.id, aggregate);
    }
  }
  const openFolioBalanceMinor = openFolios.reduce((total: number, folio: any) => total + folio.entries.reduce((balance: number, entry: any) => {
    if (entry.currencyCode !== (facts.settings.currencyCode || 'USD')) throw new Error('Open folios contain mixed currencies.');
    return balance + (entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor);
  }, 0), 0);
  const businessDate = new Date(facts.clock.currentBusinessDate);
  const demandStart = new Date(Math.max(start.getTime(), businessDate.getTime()));
  const demandEnd = new Date(Math.max(demandStart.getTime(), Math.min(end.getTime(), businessDate.getTime() + 90 * DAY_MS)));
  const priorDemand = demandStart < demandEnd ? await prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'night_audit', action: 'completed', aggregateId: { gte: hotelReportingDayKey(new Date(businessDate.getTime() - 31 * DAY_MS)), lt: hotelReportingDayKey(businessDate) } }, select: { afterSnapshot: true }, take: 32, orderBy: { occurredAt: 'desc' } }) : [];
  const demand = compareHotelDemandSnapshots(buildHotelDemandSnapshot(facts, demandStart, demandEnd, businessDate), priorDemand.map((audit: any) => audit.afterSnapshot?.reportingDay?.demandSnapshot).filter(Boolean), businessDate);
  return {
    demand: JSON.stringify(demand),
    summary: {
      start, end, businessDate: facts.clock.currentBusinessDate, currencyCode: facts.settings.currencyCode || 'USD',
      closedSnapshotDays: slices.filter(slice => snapshots.has(hotelReportingDayKey(slice.date))).length,
      unclosedHistoricalDays: slices.filter(slice => hotelReportingDayKey(slice.date) < hotelReportingDayKey(facts.clock.currentBusinessDate) && !snapshots.has(hotelReportingDayKey(slice.date))).length,
      forecastDays: slices.filter(slice => hotelReportingDayKey(slice.date) >= hotelReportingDayKey(facts.clock.currentBusinessDate) && !snapshots.has(hotelReportingDayKey(slice.date))).length,
      availableRoomNights, occupiedRoomNights, occupancyRate: availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0,
      roomRevenueMinor, taxMinor: sum('taxMinor'), feeMinor: sum('feeMinor'), totalRevenueMinor: sum('totalRevenueMinor'),
      adrMinor: occupiedRoomNights ? Math.round(roomRevenueMinor / occupiedRoomNights) : 0, revparMinor: availableRoomNights ? Math.round(roomRevenueMinor / availableRoomNights) : 0,
      arrivals: sum('arrivals'), departures: sum('departures'), newReservations: sum('newReservations'), cancellations: sum('cancellations'), noShows: sum('noShows'),
      paymentsMinor: sum('paymentsMinor'), refundsMinor: sum('refundsMinor'), openFolioBalanceMinor, openFolioCount: openFolios.length,
    },
    // Snapshot JSON retains ISO strings; Keystone's DateTime output scalar requires Date objects.
    days: days.map(day => ({ ...day, date: new Date(day.date) })),
    channels: [...channels.values()].map(channel => ({ source: channel.source, bookings: channel.bookingIds.size, revenueMinor: channel.revenueMinor })),
    roomTypes: [...roomTypes.values()].map(type => ({ ...type, occupancyRate: type.availableRoomNights ? type.occupiedRoomNights / type.availableRoomNights * 100 : 0, adrMinor: type.occupiedRoomNights ? Math.round(type.roomRevenueMinor / type.occupiedRoomNights) : 0 })),
  };
}
