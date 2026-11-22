import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { integer, relationship, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { requiredRelationshipDb, requiredRelationshipHooks } from './requiredRelationship';
import { trackingFields } from './trackingFields';
import { canFilterBookings, canFilterRooms } from '../access'

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
    groupBlock: relationship({ isFilterable: canFilterBookings, ref: 'GroupBlock.allocations', db: requiredRelationshipDb, hooks: requiredRelationshipHooks }),
    roomType: relationship({ isFilterable: canFilterRooms, ref: 'RoomType', db: requiredRelationshipDb, hooks: requiredRelationshipHooks }),
    roomsHeld: integer({ validation: { isRequired: true, min: 1 } }),
    roomsPickedUp: integer({ validation: { isRequired: true, min: 0 } }),
    rateMinor: integer({ validation: { isRequired: true, min: 0 } }),
    currencyCode: text({ validation: { isRequired: true } }),
    bookings: relationship({ isFilterable: canFilterBookings, ref: 'Booking.groupBlockAllocation', many: true }),
    ...trackingFields,
  },
});
