import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  float,
  relationship,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const RoomAssignment = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['booking', 'room', 'roomType', 'guestName', 'ratePerNight'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Booking relationship
    booking: relationship({
      ref: 'Booking.roomAssignments',
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
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Rate
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
