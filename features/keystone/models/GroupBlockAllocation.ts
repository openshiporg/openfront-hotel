import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { integer, relationship, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { requiredRelationshipDb } from './requiredRelationship';
import { trackingFields } from './trackingFields';

export const GroupBlockAllocation = list({
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
    allocationKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    groupBlock: relationship({ ref: 'GroupBlock.allocations', db: requiredRelationshipDb }),
    roomType: relationship({ ref: 'RoomType', db: requiredRelationshipDb }),
    roomsHeld: integer({ validation: { isRequired: true, min: 1 } }),
    roomsPickedUp: integer({ validation: { isRequired: true, min: 0 } }),
    rateMinor: integer({ validation: { isRequired: true, min: 0 } }),
    currencyCode: text({ validation: { isRequired: true } }),
    bookings: relationship({ ref: 'Booking.groupBlockAllocation', many: true }),
    ...trackingFields,
  },
});
