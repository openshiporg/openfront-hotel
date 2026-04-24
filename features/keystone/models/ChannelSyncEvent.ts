import { list } from '@keystone-6/core'
import {
  relationship,
  select,
  json,
  text,
  integer,
  timestamp,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const ChannelSyncEvent = list({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['channel', 'action', 'status', 'occurredAt', 'createdBy'],
      initialSort: { field: 'occurredAt', direction: 'DESC' },
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    channel: relationship({
      ref: 'Channel',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Channel',
    }),
    action: select({
      type: 'string',
      options: [
        { label: 'Inventory Push', value: 'inventory_push' },
        { label: 'Reservation Pull', value: 'reservation_pull' },
        { label: 'Webhook Event', value: 'webhook_event' },
        { label: 'Retry Attempt', value: 'retry_attempt' },
      ],
      defaultValue: 'webhook_event',
      label: 'Action',
    }),
    status: select({
      type: 'string',
      options: [
        { label: 'Success', value: 'success' },
        { label: 'Failed', value: 'failed' },
        { label: 'Processing', value: 'processing' },
      ],
      defaultValue: 'success',
      label: 'Status',
    }),
    message: text({
      label: 'Message',
      ui: {
        displayMode: 'textarea',
      },
    }),
    payload: json({
      label: 'Payload',
      ui: {
        description: 'Payload captured during sync for troubleshooting',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
      defaultValue: {},
    }),
    errorMessage: text({
      label: 'Error Message',
      ui: {
        displayMode: 'textarea',
      },
    }),
    attempts: integer({
      defaultValue: 0,
      validation: { min: 0 },
      label: 'Attempts',
    }),
    nextAttemptAt: timestamp({
      label: 'Next Attempt At',
      ui: {
        description: 'When the next retry should occur',
      },
    }),
    occurredAt: timestamp({
      defaultValue: { kind: 'now' },
      label: 'Occurred At',
    }),
    createdBy: relationship({
      ref: 'User',
      many: false,
      ui: {
        displayMode: 'select',
        labelField: 'email',
      },
      hooks: {
        resolveInput({ operation, resolvedData, context }) {
          if (
            (operation === 'create' || operation === 'update') &&
            !resolvedData.createdBy &&
            context.session?.itemId
          ) {
            return { connect: { id: context.session.itemId } }
          }
          return resolvedData.createdBy
        },
      },
    }),
    ...trackingFields,
  },
})
