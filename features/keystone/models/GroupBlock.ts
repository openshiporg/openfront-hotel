import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const GroupBlock = list({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: 'read' } },
  fields: {
    blockCode: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    name: text({ validation: { isRequired: true } }),
    status: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Tentative', value: 'tentative' },
        { label: 'Definite', value: 'definite' },
        { label: 'Released', value: 'released' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    }),
    arrivalDate: timestamp({ validation: { isRequired: true } }),
    departureDate: timestamp({ validation: { isRequired: true } }),
    releaseDate: timestamp(),
    contactName: text({ validation: { isRequired: true } }),
    contactEmail: text({ validation: { isRequired: true } }),
    billingType: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Guest pays', value: 'guest_pays' },
        { label: 'Master folio', value: 'master_folio' },
        { label: 'Split', value: 'split' },
      ],
    }),
    allocations: relationship({ ref: 'GroupBlockAllocation.groupBlock', many: true }),
    bookings: relationship({ ref: 'Booking.groupBlock', many: true }),
    masterFolio: relationship({ ref: 'Folio.groupBlock', ui: { displayMode: 'select', labelField: 'folioNumber' } }),
    ...trackingFields,
  },
});
