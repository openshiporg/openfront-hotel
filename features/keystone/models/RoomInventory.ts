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
import { getHotelAvailability } from '../inventory/roomAvailability'
import { trackingFields } from './trackingFields'
import { requiredRelationshipDb } from './requiredRelationship'

async function authoritativeAvailable(item: any, context: any) {
  if (!item?.roomTypeId || !item?.date) return 0
  const day = new Date(item.date)
  day.setUTCHours(0, 0, 0, 0)
  const [roomType] = await getHotelAvailability(context.sudo(), {
    roomTypeId: item.roomTypeId,
    checkInDate: day,
    checkOutDate: new Date(day.getTime() + 86_400_000),
  })
  return Number(roomType?.availabilityByDay?.[0]?.available ?? 0)
}

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

    // Rooms still sellable on this date, from the same calculation the booking flow uses:
    // bookings, group holds, blocks, repairs and outages, not just this record's counters.
    availableRooms: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve: async (item: any, _args: unknown, context: any) => authoritativeAvailable(item, context),
      }),
      ui: {
        description: 'Rooms left to sell on this date after bookings, group holds, blocks and outages',
      },
    }),

    isAvailable: virtual({
      field: graphql.field({
        type: graphql.Boolean,
        resolve: async (item: any, _args: unknown, context: any) => (await authoritativeAvailable(item, context)) > 0,
      }),
      ui: {
        description: 'Whether any room is left to sell on this date',
      },
    }),
    ...trackingFields,
  },
})
