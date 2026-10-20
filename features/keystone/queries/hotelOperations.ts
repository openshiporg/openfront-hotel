import { getHotelOperationalReport } from '../reporting/reporting';
import { getHotelAvailability } from '../inventory/roomAvailability';
import { refundablePaymentMinor } from '../refunds/bookingRefund';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { paymentIntegrationConfigured, paymentProviderEnabled, paymentProviderUsesEnvironment } from '../lib/integrationConfig';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';

const HOTEL_PROPERTY_KEY = 'the-alder-house';

function requireHotelPermission(context: any, permission: string, propertyKey: string) {
  if (propertyKey !== HOTEL_PROPERTY_KEY) {
    throw new Error('Property access denied.');
  }
  if (!context.session?.data?.role?.[permission]) {
    throw new Error('Not authorized for this hotel workspace.');
  }
}

// The board reads authoritative availability, which covers at most one 31-night stay window.
const MAX_RATE_BOARD_DAYS = 31;
const RATE_PLAN_PAGE_SIZE = 100;
const GUEST_PAGE_SIZE = 50;
const ROOM_PAGE_SIZE = 100;
const PAYMENT_PAGE_SIZE = 50;
const MAINTENANCE_PAGE_SIZE = 50;
const OUTBOX_PAGE_SIZE = 100;
const MAINTENANCE_PRIORITIES = ['emergency', 'high', 'medium', 'low'];

function boundedDateRange(startValue: string, endValue: string, maxDays: number) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const duration = end.getTime() - start.getTime();
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    duration < 0 ||
    duration > maxDays * 86_400_000
  ) {
    throw new Error(`Date range must be between 0 and ${maxDays} days.`);
  }
  return { start, end };
}

function syncErrorSummary(value: unknown) {
  if (!Array.isArray(value)) return { count: 0, latestMessage: null, latestAt: null };
  const latest = value.at(-1);
  if (!latest || typeof latest !== 'object') {
    return { count: value.length, latestMessage: null, latestAt: null };
  }
  const error = latest as Record<string, unknown>;
  return {
    count: value.length,
    latestMessage: typeof error.message === 'string' ? safeOperationalErrorMessage('channel') : null,
    latestAt: typeof error.occurredAt === 'string' ? error.occurredAt : null,
  };
}

