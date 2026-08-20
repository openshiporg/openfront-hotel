import { list } from '@keystone-6/core'
import {
  text,
  timestamp,
  integer,
  relationship,
  json,
} from '@keystone-6/core/fields'

import { permissions } from '../access'
import { trackingFields } from './trackingFields'
import { requiredRelationshipDb } from './requiredRelationship'

export const ChannelReservation = list({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['externalId', 'channel', 'guestName', 'checkInDate', 'checkOutDate', 'channelStatus'],
    },
    itemView: {
      defaultFieldMode: 'read',
    },
  },
  fields: {
    // Channel relationship
    channel: relationship({
      ref: 'Channel.channelReservations',
      db: requiredRelationshipDb,
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Channel',
    }),

    channelKey: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      db: { extendPrismaSchema: field => field.replace(' @default("")', '') },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: 'read' }, createView: { fieldMode: 'hidden' } },
    }),

    // External booking ID from the channel
    externalId: text({
      validation: { isRequired: true },
      isIndexed: true,
      label: 'External Booking ID',
      ui: {
        description: 'Booking ID from the OTA/channel',
      },
    }),

    // Link to our internal Reservation
    reservation: relationship({
      ref: 'Booking',
      ui: {
        displayMode: 'select',
        labelField: 'confirmationNumber',
        description: 'Linked internal booking/reservation',
      },
      label: 'Internal Reservation',
    }),

    // Room type (as provided by channel)
    roomType: relationship({
      ref: 'RoomType',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Dates
    checkInDate: timestamp({
      validation: { isRequired: true },
      label: 'Check-In Date',
      ui: {
        description: 'Check-in date from channel',
      },
    }),

    checkOutDate: timestamp({
      validation: { isRequired: true },
      label: 'Check-Out Date',
      ui: {
        description: 'Check-out date from channel',
      },
    }),

    // Guest information (as provided by channel)
    guestName: text({
      validation: { isRequired: true },
      label: 'Guest Name',
      ui: {
        description: 'Guest name from channel',
      },
    }),

    guestEmail: text({
      label: 'Guest Email',
      ui: {
        description: 'Guest email from channel',
      },
    }),

    // Financial details
    totalAmount: integer({
      validation: { min: 0 },
      label: 'Total Amount (cents)',
      ui: {
        description: 'Total booking amount in cents',
      },
    }),

    commission: integer({
      validation: { min: 0 },
      label: 'Commission (cents)',
      ui: {
        description: 'Commission amount paid to channel in cents',
      },
    }),

    // Channel status (text from OTA)
    channelStatus: text({
      label: 'Channel Status',
      ui: {
        description: 'Booking status as reported by the channel',
      },
    }),

    // Raw data payload from channel
    rawData: json({
      label: 'Raw Data',
      ui: {
        description: 'Full booking payload from channel API',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
      defaultValue: {},
    }),

    // Sync tracking
    lastSyncedAt: timestamp({
      label: 'Last Synced At',
      ui: {
        description: 'When this reservation was last synced with channel',
        itemView: { fieldMode: 'read' },
      },
    }),

    syncErrors: json({
      label: 'Sync Errors',
      ui: {
        description: 'Any errors during sync',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
      defaultValue: [],
    }),

    ...trackingFields,
  },
})
