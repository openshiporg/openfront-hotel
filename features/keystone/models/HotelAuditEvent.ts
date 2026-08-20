import { list } from '@keystone-6/core';
import { json, relationship, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const HotelAuditEvent = list({
  db: {
    extendPrismaSchema: model => model.replace(
      '\n}',
      '\n  @@index([aggregateType, aggregateId, occurredAt], map: "HotelAuditEvent_aggregate_idx")\n}'
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
      initialColumns: ['occurredAt', 'aggregateType', 'aggregateId', 'action', 'actor'],
      initialSort: { field: 'occurredAt', direction: 'DESC' },
    },
    itemView: { defaultFieldMode: 'read' },
  },
  fields: {
    eventKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    propertyKey: text({ validation: { isRequired: true } }),
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true } }),
    action: text({ validation: { isRequired: true } }),
    actor: relationship({ ref: 'User', ui: { displayMode: 'select', labelField: 'email' } }),
    beforeSnapshot: json(),
    afterSnapshot: json(),
    metadataSnapshot: json({ defaultValue: {} }),
    occurredAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    ...trackingFields,
  },
});
