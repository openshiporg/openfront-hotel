import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  float,
  select,
  timestamp,
  relationship,
  json,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

// Generate a unique payment reference
function generatePaymentReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PAY-${timestamp}-${random}`
}

export const BookingPayment = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments,
    },
  },
  ui: {
    listView: {
      initialColumns: ['paymentReference', 'booking', 'amount', 'paymentType', 'status', 'createdAt'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Payment reference (auto-generated)
    paymentReference: text({
      isIndexed: 'unique',
      label: 'Payment Reference',
      ui: {
        description: 'Auto-generated payment reference number',
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
      hooks: {
        resolveInput({ operation, resolvedData }) {
          if (operation === 'create') {
            return generatePaymentReference()
          }
          return resolvedData.paymentReference
        },
      },
    }),

    // Payment type
    paymentType: select({
      type: 'string',
      options: [
        { label: 'Deposit', value: 'deposit' },
        { label: 'Balance', value: 'balance' },
        { label: 'Full Payment', value: 'full_payment' },
        { label: 'Additional Charge', value: 'additional_charge' },
        { label: 'Refund', value: 'refund' },
        { label: 'Incidental', value: 'incidental' },
      ],
      defaultValue: 'full_payment',
      validation: { isRequired: true },
      label: 'Payment Type',
      ui: {
        description: 'Type of payment transaction',
      },
    }),

    // Amount
    amount: float({
      validation: { isRequired: true },
      label: 'Amount',
      ui: {
        description: 'Payment amount (negative for refunds)',
      },
    }),

    // Currency
    currency: text({
      defaultValue: 'USD',
      validation: { isRequired: true },
      label: 'Currency',
      ui: {
        description: 'Currency code (e.g., USD, EUR)',
      },
    }),

    // Payment method
    paymentMethod: select({
      type: 'string',
      options: [
        { label: 'Credit Card', value: 'credit_card' },
        { label: 'Debit Card', value: 'debit_card' },
        { label: 'Cash', value: 'cash' },
        { label: 'Bank Transfer', value: 'bank_transfer' },
        { label: 'Check', value: 'check' },
        { label: 'PayPal', value: 'paypal' },
        { label: 'Apple Pay', value: 'apple_pay' },
        { label: 'Google Pay', value: 'google_pay' },
        { label: 'Other', value: 'other' },
      ],
      defaultValue: 'credit_card',
      validation: { isRequired: true },
      label: 'Payment Method',
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Refunded', value: 'refunded' },
      ],
      defaultValue: 'pending',
      label: 'Status',
      ui: {
        description: 'Current payment status',
      },
    }),

    // Provider-specific identifiers
    providerPaymentId: text({
      label: 'Provider Payment ID',
      ui: {
        description: 'Primary payment identifier returned by the payment provider',
        createView: { fieldMode: 'hidden' },
      },
    }),
    providerCaptureId: text({
      label: 'Provider Capture ID',
      ui: {
        description: 'Capture identifier returned by the payment provider',
        createView: { fieldMode: 'hidden' },
      },
    }),
    providerRefundId: text({
      label: 'Provider Refund ID',
      ui: {
        description: 'Refund identifier returned by the payment provider',
        createView: { fieldMode: 'hidden' },
      },
    }),
    providerData: json({
      label: 'Provider Data',
      defaultValue: {},
      ui: {
        description: 'Raw provider payload for reconciliation and debugging',
        createView: { fieldMode: 'hidden' },
      },
    }),
    stripePaymentIntentId: text({
      label: 'Stripe Payment Intent ID',
      ui: {
        description: 'Legacy Stripe payment intent ID for backwards compatibility',
        createView: { fieldMode: 'hidden' },
      },
    }),
    stripeChargeId: text({
      label: 'Stripe Charge ID',
      ui: {
        description: 'Legacy Stripe charge ID',
        createView: { fieldMode: 'hidden' },
      },
    }),
    stripeRefundId: text({
      label: 'Stripe Refund ID',
      ui: {
        description: 'Legacy Stripe refund ID for refund transactions',
        createView: { fieldMode: 'hidden' },
      },
    }),

    // Card details (masked)
    cardBrand: text({
      label: 'Card Brand',
      ui: {
        description: 'Card brand (Visa, Mastercard, etc.)',
        itemView: { fieldMode: 'read' },
      },
    }),
    cardLast4: text({
      label: 'Card Last 4',
      ui: {
        description: 'Last 4 digits of card number',
        itemView: { fieldMode: 'read' },
      },
    }),
    cardExpMonth: text({
      label: 'Card Exp Month',
      ui: {
        itemView: { fieldMode: 'read' },
      },
    }),
    cardExpYear: text({
      label: 'Card Exp Year',
      ui: {
        itemView: { fieldMode: 'read' },
      },
    }),

    // Receipt/invoice info
    receiptEmail: text({
      label: 'Receipt Email',
      ui: {
        description: 'Email address for receipt',
      },
    }),
    receiptUrl: text({
      label: 'Receipt URL',
      ui: {
        description: 'URL to Stripe receipt',
        itemView: { fieldMode: 'read' },
      },
    }),

    // Description/notes
    description: text({
      ui: {
        displayMode: 'textarea',
        description: 'Payment description or notes',
      },
      label: 'Description',
    }),

    // Internal notes
    internalNotes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Internal staff notes',
      },
      label: 'Internal Notes',
    }),

    // Failure reason
    failureReason: text({
      label: 'Failure Reason',
      ui: {
        description: 'Reason for payment failure',
        itemView: { fieldMode: 'read' },
      },
    }),

    // Relationships
    booking: relationship({
      ref: 'Booking.payments',
      ui: {
        displayMode: 'select',
        labelField: 'confirmationNumber',
      },
      label: 'Booking',
    }),
    paymentProvider: relationship({
      ref: 'PaymentProvider.bookingPayments',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Payment Provider',
    }),
    paymentSession: relationship({
      ref: 'BookingPaymentSession',
      ui: {
        displayMode: 'select',
        labelField: 'id',
      },
      label: 'Payment Session',
      db: {
        foreignKey: true,
      },
    }),

    // Processed by (staff member)
    processedBy: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Processed By',
    }),

    // Timestamps
    processedAt: timestamp({
      label: 'Processed At',
      ui: {
        description: 'When the payment was processed',
        itemView: { fieldMode: 'read' },
      },
    }),
    refundedAt: timestamp({
      label: 'Refunded At',
      ui: {
        description: 'When the payment was refunded',
        itemView: { fieldMode: 'read' },
      },
    }),
    ...trackingFields,
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === 'update' && resolvedData.status) {
        const now = new Date().toISOString()
        // Auto-set timestamps based on status changes
        if (resolvedData.status === 'completed' && !item?.processedAt) {
          resolvedData.processedAt = now
        }
        if (resolvedData.status === 'refunded' && !item?.refundedAt) {
          resolvedData.refundedAt = now
        }
      }
    },
  },
})