export const hotelOperationsTypeDefs = String.raw`
  type HotelRoomTypeRef { id: ID!, name: String!, baseRate: Float, baseRateMinor: Int }
  type HotelRoomRef { id: ID!, roomNumber: String!, status: String, floor: String, roomType: HotelRoomTypeRef }
  type HotelUserRef { id: ID!, name: String }

  type HotelModificationRequestProjection {
    id: ID!
    requestedCheckInDate: DateTime
    requestedCheckOutDate: DateTime
    guestMessage: String
  }

  type HotelReservationProjection {
    id: ID!
    confirmationNumber: String!
    guestName: String!
    checkInDate: DateTime!
    checkOutDate: DateTime!
    status: String!
    source: String!
    numberOfGuests: Int!
    totalAmount: Float!
    balanceDue: Float!
    totalAmountMinor: Int!
    balanceDueMinor: Int!
    internalNotes: String
    hasPendingModificationRequest: Boolean!
    pendingModificationRequest: HotelModificationRequestProjection
    room: HotelRoomRef
    roomType: HotelRoomTypeRef
  }

  type HotelReservationBoard {
    businessDate: DateTime!
    reservations: [HotelReservationProjection!]!
    rooms: [HotelRoomRef!]!
  }

  type HotelTaskSummary { id: ID!, taskType: String!, status: String!, priority: String! }
  type HotelRoomOperationsItem {
    id: ID!
    roomNumber: String!
    floor: String
    status: String!
    notes: String
    lastCleaned: DateTime
    roomType: HotelRoomTypeRef!
    activeTask: HotelTaskSummary
  }
  type HotelRoomOperations { rooms: [HotelRoomOperationsItem!]!, total: Int!, statusCounts: HotelRoomStatusCounts! }
  type HotelRoomStatusCounts { all: Int!, vacant: Int!, occupied: Int!, cleaning: Int!, maintenance: Int!, out_of_order: Int! }

  type HotelInventoryProjection {
    id: ID!
    date: DateTime!
    totalRooms: Int!
    bookedRooms: Int!
    blockedRooms: Int!
    availableRooms: Int!
    isAvailable: Boolean!
    roomType: HotelRoomTypeRef!
  }
  type HotelRatePlanProjection {
    id: ID!
    name: String!
    description: String
    baseRate: Float!
    baseRateMinor: Int!
    currencyCode: String!
    minimumStay: Int
    maximumStay: Int
    cancellationPolicy: String
    mealPlan: String
    status: String
    isPublic: Boolean
    isPromotional: Boolean
    promoCode: String
    priority: Int
    validFrom: DateTime
    validTo: DateTime
    roomType: HotelRoomTypeRef!
  }
  type HotelRoomTypeCapacity { id: ID!, name: String!, totalRooms: Int!, sellableRooms: Int! }
  type HotelRateOperations {
    businessDate: DateTime
    start: DateTime!
    end: DateTime!
    roomTypes: [HotelRoomTypeCapacity!]!
    inventories: [HotelInventoryProjection!]!
    availability: [HotelInventoryAvailability!]!
    ratePlans: [HotelRatePlanProjection!]!
    ratePlanTotal: Int!
  }
  type HotelInventoryAvailability {
    roomTypeId: ID!
    date: String!
    total: Int!
    booked: Int!
    held: Int!
    blocked: Int!
    available: Int!
  }

  type HotelHousekeepingTaskProjection {
    id: ID!
    updatedAt: DateTime!
    status: String!
    taskType: String!
    priority: String!
    notes: String
    startedAt: DateTime
    completedAt: DateTime
    room: HotelRoomRef!
    assignedTo: HotelUserRef
  }
  type HotelHousekeepingMetrics {
    completedToday: Int!
    averageCleanMinutes: Int!
  }
  type HotelHousekeepingOperations {
    rooms: [HotelRoomRef!]!
    tasks: [HotelHousekeepingTaskProjection!]!
    assignees: [HotelUserRef!]!
    metrics: HotelHousekeepingMetrics!
  }

  type HotelMaintenanceProjection {
    id: ID!
    title: String!
    category: String!
    priority: String!
    status: String!
    notes: String
    completedAt: DateTime
    room: HotelRoomRef!
    assignedTo: HotelUserRef
    createdAt: DateTime!
  }
  type HotelMaintenanceOperations { requests: [HotelMaintenanceProjection!]!, total: Int!, statusCounts: JSON! }

  type HotelFolioEntryProjection {
    id: ID!
    postingKey: String!
    entryType: String!
    direction: String!
    amountMinor: Int!
    currencyCode: String!
    description: String!
    serviceDate: DateTime
    postedAt: DateTime!
    sourceType: String
    taxCategorySnapshot: String
    reversesId: ID
    reversedById: ID
  }
  type HotelFolioProjection {
    settlementBookingId: ID
    groupBlock: HotelFolioGroupRef
    id: ID!
    folioNumber: String!
    status: String!
    currencyCode: String!
    openedAt: DateTime!
    booking: HotelReservationProjection
    entries: [HotelFolioEntryProjection!]!
    debitMinor: Int!
    creditMinor: Int!
    balanceMinor: Int!
  }
  type HotelFolioOperations {
    folios: [HotelFolioProjection!]!
    overdueExceptions: [HotelReservationProjection!]!
    targetFolioId: ID
    targetMissing: Boolean!
  }
  type HotelFolioGroupRef { id: ID!, name: String! }

  type HotelChannelProjection {
    id: ID!
    name: String!
    channelType: String!
    isActive: Boolean!
    syncInventory: Boolean!
    syncRates: Boolean!
    commission: Float
    syncStatus: String!
    lastSyncAt: DateTime
    syncErrorCount: Int!
    latestSyncError: String
    latestSyncErrorAt: DateTime
  }
  type HotelChannelReservationProjection {
    id: ID!
    externalId: String!
    guestName: String!
    checkInDate: DateTime!
    checkOutDate: DateTime!
    channelStatus: String
    totalAmount: Float
    commission: Float
    channel: HotelChannelProjection!
    reservation: HotelReservationProjection
    roomType: HotelRoomTypeRef
  }
  type HotelChannelSyncProjection {
    id: ID!
    action: String!
    status: String!
    message: String
    errorMessage: String
    attempts: Int!
    nextAttemptAt: DateTime
    occurredAt: DateTime!
    channel: HotelChannelProjection!
  }
  type HotelChannelOperations {
    channels: [HotelChannelProjection!]!
    reservations: [HotelChannelReservationProjection!]!
    events: [HotelChannelSyncProjection!]!
  }

  type HotelPaymentProviderProjection { id: ID!, name: String!, code: String!, isInstalled: Boolean!, configured: Boolean!, credentialSource: String }
  type HotelPaymentProjection {
    id: ID!
    paymentReference: String!
    amount: Float!
    amountMinor: Int!
    currency: String!
    paymentType: String!
    paymentMethod: String!
    status: String!
    booking: HotelReservationProjection!
    paymentProvider: HotelPaymentProviderProjection!
    createdAt: DateTime!
  }
  type HotelPaymentSummary {
    capturedAmount: Float!
    refundedAmount: Float!
    capturedAmountMinor: Int!
    refundedAmountMinor: Int!
    completedCount: Int!
    refundedCount: Int!
    failedCount: Int!
    pendingCount: Int!
  }
  type HotelPaymentOperations { payments: [HotelPaymentProjection!]!, summary: HotelPaymentSummary!, total: Int! }
  type HotelRefundQuote { paymentId: ID!, refundableMinor: Int!, currencyCode: String! }

  type HotelOperationalReportDay {
    date: DateTime!
    availableRoomNights: Int!
    occupiedRoomNights: Int!
    occupancyRate: Float!
    roomRevenueMinor: Int!
    taxMinor: Int!
    feeMinor: Int!
    totalRevenueMinor: Int!
    adrMinor: Int!
    revparMinor: Int!
    arrivals: Int!
    departures: Int!
    newReservations: Int!
    cancellations: Int!
    noShows: Int!
    paymentsMinor: Int!
    refundsMinor: Int!
  }
  type HotelOperationalReportSummary {
    closedSnapshotDays: Int!
    unclosedHistoricalDays: Int!
    forecastDays: Int!
    start: DateTime!
    end: DateTime!
    businessDate: DateTime!
    currencyCode: String!
    availableRoomNights: Int!
    occupiedRoomNights: Int!
    occupancyRate: Float!
    roomRevenueMinor: Int!
    taxMinor: Int!
    feeMinor: Int!
    totalRevenueMinor: Int!
    adrMinor: Int!
    revparMinor: Int!
    arrivals: Int!
    departures: Int!
    newReservations: Int!
    cancellations: Int!
    noShows: Int!
    paymentsMinor: Int!
    refundsMinor: Int!
    openFolioBalanceMinor: Int!
    openFolioCount: Int!
  }
  type HotelChannelReport { source: String!, bookings: Int!, revenueMinor: Int! }
  type HotelRoomTypeReport { id: ID!, name: String!, availableRoomNights: Int!, occupiedRoomNights: Int!, occupancyRate: Float!, roomRevenueMinor: Int!, adrMinor: Int! }
  type HotelAnalyticsOperations {
    demand: String!
    summary: HotelOperationalReportSummary!
    days: [HotelOperationalReportDay!]!
    channels: [HotelChannelReport!]!
    roomTypes: [HotelRoomTypeReport!]!
  }

  type HotelGuestProjection {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    phone: String
    loyaltyNumber: String
    loyaltyTier: String
    loyaltyPoints: String
    isVip: Boolean!
    isBlacklisted: Boolean!
    lastStayAt: DateTime
    totalStays: String
    totalSpent: String
    createdAt: DateTime!
  }
  type HotelGuestOperations { guests: [HotelGuestProjection!]!, total: Int!, segmentCounts: HotelGuestSegmentCounts! }
  type HotelGuestSegmentCounts { all: Int!, vip: Int!, standard: Int!, restricted: Int! }
  type HotelPaymentProviderOperations { providers: [HotelPaymentProviderProjection!]! }
  type HotelOperatorCapabilities {
    canAccessDashboard: Boolean!
    canManageRooms: Boolean!
    canManageBookings: Boolean!
    canManageHousekeeping: Boolean!
    canManageGuests: Boolean!
    canManagePayments: Boolean!
    canManageRoles: Boolean!
    canManageOnboarding: Boolean!
    canManageAudit: Boolean!
    canManageIntegrations: Boolean!
    canManageGuestPrivacy: Boolean!
    canApproveHotelExceptions: Boolean!
  }

  type HotelNightAuditRunProjection {
    id: ID!
    businessDate: DateTime!
    status: String!
    dueBookingCount: Int!
    postedEntryCount: Int!
    existingEntryCount: Int!
    exceptionCount: Int!
    debitMinor: Int!
    completedAt: DateTime!
  }
  type HotelNightAuditOperations {
    currentBusinessDate: DateTime!
    runs: [HotelNightAuditRunProjection!]!
  }
  type HotelGroupAllocationProjection {
    id: ID!
    allocationKey: String!
    roomType: HotelRoomTypeRef!
    roomsHeld: Int!
    roomsPickedUp: Int!
    rateMinor: Int!
    currencyCode: String!
  }
  type HotelGroupBlockProjection {
    id: ID!
    blockCode: String!
    name: String!
    status: String!
    arrivalDate: DateTime!
    departureDate: DateTime!
    releaseDate: DateTime
    contactName: String!
    contactEmail: String!
    billingType: String!
    allocations: [HotelGroupAllocationProjection!]!
  }
  type HotelGroupOperations { groups: [HotelGroupBlockProjection!]! }

  type HotelOutboxAttemptProjection { id: ID!, attemptNumber: Int!, status: String!, workerId: String!, errorMessage: String, startedAt: DateTime!, finishedAt: DateTime }
  type HotelOutboxEventProjection {
    id: ID!, eventKey: String!, topic: String!, aggregateType: String!, aggregateId: String!, status: String!, attempts: Int!,
    availableAt: DateTime!, deliveredAt: DateTime, deadLetteredAt: DateTime, lastError: String, replayedFromEventKey: String,
    attemptsEvidence: [HotelOutboxAttemptProjection!]!
  }
  type HotelRefundIntentProjection {
    id: ID!, intentKey: String!, amountMinor: Int!, currencyCode: String!, reason: String!, status: String!, attempts: Int!,
    lastError: String, availableAt: DateTime!, completedAt: DateTime, booking: HotelReservationProjection!
  }
  type HotelOutboxOperations { events: [HotelOutboxEventProjection!]!, refundIntents: [HotelRefundIntentProjection!]!, eventsTotal: Int!, refundIntentsTotal: Int!, statusCounts: JSON! }

  extend type Query {
    hotelOperatorCapabilities: HotelOperatorCapabilities!
    hotelFrontDesk(propertyKey: String!, start: DateTime, end: DateTime): HotelReservationBoard!
    hotelReservationCalendar(propertyKey: String!, start: DateTime!, end: DateTime!): HotelReservationBoard!
    hotelRoomOperations(propertyKey: String!, search: String, status: String, sort: String, take: Int, skip: Int): HotelRoomOperations!
    hotelRateOperations(propertyKey: String!, start: DateTime, end: DateTime, ratePlanSkip: Int): HotelRateOperations!
    hotelHousekeepingOperations(propertyKey: String!): HotelHousekeepingOperations!
    hotelMaintenanceOperations(propertyKey: String!, search: String, status: String, priority: String, sort: String, take: Int, skip: Int): HotelMaintenanceOperations!
    hotelFolioOperations(propertyKey: String!, bookingId: ID): HotelFolioOperations!
    hotelChannelOperations(propertyKey: String!): HotelChannelOperations!
    hotelPaymentOperations(propertyKey: String!, search: String, status: String, sort: String, take: Int, skip: Int): HotelPaymentOperations!
    hotelRefundQuote(propertyKey: String!, paymentId: ID!): HotelRefundQuote!
    hotelAnalyticsOperations(propertyKey: String!, start: DateTime!, end: DateTime!): HotelAnalyticsOperations!
    hotelGuestOperations(propertyKey: String!, search: String, segment: String, sort: String, take: Int, skip: Int): HotelGuestOperations!
    hotelPaymentProviderOperations(propertyKey: String!): HotelPaymentProviderOperations!
    hotelNightAuditOperations(propertyKey: String!): HotelNightAuditOperations!
    hotelGroupOperations(propertyKey: String!): HotelGroupOperations!
    hotelOutboxOperations(propertyKey: String!, status: String, search: String, eventSkip: Int, refundSkip: Int): HotelOutboxOperations!
  }
`;

