import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { json, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

/** Immutable receiver-side proof that an authenticated outbox payload was persisted. */
export const HotelOutboxReceipt = list({
  db: {
    extendPrismaSchema: model => model.replace(
      '\n}',
      [
        '\n  @@index([propertyKey, receivedAt], map: "HotelOutboxReceipt_tenant_idx")',
        '  @@index([topic, receivedAt], map: "HotelOutboxReceipt_topic_idx")',
        '}',
      ].join('\n')
    ),
  },
  access: {
    operation: {
      query: permissions.canManageAudit,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: 'read' },
    listView: { initialColumns: ['receivedAt', 'eventKey', 'topic', 'credentialKeyId'] },
  },
  fields: {
    eventKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    propertyKey: text({ validation: { isRequired: true } }),
    topic: text({ validation: { isRequired: true } }),
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true } }),
    credentialKeyId: text({ validation: { isRequired: true } }),
    bodyHash: text({ validation: { isRequired: true } }),
    payloadSnapshot: json({ defaultValue: {} }),
    receivedAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
