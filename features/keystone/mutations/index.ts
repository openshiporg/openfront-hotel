import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import cancelBooking from "./cancelBooking";
import pushInventoryToChannel from "./pushInventoryToChannel";
import pullReservationsFromChannel from "./pullReservationsFromChannel";
import initiateBookingPaymentSession from './initiateBookingPaymentSession';
import completeBookingPayment from './completeBookingPayment';
import handleBookingPaymentProviderWebhook from './handleBookingPaymentProviderWebhook';
import createStorefrontBooking from './createStorefrontBooking';
import updateBookingStatus from './updateBookingStatus';
import bookingPaymentProviders from '../queries/bookingPaymentProviders';
import activeBookingPaymentSession from '../queries/activeBookingPaymentSession';

const graphql = String.raw;

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      type BookingCheckoutPaymentProvider {
        id: ID!
        name: String!
        code: String!
        metadata: JSON
      }

      type BookingCheckoutPaymentSession {
        id: ID!
        amount: Int!
        isSelected: Boolean!
        isInitiated: Boolean!
        data: JSON
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
      }

      type Query {
        redirectToInit: Boolean
        bookingPaymentProviders: [BookingCheckoutPaymentProvider!]!
        activeBookingPaymentSession(bookingId: ID!): ActiveBookingPaymentSession
      }

      input ChannelSyncDateRangeInput {
        startDate: DateTime
        endDate: DateTime
      }

      type ChannelSyncResult {
        channelId: ID!
        status: String!
        syncedAt: DateTime!
        details: JSON
      }

      type BookingPaymentWebhookResult {
        success: Boolean!
        providerCode: String!
        type: String!
      }

      type Mutation {
        cancelBooking(bookingId: ID!, refundAmount: Float, refundReason: String): Booking
        pushInventoryToChannel(channelId: ID!, dateRange: ChannelSyncDateRangeInput): ChannelSyncResult
        pullReservationsFromChannel(channelId: ID!): ChannelSyncResult
        createStorefrontBooking(data: BookingCreateInput!): Booking
        updateBookingStatus(bookingId: ID!, status: String!): Booking
        initiateBookingPaymentSession(
          bookingId: ID!
          paymentProviderCode: String!
          amount: Float
          currency: String
          returnUrl: String
          cancelUrl: String
        ): BookingCheckoutPaymentSession
        completeBookingPayment(
          bookingId: ID!
          paymentSessionId: ID!
          providerPaymentId: String
        ): BookingCheckoutPaymentResult
        handleBookingPaymentProviderWebhook(
          providerCode: String!
          event: JSON!
          headers: JSON!
        ): BookingPaymentWebhookResult!
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        bookingPaymentProviders,
        activeBookingPaymentSession,
      },
      Mutation: {
        cancelBooking,
        pushInventoryToChannel,
        pullReservationsFromChannel,
        createStorefrontBooking,
        updateBookingStatus,
        initiateBookingPaymentSession,
        completeBookingPayment,
        handleBookingPaymentProviderWebhook,
      },
    },
  });
}