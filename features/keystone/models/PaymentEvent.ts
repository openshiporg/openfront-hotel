import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

/** Append-only replay and settlement evidence written only by payment domain code. */
export const PaymentEvent = list({
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
    listView: {
      initialColumns: ['providerCode', 'eventType', 'status', 'processedAt'],
    },
    itemView: { defaultFieldMode: 'read' },
  },
  fields: {
    replayKey: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    providerCode: text({ validation: { isRequired: true } }),
    providerEventId: text({ validation: { isRequired: true } }),
    eventType: text({ validation: { isRequired: true } }),
    status: select({
      type: 'string',
      options: [
        { label: 'Processed', value: 'processed' },
        { label: 'Ignored', value: 'ignored' },
        { label: 'Failed', value: 'failed' },
      ],
      validation: { isRequired: true },
    }),
    payloadHash: text({ validation: { isRequired: true } }),
    processedAt: timestamp({ defaultValue: { kind: 'now' } }),
    evidence: json({ defaultValue: {} }),
    booking: relationship({ ref: 'Booking.paymentEvents' }),
    payment: relationship({ ref: 'BookingPayment.events' }),
    ...trackingFields,
  },
});
