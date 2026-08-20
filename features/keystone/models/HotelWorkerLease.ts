import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { text, timestamp } from '@keystone-6/core/fields';

/** Internal cross-replica scheduler lease. */
export const HotelWorkerLease = list({
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  ui: { isHidden: true, hideCreate: true, hideDelete: true },
  fields: {
    leaseKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    ownerId: text({ validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
    heartbeatAt: timestamp({ validation: { isRequired: true } }),
  },
});
