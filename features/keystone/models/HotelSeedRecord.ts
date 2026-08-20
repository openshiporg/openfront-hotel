import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';

/** Stable identity map for convergent canonical/custom onboarding records. */
export const HotelSeedRecord = list({
  db: { extendPrismaSchema: model => model.replace('\n}', '\n  @@index([section, entityId], map: "HotelSeedRecord_entity_idx")\n}') },
  access: {
    operation: { query: permissions.canManageOnboarding, create: denyAll, update: denyAll, delete: denyAll },
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: 'read' } },
  fields: {
    seedKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    section: text({ validation: { isRequired: true } }),
    entityId: text({ validation: { isRequired: true } }),
    contentHash: text({ validation: { isRequired: true } }),
    seedVersion: text({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