function mapRoom(room: any) {
  if (!room) return null;
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor ?? null,
    status: room.status || null,
    roomType: room.roomType ? { id: room.roomType.id, name: room.roomType.name, baseRate: room.roomType.baseRateMinor / 100, baseRateMinor: room.roomType.baseRateMinor } : null,
  };
}

function mapReservation(booking: any) {
  if (!booking) return null;
  const assignment = booking.roomAssignments?.[0];
  return {
    id: booking.id,
    confirmationNumber: booking.confirmationNumber,
    guestName: booking.guestName,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    status: booking.status,
    source: booking.source,
    numberOfGuests: booking.numberOfGuests,
    totalAmount: booking.totalAmountMinor / 100,
    balanceDue: booking.balanceDueMinor / 100,
    totalAmountMinor: booking.totalAmountMinor,
    balanceDueMinor: booking.balanceDueMinor,
    internalNotes: booking.internalNotes || null,
    hasPendingModificationRequest: Boolean(booking.modificationRequests?.length),
    pendingModificationRequest: booking.modificationRequests?.[0] || null,
    room: mapRoom(assignment?.room),
    roomType: assignment?.roomType
      ? { id: assignment.roomType.id, name: assignment.roomType.name, baseRate: assignment.roomType.baseRateMinor / 100, baseRateMinor: assignment.roomType.baseRateMinor }
      : null,
  };
}

