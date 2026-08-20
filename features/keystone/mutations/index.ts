import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import cancelBooking from "./cancelBooking";
import pushInventoryToChannel from "./pushInventoryToChannel";
import pullReservationsFromChannel from "./pullReservationsFromChannel";
import initiateBookingPaymentSession from './initiateBookingPaymentSession';
import completeBookingPayment from './completeBookingPayment';
import createStorefrontBooking, { type StorefrontBookingInput } from './createStorefrontBooking';
import createStaffBooking, { type StaffBookingInput } from './createStaffBooking';
import amendStaffBooking from './amendStaffBooking';
import submitHotelContactMessage from './submitHotelContactMessage';
import requestBookingPaymentRefund from './requestBookingPaymentRefund';
import updateHotelPropertySettings from './updateHotelPropertySettings';
import updateBookingStatus from './updateBookingStatus';
import updateRoomOperationalStatus from './updateRoomOperationalStatus';
import reportRoomMaintenanceIssue from './reportRoomMaintenanceIssue';
import assignRoomToBooking from './assignRoomToBooking';
import updateBookingStayDates from './updateBookingStayDates';
import retryFailedChannelSyncs from './retryFailedChannelSyncs';
import updateMaintenanceRequestStatus from './updateMaintenanceRequestStatus';
import updateRoomInventoryControls from './updateRoomInventoryControls';
import requestBookingModification from './requestBookingModification';
import resolveBookingModificationRequest from './resolveBookingModificationRequest';
import bookingPaymentProviders from '../queries/bookingPaymentProviders';
import activeBookingPaymentSession from '../queries/activeBookingPaymentSession';
import guestBooking from '../queries/guestBooking';
import guestBookings from '../queries/guestBookings';
import verifyGuestBooking from '../queries/verifyGuestBooking';
import storefrontRoomType from '../queries/storefrontRoomType';
import storefrontRoomTypes from '../queries/storefrontRoomTypes';
import storefrontAvailability from '../queries/storefrontAvailability';
import publicHotelSettings from '../queries/publicHotelSettings';
import storefrontQuote from '../queries/storefrontQuote';
import guestCancellationQuote from '../queries/guestCancellationQuote';
import { ensureBookingHasGuestAccess } from '../lib/guestBookingAccess';
import ensureReservationSnapshots from './ensureReservationSnapshots';
import runHotelOnboarding from './runHotelOnboarding';
import postFolioEntry from './postFolioEntry';
import reverseFolioEntry from './reverseFolioEntry';
import recordBookingPayment from './recordBookingPayment';
import closeReconciledFolio from './closeReconciledFolio';
import updateHousekeepingTaskStatus from './updateHousekeepingTaskStatus';
import updateRatePlanPublication from './updateRatePlanPublication';
import { hotelOperationsResolvers, hotelOperationsTypeDefs } from '../queries/hotelOperations';
import runHotelNightAudit from './runHotelNightAudit';
import createHotelGroupBlock from './createHotelGroupBlock';
import replayHotelOutboxEvent from './replayHotelOutboxEvent';
import pickupHotelGroupBlock from './pickupHotelGroupBlock';
import updateHotelGroupBlockStatus from './updateHotelGroupBlockStatus';
import resolveOverdueCheckedInBooking from './resolveOverdueCheckedInBooking';
import replayRefundIntent from './replayRefundIntent';
import redeemHotelPasswordResetToken from './redeemHotelPasswordResetToken';
import configureHotelPaymentProvider from './configureHotelPaymentProvider';
import { paymentProviderCredentials } from '../lib/integrationConfig';

const graphql = String.raw;

function mapCheckoutPaymentProvider(provider: any) {
  if (!provider) return null;
  const metadata = provider.metadata && typeof provider.metadata === 'object' ? provider.metadata : {};
  const credentials = paymentProviderCredentials(provider);
  return {
    id: provider.id,
    name: provider.name,
    code: provider.code,
    displayName: typeof metadata.displayName === 'string' ? metadata.displayName : provider.name,
    publicClientKey: provider.code === 'pp_stripe_stripe'
      ? credentials.publishableKey || null
      : provider.code === 'pp_paypal_paypal' ? credentials.clientId || null : null,
  };
}

