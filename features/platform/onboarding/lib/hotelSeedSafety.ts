const DAY_MS = 86_400_000;
export const HOTEL_SETUP_COMPLETION_KEY = 'hotel:onboarding:completed';

/** Setup is an initialization operation; a completed retry never replays writes. */
export async function inspectHotelSetup(prisma: any, requestHash: string) {
  const completed = await prisma.hotelSeedRecord.findUnique({ where: { seedKey: HOTEL_SETUP_COMPLETION_KEY } });
  if (completed) {
    if (completed.contentHash !== requestHash) {
      throw new Error('Hotel setup has already completed with different data. Use property, room and rate settings to make changes.');
    }
    return { replayed: true };
  }
  // Existing pre-marker installations must never be treated as empty, including
  // earlier demo seeds. A repair/import is a separate, explicitly reviewed flow.
  const records = await Promise.all([
    prisma.room.findFirst({ select: { id: true } }),
    prisma.roomType.findFirst({ select: { id: true } }),
    prisma.booking.findFirst({ select: { id: true } }),
    prisma.folio.findFirst({ select: { id: true } }),
    prisma.housekeepingTask.findFirst({ select: { id: true } }),
    prisma.maintenanceRequest.findFirst({ select: { id: true } }),
    prisma.hotelSeedRecord.findFirst({ select: { id: true } }),
    prisma.guest.findFirst({ select: { id: true } }),
    prisma.ratePlan.findFirst({ select: { id: true } }),
    prisma.channel.findFirst({ select: { id: true } }),
    prisma.roomInventory.findFirst({ select: { id: true } }),
    prisma.nightAuditRun.findFirst({ select: { id: true } }),
  ]);
  if (records.some(Boolean)) {
    throw new Error('Hotel setup cannot replace existing rooms, reservations or operational data. Continue through the property settings and operating workspaces.');
  }
  return { replayed: false };
}

function day(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('A valid property business date is required for hotel setup.');
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Built-in demo calendar is relative; custom import dates are deliberate. */
export function prepareHotelSeed(source: Record<string, any>, businessDate: Date, relative: boolean) {
  const seed = structuredClone(source);
  const offset = relative ? day(businessDate) - Date.UTC(2026, 2, 12) : 0;
  const shift = (value: string) => new Date(day(value) + offset).toISOString();
  for (const section of ['bookings', 'channelReservations']) {
    for (const row of seed[section]) {
      row.checkInDate = shift(row.checkInDate);
      row.checkOutDate = shift(row.checkOutDate);
      if (relative && row.label) row.label = `${row.guestName} · ${row.roomType} · ${row.checkInDate.slice(0, 10)}–${row.checkOutDate.slice(0, 10)}`;
    }
  }
  for (const row of seed.seasonalRates) {
    row.startDate = shift(row.startDate); row.endDate = shift(row.endDate);
  }
  for (const row of seed.ratePlans) {
    if (row.validFrom) row.validFrom = shift(row.validFrom);
    if (row.validTo) row.validTo = shift(row.validTo);
  }
  for (const row of seed.channelSyncEvents) row.occurredAt = shift(row.occurredAt);
  for (const booking of seed.bookings) {
    const rate = seed.ratePlans.find((item: any) => item.name === booking.ratePlan && item.roomType === booking.roomType);
    if (!rate) throw new Error(`Booking ${booking.key} is missing a compatible rate plan.`);
    const nights = (day(booking.checkOutDate) - day(booking.checkInDate)) / DAY_MS;
    if (nights < 1 || nights > 31) throw new Error(`Booking ${booking.key} is outside the supported stay range.`);
    const capturedMinor = seed.bookingPayments.filter((payment: any) => payment.bookingKey === booking.key && ['completed', 'refunded'].includes(payment.status))
      .reduce((total: number, payment: any) => total + (payment.paymentType === 'refund' ? -1 : 1) * Math.round(payment.amount * 100), 0);
    const totalMinor = Math.round(booking.totalAmount * 100);
    if (capturedMinor < 0 || capturedMinor > totalMinor) throw new Error(`Booking ${booking.key} payments do not reconcile to its commercial total.`);
    booking.depositAmount = capturedMinor / 100;
    booking.balanceDue = (totalMinor - capturedMinor) / 100;
    booking.paymentStatus = capturedMinor === totalMinor ? 'paid' : capturedMinor ? 'partial' : 'unpaid';
    if (booking.status === 'checked_in' && !(day(booking.checkInDate) <= day(businessDate) && day(booking.checkOutDate) > day(businessDate))) {
      throw new Error(`Checked-in demo booking ${booking.key} must contain the current business date.`);
    }
  }
  // Filtering the minimal demo can remove the stay which occupied a room.
  for (const room of seed.rooms) {
    const occupied = seed.bookings.some((booking: any) => booking.roomNumber === room.roomNumber && booking.status === 'checked_in');
    if (occupied) room.status = 'occupied';
    else if (room.status === 'occupied') room.status = 'vacant';
  }
  for (const row of seed.inventory) {
    row.date = shift(row.date);
    const rooms = seed.rooms.filter((room: any) => room.roomType === row.roomType);
    row.totalRooms = rooms.length;
    // Direct reservations are counted from assignments by availability. These
    // are channel-supplied counters, so demo bookings must not leave stale ones.
    row.bookedRooms = 0;
    row.blockedRooms = rooms.filter((room: any) => ['maintenance', 'out_of_order'].includes(room.status)).length;
    if (relative && row.label) row.label = `${row.roomType} · ${row.date.slice(0, 10)}`;
  }
  return seed;
}