const reservationInclude = {
  roomAssignments: {
    take: 1,
    include: { room: { include: { roomType: true } }, roomType: true },
  },
  modificationRequests: {
    where: { status: 'pending' },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      requestedCheckInDate: true,
      requestedCheckOutDate: true,
      guestMessage: true,
    },
  },
} as const;

async function reservationBoard(
  context: any,
  args: any,
  permission: string,
  maxDays: number,
  vacantOnly: boolean,
  includePendingModifications = false,
) {
  requireHotelPermission(context, permission, args.propertyKey);
  let range = args;
  if (!args.start || !args.end) {
    // Without explicit dates, read the week either side of the property's business date, which
    // is what the arrival, departure and in-house queues are counted against.
    const current = await context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { currentBusinessDate: true } });
    if (!current) throw new Error('Property business date is not configured.');
    const anchor = new Date(current.currentBusinessDate).getTime();
    range = { start: new Date(anchor - 7 * 86_400_000).toISOString(), end: new Date(anchor + 7 * 86_400_000).toISOString() };
  }
  const { start, end } = boundedDateRange(range.start, range.end, maxDays);
  const dateOverlap = { checkOutDate: { gt: start }, checkInDate: { lt: end } };
  const [bookings, rooms, clock] = await Promise.all([
    context.prisma.booking.findMany({
      where: includePendingModifications
        ? { OR: [dateOverlap, { modificationRequests: { some: { status: 'pending' } } }] }
        : dateOverlap,
      orderBy: [{ checkInDate: 'asc' }, { id: 'asc' }],
      take: 251,
      include: reservationInclude,
    }),
    context.prisma.room.findMany({
      where: vacantOnly ? { status: 'vacant' } : undefined,
      orderBy: [{ roomNumber: 'asc' }],
      take: 251,
      include: { roomType: true },
    }),
    context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { currentBusinessDate: true } }),
  ]);
  if (!clock) throw new Error('Property business date is not configured.');
  if (bookings.length > 250 || rooms.length > 250) throw new Error('Reservation board exceeds the supported 250-record bound; narrow the date range.');
  return { businessDate: clock.currentBusinessDate, reservations: bookings.map(mapReservation), rooms: rooms.map(mapRoom) };
}

