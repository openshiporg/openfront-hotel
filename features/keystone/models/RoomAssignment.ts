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
import { requiredRelationshipDb } from './requiredRelationship'

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
      initialColumns: ['booking', 'room', 'roomType', 'guestName', 'ratePerNight'],
    },
    itemView: {
      defaultFieldMode: 'read',
    },
  },
  fields: {
    // Booking relationship
    booking: relationship({
      ref: 'Booking.roomAssignments',
      db: requiredRelationshipDb,
      ui: {
        displayMode: 'select',
        labelField: 'confirmationNumber',
      },
      label: 'Booking',
    }),

    // Room relationship
    room: relationship({
      ref: 'Room.roomAssignments',
      ui: {
        displayMode: 'select',
        labelField: 'roomNumber',
      },
      label: 'Room',
    }),

    // Room type relationship
    roomType: relationship({
      ref: 'RoomType.roomAssignments',
      db: requiredRelationshipDb,
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Rate
    ratePerNightMinor: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: 'Rate Per Night (minor units)' }),
    ratePerNight: float({
      validation: { min: 0 },
      label: 'Rate Per Night',
      ui: {
        description: 'Nightly rate for this room assignment',
      },
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
})