function mapCheckoutPaymentSession(session: any) {
  if (!session) return null;
  const data = session.data && typeof session.data === 'object' ? session.data : {};
  return {
    ...session,
    clientSecret: typeof data.clientSecret === 'string' ? data.clientSecret : null,
    paymentIntentId: typeof data.paymentIntentId === 'string' ? data.paymentIntentId : null,
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
    approveLink: typeof data.approveLink === 'string' ? data.approveLink : null,
    paymentProvider: mapCheckoutPaymentProvider(session.paymentProvider),
  };
}

function mapChannelSyncResult(result: any) {
  const details = result?.details && typeof result.details === 'object' ? result.details : {};
  return {
    channelId: result.channelId,
    status: result.status,
    syncedAt: result.syncedAt,
    message:
      typeof details.message === 'string'
        ? details.message
        : typeof details.error === 'string'
          ? details.error
          : null,
    processedCount: Number.isInteger(details.processed) ? details.processed : 0,
    failedCount: Number.isInteger(details.failed) ? details.failed : 0,
  };
}

function mapStorefrontRoomImage(image: any) {
  return {
    id: image.id,
    url: image.image?.url || null,
    imagePath: image.imagePath || null,
    altText: image.altText || null,
    caption: image.caption || null,
    order: image.order ?? 0,
    isPrimary: Boolean(image.isPrimary),
  };
}

function mapStorefrontRoomType(roomType: any) {
  if (!roomType) return null;
  return {
    ...roomType,
    amenities: roomType.amenities || [],
    roomsCount: roomType.roomsCount ?? null,
    availableCount: roomType.availableCount ?? null,
    roomImages: (roomType.roomImages || []).map(mapStorefrontRoomImage),
    ratePlans: roomType.ratePlans || [],
  };
}