export const hotelOperationsResolvers = {
  Query: {
    hotelOperatorCapabilities: (_root: unknown, _args: unknown, context: any) => {
      if (!context.session?.itemId) throw new Error('Authentication is required.');
      const role = context.session.data?.role || {};
      return {
        canAccessDashboard: Boolean(role.canAccessDashboard),
        canManageRooms: Boolean(role.canManageRooms),
        canManageBookings: Boolean(role.canManageBookings),
        canManageHousekeeping: Boolean(role.canManageHousekeeping),
        canManageGuests: Boolean(role.canManageGuests),
        canManagePayments: Boolean(role.canManagePayments),
        canManageRoles: Boolean(role.canManageRoles),
        canManageOnboarding: Boolean(role.canManageOnboarding),
        canManageAudit: Boolean(role.canManageAudit),
        canManageIntegrations: Boolean(role.canManageIntegrations),
        canManageGuestPrivacy: Boolean(role.canManageGuestPrivacy),
        canApproveHotelExceptions: Boolean(role.canApproveHotelExceptions),
      };
    },
    hotelFrontDesk: (_root: unknown, args: any, context: any) =>
      reservationBoard(context, args, 'canManageBookings', 31, true, true),
    hotelReservationCalendar: (_root: unknown, args: any, context: any) =>
      reservationBoard(context, args, 'canManageBookings', 120, false),

    hotelRoomOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageRooms', args.propertyKey);
      const search = String(args.search || '').trim().slice(0, 120);
      const take = Math.min(Math.max(Math.trunc(Number(args.take) || ROOM_PAGE_SIZE), 1), 250);
      const skip = Math.min(Math.max(Math.trunc(Number(args.skip) || 0), 0), 100_000);
      const floor = /^-?\d{1,3}$/.test(search) ? Number(search) : null;
      const searchWhere = search ? { OR: [
        { roomNumber: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { roomType: { name: { contains: search, mode: 'insensitive' } } },
        ...(floor !== null ? [{ floor }] : []),
      ] } : {};
      const statuses = ['vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order'];
      const statusWhere = args.status === 'out_of_service'
        ? { status: { in: ['maintenance', 'out_of_order'] } }
        : statuses.includes(String(args.status)) ? { status: String(args.status) } : {};
      const where = { AND: [searchWhere, statusWhere] };
      const orderBy = args.sort === 'floor'
        ? [{ floor: { sort: 'asc', nulls: 'last' } }, { roomNumber: 'asc' }, { id: 'asc' }]
        : args.sort === 'status'
          ? [{ status: 'asc' }, { roomNumber: 'asc' }, { id: 'asc' }]
          : [{ roomNumber: 'asc' }, { id: 'asc' }];
      const [total, grouped] = await Promise.all([
        context.prisma.room.count({ where }),
        context.prisma.room.groupBy({ by: ['status'], where: searchWhere, _count: { _all: true } }),
      ]);
      const countOf = (status: string) => Number(grouped.find((row: any) => row.status === status)?._count?._all || 0);
      const rooms = await context.prisma.room.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          roomType: true,
          housekeepingTasks: {
            where: { status: { not: 'completed' } },
            orderBy: [{ createdAt: 'desc' }],
            take: 1,
          },
        },
      });
      return {
        rooms: rooms.map((room: any) => ({
          ...mapRoom(room),
          notes: room.notes || null,
          lastCleaned: room.lastCleaned,
          activeTask: room.housekeepingTasks[0] || null,
        })),
        total,
        statusCounts: {
          all: grouped.reduce((sum: number, row: any) => sum + Number(row._count?._all || 0), 0),
          vacant: countOf('vacant'), occupied: countOf('occupied'), cleaning: countOf('cleaning'),
          maintenance: countOf('maintenance'), out_of_order: countOf('out_of_order'),
        },
      };
    },

    hotelRateOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageRooms', args.propertyKey);
      // Without explicit dates the board shows the week starting on the property's open business date.
      const clock = await context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
      const anchor = clock?.currentBusinessDate ? new Date(clock.currentBusinessDate) : new Date();
      anchor.setUTCHours(0, 0, 0, 0);
      const { start, end } = boundedDateRange(
        args.start || anchor.toISOString(),
        args.end || new Date(anchor.getTime() + 7 * 86_400_000).toISOString(),
        MAX_RATE_BOARD_DAYS,
      );
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
      const ratePlanSkip = Math.min(Math.max(Math.trunc(Number(args.ratePlanSkip) || 0), 0), 100_000);
      const roomTypes = await context.prisma.roomType.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], include: { rooms: true } });
      const [inventories, ratePlans, ratePlanTotal, availability] = await Promise.all([
        // One override row per room type and day at most, so this bound never truncates the range.
        context.prisma.roomInventory.findMany({
          where: { date: { gte: start, lt: end } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          take: Math.max(1, roomTypes.length * days),
          include: { roomType: true },
        }),
        context.prisma.ratePlan.findMany({
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { baseRateMinor: 'asc' }, { id: 'asc' }],
          skip: ratePlanSkip,
          take: RATE_PLAN_PAGE_SIZE,
          include: { roomType: true },
        }),
        context.prisma.ratePlan.count(),
        roomTypes.length ? getHotelAvailability(context, { checkInDate: start, checkOutDate: end }) : [],
      ]);
      const availabilityRows = availability.flatMap((roomType: any) => roomType.availabilityByDay.map((day: any) => ({ roomTypeId: roomType.id, ...day })));
      const availableByKey = new Map(availabilityRows.map((row: any) => [`${row.roomTypeId}:${row.date}`, row.available]));
      return {
        businessDate: clock?.currentBusinessDate || null,
        start,
        end,
        roomTypes: roomTypes.map((type: any) => ({
          id: type.id,
          name: type.name,
          totalRooms: type.rooms.length,
          sellableRooms: type.rooms.filter((room: any) => !['maintenance', 'out_of_order'].includes(room.status)).length,
        })),
        inventories: inventories.map((item: any) => {
          const available = Number(availableByKey.get(`${item.roomTypeId}:${new Date(item.date).toISOString().slice(0, 10)}`) ?? 0);
          return { ...item, availableRooms: available, isAvailable: available > 0 };
        }),
        availability: availabilityRows,
        ratePlans,
        ratePlanTotal,
      };
    },

    hotelHousekeepingOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageHousekeeping', args.propertyKey);
      const completedSince = new Date();
      completedSince.setUTCHours(0, 0, 0, 0);
      const [rooms, tasks, assignees] = await Promise.all([
        context.prisma.room.findMany({ orderBy: { roomNumber: 'asc' }, take: 250, include: { roomType: true } }),
        context.prisma.housekeepingTask.findMany({
          where: {
            OR: [
              { status: { in: ['pending', 'in_progress', 'on_hold', 'inspection_needed'] } },
              { status: 'completed', completedAt: { gte: completedSince } },
            ],
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          take: 250,
          include: { room: { include: { roomType: true } }, assignedTo: true },
        }),
        // Same eligibility as task assignment: active staff whose role grants housekeeping or
        // room maintenance, whatever the role is called.
        context.prisma.user.findMany({
          where: { isActive: true, role: { OR: [{ canManageHousekeeping: true }, { canManageRooms: true }] } },
          orderBy: { name: 'asc' },
          take: 500,
          select: { id: true, name: true },
        }),
      ]);
      const completed = tasks.filter((task: any) => task.status === 'completed' && task.completedAt >= completedSince);
      const durations = completed
        .filter((task: any) => task.startedAt && task.completedAt)
        .map((task: any) => Math.max(0, Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 60_000)));
      return {
        rooms: rooms.map(mapRoom),
        tasks: tasks.map((task: any) => ({ ...task, room: mapRoom(task.room) })),
        assignees,
        metrics: {
          completedToday: completed.length,
          averageCleanMinutes: durations.length ? Math.round(durations.reduce((sum: number, value: number) => sum + value, 0) / durations.length) : 0,
        },
      };
    },

    hotelMaintenanceOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageRooms', args.propertyKey);
      const search = String(args.search || '').trim().slice(0, 160);
      const take = Math.min(Math.max(Math.trunc(Number(args.take) || MAINTENANCE_PAGE_SIZE), 1), 100);
      const skip = Math.min(Math.max(Math.trunc(Number(args.skip) || 0), 0), 100_000);
      const searchWhere = search ? { OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { room: { roomNumber: { contains: search, mode: 'insensitive' } } },
        { assignedTo: { name: { contains: search, mode: 'insensitive' } } },
      ] } : {};
      const priority = MAINTENANCE_PRIORITIES.includes(String(args.priority)) ? { priority: String(args.priority) } : {};
      const status = args.status && args.status !== 'all' ? { status: String(args.status).slice(0, 40) } : {};
      const where = { AND: [searchWhere, priority, status] };
      const include = { room: { include: { roomType: true } }, assignedTo: true };
      const recent = [{ createdAt: 'desc' }, { id: 'desc' }];
      let total: number;
      let requests: any[];
      if (args.sort === 'recent') {
        [total, requests] = await Promise.all([
          context.prisma.maintenanceRequest.count({ where }),
          context.prisma.maintenanceRequest.findMany({ where, orderBy: recent, take, skip, include }),
        ]);
      } else {
        // Priority order (emergency first) across every matching request: walk the priority groups in order.
        const groups = [...MAINTENANCE_PRIORITIES.map((value) => ({ priority: value })), { priority: { notIn: MAINTENANCE_PRIORITIES } }];
        const counts = await Promise.all(groups.map((group) => context.prisma.maintenanceRequest.count({ where: { AND: [where, group] } })));
        total = counts.reduce((sum: number, count: number) => sum + count, 0);
        requests = [];
        let groupSkip = skip;
        for (const [index, group] of groups.entries()) {
          if (requests.length >= take) break;
          if (groupSkip >= counts[index]) { groupSkip -= counts[index]; continue; }
          requests.push(...await context.prisma.maintenanceRequest.findMany({ where: { AND: [where, group] }, orderBy: recent, skip: groupSkip, take: take - requests.length, include }));
          groupSkip = 0;
        }
      }
      const [byStatus, emergencyOpen] = await Promise.all([
        context.prisma.maintenanceRequest.groupBy({ by: ['status'], where: { AND: [searchWhere, priority] }, _count: { _all: true } }),
        context.prisma.maintenanceRequest.count({ where: { AND: [searchWhere, { priority: 'emergency' }, { status: { notIn: ['verified', 'cancelled'] } }] } }),
      ]);
      const statusCounts: Record<string, number> = { emergencyOpen };
      for (const row of byStatus) statusCounts[row.status || 'reported'] = (statusCounts[row.status || 'reported'] || 0) + Number(row._count?._all || 0);
      return {
        requests: requests.map((item: any) => ({ ...item, room: mapRoom(item.room) })),
        total,
        statusCounts,
      };
    },

    hotelFolioOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      const folioInclude = {
        booking: { include: reservationInclude },
        groupBlock: { select: { id: true, name: true } },
        billedBookings: { take: 1, orderBy: { id: 'asc' }, select: { id: true } },
        entries: {
          orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
          include: { reversedBy: { select: { id: true } } },
        },
      };
      const requestedBookingId = args.bookingId ? String(args.bookingId).trim().slice(0, 100) : '';
      const [recentFolios, clock, target] = await Promise.all([context.prisma.folio.findMany({
        orderBy: [{ openedAt: 'desc' }],
        take: 50,
        include: folioInclude,
      }), context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
      // A deep link names one reservation: its own folio, or the group master folio that bills it.
      requestedBookingId ? context.prisma.folio.findFirst({
        where: { OR: [{ bookingId: requestedBookingId }, { billedBookings: { some: { id: requestedBookingId } } }] },
        orderBy: [{ openedAt: 'desc' }],
        include: folioInclude,
      }) : null]);
      const folios = target && !recentFolios.some((folio: any) => folio.id === target.id) ? [target, ...recentFolios] : recentFolios;
      const overdueExceptions = clock ? await context.prisma.booking.findMany({
        where: { status: 'checked_in', checkOutDate: { lte: clock.currentBusinessDate } },
        orderBy: [{ checkOutDate: 'asc' }, { id: 'asc' }], take: 100, include: reservationInclude,
      }) : [];
      return {
        targetFolioId: target?.id || null,
        targetMissing: Boolean(requestedBookingId) && !target,
        overdueExceptions: overdueExceptions.map(mapReservation),
        folios: folios.map((folio: any) => {
          const debitMinor = folio.entries
            .filter((entry: any) => entry.direction === 'debit')
            .reduce((sum: number, entry: any) => sum + entry.amountMinor, 0);
          const creditMinor = folio.entries
            .filter((entry: any) => entry.direction === 'credit')
            .reduce((sum: number, entry: any) => sum + entry.amountMinor, 0);
          return {
            ...folio,
            settlementBookingId: folio.booking?.id || folio.billedBookings?.[0]?.id || null,
            groupBlock: folio.groupBlock || null,
            booking: mapReservation(folio.booking),
            entries: folio.entries.map((entry: any) => ({
              ...entry,
              reversesId: entry.reversesId || null,
              reversedById: entry.reversedBy?.id || null,
            })),
            debitMinor,
            creditMinor,
            balanceMinor: debitMinor - creditMinor,
          };
        }),
      };
    },

    hotelChannelOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageBookings', args.propertyKey);
      requireHotelPermission(context, 'canManageIntegrations', args.propertyKey);
      const [channels, reservations, events] = await Promise.all([
        context.prisma.channel.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        context.prisma.channelReservation.findMany({
          orderBy: { lastSyncedAt: 'desc' },
          take: 50,
          include: {
            channel: true,
            reservation: { include: reservationInclude },
            roomType: true,
          },
        }),
        context.prisma.channelSyncEvent.findMany({
          orderBy: { occurredAt: 'desc' },
          take: 50,
          include: { channel: true },
        }),
      ]);
      const mapChannel = (channel: any) => {
        const errors = syncErrorSummary(channel.syncErrors);
        return {
          id: channel.id,
          name: channel.name,
          channelType: channel.channelType,
          isActive: channel.isActive,
          syncInventory: channel.syncInventory,
          syncRates: channel.syncRates,
          commission: channel.commission,
          syncStatus: channel.syncStatus || 'unknown',
          lastSyncAt: channel.lastSyncAt,
          syncErrorCount: errors.count,
          latestSyncError: errors.latestMessage,
          latestSyncErrorAt: errors.latestAt,
        };
      };
      return {
        channels: channels.map(mapChannel),
        reservations: reservations.map((item: any) => ({
          ...item,
          channel: mapChannel(item.channel),
          reservation: mapReservation(item.reservation),
        })),
        events: events.map((item: any) => ({
          ...item,
          message: item.status === 'failed' ? safeOperationalErrorMessage('channel') : item.message,
          errorMessage: item.errorMessage ? safeOperationalErrorMessage('channel') : null,
          channel: mapChannel(item.channel),
        })),
      };
    },

    hotelPaymentOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      const search = String(args.search || '').trim().slice(0, 160);
      const take = Math.min(Math.max(Math.trunc(Number(args.take) || PAYMENT_PAGE_SIZE), 1), 100);
      const skip = Math.min(Math.max(Math.trunc(Number(args.skip) || 0), 0), 100_000);
      const searchWhere = search ? { OR: [
        { paymentReference: { contains: search, mode: 'insensitive' } },
        { providerPaymentId: { contains: search, mode: 'insensitive' } },
        { paymentMethod: { contains: search, mode: 'insensitive' } },
        { booking: { confirmationNumber: { contains: search, mode: 'insensitive' } } },
        { booking: { guestName: { contains: search, mode: 'insensitive' } } },
        { paymentProvider: { name: { contains: search, mode: 'insensitive' } } },
      ] } : {};
      const status = ['completed', 'pending', 'failed', 'refunded', 'processing', 'cancelled'].includes(String(args.status)) ? String(args.status) : null;
      const where = { AND: [searchWhere, status ? { status } : {}] };
      const orderBy = args.sort === 'amount' ? [{ amountMinor: 'desc' }, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];
      const [payments, total, byStatus] = await Promise.all([
        context.prisma.bookingPayment.findMany({
          where, orderBy, take, skip,
          include: { booking: { include: reservationInclude }, paymentProvider: true },
        }),
        context.prisma.bookingPayment.count({ where }),
        // Totals cover every payment record, not just the page on screen.
        context.prisma.bookingPayment.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountMinor: true } }),
      ]);
      const statusTotal = (value: string) => byStatus.find((row: any) => row.status === value);
      const capturedAmountMinor = Math.max(0, Number(statusTotal('completed')?._sum?.amountMinor || 0));
      const refundedAmountMinor = Math.abs(Number(statusTotal('refunded')?._sum?.amountMinor || 0));
      return {
        total,
        payments: payments.map((payment: any) => ({
          ...payment,
          amount: payment.amountMinor / 100,
          booking: mapReservation(payment.booking),
          paymentProvider: {
            id: payment.paymentProvider.id,
            name: payment.paymentProvider.name,
            code: payment.paymentProvider.code,
            isInstalled: payment.paymentProvider.isInstalled,
          },
        })),
        summary: {
          capturedAmountMinor,
          refundedAmountMinor,
          capturedAmount: capturedAmountMinor / 100,
          refundedAmount: refundedAmountMinor / 100,
          completedCount: Number(statusTotal('completed')?._count?._all || 0),
          refundedCount: Number(statusTotal('refunded')?._count?._all || 0),
          failedCount: Number(statusTotal('failed')?._count?._all || 0),
          pendingCount: Number(statusTotal('pending')?._count?._all || 0),
        },
      };
    },

    hotelRefundQuote: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      const payment = await context.prisma.bookingPayment.findUnique({ where: { id: args.paymentId } });
      if (!payment || payment.status !== 'completed' || payment.paymentType === 'refund') {
        throw new Error('Only a completed capture has a refundable balance.');
      }
      return {
        paymentId: payment.id,
        refundableMinor: await refundablePaymentMinor(context.prisma, payment),
        currencyCode: String(payment.currency || 'USD').toUpperCase(),
      };
    },

    hotelAnalyticsOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageBookings', args.propertyKey);
      const { start, end } = boundedDateRange(args.start, args.end, 370);
      if (end <= start) throw new Error('Reporting end must be after start.');
      if ([start, end].some(date => date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds() || date.getUTCMilliseconds())) {
        throw new Error('Reporting ranges must use exclusive UTC midnight day boundaries.');
      }
      return context.transaction((tx: any) => getHotelOperationalReport(tx.prisma, start, end), { isolationLevel: 'RepeatableRead' });
    },

    hotelGuestOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageGuests', args.propertyKey);
      const search = String(args.search || '').trim().slice(0, 160);
      const take = Math.min(Math.max(Math.trunc(Number(args.take) || GUEST_PAGE_SIZE), 1), 100);
      const skip = Math.min(Math.max(Math.trunc(Number(args.skip) || 0), 0), 100_000);
      // Phone numbers are stored as typed; compare digits only so "+1 (555) 010" finds "15550100".
      const digits = search.replace(/\D/g, '');
      const phoneMatches: Array<{ id: string }> = search && digits.length >= 3
        ? await context.prisma.$queryRaw`SELECT "id" FROM "Guest" WHERE regexp_replace("phone", '\\D', '', 'g') LIKE ${`%${digits}%`} LIMIT 1000`
        : [];
      const searchWhere = search ? { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        ...(phoneMatches.length ? [{ id: { in: phoneMatches.map((row) => row.id) } }] : []),
      ] } : {};
      const segmentWhere: Record<string, object> = {
        vip: { isVip: true, isBlacklisted: false },
        standard: { isVip: false, isBlacklisted: false },
        restricted: { isBlacklisted: true },
      };
      const segment = segmentWhere[String(args.segment)] ? String(args.segment) : 'all';
      const where = { AND: [searchWhere, segment === 'all' ? {} : segmentWhere[segment]] };
      const orderBy = args.sort === 'name'
        ? [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }]
        : args.sort === 'reservations'
          ? [{ bookings: { _count: 'desc' } }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }];
      const [total, all, vip, standard, restricted] = await Promise.all([
        context.prisma.guest.count({ where }),
        context.prisma.guest.count({ where: searchWhere }),
        context.prisma.guest.count({ where: { AND: [searchWhere, segmentWhere.vip] } }),
        context.prisma.guest.count({ where: { AND: [searchWhere, segmentWhere.standard] } }),
        context.prisma.guest.count({ where: { AND: [searchWhere, segmentWhere.restricted] } }),
      ]);
      const guests = await context.prisma.guest.findMany({
        where,
        orderBy,
        take,
        skip,
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          loyaltyNumber: true, loyaltyTier: true,
          isVip: true, isBlacklisted: true, loyaltyPoints: true, createdAt: true, updatedAt: true,
        },
      });
      const stayFacts = guests.length ? await context.prisma.booking.groupBy({
        by: ['guestProfileId'],
        where: { guestProfileId: { in: guests.map((guest: any) => guest.id) }, status: 'checked_out' },
        _count: { _all: true },
        _sum: { totalAmountMinor: true },
        _max: { checkOutDate: true },
      }) : [];
      const factsByGuest = new Map(stayFacts.map((fact: any) => [fact.guestProfileId, fact]));
      return {
        guests: guests.map((guest: any) => {
          const facts: any = factsByGuest.get(guest.id);
          return {
            ...guest,
            totalStays: String(facts?._count?._all || 0),
            totalSpent: (Number(facts?._sum?.totalAmountMinor || 0) / 100).toFixed(2),
            lastStayAt: facts?._max?.checkOutDate || null,
          };
        }),
        total,
        segmentCounts: { all, vip, standard, restricted },
      };
    },

    hotelPaymentProviderOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      await ensureDefaultPaymentProviders(context);
      const providers = await context.prisma.paymentProvider.findMany({
        orderBy: { name: 'asc' },
        take: 20,
        select: { id: true, name: true, code: true, isInstalled: true, credentials: true, metadata: true },
      });
      return { providers: providers.map((provider: any) => ({
        id: provider.id,
        name: provider.name,
        code: provider.code,
        isInstalled: paymentProviderEnabled(provider),
        configured: paymentIntegrationConfigured(provider),
        credentialSource: paymentProviderUsesEnvironment(provider) ? 'environment' : 'saved',
      })) };
    },

    hotelNightAuditOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      const [clock, runs] = await Promise.all([
        context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
        context.prisma.nightAuditRun.findMany({
          orderBy: { businessDate: 'desc' },
          take: 30,
        }),
      ]);
      if (!clock) throw new Error('Property business date is not configured.');
      return { currentBusinessDate: clock.currentBusinessDate, runs };
    },

    hotelOutboxOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageAudit', args.propertyKey);
      const search = String(args.search || '').trim().slice(0, 160);
      const page = (value: unknown) => Math.min(Math.max(Math.trunc(Number(value) || 0), 0), 100_000);
      // Messages record success as 'delivered' and refunds as 'succeeded'; the screen shows both as 'completed'.
      const status = ['pending', 'processing', 'failed', 'dead_letter', 'completed'].includes(String(args.status)) ? String(args.status) : null;
      const eventWhere = { AND: [
        status ? { status: status === 'completed' ? 'delivered' : status } : {},
        search ? { OR: [
          { topic: { contains: search, mode: 'insensitive' } }, { eventKey: { contains: search, mode: 'insensitive' } },
          { aggregateType: { contains: search, mode: 'insensitive' } }, { aggregateId: { contains: search, mode: 'insensitive' } },
          { lastError: { contains: search, mode: 'insensitive' } },
        ] } : {},
      ] };
      const refundWhere = { AND: [
        status ? { status: status === 'completed' ? 'succeeded' : status } : {},
        search ? { OR: [
          { reason: { contains: search, mode: 'insensitive' } }, { lastError: { contains: search, mode: 'insensitive' } },
          { booking: { confirmationNumber: { contains: search, mode: 'insensitive' } } },
        ] } : {},
      ] };
      const [events, refundIntents, eventsTotal, refundIntentsTotal, eventStatuses, refundStatuses] = await Promise.all([
        context.prisma.hotelOutboxEvent.findMany({
          where: eventWhere, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: page(args.eventSkip), take: OUTBOX_PAGE_SIZE,
          include: { attemptsEvidence: { orderBy: { attemptNumber: 'asc' }, take: 20 } },
        }),
        context.prisma.refundIntent.findMany({
          where: refundWhere, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: page(args.refundSkip), take: OUTBOX_PAGE_SIZE,
          include: { booking: { include: reservationInclude } },
        }),
        context.prisma.hotelOutboxEvent.count({ where: eventWhere }),
        context.prisma.refundIntent.count({ where: refundWhere }),
        context.prisma.hotelOutboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
        context.prisma.refundIntent.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      const statusCounts: Record<string, number> = {};
      for (const row of [...eventStatuses, ...refundStatuses]) {
        const key = row.status === 'delivered' || row.status === 'succeeded' ? 'completed' : row.status;
        statusCounts[key] = (statusCounts[key] || 0) + Number(row._count?._all || 0);
      }
      return {
        events,
        refundIntents: refundIntents.map((item: any) => ({ ...item, booking: mapReservation(item.booking) })),
        eventsTotal,
        refundIntentsTotal,
        statusCounts,
      };
    },

    hotelGroupOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageBookings', args.propertyKey);
      const groups = await context.prisma.groupBlock.findMany({
        orderBy: [{ arrivalDate: 'asc' }, { id: 'asc' }],
        take: 100,
        include: { allocations: { include: { roomType: true } } },
      });
      return { groups };
    },
  },
};
