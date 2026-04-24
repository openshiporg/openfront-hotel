import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  float,
  integer,
  select,
  timestamp,
  relationship,
  virtual,
} from '@keystone-6/core/fields'
import { graphql } from '@keystone-6/core'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

// Generate a unique confirmation number
function generateConfirmationNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BK-${timestamp}-${random}`
}

export const Booking = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['confirmationNumber', 'guestName', 'checkInDate', 'checkOutDate', 'status', 'totalAmount'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Confirmation number (auto-generated)
    confirmationNumber: text({
      isIndexed: 'unique',
      label: 'Confirmation Number',
      ui: {
        description: 'Auto-generated booking confirmation number',
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
      hooks: {
        resolveInput({ operation, resolvedData }) {
          if (operation === 'create') {
            return generateConfirmationNumber()
          }
          return resolvedData.confirmationNumber
        },
      },
    }),

    // Guest information
    guestName: text({
      validation: { isRequired: true },
      label: 'Guest Name',
      ui: {
        description: 'Primary guest name',
      },
    }),
    guestEmail: text({
      label: 'Guest Email',
      ui: {
        description: 'Contact email for the booking',
      },
    }),
    guestPhone: text({
      label: 'Guest Phone',
      ui: {
        description: 'Contact phone number',
      },
    }),

    // Dates
    checkInDate: timestamp({
      validation: { isRequired: true },
      label: 'Check-In Date',
      ui: {
        description: 'Expected check-in date and time',
      },
    }),
    checkOutDate: timestamp({
      validation: { isRequired: true },
      label: 'Check-Out Date',
      ui: {
        description: 'Expected check-out date and time',
      },
    }),

    // Computed number of nights
    numberOfNights: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve(item: any) {
          if (item.checkInDate && item.checkOutDate) {
            const checkIn = new Date(item.checkInDate)
            const checkOut = new Date(item.checkOutDate)
            const diffTime = checkOut.getTime() - checkIn.getTime()
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            return diffDays > 0 ? diffDays : 0
          }
          return 0
        },
      }),
      ui: {
        description: 'Calculated number of nights',
      },
    }),

    // Guest count
    numberOfGuests: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: 'Number of Guests',
      ui: {
        description: 'Total number of guests',
      },
    }),
    numberOfAdults: integer({
      validation: { min: 1 },
      defaultValue: 1,
      label: 'Number of Adults',
    }),
    numberOfChildren: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Number of Children',
    }),

    // Financials
    roomRate: float({
      validation: { min: 0 },
      label: 'Room Rate',
      ui: {
        description: 'Total room rate before taxes',
      },
    }),
    taxAmount: float({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Tax Amount',
      ui: {
        description: 'Total tax amount',
      },
    }),
    feesAmount: float({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Fees Amount',
      ui: {
        description: 'Additional fees (resort fee, service charge, etc.)',
      },
    }),
    totalAmount: float({
      validation: { min: 0 },
      label: 'Total Amount',
      ui: {
        description: 'Total amount including room rate, taxes, and fees',
      },
    }),
    depositAmount: float({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Deposit Amount',
      ui: {
        description: 'Deposit or prepayment amount',
      },
    }),
    balanceDue: float({
      validation: { min: 0 },
      label: 'Balance Due',
      ui: {
        description: 'Remaining balance to be paid',
      },
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Checked In', value: 'checked_in' },
        { label: 'Checked Out', value: 'checked_out' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'No Show', value: 'no_show' },
      ],
      defaultValue: 'pending',
      label: 'Status',
      ui: {
        description: 'Current booking status',
      },
    }),

    // Payment status
    paymentStatus: select({
      type: 'string',
      options: [
        { label: 'Unpaid', value: 'unpaid' },
        { label: 'Partial', value: 'partial' },
        { label: 'Paid', value: 'paid' },
        { label: 'Refunded', value: 'refunded' },
      ],
      defaultValue: 'unpaid',
      label: 'Payment Status',
    }),

    // Booking source
    source: select({
      type: 'string',
      options: [
        { label: 'Direct', value: 'direct' },
        { label: 'Website', value: 'website' },
        { label: 'Phone', value: 'phone' },
        { label: 'Walk In', value: 'walk_in' },
        { label: 'OTA', value: 'ota' },
        { label: 'Corporate', value: 'corporate' },
        { label: 'Group', value: 'group' },
      ],
      defaultValue: 'direct',
      label: 'Booking Source',
    }),

    // Special requests
    specialRequests: text({
      ui: {
        displayMode: 'textarea',
        description: 'Guest special requests and notes',
      },
      label: 'Special Requests',
    }),

    // Internal notes
    internalNotes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Internal staff notes',
      },
      label: 'Internal Notes',
    }),

    // Relationships
    roomAssignments: relationship({
      ref: 'RoomAssignment.booking',
      many: true,
      ui: {
        displayMode: 'cards',
        cardFields: ['room', 'roomType', 'guestName', 'ratePerNight'],
        inlineCreate: { fields: ['room', 'roomType', 'guestName', 'ratePerNight', 'specialRequests'] },
        inlineEdit: { fields: ['room', 'roomType', 'guestName', 'ratePerNight', 'specialRequests'] },
      },
      label: 'Room Assignments',
    }),

    // Guest profile relationship
    guestProfile: relationship({
      ref: 'Guest.bookings',
      ui: {
        displayMode: 'select',
        labelField: 'email',
      },
      label: 'Guest Profile',
    }),

    // Legacy guest relationship (for backwards compatibility with User)
    guest: relationship({
      ref: 'User.bookings',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'User Account',
    }),

    // Payments relationship
    payments: relationship({
      ref: 'BookingPayment.booking',
      many: true,
      ui: {
        displayMode: 'cards',
        cardFields: ['paymentReference', 'amount', 'paymentType', 'status'],
        inlineCreate: { fields: ['paymentType', 'amount', 'paymentMethod', 'description'] },
        inlineEdit: { fields: ['paymentType', 'amount', 'paymentMethod', 'status', 'description'] },
      },
      label: 'Payments',
    }),
    paymentSessions: relationship({
      ref: 'BookingPaymentSession.booking',
      many: true,
      ui: {
        displayMode: 'count',
      },
      label: 'Payment Sessions',
    }),

    // Timestamps
    confirmedAt: timestamp({
      label: 'Confirmed At',
      ui: {
        description: 'When the booking was confirmed',
      },
    }),
    checkedInAt: timestamp({
      label: 'Checked In At',
      ui: {
        description: 'Actual check-in time',
      },
    }),
    checkedOutAt: timestamp({
      label: 'Checked Out At',
      ui: {
        description: 'Actual check-out time',
      },
    }),
    cancelledAt: timestamp({
      label: 'Cancelled At',
      ui: {
        description: 'When the booking was cancelled',
      },
    }),
    ...trackingFields,
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === 'update' && resolvedData.status) {
        const now = new Date().toISOString()
        // Auto-set timestamps based on status changes
        if (resolvedData.status === 'confirmed' && !item?.confirmedAt) {
          resolvedData.confirmedAt = now
        }
        if (resolvedData.status === 'checked_in' && !item?.checkedInAt) {
          resolvedData.checkedInAt = now
        }
        if (resolvedData.status === 'checked_out' && !item?.checkedOutAt) {
          resolvedData.checkedOutAt = now
        }
        if (resolvedData.status === 'cancelled' && !item?.cancelledAt) {
          resolvedData.cancelledAt = now
        }
      }
    },
  },
})