function mapGuestBooking(booking: any) {
  if (!booking) return null;
  return {
    ...booking,
    checkInDate: booking.checkInDate ? new Date(booking.checkInDate) : null,
    checkOutDate: booking.checkOutDate ? new Date(booking.checkOutDate) : null,
    createdAt: booking.createdAt ? new Date(booking.createdAt) : null,
    confirmedAt: booking.confirmedAt ? new Date(booking.confirmedAt) : null,
    cancelledAt: booking.cancelledAt ? new Date(booking.cancelledAt) : null,
    roomAssignments: (booking.roomAssignments || []).map((assignment: any) => ({
      id: assignment.id,
      ratePerNight: assignment.ratePerNight ?? null,
      guestName: assignment.guestName || null,
      roomType: assignment.roomType ? mapStorefrontRoomType(assignment.roomType) : null,
      roomNumber: assignment.room?.roomNumber || null,
    })),
  };
}

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      ${hotelOperationsTypeDefs}

      type PublicHotelSettings {
        state: String!
        accentPreset: String!
        propertyName: String
        tagline: String
        contactEmail: String
        contactPhone: String
        addressLine1: String
        addressLine2: String
        frontDeskCopy: String
        checkInTime: String
        checkOutTime: String
        heroImagePath: String
        heroImageAltText: String
        heroImageCaption: String
        amenityImagePath: String
        amenityImageAltText: String
        amenityImageCaption: String
        locationImagePath: String
        locationImageAltText: String
        locationImageCaption: String
      }

      type BookingCheckoutPaymentProvider {
        id: ID!
        name: String!
        code: String!
        displayName: String
        publicClientKey: String
      }

      type BookingCheckoutPaymentSession {
        id: ID!
        amount: Int!
        isSelected: Boolean!
        isInitiated: Boolean!
        clientSecret: String
        paymentIntentId: String
        orderId: String
        approveLink: String
        paymentProvider: BookingCheckoutPaymentProvider
      }

      type BookingCheckoutPaymentResult {
        id: ID!
        status: String!
        amount: Float
        providerPaymentId: String
        stripePaymentIntentId: String
        paymentProvider: BookingCheckoutPaymentProvider
      }

      type ActiveBookingPaymentSession {
        id: ID!
        isSelected: Boolean!
        isInitiated: Boolean!
        paymentProvider: BookingCheckoutPaymentProvider
      }

      type StorefrontQuote {
        roomTypeId: ID!
        roomTypeName: String!
        ratePlanId: ID!
        ratePlanName: String!
        cancellationPolicy: String
        mealPlan: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        nights: Int!
        numberOfGuests: Int!
        ratePerNight: Float!
        roomSubtotal: Float!
        taxAmount: Float!
        feesAmount: Float!
        totalAmount: Float!
        roomSubtotalMinor: Int!
        taxAmountMinor: Int!
        feesAmountMinor: Int!
        totalAmountMinor: Int!
        currencyCode: String!
        pricingVersion: String!
        quoteToken: String!
      }

      type StorefrontRoomImage {
        id: ID!
        url: String
        imagePath: String
        altText: String
        caption: String
        order: Int
        isPrimary: Boolean!
      }

      type StorefrontRatePlan {
        id: ID!
        name: String!
        description: String
        baseRate: Float!
        baseRateMinor: Int!
        currencyCode: String!
        minimumStay: Int
        cancellationPolicy: String
        mealPlan: String
        isPromotional: Boolean!
      }

      type StorefrontRoomType {
        id: ID!
        name: String!
        shortDescription: String
        eyebrow: String
        viewDescription: String
        thumbnail: String
        baseRate: Float!
        baseRateMinor: Int!
        maxOccupancy: Int!
        bedConfiguration: String
        amenities: [String!]!
        squareFeet: Int
        roomsCount: Int
        availableCount: Int
        roomImages: [StorefrontRoomImage!]!
        ratePlans: [StorefrontRatePlan!]!
      }

      type GuestRoomAssignment {
        id: ID!
        ratePerNight: Float
        guestName: String
        roomType: StorefrontRoomType
        roomNumber: String
      }

      type GuestBookingActionResult {
        id: ID!
        status: String
        paymentStatus: String
        balanceDueMinor: Int!
        cancelledAt: DateTime
      }

      type HotelPasswordResetResult {
        code: String
        message: String!
      }

      type BookingModificationResolutionResult {
        requestId: ID!
        bookingId: ID!
        status: String!
        decision: String!
        checkInDate: DateTime
        checkOutDate: DateTime
        pricingRevision: Int
        replayed: Boolean!
      }

      type HotelContactMessageResult {
        reference: String!
        status: String!
        replayed: Boolean!
      }

      type BookingPaymentRefundRequestResult {
        status: String!
        paymentId: ID!
        intentId: ID
        amountMinor: Int!
      }

      type GuestCancellationQuote {
        canCancel: Boolean!
        policy: String!
        summary: String!
        refundableMinor: Int!
        cancellationFeeMinor: Int!
        capturedMinor: Int!
        currencyCode: String!
        fullRefundDeadline: DateTime
      }

      type GuestBooking {
        id: ID!
        confirmationNumber: String!
        guestName: String!
        guestEmail: String!
        guestPhone: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        numberOfNights: Int!
        numberOfGuests: Int!
        numberOfAdults: Int
        numberOfChildren: Int
        roomRate: Float
        taxAmount: Float
        feesAmount: Float
        totalAmount: Float
        depositAmount: Float
        balanceDue: Float
        roomRateMinor: Int
        taxAmountMinor: Int
        feesAmountMinor: Int
        totalAmountMinor: Int
        depositAmountMinor: Int
        balanceDueMinor: Int
        currencyCode: String
        status: String
        paymentStatus: String
        specialRequests: String
        createdAt: DateTime
        confirmedAt: DateTime
        cancelledAt: DateTime
        confirmationDeliveryStatus: String
        updateDeliveryStatus: String
        cancellationDeliveryStatus: String
        roomAssignments: [GuestRoomAssignment!]!
      }

      type Query {
        redirectToInit: Boolean
        publicHotelSettings: PublicHotelSettings!
        bookingPaymentProviders: [BookingCheckoutPaymentProvider!]!
        activeBookingPaymentSession(bookingId: ID!): ActiveBookingPaymentSession
        storefrontRoomTypes: [StorefrontRoomType!]!
        storefrontRoomType(id: ID!): StorefrontRoomType
        storefrontAvailability(checkInDate: DateTime!, checkOutDate: DateTime!): [StorefrontRoomType!]!
        storefrontQuote(
          roomTypeId: ID!
          ratePlanId: ID!
          checkInDate: DateTime!
          checkOutDate: DateTime!
          numberOfAdults: Int!
          numberOfChildren: Int
          promoCode: String
        ): StorefrontQuote!
        guestBooking(bookingId: ID!): GuestBooking
        guestBookings(email: String!): [GuestBooking!]!
        guestCancellationQuote(bookingId: ID!): GuestCancellationQuote!
      }

      input ChannelSyncDateRangeInput {
        startDate: DateTime
        endDate: DateTime
      }

      type ChannelSyncResult {
        channelId: ID!
        status: String!
        syncedAt: DateTime!
        message: String
        processedCount: Int!
        failedCount: Int!
      }

      type ReservationSnapshotResult {
        bookingId: ID!
        created: Int!
        existing: Int!
        total: Int!
      }

      type ChannelRetryResult {
        processed: Int!
        succeeded: Int!
        failed: Int!
        retriedAt: DateTime!
      }

      type HotelOutboxReplayResult {
        id: ID!
        eventKey: String!
        status: String!
        replayed: Boolean!
      }

      type OverdueStayResolutionResult {
        bookingId: ID!
        folioId: ID!
        status: String!
        folioStatus: String!
        writtenOffMinor: Int!
        replayed: Boolean!
      }

      type HotelOnboardingResult {
        success: Boolean!
        message: String!
        createdCount: Int!
        updatedCount: Int!
        skippedCount: Int!
      }

      type FolioPostingResult {
        folioId: ID!
        entryId: ID!
        postingKey: String!
        replayed: Boolean!
        debitMinor: Int!
        creditMinor: Int!
        balanceMinor: Int!
      }

      type FolioClosureResult {
        folioId: ID!
        status: String!
        balanceMinor: Int!
        replayed: Boolean!
      }

      input StorefrontBookingCreateInput {
        guestName: String!
        guestEmail: String!
        guestPhone: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        numberOfAdults: Int!
        numberOfChildren: Int
        roomTypeId: ID!
        ratePlanId: ID!
        promoCode: String
        quoteToken: String!
        specialRequests: String
      }

      input HotelPropertySettingsInput {
        propertyName: String!
        tagline: String
        contactEmail: String!
        contactPhone: String!
        addressLine1: String!
        addressLine2: String
        frontDeskCopy: String
        checkInTime: String!
        checkOutTime: String!
        currencyCode: String!
        taxRateBasisPoints: Int!
        serviceFeeMinor: Int!
        storefrontAccentPreset: String!
        heroImagePath: String
        heroImageAltText: String
        heroImageCaption: String
        amenityImagePath: String
        amenityImageAltText: String
        amenityImageCaption: String
        locationImagePath: String
        locationImageAltText: String
        locationImageCaption: String
      }

      input HotelPaymentProviderCredentialsInput {
        secretKey: String
        publishableKey: String
        webhookSecret: String
        clientId: String
        clientSecret: String
        webhookId: String
        sandbox: Boolean
      }

      type HotelPaymentProviderConfigurationResult {
        id: ID!
        name: String!
        code: String!
        isInstalled: Boolean!
        configured: Boolean!
      }

      input StaffBookingCreateInput {
        guestName: String!
        guestEmail: String!
        guestPhone: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        numberOfAdults: Int!
        numberOfChildren: Int
        roomTypeId: ID!
        ratePlanId: ID!
        promoCode: String
        specialRequests: String
        internalNotes: String
        source: String
        status: String
        idempotencyKey: String!
      }

      type Mutation {
        configureHotelPaymentProvider(code: String!, enabled: Boolean!, credentials: HotelPaymentProviderCredentialsInput): HotelPaymentProviderConfigurationResult!
        redeemHotelPasswordResetToken(email: String!, token: String!, password: String!): HotelPasswordResetResult!
        updateHotelPropertySettings(data: HotelPropertySettingsInput!, idempotencyKey: String!): HotelSettings!
        runHotelOnboarding(template: String!, data: JSON): HotelOnboardingResult!
        runHotelNightAudit(
          propertyKey: String!
          businessDate: DateTime!
          idempotencyKey: String!
        ): HotelNightAuditRunProjection!
        replayHotelOutboxEvent(eventId: ID!, idempotencyKey: String!): HotelOutboxReplayResult!
        replayRefundIntent(intentId: ID!, idempotencyKey: String!): RefundIntent!
        resolveOverdueCheckedInBooking(
          bookingId: ID!
          idempotencyKey: String!
          reason: String!
        ): OverdueStayResolutionResult!
        pickupHotelGroupBlock(
          groupBlockId: ID!
          allocationId: ID!
          bookingId: ID!
          idempotencyKey: String!
        ): Booking
        updateHotelGroupBlockStatus(
          groupBlockId: ID!
          status: String!
          idempotencyKey: String!
        ): HotelGroupBlockProjection!
        createHotelGroupBlock(
          name: String!
          arrivalDate: DateTime!
          departureDate: DateTime!
          releaseDate: DateTime
          contactName: String!
          contactEmail: String!
          billingType: String!
          roomTypeId: ID!
          roomsHeld: Int!
          rateMinor: Int!
          currencyCode: String!
          idempotencyKey: String!
        ): HotelGroupBlockProjection!
        verifyGuestBooking(confirmationNumber: String!, email: String!): GuestBooking
        ensureGuestBookingAccess(bookingId: ID!): Boolean!
        ensureReservationSnapshots(bookingId: ID!): ReservationSnapshotResult!
        postFolioEntry(
          bookingId: ID!
          postingKey: String!
          entryType: String!
          direction: String!
          amountMinor: Int!
          currencyCode: String!
          description: String!
          serviceDate: DateTime
        ): FolioPostingResult!
        reverseFolioEntry(
          entryId: ID!
          postingKey: String!
          reason: String!
        ): FolioPostingResult!
        recordBookingPayment(
          bookingId: ID!
          postingKey: String!
          amountMinor: Int!
          currencyCode: String!
          paymentMethod: String!
          description: String!
        ): FolioPostingResult!
        closeReconciledFolio(
          bookingId: ID!
          idempotencyKey: String!
        ): FolioClosureResult!
        cancelBooking(bookingId: ID!, refundReason: String, idempotencyKey: String!): GuestBookingActionResult
        pushInventoryToChannel(channelId: ID!, dateRange: ChannelSyncDateRangeInput): ChannelSyncResult
        pullReservationsFromChannel(channelId: ID!): ChannelSyncResult
        retryFailedChannelSyncs: ChannelRetryResult!
        submitHotelContactMessage(
          name: String!
          email: String!
          phone: String
          subject: String!
          message: String!
          idempotencyKey: String!
        ): HotelContactMessageResult!
        createStorefrontBooking(data: StorefrontBookingCreateInput!): GuestBooking
        createStaffBooking(data: StaffBookingCreateInput!): Booking!
        amendStaffBooking(
          bookingId: ID!
          checkInDate: DateTime!
          checkOutDate: DateTime!
          roomTypeId: ID
          ratePlanId: ID
          promoCode: String
          idempotencyKey: String!
        ): Booking!
        requestBookingPaymentRefund(
          paymentId: ID!
          amountMinor: Int!
          reason: String!
          idempotencyKey: String!
        ): BookingPaymentRefundRequestResult!
        updateBookingStatus(bookingId: ID!, status: String!, idempotencyKey: String!): Booking
        updateRoomOperationalStatus(
          roomId: ID!
          status: String!
          notes: String
          idempotencyKey: String!
        ): Room
        updateHousekeepingTaskStatus(
          taskId: ID!
          status: String!
          assignedToId: ID
          notes: String
          idempotencyKey: String!
        ): HousekeepingTask
        updateRatePlanPublication(
          ratePlanId: ID!
          status: String
          isPublic: Boolean
          idempotencyKey: String!
        ): RatePlan
        reportRoomMaintenanceIssue(
          roomId: ID!
          title: String!
          description: String
          category: String
          priority: String
          idempotencyKey: String!
        ): MaintenanceRequest
        assignRoomToBooking(bookingId: ID!, roomId: ID!, idempotencyKey: String!): Booking
        updateBookingStayDates(
          bookingId: ID!
          checkInDate: DateTime!
          checkOutDate: DateTime!
          idempotencyKey: String!
        ): Booking
        updateMaintenanceRequestStatus(
          requestId: ID!
          status: String!
          notes: String
          idempotencyKey: String!
        ): MaintenanceRequest
        updateRoomInventoryControls(
          roomTypeId: ID!
          date: DateTime!
          totalRooms: Int
          bookedRooms: Int
          blockedRooms: Int
          idempotencyKey: String!
        ): RoomInventory
        requestBookingModification(
          bookingId: ID!
          guestEmail: String!
          requestedCheckInDate: DateTime
          requestedCheckOutDate: DateTime
          message: String
        ): GuestBookingActionResult
        resolveBookingModificationRequest(
          bookingId: ID!
          decision: String!
          checkInDate: DateTime
          checkOutDate: DateTime
          staffNote: String
          idempotencyKey: String!
        ): BookingModificationResolutionResult!
        initiateBookingPaymentSession(
          bookingId: ID!
          paymentProviderCode: String!
          returnUrl: String
          cancelUrl: String
        ): BookingCheckoutPaymentSession
        completeBookingPayment(
          bookingId: ID!
          paymentSessionId: ID!
          providerPaymentId: String
        ): BookingCheckoutPaymentResult
      }
    `,
    resolvers: {
      Query: {
        ...hotelOperationsResolvers.Query,
        redirectToInit,
        publicHotelSettings,
        bookingPaymentProviders: async (root: unknown, args: unknown, context: any) =>
          (await bookingPaymentProviders(root, args, context)).map(mapCheckoutPaymentProvider),
        activeBookingPaymentSession,
        storefrontRoomTypes: async (root: unknown, args: unknown, context: any) =>
          (await storefrontRoomTypes(root, args, context)).map(mapStorefrontRoomType),
        storefrontRoomType: async (root: unknown, args: { id: string }, context: any) =>
          mapStorefrontRoomType(await storefrontRoomType(root, args, context)),
        storefrontAvailability: async (
          root: unknown,
          args: { checkInDate: string; checkOutDate: string },
          context: any
        ) => (await storefrontAvailability(root, args, context)).map(mapStorefrontRoomType),
        storefrontQuote,
        guestBooking: async (root: unknown, args: { bookingId: string }, context: any) =>
          mapGuestBooking(await guestBooking(root, args, context)),
        guestBookings: async (root: unknown, args: { email: string }, context: any) =>
          (await guestBookings(root, args, context)).map(mapGuestBooking),
        guestCancellationQuote,
      },
      Mutation: {
        configureHotelPaymentProvider,
        redeemHotelPasswordResetToken,
        updateHotelPropertySettings,
        runHotelOnboarding,
        runHotelNightAudit,
        createHotelGroupBlock,
        pickupHotelGroupBlock,
        updateHotelGroupBlockStatus,
        replayHotelOutboxEvent,
        replayRefundIntent,
        resolveOverdueCheckedInBooking,
        verifyGuestBooking: async (
          root: unknown,
          args: { confirmationNumber: string; email: string },
          context: any
        ) => mapGuestBooking(await verifyGuestBooking(root, args, context)),
        ensureGuestBookingAccess: async (
          root: unknown,
          { bookingId }: { bookingId: string },
          context: any
        ) => {
          if (!context.session?.data?.role?.canManageBookings) {
            throw new Error('Not authorized to manage booking access.');
          }
          await ensureBookingHasGuestAccess(context, bookingId);
          return true;
        },
        ensureReservationSnapshots,
        postFolioEntry,
        reverseFolioEntry,
        recordBookingPayment,
        closeReconciledFolio,
        cancelBooking: async (root: unknown, args: any, context: any) => {
          const booking = await cancelBooking(root, args, context);
          return {
            id: booking.id,
            status: booking.status || null,
            paymentStatus: booking.paymentStatus || null,
            balanceDueMinor: Number(booking.balanceDueMinor || 0),
            cancelledAt: booking.cancelledAt || null,
          };
        },
        pushInventoryToChannel: async (root: unknown, args: any, context: any) =>
          mapChannelSyncResult(await pushInventoryToChannel(root, args, context)),
        pullReservationsFromChannel: async (root: unknown, args: any, context: any) =>
          mapChannelSyncResult(await pullReservationsFromChannel(root, args, context)),
        retryFailedChannelSyncs,
        submitHotelContactMessage,
        createStorefrontBooking: async (
          root: unknown,
          args: { data: StorefrontBookingInput },
          context: any
        ) => mapGuestBooking(await createStorefrontBooking(root, args, context)),
        createStaffBooking: async (
          root: unknown,
          args: { data: StaffBookingInput },
          context: any,
        ) => createStaffBooking(root, args, context),
        amendStaffBooking,
        requestBookingPaymentRefund,
        updateBookingStatus,
        updateRoomOperationalStatus,
        updateHousekeepingTaskStatus,
        updateRatePlanPublication,
        reportRoomMaintenanceIssue,
        assignRoomToBooking,
        updateBookingStayDates,
        updateMaintenanceRequestStatus,
        updateRoomInventoryControls,
        requestBookingModification: async (root: unknown, args: any, context: any) => {
          const booking = await requestBookingModification(root, args, context);
          return {
            id: booking.id,
            status: booking.status || null,
            paymentStatus: null,
            cancelledAt: null,
          };
        },
        resolveBookingModificationRequest,
        initiateBookingPaymentSession: async (root: unknown, args: any, context: any) =>
          mapCheckoutPaymentSession(await initiateBookingPaymentSession(root, args, context)),
        completeBookingPayment,
      },
    },
  });
}