import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  float,
  integer,
  relationship,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { requiredRelationshipDb, requiredRelationshipHooks } from './requiredRelationship'
import { canFilterBookings, canFilterRooms } from '../access'

export const RoomAssignment = list({
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
      initialColumns: ['booking', 'room', 'roomType', 'guestName', 'ratePerNightMinor'],
    },
    itemView: {
      defaultFieldMode: 'read',
    },
  },
  fields: {
    // Booking relationship
    booking: relationship({ isFilterable: canFilterBookings,
      ref: 'Booking.roomAssignments',
      db: requiredRelationshipDb, hooks: requiredRelationshipHooks,
      ui: {
        displayMode: 'select',
        labelField: 'confirmationNumber',
      },
      label: 'Booking',
    }),

    // Room relationship
    room: relationship({ isFilterable: canFilterRooms,
      ref: 'Room.roomAssignments',
      ui: {
        displayMode: 'select',
        labelField: 'roomNumber',
      },
      label: 'Room',
    }),

    // Room type relationship
    roomType: relationship({ isFilterable: canFilterRooms,
      ref: 'RoomType.roomAssignments',
      db: requiredRelationshipDb, hooks: requiredRelationshipHooks,
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Rate
    ratePerNightMinor: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: 'Rate per night' }),
    ratePerNight: float({
      validation: { min: 0 },
      label: 'Rate per night (USD)',
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } },
    }),

    // Guest information
    guestName: text({
      label: 'Guest Name',
      ui: {
        description: 'Name of guest assigned to this room',
      },
    }),

    // Special requests
    specialRequests: text({
      ui: {
        displayMode: 'textarea',
        description: 'Special requests or notes for this room',
      },
      label: 'Special Requests',
    }),
    ...trackingFields,
  },
  hooks: {
    // Staff edit the cents field (shown in dollars); keep the legacy dollar copy the storefront reads in step.
    resolveInput: async ({ resolvedData, inputData }) => ({
      ...resolvedData,
      ...(Number.isSafeInteger((inputData as any).ratePerNightMinor) ? { ratePerNight: resolvedData.ratePerNightMinor / 100 }
        : typeof (inputData as any).ratePerNight === 'number' && typeof resolvedData.ratePerNight === 'number' ? { ratePerNightMinor: Math.round(resolvedData.ratePerNight * 100) } : {}),
    }),
  },
})
