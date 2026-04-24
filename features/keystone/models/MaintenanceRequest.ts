import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  integer,
  select,
  timestamp,
  relationship,
  json,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const MaintenanceRequest = list({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
      delete: permissions.canManageRooms,
    },
  },
  ui: {
    listView: {
      initialColumns: ['room', 'title', 'category', 'priority', 'status', 'assignedTo'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Room relationship
    room: relationship({
      ref: 'Room',
      ui: {
        displayMode: 'select',
        labelField: 'roomNumber',
      },
      label: 'Room',
    }),

    // Issue details
    title: text({
      validation: { isRequired: true },
      label: 'Title',
      ui: {
        description: 'Brief description of the issue',
      },
    }),

    description: text({
      ui: {
        displayMode: 'textarea',
        description: 'Detailed description of the maintenance issue',
      },
      label: 'Description',
    }),

    // Category
    category: select({
      type: 'string',
      options: [
        { label: 'Plumbing', value: 'plumbing' },
        { label: 'Electrical', value: 'electrical' },
        { label: 'HVAC', value: 'hvac' },
        { label: 'Furniture', value: 'furniture' },
        { label: 'Appliance', value: 'appliance' },
        { label: 'Structural', value: 'structural' },
        { label: 'Cleaning', value: 'cleaning' },
        { label: 'Other', value: 'other' },
      ],
      validation: { isRequired: true },
      label: 'Category',
      ui: {
        description: 'Type of maintenance issue',
      },
    }),

    // Priority
    priority: select({
      type: 'string',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'Emergency', value: 'emergency' },
      ],
      defaultValue: 'medium',
      validation: { isRequired: true },
      label: 'Priority',
      ui: {
        description: 'Urgency of the maintenance request',
      },
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Reported', value: 'reported' },
        { label: 'Assigned', value: 'assigned' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Verified', value: 'verified' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      defaultValue: 'reported',
      label: 'Status',
      ui: {
        description: 'Current status of the maintenance request',
      },
    }),

    // People involved
    reportedBy: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
        description: 'Staff member or guest who reported the issue',
      },
      label: 'Reported By',
    }),

    assignedTo: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
        description: 'Maintenance staff member assigned to fix the issue',
      },
      label: 'Assigned To',
    }),

    // Images
    images: json({
      label: 'Images',
      ui: {
        description: 'Array of S3 image URLs showing the issue',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: [],
    }),

    // Scheduling
    scheduledFor: timestamp({
      label: 'Scheduled For',
      ui: {
        description: 'When the maintenance is scheduled',
      },
    }),

    completedAt: timestamp({
      label: 'Completed At',
      ui: {
        description: 'When the maintenance was completed',
        itemView: { fieldMode: 'read' },
      },
    }),

    // Cost tracking
    cost: integer({
      validation: { min: 0 },
      label: 'Cost',
      ui: {
        description: 'Cost of maintenance in cents',
      },
    }),

    // Notes
    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Internal notes about the maintenance request',
      },
      label: 'Notes',
    }),

    ...trackingFields,
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === 'update' && resolvedData.status === 'completed' && !item?.completedAt) {
        resolvedData.completedAt = new Date().toISOString()
      }
    },
  },
})
