import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  integer,
  select,
  timestamp,
  relationship,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const Room = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageRooms,
    },
  },
  ui: {
    listView: {
      initialColumns: ['roomNumber', 'roomType', 'floor', 'status'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Basic information
    roomNumber: text({
      validation: { isRequired: true },
      isIndexed: 'unique',
      label: 'Room Number',
      ui: {
        description: 'Unique room identifier (e.g., 101, 202A)',
      },
    }),

    // Room type relationship
    roomType: relationship({
      ref: 'RoomType.rooms',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Location
    floor: integer({
      validation: { min: 0 },
      label: 'Floor',
      ui: {
        description: 'Floor number where the room is located',
      },
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Vacant', value: 'vacant' },
        { label: 'Occupied', value: 'occupied' },
        { label: 'Cleaning', value: 'cleaning' },
        { label: 'Maintenance', value: 'maintenance' },
        { label: 'Out of Order', value: 'out_of_order' },
      ],
      defaultValue: 'vacant',
      label: 'Status',
      ui: {
        description: 'Current room status',
      },
    }),

    // Housekeeping
    lastCleaned: timestamp({
      label: 'Last Cleaned',
      ui: {
        description: 'When the room was last cleaned',
      },
    }),

    // Notes
    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Maintenance issues, special notes, etc.',
      },
      label: 'Notes',
    }),

    // Relationships
    housekeepingTasks: relationship({
      ref: 'HousekeepingTask.room',
      many: true,
      ui: {
        displayMode: 'cards',
        cardFields: ['taskType', 'status', 'assignedTo'],
        inlineCreate: { fields: ['taskType', 'priority', 'notes'] },
      },
      label: 'Housekeeping Tasks',
    }),
    roomAssignments: relationship({
      ref: 'RoomAssignment.room',
      many: true,
      ui: {
        displayMode: 'count',
      },
      label: 'Room Assignments',
    }),
    ...trackingFields,
  },
})
