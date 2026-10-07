import { list } from '@keystone-6/core'
import {
  text,
  integer,
  select,
  timestamp,
  relationship,
} from '@keystone-6/core/fields'

import { permissions } from '../access'
import { trackingFields } from './trackingFields'
import { requiredRelationshipDb } from './requiredRelationship'

export const Room = list({
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
      db: requiredRelationshipDb,
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
      access: { create: () => false, update: () => false },
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
      access: { create: () => false, update: () => false },
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
      access: { create: () => false, update: () => false },
      ref: 'RoomAssignment.room',
      many: true,
      ui: {
        displayMode: 'count',
      },
      label: 'Room Assignments',
    }),
    ...trackingFields,
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      ...(typeof resolvedData.roomNumber === 'string'
        ? { roomNumber: resolvedData.roomNumber.trim().toUpperCase() }
        : {}),
    }),
    beforeOperation: async ({ operation, item, context, resolvedData }) => {
      if (operation === 'update' && item?.id && resolvedData.roomType !== undefined) {
        const assignments = await context.prisma.roomAssignment.count({ where: { roomId: String(item.id) } });
        if (assignments) throw new Error('A room with assignment history cannot change room type; create a new physical-room record when reclassifying retired inventory.');
      }
      if (operation !== 'delete' || !item?.id) return;
      const [assignments, housekeeping, maintenance] = await Promise.all([
        context.prisma.roomAssignment.count({ where: { roomId: String(item.id) } }),
        context.prisma.housekeepingTask.count({ where: { roomId: String(item.id) } }),
        context.prisma.maintenanceRequest.count({ where: { roomId: String(item.id) } }),
      ]);
      if (assignments || housekeeping || maintenance) {
        throw new Error('Room history exists; retire operational availability instead of deleting the room.');
      }
    },
  },
})
