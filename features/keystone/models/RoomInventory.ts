import { list, graphql } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  timestamp,
  integer,
  relationship,
  text,
  virtual,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { requiredRelationshipDb } from './requiredRelationship'

export const RoomInventory = list({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['date', 'roomType', 'totalRooms', 'bookedRooms', 'availableRooms'],
    },
    itemView: {
      defaultFieldMode: 'read',
    },
  },
  fields: {
    inventoryKey: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      db: { extendPrismaSchema: field => field.replace(' @default("")', '') },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: 'read' }, createView: { fieldMode: 'hidden' } },
    }),
    // Date for this inventory record
    date: timestamp({
      validation: { isRequired: true },
      isIndexed: true,
      label: 'Date',
      ui: {
        description: 'Date for this inventory snapshot',
      },
    }),

    // Room type relationship
    roomType: relationship({
      ref: 'RoomType',
      db: requiredRelationshipDb,
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Inventory counts
    totalRooms: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: 'Total Rooms',
      ui: {
        description: 'Total number of rooms of this type',
      },
    }),

    bookedRooms: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: 'Booked Rooms',
      ui: {
        description: 'Number of rooms currently booked',
      },
    }),

    blockedRooms: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: 'Blocked Rooms',
      ui: {
        description: 'Number of rooms blocked (out of order, reserved, etc)',
      },
    }),

    // Virtual field for available rooms
    availableRooms: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve(item: any) {
          const total = item.totalRooms || 0
          const booked = item.bookedRooms || 0
          const blocked = item.blockedRooms || 0
          return Math.max(0, total - booked - blocked)
        },
      }),
      ui: {
        description: 'Calculated available rooms (total - booked - blocked)',
      },
    }),

    // Virtual field for availability status
    isAvailable: virtual({
      field: graphql.field({
        type: graphql.Boolean,
        resolve(item: any) {
          const total = item.totalRooms || 0
          const booked = item.bookedRooms || 0
          const blocked = item.blockedRooms || 0
          const available = total - booked - blocked
          return available > 0
        },
      }),
      ui: {
        description: 'Whether any rooms are available',
      },
    }),
    ...trackingFields,
  },
})
