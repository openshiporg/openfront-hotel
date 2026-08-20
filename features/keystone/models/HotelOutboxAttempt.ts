import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { requiredRelationshipDb } from './requiredRelationship';
import { trackingFields } from './trackingFields';

/** Immutable delivery-attempt evidence for the transactional hotel outbox. */
export const HotelOutboxAttempt = list({
  db: {
    extendPrismaSchema: model => model.replace(
      '\n}',
      [
        '\n  @@unique([outboxId, attemptNumber], map: "HotelOutboxAttempt_outbox_attempt_key")',
        '  @@index([propertyKey, startedAt], map: "HotelOutboxAttempt_tenant_idx")',
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
    listView: { initialColumns: ['startedAt', 'outbox', 'attemptNumber', 'status', 'workerId'] },
  },
  fields: {
    outbox: relationship({ ref: 'HotelOutboxEvent.attemptsEvidence', db: requiredRelationshipDb }),
    propertyKey: text({ validation: { isRequired: true } }),
    attemptNumber: integer({ validation: { isRequired: true, min: 1 } }),
    workerId: text({ validation: { isRequired: true } }),
    status: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Failed', value: 'failed' },
      ],
    }),
    errorMessage: text(),
    responseSnapshot: json({ defaultValue: {} }),
    startedAt: timestamp({ validation: { isRequired: true } }),
    finishedAt: timestamp(),
    ...trackingFields,
  },
});
