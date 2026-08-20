import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { integer, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

/** Immutable evidence for one replay-safe property business-date close. */
export const NightAuditRun = list({
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
    listView: { initialColumns: ['businessDate', 'status', 'dueBookingCount', 'postedEntryCount', 'completedAt'] },
  },
  fields: {
    eventKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    propertyKey: text({ validation: { isRequired: true } }),
    businessDate: timestamp({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
      ],
    }),
    dueBookingCount: integer({ validation: { isRequired: true, min: 0 } }),
    postedEntryCount: integer({ validation: { isRequired: true, min: 0 } }),
    existingEntryCount: integer({ validation: { isRequired: true, min: 0 } }),
    exceptionCount: integer({ validation: { isRequired: true, min: 0 } }),
    debitMinor: integer({ validation: { isRequired: true, min: 0 } }),
    startedAt: timestamp({ validation: { isRequired: true } }),
    completedAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
