import { list, graphql } from '@keystone-6/core';
import { checkbox, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipDb } from './requiredRelationship';

export const BookingPaymentSession = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['booking', 'paymentProvider', 'amount', 'isSelected', 'isInitiated', 'createdAt'],
    },
    itemView: { defaultFieldMode: 'read' },
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
      isIndexed: 'unique',
    }),
    booking: relationship({
      ref: 'Booking.paymentSessions',
      db: requiredRelationshipDb,
    }),
    paymentProvider: relationship({
      ref: 'PaymentProvider.bookingPaymentSessions',
      db: requiredRelationshipDb,
    }),
    payment: relationship({
      ref: 'BookingPayment.paymentSession',
      ui: {
        itemView: { fieldMode: 'read' },
        createView: { fieldMode: 'hidden' },
      },
    }),
    paymentAuthorizedAt: timestamp(),
    ...trackingFields,
  },
  hooks: {
    beforeOperation: async ({ operation, item, context }) => {
      if ((operation !== 'update' && operation !== 'delete') || !item?.id) return;
      const settledPayment = await context.prisma.bookingPayment.findUnique({
        where: { paymentSessionId: String(item.id) },
        select: { id: true },
      });
      if (settledPayment) {
        throw new Error('Settled payment sessions are immutable.');
      }
    },
  },
});
