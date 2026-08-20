import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import {
  text,
  select,
  float,
  checkbox,
  timestamp,
  relationship,
  json,
} from '@keystone-6/core/fields'

import { permissions } from '../access'
import { trackingFields } from './trackingFields'

const canReadChannels = ({ session }: any) => permissions.canManageBookings({ session }) || permissions.canManageIntegrations({ session });
const canManageChannels = ({ session }: any) => permissions.canManageBookings({ session }) && permissions.canManageIntegrations({ session });

export const Channel = list({
  access: {
    operation: {
      query: canReadChannels,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['name', 'channelType', 'isActive', 'syncStatus', 'lastSyncAt'],
    },
    itemView: {
      defaultFieldMode: 'read',
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
      defaultValue: false,
      label: 'Active',
      ui: {
        description: 'Whether this channel is currently active',
      },
    }),

    // Experimental P2 bridge configuration. API reads are denied; this release
    // does not claim application-layer encryption for this JSON field.
    credentials: json({
      access: {
        read: denyAll,
        create: canManageChannels,
        update: canManageChannels,
      },
      label: 'Credentials',
      ui: {
        description: 'Experimental bridge configuration; raw API reads are denied. Protect the database and secret-manager source.',
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
      defaultValue: false,
      label: 'Sync Inventory',
      ui: {
        description: 'Automatically sync room inventory to this channel',
      },
    }),

    syncRates: checkbox({
      access: { create: () => false, update: () => false },
      defaultValue: false,
      label: 'Rate sync (P2)',
      ui: {
        description: 'Reserved for a future certified adapter; the bounded custom bridge does not push rates.',
        itemView: { fieldMode: 'read' },
        createView: { fieldMode: 'hidden' },
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
      defaultValue: 'paused',
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
  hooks: {
    validateInput: ({ resolvedData, item, addValidationError }) => {
      const active = resolvedData.isActive ?? item?.isActive ?? false;
      const credentials = (resolvedData.credentials ?? item?.credentials ?? {}) as Record<string, unknown>;
      if (active && String(credentials.mode || '').toLowerCase() !== 'live') {
        addValidationError('A channel can be activated only with an explicitly certified live custom-bridge configuration.');
      }
      if (resolvedData.syncRates === true) {
        addValidationError('Rate sync is P2 and is not available through the bounded custom bridge.');
      }
    },
  },
})
