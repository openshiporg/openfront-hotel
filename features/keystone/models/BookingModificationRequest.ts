import { list } from '@keystone-6/core';
import { json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { requiredRelationshipDb } from './requiredRelationship';
import { trackingFields } from './trackingFields';

export const BookingModificationRequest = list({
  db: {
    extendPrismaSchema: model => model.replace(
      '\n}',
      '\n  @@index([bookingId, status, createdAt], map: "BookingModificationRequest_booking_status_created_idx")\n}',
    ),
  },
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: { isHidden: true, hideCreate: true, hideDelete: true },
  fields: {
    requestKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    booking: relationship({ ref: 'Booking.modificationRequests', db: { foreignKey: true, ...requiredRelationshipDb } }),
    requestedCheckInDate: timestamp(),
    requestedCheckOutDate: timestamp(),
    guestMessage: text({ ui: { displayMode: 'textarea' } }),
    requestedByEmailHash: text({ validation: { isRequired: true } }),
    status: select({
      type: 'string', validation: { isRequired: true }, defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Declined', value: 'declined' },
      ],
    }),
    resolutionKey: text({ isIndexed: 'unique', db: { isNullable: true } }),
    resolutionRequestHash: text(),
    resolvedBy: relationship({ ref: 'User' }),
    resolvedAt: timestamp(),
    staffNote: text({ ui: { displayMode: 'textarea' } }),
    resultSnapshot: json({ defaultValue: {} }),
    ...trackingFields,
  },
});
