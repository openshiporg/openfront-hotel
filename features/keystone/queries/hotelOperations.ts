import { refundablePaymentMinor } from '../lib/bookingRefund';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { paymentIntegrationConfigured } from '../lib/integrationConfig';

const HOTEL_PROPERTY_KEY = 'the-alder-house';

function requireHotelPermission(context: any, permission: string, propertyKey: string) {
  if (propertyKey !== HOTEL_PROPERTY_KEY) {
    throw new Error('Property access denied.');
  }
  if (!context.session?.data?.role?.[permission]) {
    throw new Error('Not authorized for this hotel workspace.');
  }
}

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
    latestMessage: typeof error.message === 'string' ? error.message : null,
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
  type HotelRoomOperations { rooms: [HotelRoomOperationsItem!]! }

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
    roomTypes: [HotelRoomTypeCapacity!]!
    inventories: [HotelInventoryProjection!]!
    ratePlans: [HotelRatePlanProjection!]!
  }

  type HotelHousekeepingTaskProjection {
    id: ID!
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
  type HotelMaintenanceOperations { requests: [HotelMaintenanceProjection!]! }

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
  }

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

  type HotelPaymentProviderProjection { id: ID!, name: String!, code: String!, isInstalled: Boolean!, configured: Boolean! }
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
  }
  type HotelPaymentOperations { payments: [HotelPaymentProjection!]!, summary: HotelPaymentSummary! }
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
  type HotelGuestOperations { guests: [HotelGuestProjection!]! }
  type HotelPaymentProviderOperations { providers: [HotelPaymentProviderProjection!]! }
  type HotelOperatorCapabilities {
    canAccessDashboard: Boolean!
    canManageRooms: Boolean!
    canManageBookings: Boolean!
    canManageHousekeeping: Boolean!
    canManageGuests: Boolean!
    canManagePayments: Boolean!
    canManageOnboarding: Boolean!
    canManageAudit: Boolean!
    canManageIntegrations: Boolean!
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
  type HotelOutboxOperations { events: [HotelOutboxEventProjection!]!, refundIntents: [HotelRefundIntentProjection!]! }

  extend type Query {
    hotelOperatorCapabilities: HotelOperatorCapabilities!
    hotelFrontDesk(propertyKey: String!, start: DateTime!, end: DateTime!): HotelReservationBoard!
    hotelReservationCalendar(propertyKey: String!, start: DateTime!, end: DateTime!): HotelReservationBoard!
    hotelRoomOperations(propertyKey: String!): HotelRoomOperations!
    hotelRateOperations(propertyKey: String!, start: DateTime!, end: DateTime!): HotelRateOperations!
    hotelHousekeepingOperations(propertyKey: String!): HotelHousekeepingOperations!
    hotelMaintenanceOperations(propertyKey: String!): HotelMaintenanceOperations!
    hotelFolioOperations(propertyKey: String!): HotelFolioOperations!
    hotelChannelOperations(propertyKey: String!): HotelChannelOperations!
    hotelPaymentOperations(propertyKey: String!): HotelPaymentOperations!
    hotelRefundQuote(propertyKey: String!, paymentId: ID!): HotelRefundQuote!
    hotelAnalyticsOperations(propertyKey: String!, start: DateTime!, end: DateTime!): HotelAnalyticsOperations!
    hotelGuestOperations(propertyKey: String!, search: String): HotelGuestOperations!
    hotelPaymentProviderOperations(propertyKey: String!): HotelPaymentProviderOperations!
    hotelNightAuditOperations(propertyKey: String!): HotelNightAuditOperations!
    hotelGroupOperations(propertyKey: String!): HotelGroupOperations!
    hotelOutboxOperations(propertyKey: String!): HotelOutboxOperations!
  }
`;

function mapRoom(room: any) {
  if (!room) return null;
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor || null,
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
  const { start, end } = boundedDateRange(args.start, args.end, maxDays);
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
        canManageOnboarding: Boolean(role.canManageOnboarding),
        canManageAudit: Boolean(role.canManageAudit),
        canManageIntegrations: Boolean(role.canManageIntegrations),
      };
    },
    hotelFrontDesk: (_root: unknown, args: any, context: any) =>
      reservationBoard(context, args, 'canManageBookings', 31, true, true),
    hotelReservationCalendar: (_root: unknown, args: any, context: any) =>
      reservationBoard(context, args, 'canManageBookings', 120, false),

    hotelRoomOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageRooms', args.propertyKey);
      const rooms = await context.prisma.room.findMany({
        orderBy: [{ roomNumber: 'asc' }],
        take: 250,
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
      };
    },

    hotelRateOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageRooms', args.propertyKey);
      const { start, end } = boundedDateRange(args.start, args.end, 120);
      const [roomTypes, inventories, ratePlans] = await Promise.all([
        context.prisma.roomType.findMany({ orderBy: { name: 'asc' }, include: { rooms: true } }),
        context.prisma.roomInventory.findMany({
          where: { date: { gte: start, lte: end } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          take: 500,
          include: { roomType: true },
        }),
        context.prisma.ratePlan.findMany({
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { baseRateMinor: 'asc' }],
          take: 100,
          include: { roomType: true },
        }),
      ]);
      return {
        roomTypes: roomTypes.map((type: any) => ({
          id: type.id,
          name: type.name,
          totalRooms: type.rooms.length,
          sellableRooms: type.rooms.filter((room: any) => !['maintenance', 'out_of_order'].includes(room.status)).length,
        })),
        inventories: inventories.map((item: any) => ({
          ...item,
          availableRooms: Math.max(0, item.totalRooms - item.bookedRooms - item.blockedRooms),
          isAvailable: item.totalRooms - item.bookedRooms - item.blockedRooms > 0,
        })),
        ratePlans,
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
        context.prisma.user.findMany({
          where: { role: { name: 'Housekeeping' } },
          orderBy: { name: 'asc' },
          take: 100,
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
      const requests = await context.prisma.maintenanceRequest.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
        include: { room: { include: { roomType: true } }, assignedTo: true },
      });
      return { requests: requests.map((item: any) => ({ ...item, room: mapRoom(item.room) })) };
    },

    hotelFolioOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      const [folios, clock] = await Promise.all([context.prisma.folio.findMany({
        orderBy: [{ openedAt: 'desc' }],
        take: 50,
        include: {
          booking: { include: reservationInclude },
          entries: {
            orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
            include: { reversedBy: { select: { id: true } } },
          },
        },
      }), context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } })]);
      const overdueExceptions = clock ? await context.prisma.booking.findMany({
        where: { status: 'checked_in', checkOutDate: { lte: clock.currentBusinessDate } },
        orderBy: [{ checkOutDate: 'asc' }, { id: 'asc' }], take: 100, include: reservationInclude,
      }) : [];
      return {
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
        events: events.map((item: any) => ({ ...item, channel: mapChannel(item.channel) })),
      };
    },

    hotelPaymentOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      const payments = await context.prisma.bookingPayment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { booking: { include: reservationInclude }, paymentProvider: true },
      });
      const completed = payments.filter((payment: any) => payment.status === 'completed');
      const refunded = payments.filter((payment: any) => payment.status === 'refunded');
      return {
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
          capturedAmountMinor: completed.reduce((sum: number, payment: any) => sum + Math.max(0, Number(payment.amountMinor || 0)), 0),
          refundedAmountMinor: refunded.reduce((sum: number, payment: any) => sum + Math.abs(Number(payment.amountMinor || 0)), 0),
          capturedAmount: completed.reduce((sum: number, payment: any) => sum + Math.max(0, Number(payment.amountMinor || 0)), 0) / 100,
          refundedAmount: refunded.reduce((sum: number, payment: any) => sum + Math.abs(Number(payment.amountMinor || 0)), 0) / 100,
          completedCount: completed.length,
          refundedCount: refunded.length,
          failedCount: payments.filter((payment: any) => payment.status === 'failed').length,
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
      const [settings, clock, roomTypes, inventories, bookings, payments, openFolios, policyFees] = await Promise.all([
        context.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
        context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { currentBusinessDate: true } }),
        context.prisma.roomType.findMany({ orderBy: { name: 'asc' }, include: { rooms: true } }),
        context.prisma.roomInventory.findMany({
          where: { date: { gte: start, lt: end } },
          orderBy: [{ date: 'asc' }, { roomTypeId: 'asc' }],
          take: 20_001,
        }),
        context.prisma.booking.findMany({
          where: {
            OR: [
              { checkOutDate: { gt: start }, checkInDate: { lt: end } },
              { createdAt: { gte: start, lt: end } },
              { cancelledAt: { gte: start, lt: end } },
            ],
          },
          orderBy: [{ checkInDate: 'asc' }, { id: 'asc' }],
          take: 5_001,
          include: {
            roomAssignments: { take: 1, include: { roomType: true } },
            lineItems: {
              where: { snapshotStatus: 'active', date: { gte: start, lt: end } },
              orderBy: [{ date: 'asc' }, { id: 'asc' }],
            },
          },
        }),
        context.prisma.bookingPayment.findMany({
          where: {
            status: { in: ['completed', 'refunded'] },
            OR: [
              { processedAt: { gte: start, lt: end } },
              { refundedAt: { gte: start, lt: end } },
              { createdAt: { gte: start, lt: end } },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 5_001,
        }),
        context.prisma.folio.findMany({
          where: { status: 'open' },
          orderBy: { openedAt: 'asc' },
          take: 2_001,
          include: { entries: { select: { direction: true, amountMinor: true } } },
        }),
        context.prisma.folioEntry.findMany({
          where: {
            direction: 'debit',
            postedAt: { gte: start, lt: end },
            postingKey: { startsWith: 'booking:cancel:', endsWith: ':fee' },
          },
          orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
          take: 5_001,
          select: { amountMinor: true, serviceDate: true, postedAt: true },
        }),
      ]);
      if (!settings) throw new Error('Hotel settings are not configured.');
      if (!clock) throw new Error('Property business date is not configured.');
      if (inventories.length > 20_000 || bookings.length > 5_000 || payments.length > 5_000 || openFolios.length > 2_000 || policyFees.length > 5_000) {
        throw new Error('Reporting range exceeds the bounded launch dataset; request a shorter period.');
      }

      const dayKey = (value: Date | string) => {
        const date = new Date(value);
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
      };
      const dayDates: Date[] = [];
      for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        dayDates.push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())));
      }
      const operationalRoomCount = (type: any) => type.rooms.filter((room: any) => !['maintenance', 'out_of_order'].includes(room.status)).length;
      const totalPhysicalRooms = roomTypes.reduce((sum: number, type: any) => sum + operationalRoomCount(type), 0);
      const inventoryByDay = new Map<string, any[]>();
      for (const inventory of inventories) {
        const key = dayKey(inventory.date);
        inventoryByDay.set(key, [...(inventoryByDay.get(key) || []), inventory]);
      }
      const activeStatuses = new Set(['confirmed', 'checked_in', 'checked_out']);
      const activeBookings = bookings.filter((booking: any) => activeStatuses.has(booking.status));
      const policyFeeByDay = new Map<string, number>();
      for (const fee of policyFees) {
        const key = dayKey(fee.serviceDate || fee.postedAt);
        policyFeeByDay.set(key, (policyFeeByDay.get(key) || 0) + Number(fee.amountMinor || 0));
      }
      const paymentByDay = new Map<string, { paymentsMinor: number; refundsMinor: number }>();
      for (const payment of payments) {
        const timestamp = payment.paymentType === 'refund'
          ? payment.refundedAt || payment.processedAt || payment.createdAt
          : payment.processedAt || payment.createdAt;
        const key = dayKey(timestamp);
        const current = paymentByDay.get(key) || { paymentsMinor: 0, refundsMinor: 0 };
        if (payment.paymentType === 'refund' || Number(payment.amountMinor || 0) < 0) current.refundsMinor += Math.abs(Number(payment.amountMinor || 0));
        else current.paymentsMinor += Math.max(0, Number(payment.amountMinor || 0));
        paymentByDay.set(key, current);
      }

      const days = dayDates.map(date => {
        const key = dayKey(date);
        const next = new Date(date); next.setUTCDate(next.getUTCDate() + 1);
        const inventoryRows = inventoryByDay.get(key) || [];
        const blocked = inventoryRows.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.blockedRooms || 0)), 0);
        const availableRoomNights = Math.max(0, totalPhysicalRooms - blocked);
        const occupiedBookings = activeBookings.filter((booking: any) => booking.checkInDate < next && booking.checkOutDate > date);
        const lines = occupiedBookings.flatMap((booking: any) => booking.lineItems.filter((line: any) => dayKey(line.date) === key));
        const roomRevenueMinor = lines.filter((line: any) => line.type === 'room').reduce((sum: number, line: any) => sum + Number(line.totalPrice || 0), 0);
        const taxMinor = lines.filter((line: any) => line.type === 'tax').reduce((sum: number, line: any) => sum + Number(line.totalPrice || 0), 0);
        const feeMinor = lines.filter((line: any) => !['room', 'tax'].includes(line.type)).reduce((sum: number, line: any) => sum + Number(line.totalPrice || 0), 0) + (policyFeeByDay.get(key) || 0);
        const occupiedRoomNights = occupiedBookings.length;
        const paymentsForDay = paymentByDay.get(key) || { paymentsMinor: 0, refundsMinor: 0 };
        return {
          date,
          availableRoomNights,
          occupiedRoomNights,
          occupancyRate: availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0,
          roomRevenueMinor,
          taxMinor,
          feeMinor,
          totalRevenueMinor: roomRevenueMinor + taxMinor + feeMinor,
          adrMinor: occupiedRoomNights ? Math.round(roomRevenueMinor / occupiedRoomNights) : 0,
          revparMinor: availableRoomNights ? Math.round(roomRevenueMinor / availableRoomNights) : 0,
          arrivals: activeBookings.filter((booking: any) => dayKey(booking.checkInDate) === key).length,
          departures: activeBookings.filter((booking: any) => dayKey(booking.checkOutDate) === key).length,
          newReservations: bookings.filter((booking: any) => dayKey(booking.createdAt) === key).length,
          cancellations: bookings.filter((booking: any) => booking.status !== 'no_show' && booking.cancelledAt && dayKey(booking.cancelledAt) === key).length,
          noShows: bookings.filter((booking: any) => booking.status === 'no_show' && dayKey(booking.checkInDate) === key).length,
          ...paymentsForDay,
        };
      });
      const sum = (field: string) => days.reduce((total: number, day: any) => total + Number(day[field] || 0), 0);
      const availableRoomNights = sum('availableRoomNights');
      const occupiedRoomNights = sum('occupiedRoomNights');
      const roomRevenueMinor = sum('roomRevenueMinor');
      const openFolioBalanceMinor = openFolios.reduce((folioTotal: number, folio: any) => folioTotal + folio.entries.reduce(
        (entryTotal: number, entry: any) => entryTotal + (entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor),
        0,
      ), 0);

      const channelMap = new Map<string, { source: string; bookings: Set<string>; revenueMinor: number }>();
      const roomTypeMap = new Map<string, { id: string; name: string; availableRoomNights: number; occupiedRoomNights: number; roomRevenueMinor: number }>(roomTypes.map((type: any) => [type.id, {
        id: type.id,
        name: type.name,
        availableRoomNights: dayDates.reduce((total, date) => {
          const inventory = (inventoryByDay.get(dayKey(date)) || []).find((item: any) => item.roomTypeId === type.id);
          return total + Math.max(0, operationalRoomCount(type) - Number(inventory?.blockedRooms || 0));
        }, 0),
        occupiedRoomNights: 0,
        roomRevenueMinor: 0,
      }] as [string, { id: string; name: string; availableRoomNights: number; occupiedRoomNights: number; roomRevenueMinor: number }]));
      for (const booking of activeBookings) {
        const periodLines = booking.lineItems.filter((line: any) => new Date(line.date) >= start && new Date(line.date) < end);
        const revenueMinor = periodLines.reduce((total: number, line: any) => total + Number(line.totalPrice || 0), 0);
        if (periodLines.length) {
          const source = String(booking.source || 'direct');
          const channel = channelMap.get(source) || { source, bookings: new Set<string>(), revenueMinor: 0 };
          channel.bookings.add(booking.id); channel.revenueMinor += revenueMinor; channelMap.set(source, channel);
        }
        const roomTypeId = booking.roomAssignments[0]?.roomTypeId;
        const roomType = roomTypeId ? roomTypeMap.get(roomTypeId) : null;
        if (roomType) {
          roomType.occupiedRoomNights += periodLines.filter((line: any) => line.type === 'room').length;
          roomType.roomRevenueMinor += periodLines.filter((line: any) => line.type === 'room').reduce((total: number, line: any) => total + Number(line.totalPrice || 0), 0);
        }
      }

      return {
        summary: {
          start,
          end,
          businessDate: clock.currentBusinessDate,
          currencyCode: settings.currencyCode || 'USD',
          availableRoomNights,
          occupiedRoomNights,
          occupancyRate: availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0,
          roomRevenueMinor,
          taxMinor: sum('taxMinor'),
          feeMinor: sum('feeMinor'),
          totalRevenueMinor: sum('totalRevenueMinor'),
          adrMinor: occupiedRoomNights ? Math.round(roomRevenueMinor / occupiedRoomNights) : 0,
          revparMinor: availableRoomNights ? Math.round(roomRevenueMinor / availableRoomNights) : 0,
          arrivals: sum('arrivals'), departures: sum('departures'), newReservations: sum('newReservations'),
          cancellations: sum('cancellations'), noShows: sum('noShows'),
          paymentsMinor: sum('paymentsMinor'), refundsMinor: sum('refundsMinor'),
          openFolioBalanceMinor,
          openFolioCount: openFolios.length,
        },
        days,
        channels: [...channelMap.values()].map(item => ({ source: item.source, bookings: item.bookings.size, revenueMinor: item.revenueMinor })),
        roomTypes: [...roomTypeMap.values()].map((item: any) => ({
          ...item,
          occupancyRate: item.availableRoomNights ? item.occupiedRoomNights / item.availableRoomNights * 100 : 0,
          adrMinor: item.occupiedRoomNights ? Math.round(item.roomRevenueMinor / item.occupiedRoomNights) : 0,
        })),
      };
    },

    hotelGuestOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManageGuests', args.propertyKey);
      const search = String(args.search || '').trim();
      const guests = await context.prisma.guest.findMany({
        where: search
          ? { OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ] }
          : undefined,
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
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
      };
    },

    hotelPaymentProviderOperations: async (_root: unknown, args: any, context: any) => {
      requireHotelPermission(context, 'canManagePayments', args.propertyKey);
      await ensureDefaultPaymentProviders(context);
      const providers = await context.prisma.paymentProvider.findMany({
        orderBy: { name: 'asc' },
        take: 20,
        select: { id: true, name: true, code: true, isInstalled: true, credentials: true },
      });
      return { providers: providers.map((provider: any) => ({
        id: provider.id,
        name: provider.name,
        code: provider.code,
        isInstalled: provider.isInstalled,
        configured: paymentIntegrationConfigured(provider),
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
      const [events, refundIntents] = await Promise.all([
        context.prisma.hotelOutboxEvent.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100,
          include: { attemptsEvidence: { orderBy: { attemptNumber: 'asc' }, take: 20 } },
        }),
        context.prisma.refundIntent.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100,
          include: { booking: { include: reservationInclude } },
        }),
      ]);
      return { events, refundIntents: refundIntents.map((item: any) => ({ ...item, booking: mapReservation(item.booking) })) };
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
