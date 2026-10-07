const DEFAULT_CURRENCY = 'USD';

export type ReservationSnapshotSource = {
  bookingId: string;
  checkInDate: string | Date;
  checkOutDate: string | Date;
  roomTotalCents: number;
  taxTotalCents: number;
  feesTotalCents: number;
  currencyCode?: string | null;
  roomType: {
    id: string;
    name: string;
    imagePath?: string | null;
    imageAltText?: string | null;
  };
  ratePlan?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    cancellationPolicy?: string | null;
    mealPlan?: string | null;
  } | null;
  taxRateBasisPoints?: number | null;
  pricingSource?: string | null;
  nightlyRoomAmounts?: number[] | null;
  snapshotKeyPrefix?: string | null;
};

export type ReservationSnapshotLine = {
  reservation: { connect: { id: string } };
  type: 'room' | 'tax' | 'service_fee';
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date: string;
  snapshotKey: string;
  currencyCode: string;
  nightIndex: number | null;
  roomTypeIdSnapshot: string;
  roomTypeNameSnapshot: string;
  ratePlanIdSnapshot: string;
  ratePlanNameSnapshot: string;
  ratePlanDescriptionSnapshot: string;
  cancellationPolicySnapshot: string;
  mealPlanSnapshot: string;
  imagePathSnapshot: string;
  imageAltTextSnapshot: string;
  taxRateBasisPoints: number | null;
  pricingSourceSnapshot: string;
};

export function toMinorUnits(amount: number | null | undefined) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) throw new Error('Invalid monetary amount.');
  return Math.round(value * 100);
}

function normalizeDate(value: string | Date) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid reservation date.');
  return date;
}

