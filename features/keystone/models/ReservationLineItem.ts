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

export const ReservationLineItem = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['reservation', 'type', 'description', 'quantity', 'totalPrice', 'date'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Reservation relationship
    reservation: relationship({
      ref: 'Booking',
      ui: {
        displayMode: 'select',
        labelField: 'confirmationNumber',
      },
      label: 'Reservation',
    }),

    // Type of charge
    type: select({
      type: 'string',
      options: [
        { label: 'Room', value: 'room' },
        { label: 'Food & Beverage', value: 'food_beverage' },
        { label: 'Spa', value: 'spa' },
        { label: 'Parking', value: 'parking' },
        { label: 'Minibar', value: 'minibar' },
        { label: 'Laundry', value: 'laundry' },
        { label: 'Phone', value: 'phone' },
        { label: 'Internet', value: 'internet' },
        { label: 'Service Fee', value: 'service_fee' },
        { label: 'Tax', value: 'tax' },
        { label: 'Other', value: 'other' },
      ],
      validation: { isRequired: true },
      label: 'Type',
      ui: {
        description: 'Type of charge or service',
      },
    }),

    // Description
    description: text({
      validation: { isRequired: true },
      ui: {
        displayMode: 'textarea',
        description: 'Description of the charge or service',
      },
      label: 'Description',
    }),

    // Quantity
    quantity: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: 'Quantity',
      ui: {
        description: 'Number of units',
      },
    }),

    // Unit price (in cents)
    unitPrice: integer({
      validation: { isRequired: true, min: 0 },
      label: 'Unit Price (cents)',
      ui: {
        description: 'Price per unit in cents',
      },
    }),

    // Total price (in cents)
    totalPrice: integer({
      validation: { isRequired: true, min: 0 },
      label: 'Total Price (cents)',
      ui: {
        description: 'Total price (quantity × unit price) in cents',
      },
    }),

    // Date of charge
    date: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: 'now' },
      label: 'Date',
      ui: {
        description: 'When this charge was incurred',
      },
    }),

    // Posted by (staff member who added the charge)
    postedBy: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
        description: 'Staff member who posted this charge',
      },
      label: 'Posted By',
    }),

    // Notes
    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Additional notes about this charge',
      },
      label: 'Notes',
    }),

    ...trackingFields,
  },
  hooks: {
    resolveInput: async ({ resolvedData, item, operation }) => {
      // Auto-calculate totalPrice if quantity or unitPrice changes
      if (resolvedData.quantity !== undefined || resolvedData.unitPrice !== undefined) {
        const quantity = resolvedData.quantity ?? item?.quantity ?? 1
        const unitPrice = resolvedData.unitPrice ?? item?.unitPrice ?? 0
        resolvedData.totalPrice = quantity * unitPrice
      }
      return resolvedData
    },
  },
})
