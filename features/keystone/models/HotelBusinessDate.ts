import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const HotelBusinessDate = list({
  isSingleton: true,
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: 'read' } },
  fields: {
    propertyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    currentBusinessDate: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
