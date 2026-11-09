import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

/** Storefront contact-form inquiry. Read by the front desk in Guest Messages; nothing is sent. */
export const HotelContactMessage = list({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: 'read' }, listView: { initialColumns: ['receivedAt', 'guestName', 'subject'], initialSort: { field: 'receivedAt', direction: 'DESC' } } },
  fields: {
    reference: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    guestName: text({ validation: { isRequired: true } }),
    replyTo: text({ validation: { isRequired: true } }),
    phone: text({ defaultValue: '' }),
    subject: text({ validation: { isRequired: true } }),
    message: text({ validation: { isRequired: true }, ui: { displayMode: 'textarea' } }),
    receivedAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    ...trackingFields,
  },
});
