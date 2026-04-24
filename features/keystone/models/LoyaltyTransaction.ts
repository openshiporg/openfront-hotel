import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  integer,
  select,
  relationship,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const LoyaltyTransaction = list({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: permissions.canManageGuests,
      update: permissions.canManageGuests,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['guest', 'points', 'type', 'description', 'createdAt'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Guest relationship
    guest: relationship({
      ref: 'Guest',
      ui: {
        displayMode: 'select',
        labelField: 'email',
      },
      label: 'Guest',
    }),

    // Booking relationship (optional - for earned points from stays)
    booking: relationship({
      ref: 'Booking',
      ui: {
        displayMode: 'select',
        labelField: 'confirmationNumber',
        description: 'Associated booking (if applicable)',
      },
      label: 'Booking',
    }),

    // Points (can be positive or negative)
    points: integer({
      validation: { isRequired: true },
      label: 'Points',
      ui: {
        description: 'Points earned (positive) or redeemed/expired (negative)',
      },
    }),

    // Transaction type
    type: select({
      type: 'string',
      options: [
        { label: 'Earned', value: 'earned' },
        { label: 'Redeemed', value: 'redeemed' },
        { label: 'Adjusted', value: 'adjusted' },
        { label: 'Bonus', value: 'bonus' },
        { label: 'Expired', value: 'expired' },
      ],
      validation: { isRequired: true },
      label: 'Transaction Type',
      ui: {
        description: 'Type of loyalty transaction',
      },
    }),

    // Description
    description: text({
      validation: { isRequired: true },
      ui: {
        displayMode: 'textarea',
        description: 'Description of why points were earned/redeemed',
      },
      label: 'Description',
    }),

    // Created by (staff member who created transaction)
    createdBy: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
        description: 'Staff member who created this transaction',
      },
      label: 'Created By',
    }),

    ...trackingFields,
  },
})
