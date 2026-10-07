import { hotelHousekeepingStaffCapabilities, updateHotelHousekeepingStaffCapability } from '../workforce/housekeepingCapabilities';
import guestFolio from '../queries/guestFolio';
import { hotelPayoutOperations, manageHotelPayout } from '../finance/hotelPayoutReconciliation';
import { hotelRelocation, updateHotelRelocation } from '../operations/guestRelocation';
import { hotelSecurityAuthorization, manageHotelSecurityAuthorization } from '../security/authorization';
import { hotelDerivedRateTypeDefs, hotelDerivedRateResolvers } from '../rates/derived';
import { hotelLoyaltyAccount, redeemHotelLoyalty } from '../loyalty/commands';
import { maintenanceCommercialTypeDefs, maintenanceCommercialResolvers } from '../operations/maintenanceCommercial';
import { saveHotelChannelDraft } from '../lib/hotelChannelConfiguration';
import { hotelMfaTypeDefs, hotelMfaResolvers } from '../lib/hotelMfa';
import { hotelPayerWindows, hotelReceivableOperations, hotelReceivableOperationsPage, manageHotelReceivable } from '../receivables/commands';
import { hotelDisputeOperations, annotateHotelDispute } from '../finance/hotelDisputes';
import { hotelGroupWorkspace, createHotelGroupRoomingList, closeHotelGroupMasterFolio, detachHotelGroupBooking } from '../groups/commands';
import { hotelFolioReceipt } from '../lib/hotelFolioReceipt';
import { guestBookedStayTerms } from '../lib/storefrontBooking';
import { hotelGuestGovernanceTypeDefs, hotelGuestGovernanceResolvers } from '../guest-governance/commands';
import { getHotelStayServices, updateHotelStayService } from '../operations/stayServices';
import { hotelCashierOperations, manageHotelCashier } from '../cashier/commands';
import { getHotelRoomOutages, updateHotelRoomOutage } from '../operations/roomOutages';
import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import cancelBooking from "./cancelBooking";
import pushInventoryToChannel from "./pushInventoryToChannel";
import pullReservationsFromChannel from "./pullReservationsFromChannel";
import initiateBookingPaymentSession from './initiateBookingPaymentSession';
import completeBookingPayment from './completeBookingPayment';
import { getHotelStayRegister, updateHotelStayRegister } from '../operations/stayRegister';
import createStorefrontBooking, { type StorefrontBookingInput } from '../bookings/createStorefrontBooking';
import createStaffBooking, { type StaffBookingInput } from '../bookings/createStaffBooking';
import amendStaffBooking from './amendStaffBooking';
import submitHotelContactMessage from './submitHotelContactMessage';
import requestBookingPaymentRefund from './requestBookingPaymentRefund';
import updateHotelPropertySettings from './updateHotelPropertySettings';
import updateBookingStatus from '../bookings/status';
import updateRoomOperationalStatus from '../operations/roomLifecycle';
import reportRoomMaintenanceIssue from '../operations/maintenanceIssue';
import assignRoomToBooking from '../bookings/roomAssignment';
import updateBookingStayDates from './updateBookingStayDates';
import retryFailedChannelSyncs from './retryFailedChannelSyncs';
import updateMaintenanceRequestStatus from '../operations/maintenanceRequests';
import updateRoomInventoryControls from './updateRoomInventoryControls';
import requestBookingModification from '../bookings/requestModification';
import resolveBookingModificationRequest from '../bookings/resolveModificationRequest';
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
import updateHousekeepingTaskStatus from '../workforce/housekeepingTasks';
import updateRatePlanPublication from './updateRatePlanPublication';
import { hotelOperationsResolvers, hotelOperationsTypeDefs } from '../queries/hotelOperations';
import runHotelNightAudit from '../operations/nightAudit';
import createHotelGroupBlock from './createHotelGroupBlock';
import replayHotelOutboxEvent from './replayHotelOutboxEvent';
import pickupHotelGroupBlock from './pickupHotelGroupBlock';
import updateHotelGroupBlockStatus from './updateHotelGroupBlockStatus';
import resolveOverdueCheckedInBooking from './resolveOverdueCheckedInBooking';
import replayRefundIntent from './replayRefundIntent';
import redeemHotelPasswordResetToken from './redeemHotelPasswordResetToken';
import configureHotelPaymentProvider from './configureHotelPaymentProvider';
import { paymentProviderCredentials } from '../lib/integrationConfig';
import { applyHotelAuthGraphqlPolicy } from '../lib/hotelAuthGraphqlSchema';

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
    bookedStayTerms: guestBookedStayTerms(booking),
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
  const schema = mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      ${hotelOperationsTypeDefs}
      ${hotelGuestGovernanceTypeDefs}
      ${hotelMfaTypeDefs}
      ${maintenanceCommercialTypeDefs}
      ${hotelDerivedRateTypeDefs}

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
        securityDepositMinor: Int!
        depositPercent: Int!
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
        bookedStayTerms: JSON
        status: String
        paymentStatus: String
        refundPendingMinor: Int
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
        hotelHousekeepingStaffCapabilities: String!
        hotelPayerWindows(folioId: ID!, bookingId: ID): JSON!
        guestFolio(bookingId: ID!): JSON!
        hotelPayoutOperations: JSON!
        hotelSecurityAuthorization(bookingId: ID!): JSON!
        hotelFolioReceipt(folioId: ID!): JSON!
        hotelCashierOperations: JSON!
        hotelReceivableOperations: JSON! @deprecated(reason: "Use hotelReceivableOperationsPage for bounded workspace reads.")
        hotelReceivableOperationsPage(afterAccountId: ID, afterInvoiceId: ID, pageSize: Int): JSON!
        hotelDisputeOperations: JSON!
        hotelGroupWorkspace(after: ID): String!
        hotelLoyaltyAccount(bookingId: ID!): String!
        hotelRelocation(bookingId: ID!): String!
        hotelStayServices(bookingId: ID, roomId: ID): String!
        hotelRoomOutages: String!
        hotelStayRegister(bookingId: ID!): String!
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
        idempotencyKey: String!
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
        refundApprovalThresholdMinor: Int
        writeOffApprovalThresholdMinor: Int
        cashVarianceApprovalThresholdMinor: Int
        prearrivalEmailEnabled: Boolean
        prearrivalDays: Int
        loyaltyEnabled: Boolean
        loyaltyEarnMinorPerPoint: Int
        loyaltyRedeemMinorPerPoint: Int
        loyaltyMinimumRedemptionPoints: Int
        securityDepositMinor: Int
        depositPercent: Int
        groupsEnabled: Boolean
        ratePublicationRequiresApproval: Boolean
        propertyName: String!
        tagline: String
        contactEmail: String!
        contactPhone: String!
        addressLine1: String!
        addressLine2: String
        frontDeskCopy: String
        timeZone: String!
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
        quoteToken: String!
        idempotencyKey: String!
      }

      type Mutation {
        updateHotelRelocation(bookingId: ID!, status: String!, expectedRevision: Int!, propertyName: String, contact: String, confirmation: String, costMinor: Int, guestAgreement: String, followUp: String, costEvidence: String, idempotencyKey: String!): String!
        detachHotelGroupBooking(bookingId: ID!, checkInDate: DateTime!, checkOutDate: DateTime!, roomTypeId: ID!, ratePlanId: ID!, reason: String!, idempotencyKey: String!): String!
        manageHotelPayout(input: JSON!): JSON!
        manageHotelSecurityAuthorization(input: JSON!): JSON!
        redeemHotelLoyalty(bookingId: ID!, points: Int!, idempotencyKey: String!): String!
        saveHotelChannelDraft(input: JSON!): JSON!
        manageHotelReceivable(input: JSON!): JSON!
        annotateHotelDispute(input: JSON!): JSON!
        createHotelGroupRoomingList(groupBlockId: ID!, allocationId: ID!, rows: String!, idempotencyKey: String!): String!
        closeHotelGroupMasterFolio(groupBlockId: ID!, idempotencyKey: String!): String!
        manageHotelCashier(input: JSON!): JSON!
        updateHotelStayService(serviceId: ID, bookingId: ID, roomId: ID, category: String, title: String, description: String, priority: String, dueAt: DateTime, status: String!, expectedStatus: String, assignedToId: ID, resolution: String, idempotencyKey: String!): String!
        updateHotelRoomOutage(roomId: ID!, outageId: ID, startDate: DateTime, endDate: DateTime, reason: String!, action: String!, idempotencyKey: String!): String!
        updateHotelStayRegister(bookingId: ID!, action: String!, name: String, occupantId: ID, keyReference: String, idempotencyKey: String!): String!
        configureHotelPaymentProvider(code: String!, enabled: Boolean!, credentials: HotelPaymentProviderCredentialsInput): HotelPaymentProviderConfigurationResult!
        redeemHotelPasswordResetToken(email: String!, token: String!, password: String!): HotelPasswordResetResult!
        updateHotelPropertySettings(data: HotelPropertySettingsInput!, idempotencyKey: String!): HotelSettings!
        runHotelOnboarding(template: String!, data: JSON): HotelOnboardingResult!
        runHotelNightAudit(
          propertyKey: String!
          businessDate: DateTime!
          idempotencyKey: String!
        ): HotelNightAuditRunProjection!
        replayHotelOutboxEvent(eventId: ID!, idempotencyKey: String!, acknowledgeUnknownDelivery: Boolean): HotelOutboxReplayResult!
        replayRefundIntent(intentId: ID!, idempotencyKey: String!): RefundIntent!
        resolveOverdueCheckedInBooking(
          bookingId: ID!
          approvalId: ID
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
          ratePlanId: ID
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
          approvalId: ID
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
          approvalId: ID
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
          targetRoomId: ID
          earlyDepartureApprovalId: ID
          earlyDepartureReason: String
          checkInDate: DateTime!
          checkOutDate: DateTime!
          roomTypeId: ID
          ratePlanId: ID
          promoCode: String
          idempotencyKey: String!
        ): Booking!
        requestBookingPaymentRefund(
          paymentId: ID!
          approvalId: ID
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
        updateHotelHousekeepingStaffCapability(staffId: ID!, configuration: String!, expectedRevision: Int!, idempotencyKey: String!): String!
        updateHousekeepingTaskStatus(
          taskId: ID!
          expectedStatus: String
          expectedUpdatedAt: DateTime
          status: String!
          assignedToId: ID
          notes: String
          idempotencyKey: String!
        ): HousekeepingTask
        updateRatePlanPublication(
          ratePlanId: ID!
          approvalId: ID
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
        hotelHousekeepingStaffCapabilities, hotelPayerWindows, hotelFolioReceipt, hotelSecurityAuthorization, guestFolio, hotelPayoutOperations,
        ...hotelGuestGovernanceResolvers.Query,
        ...hotelMfaResolvers.Query,
        ...maintenanceCommercialResolvers.Query,
        ...hotelDerivedRateResolvers.Query,
        hotelReceivableOperations, hotelReceivableOperationsPage, hotelDisputeOperations, hotelGroupWorkspace, hotelLoyaltyAccount, hotelRelocation,
        hotelCashierOperations,
        hotelStayServices: getHotelStayServices,
        hotelRoomOutages: getHotelRoomOutages,
        hotelStayRegister: getHotelStayRegister,
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
        ...hotelGuestGovernanceResolvers.Mutation,
        ...hotelMfaResolvers.Mutation,
        ...maintenanceCommercialResolvers.Mutation,
        ...hotelDerivedRateResolvers.Mutation,
        updateHotelRelocation, detachHotelGroupBooking, manageHotelPayout, manageHotelSecurityAuthorization, redeemHotelLoyalty, saveHotelChannelDraft, manageHotelReceivable, annotateHotelDispute, createHotelGroupRoomingList, closeHotelGroupMasterFolio,
        manageHotelCashier,
        updateHotelStayService,
        updateHotelRoomOutage,
        updateHotelStayRegister,
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
        updateHotelHousekeepingStaffCapability, updateHousekeepingTaskStatus,
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
  return applyHotelAuthGraphqlPolicy(schema);
}