export function getReservationStayDates(checkInValue: string | Date, checkOutValue: string | Date) {
  const checkIn = normalizeDate(checkInValue);
  const checkOut = normalizeDate(checkOutValue);
  checkIn.setUTCHours(0, 0, 0, 0);
  checkOut.setUTCHours(0, 0, 0, 0);
  if (checkOut <= checkIn) throw new Error('Check-out must be after check-in.');

  const dates: Date[] = [];
  const current = new Date(checkIn.getTime());
  while (current < checkOut) {
    dates.push(new Date(current.getTime()));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function allocateMinorUnits(total: number, count: number) {
  if (!Number.isInteger(total) || total < 0) throw new Error('Minor-unit total must be a non-negative integer.');
  if (!Number.isInteger(count) || count < 1) throw new Error('Allocation count must be positive.');

  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildReservationSnapshotLines(source: ReservationSnapshotSource): ReservationSnapshotLine[] {
  const stayDates = getReservationStayDates(source.checkInDate, source.checkOutDate);
  const roomAmounts = source.nightlyRoomAmounts?.length === stayDates.length
    ? source.nightlyRoomAmounts
    : allocateMinorUnits(source.roomTotalCents, stayDates.length);
  if (roomAmounts.reduce((sum, amount) => sum + amount, 0) !== source.roomTotalCents) {
    throw new Error('Nightly pricing evidence does not equal the room subtotal.');
  }
  const taxAmounts = allocateMinorUnits(source.taxTotalCents, stayDates.length);
  const currencyCode = (source.currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
  const ratePlan = source.ratePlan || {};
  const snapshotRoot = source.snapshotKeyPrefix ? `${source.bookingId}:${source.snapshotKeyPrefix}` : source.bookingId;
  const common = {
    reservation: { connect: { id: source.bookingId } },
    quantity: 1,
    currencyCode,
    roomTypeIdSnapshot: source.roomType.id,
    roomTypeNameSnapshot: source.roomType.name,
    ratePlanIdSnapshot: ratePlan.id || '',
    ratePlanNameSnapshot: ratePlan.name || 'Room type base rate',
    ratePlanDescriptionSnapshot: ratePlan.description || '',
    cancellationPolicySnapshot: ratePlan.cancellationPolicy || '',
    mealPlanSnapshot: ratePlan.mealPlan || 'room_only',
    imagePathSnapshot: source.roomType.imagePath || '',
    imageAltTextSnapshot: source.roomType.imageAltText || '',
    pricingSourceSnapshot: source.pricingSource || 'storefront',
  };

  const lines: ReservationSnapshotLine[] = [];
  stayDates.forEach((date, index) => {
    const key = dayKey(date);
    lines.push({
      ...common,
      type: 'room',
      description: `${source.roomType.name} · ${key}`,
      unitPrice: roomAmounts[index],
      totalPrice: roomAmounts[index],
      date: date.toISOString(),
      snapshotKey: `${snapshotRoot}:room:${key}`,
      nightIndex: index + 1,
      taxRateBasisPoints: null,
    });
    lines.push({
      ...common,
      type: 'tax',
      description: `Tax · ${source.roomType.name} · ${key}`,
      unitPrice: taxAmounts[index],
      totalPrice: taxAmounts[index],
      date: date.toISOString(),
      snapshotKey: `${snapshotRoot}:tax:${key}`,
      nightIndex: index + 1,
      taxRateBasisPoints: source.taxRateBasisPoints ?? null,
    });
  });

  lines.push({
    ...common,
    type: 'service_fee',
    description: `Fees · ${source.roomType.name} · stay`,
    unitPrice: source.feesTotalCents,
    totalPrice: source.feesTotalCents,
    date: stayDates[0].toISOString(),
    snapshotKey: `${snapshotRoot}:fees:stay`,
    nightIndex: null,
    taxRateBasisPoints: null,
  });

  return lines;
}

async function getRatePlanSnapshot(context: any, ratePlanId?: string | null) {
  if (!ratePlanId) return null;
  return context.sudo().query.RatePlan.findOne({
    where: { id: ratePlanId },
    query: 'id name description cancellationPolicy mealPlan',
  });
}

export async function ensureReservationSnapshots(context: any, bookingId: string) {
  const sudo = context.sudo();
  const booking = await sudo.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      source
      checkInDate
      checkOutDate
      roomRate
      taxAmount
      feesAmount
      roomRateMinor
      taxAmountMinor
      feesAmountMinor
      currencyCode
      pricingVersion
      pricingSnapshot
      ratePlan { id }
      roomAssignments {
        id
        roomType {
          id
          name
          roomImages(orderBy: { order: asc }) {
            id
            image { url }
            imagePath
            altText
            order
            isPrimary
          }
        }
      }
    `,
  });
  if (!booking) throw new Error('Booking not found.');

  const assignment = booking.roomAssignments?.find((item: any) => item.roomType) || booking.roomAssignments?.[0];
  const roomType = assignment?.roomType;
  if (!roomType) throw new Error('Booking must have a room type before snapshots can be created.');
  const primaryImage = roomType.roomImages?.find((image: any) => image.isPrimary) || roomType.roomImages?.[0];
  const ratePlan = await getRatePlanSnapshot(context, booking.ratePlan?.id);
  const roomTotalCents = Number.isSafeInteger(booking.roomRateMinor) ? booking.roomRateMinor : toMinorUnits(booking.roomRate);
  const taxTotalCents = Number.isSafeInteger(booking.taxAmountMinor) ? booking.taxAmountMinor : toMinorUnits(booking.taxAmount);
  const feesTotalCents = Number.isSafeInteger(booking.feesAmountMinor) ? booking.feesAmountMinor : toMinorUnits(booking.feesAmount);
  const pricingSnapshot = booking.pricingSnapshot && typeof booking.pricingSnapshot === 'object' ? booking.pricingSnapshot : {};
  const nightlyRoomAmounts = Array.isArray(pricingSnapshot.nightlyRates)
    ? pricingSnapshot.nightlyRates.map((night: any) => Number(night.amountMinor))
    : null;
  const taxRateBasisPoints = roomTotalCents > 0
    ? Math.round((taxTotalCents / roomTotalCents) * 10_000)
    : null;
  const lines = buildReservationSnapshotLines({
    bookingId,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    roomTotalCents,
    taxTotalCents,
    feesTotalCents,
    currencyCode: booking.currencyCode || 'USD',
    roomType: {
      id: roomType.id,
      name: roomType.name,
      imagePath: primaryImage?.image?.url || primaryImage?.imagePath || '',
      imageAltText: primaryImage?.altText || '',
    },
    ratePlan,
    taxRateBasisPoints,
    pricingSource: `${booking.source || 'direct'}:${booking.pricingVersion || 'legacy-v1'}`,
    nightlyRoomAmounts,
    snapshotKeyPrefix: typeof pricingSnapshot.snapshotKeyPrefix === 'string' ? pricingSnapshot.snapshotKeyPrefix : null,
  });

  const existing = await sudo.query.ReservationLineItem.findMany({
    where: { reservation: { id: { equals: bookingId } }, snapshotStatus: { equals: 'active' } },
    query: 'id snapshotKey',
  });
  const existingKeys = new Set(existing.map((line: any) => line.snapshotKey).filter(Boolean));
  const missing = lines.filter((line) => !existingKeys.has(line.snapshotKey));
  for (const line of missing) {
    await sudo.query.ReservationLineItem.createOne({ data: line });
  }

  return {
    bookingId,
    created: missing.length,
    existing: lines.length - missing.length,
    total: lines.length,
  };
}
