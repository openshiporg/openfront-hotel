import { list, graphql } from '@keystone-6/core';
import { checkbox, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const BookingPaymentSession = list({
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
      initialColumns: ['booking', 'paymentProvider', 'amount', 'isSelected', 'isInitiated', 'createdAt'],
    },
  },
  fields: {
    isSelected: checkbox({
      defaultValue: false,
    }),
    isInitiated: checkbox({
      defaultValue: false,
    }),
    amount: integer({
      validation: { isRequired: true },
      label: 'Amount (cents)',
    }),
    formattedAmount: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item: any) {
          const amount = Number(item.amount || 0) / 100;
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(amount);
        },
      }),
    }),
    data: json({
      defaultValue: {},
    }),
    idempotencyKey: text({
      isIndexed: true,
    }),
    booking: relationship({
      ref: 'Booking.paymentSessions',
    }),
    paymentProvider: relationship({
      ref: 'PaymentProvider.bookingPaymentSessions',
    }),
    paymentAuthorizedAt: timestamp(),
    ...trackingFields,
  },
});
