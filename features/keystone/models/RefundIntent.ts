import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { requiredRelationshipDb } from './requiredRelationship';
import { trackingFields } from './trackingFields';

/** Durable provider-refund command. Provider I/O occurs only after this row commits. */
export const RefundIntent = list({
  db: {
    extendPrismaSchema: model => model.replace(
      '\n}',
      [
        '\n  @@index([status, availableAt], map: "RefundIntent_dispatch_idx")',
        '  @@index([bookingId, status], map: "RefundIntent_booking_status_idx")',
        '  @@index([sourcePaymentId, status], map: "RefundIntent_source_status_idx")',
        '}',
      ].join('\n'),
    ),
  },
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: 'read' },
    listView: { initialColumns: ['createdAt', 'booking', 'amountMinor', 'status', 'attempts'] },
  },
  fields: {
    intentKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    cancellationEventKey: text({ validation: { isRequired: true } }),
    propertyKey: text({ validation: { isRequired: true } }),
    booking: relationship({ ref: 'Booking.refundIntents', db: requiredRelationshipDb }),
    sourcePayment: relationship({ ref: 'BookingPayment.refundIntents', db: requiredRelationshipDb }),
    paymentProvider: relationship({ ref: 'PaymentProvider.refundIntents', db: requiredRelationshipDb }),
    amountMinor: integer({ validation: { isRequired: true, min: 1 } }),
    currencyCode: text({ validation: { isRequired: true } }),
    reason: text({ validation: { isRequired: true } }),
    actorId: text({ db: { isNullable: true } }),
    status: select({
      type: 'string', validation: { isRequired: true }, defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Failed', value: 'failed' },
        { label: 'Dead letter', value: 'dead_letter' },
      ],
    }),
    attempts: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    maxAttempts: integer({ validation: { isRequired: true, min: 1 }, defaultValue: 8 }),
    availableAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    leaseToken: text(),
    leaseExpiresAt: timestamp(),
    lastAttemptAt: timestamp(),
    completedAt: timestamp(),
    deadLetteredAt: timestamp(),
    providerRefundId: text({ isIndexed: 'unique', db: { isNullable: true } }),
    providerResultSnapshot: json({ defaultValue: {} }),
    lastError: text(),
    ...trackingFields,
  },
});
