import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  select,
  float,
  checkbox,
  timestamp,
  relationship,
  json,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const Channel = list({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'channelType', 'isActive', 'syncStatus', 'lastSyncAt'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Channel name
    name: text({
      validation: { isRequired: true },
      isIndexed: 'unique',
      label: 'Channel Name',
      ui: {
        description: 'e.g., Booking.com, Expedia, Airbnb',
      },
    }),

    // Channel type
    channelType: select({
      type: 'string',
      options: [
        { label: 'OTA (Online Travel Agency)', value: 'ota' },
        { label: 'GDS (Global Distribution System)', value: 'gds' },
        { label: 'Direct', value: 'direct' },
        { label: 'Metasearch', value: 'metasearch' },
      ],
      validation: { isRequired: true },
      label: 'Channel Type',
      ui: {
        description: 'Type of distribution channel',
      },
    }),

    // Active status
    isActive: checkbox({
      defaultValue: true,
      label: 'Active',
      ui: {
        description: 'Whether this channel is currently active',
      },
    }),

    // API credentials (encrypted/secured)
    credentials: json({
      label: 'Credentials',
      ui: {
        description: 'API keys and authentication credentials (encrypted)',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'hidden' },
      },
      defaultValue: {},
    }),

    // Commission percentage
    commission: float({
      validation: { min: 0, max: 100 },
      defaultValue: 0,
      label: 'Commission (%)',
      ui: {
        description: 'Commission percentage charged by this channel',
      },
    }),

    // Sync settings
    syncInventory: checkbox({
      defaultValue: true,
      label: 'Sync Inventory',
      ui: {
        description: 'Automatically sync room inventory to this channel',
      },
    }),

    syncRates: checkbox({
      defaultValue: true,
      label: 'Sync Rates',
      ui: {
        description: 'Automatically sync room rates to this channel',
      },
    }),

    // Sync status tracking
    lastSyncAt: timestamp({
      label: 'Last Sync At',
      ui: {
        description: 'When data was last synced with this channel',
        itemView: { fieldMode: 'read' },
      },
    }),

    syncStatus: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Error', value: 'error' },
        { label: 'Paused', value: 'paused' },
      ],
      defaultValue: 'active',
      label: 'Sync Status',
      ui: {
        description: 'Current synchronization status',
      },
    }),

    // Sync errors
    syncErrors: json({
      label: 'Sync Errors',
      ui: {
        description: 'Array of recent sync errors',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
      defaultValue: [],
    }),

    // Room type mapping rules (map our room types to channel room types)
    mappingRules: json({
      label: 'Mapping Rules',
      ui: {
        description: 'JSON mapping of room types to channel-specific types',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: {},
    }),

    // Relationships
    channelReservations: relationship({
      ref: 'ChannelReservation.channel',
      many: true,
      ui: {
        displayMode: 'count',
        description: 'Reservations received from this channel',
      },
      label: 'Channel Reservations',
    }),

    ...trackingFields,
  },
})
