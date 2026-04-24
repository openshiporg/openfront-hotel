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

export const HousekeepingTask = list({
  access: {
    operation: {
      query: permissions.canManageHousekeeping,
      create: permissions.canManageHousekeeping,
      update: permissions.canManageHousekeeping,
      delete: permissions.canManageHousekeeping,
    },
  },
  ui: {
    listView: {
      initialColumns: ['room', 'taskType', 'status', 'priority', 'assignedTo'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Room relationship
    room: relationship({
      ref: 'Room.housekeepingTasks',
      ui: {
        displayMode: 'select',
        labelField: 'roomNumber',
      },
      label: 'Room',
    }),

    // Task type
    taskType: select({
      type: 'string',
      options: [
        { label: 'Checkout Clean', value: 'checkout_clean' },
        { label: 'Stayover Clean', value: 'stayover_clean' },
        { label: 'Deep Clean', value: 'deep_clean' },
        { label: 'Maintenance', value: 'maintenance' },
        { label: 'Inspection', value: 'inspection' },
        { label: 'Turn Down', value: 'turn_down' },
      ],
      validation: { isRequired: true },
      label: 'Task Type',
      ui: {
        description: 'Type of housekeeping task',
      },
    }),

    // Assignment
    assignedTo: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Assigned To',
      hooks: {
        resolveInput({ operation, resolvedData, context }) {
          // Auto-assign to current user on create if not specified
          if (operation === 'create' && !resolvedData.assignedTo && context.session?.itemId) {
            return { connect: { id: context.session.itemId } }
          }
          return resolvedData.assignedTo
        },
      },
    }),

    // Priority
    priority: integer({
      defaultValue: 2,
      validation: { min: 1, max: 5 },
      label: 'Priority',
      ui: {
        description: 'Task priority (1 = highest, 5 = lowest)',
      },
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Inspection Needed', value: 'inspection_needed' },
        { label: 'On Hold', value: 'on_hold' },
      ],
      defaultValue: 'pending',
      label: 'Status',
      ui: {
        description: 'Current task status',
      },
    }),

    // Timestamps
    startedAt: timestamp({
      label: 'Started At',
      ui: {
        description: 'When the task was started',
      },
    }),
    completedAt: timestamp({
      label: 'Completed At',
      ui: {
        description: 'When the task was completed',
      },
    }),

    // Notes
    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Issues found, special instructions, etc.',
      },
      label: 'Notes',
    }),
    ...trackingFields,
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === 'update' && resolvedData.status) {
        // Auto-set startedAt when status changes to in_progress
        if (resolvedData.status === 'in_progress' && !item?.startedAt) {
          resolvedData.startedAt = new Date().toISOString()
        }
        // Auto-set completedAt when status changes to completed
        if (resolvedData.status === 'completed' && !item?.completedAt) {
          resolvedData.completedAt = new Date().toISOString()
        }
      }
    },
  },
})
