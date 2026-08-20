import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { integer, text, timestamp } from '@keystone-6/core/fields';

/** Internal fixed-window counters. Never exposed through generated CRUD. */
export const HotelAbuseBucket = list({
  db: { extendPrismaSchema: model => model.replace('\n}', '\n  @@index([expiresAt], map: "HotelAbuseBucket_expiry_idx")\n}') },
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  ui: { isHidden: true, hideCreate: true, hideDelete: true },
  fields: {
    bucketKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    count: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    windowStartedAt: timestamp({ validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
  },
});
