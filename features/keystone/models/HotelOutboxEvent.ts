import { list } from '@keystone-6/core';
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const HotelOutboxEvent = list({
  db: {
    extendPrismaSchema: model => model.replace(
      '\n}',
      [
        '\n  @@index([status, availableAt], map: "HotelOutboxEvent_dispatch_idx")',
        '  @@index([aggregateType, aggregateId], map: "HotelOutboxEvent_aggregate_idx")',
        '  @@index([propertyKey, status, availableAt], map: "HotelOutboxEvent_tenant_dispatch_idx")',
        '  @@index([propertyKey, status, leaseExpiresAt], map: "HotelOutboxEvent_lease_idx")',
        '}',
      ].join('\n')
    ),
  },
  access: {
    operation: {
      query: permissions.canManageAudit,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['createdAt', 'topic', 'aggregateId', 'status', 'attempts', 'availableAt'],
      initialSort: { field: 'createdAt', direction: 'DESC' },
    },
    itemView: { defaultFieldMode: 'read' },
  },
  fields: {
    eventKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    propertyKey: text({ validation: { isRequired: true } }),
    topic: text({ validation: { isRequired: true } }),
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true } }),
    payloadSnapshot: json({ defaultValue: {} }),
    status: select({
      type: 'string',
      validation: { isRequired: true },
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Failed', value: 'failed' },
        { label: 'Dead letter', value: 'dead_letter' },
      ],
    }),
    attempts: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    availableAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    deliveredAt: timestamp(),
    lastError: text(),
    leaseToken: text({ ui: { itemView: { fieldMode: 'read' } } }),
    leaseExpiresAt: timestamp({ ui: { itemView: { fieldMode: 'read' } } }),
    lastAttemptAt: timestamp({ ui: { itemView: { fieldMode: 'read' } } }),
    deadLetteredAt: timestamp({ ui: { itemView: { fieldMode: 'read' } } }),
    replayedFromEventKey: text({ ui: { itemView: { fieldMode: 'read' } } }),
    dispatchResultSnapshot: json({ defaultValue: {} }),
    maxAttempts: integer({ validation: { isRequired: true, min: 1 }, defaultValue: 5 }),
    attemptsEvidence: relationship({ ref: 'HotelOutboxAttempt.outbox', many: true }),
    ...trackingFields,
  },
});
