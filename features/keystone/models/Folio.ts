import { list } from '@keystone-6/core';
import { relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { restrictRelation } from './requiredRelationship';
import { trackingFields } from './trackingFields';

export const Folio = list({
  db: {
    extendPrismaSchema: model => restrictRelation(
      restrictRelation(model, 'Folio_booking'),
      'Folio_groupBlock',
    ),
  },
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['folioNumber', 'booking', 'status', 'currencyCode', 'openedAt'],
    },
    itemView: { defaultFieldMode: 'read' },
  },
  fields: {
    folioNumber: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    booking: relationship({
      ref: 'Booking.folio',
      db: { foreignKey: true },
      ui: { displayMode: 'select', labelField: 'confirmationNumber' },
    }),
    groupBlock: relationship({
      ref: 'GroupBlock.masterFolio',
      db: { foreignKey: true },
      ui: { displayMode: 'select', labelField: 'name' },
    }),
    billedBookings: relationship({
      ref: 'Booking.billingFolio',
      many: true,
      ui: { displayMode: 'count' },
    }),
    status: select({
      type: 'string',
      validation: { isRequired: true },
      defaultValue: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
        { label: 'Voided', value: 'voided' },
      ],
    }),
    currencyCode: text({
      validation: { isRequired: true },
      defaultValue: 'USD',
    }),
    entries: relationship({
      ref: 'FolioEntry.folio',
      many: true,
      ui: { displayMode: 'cards', cardFields: ['entryType', 'direction', 'amountMinor', 'description', 'postedAt'] },
    }),
    openedAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    closedAt: timestamp(),
    ...trackingFields,
  },
});
