import { list } from '@keystone-6/core';
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { requiredRelationshipDb } from './requiredRelationship';
import { trackingFields } from './trackingFields';

export const FolioEntry = list({
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
      initialColumns: ['folio', 'entryType', 'direction', 'amountMinor', 'currencyCode', 'serviceDate', 'postedAt'],
    },
    itemView: { defaultFieldMode: 'read' },
  },
  fields: {
    folio: relationship({
      ref: 'Folio.entries',
      db: { foreignKey: true, ...requiredRelationshipDb },
    }),
    postingKey: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    entryType: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Room charge', value: 'room_charge' },
        { label: 'Tax', value: 'tax' },
        { label: 'Fee', value: 'fee' },
        { label: 'Add-on', value: 'addon' },
        { label: 'Payment', value: 'payment' },
        { label: 'Refund', value: 'refund' },
        { label: 'Adjustment', value: 'adjustment' },
        { label: 'Transfer', value: 'transfer' },
        { label: 'Reversal', value: 'reversal' },
      ],
    }),
    direction: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Debit', value: 'debit' },
        { label: 'Credit', value: 'credit' },
      ],
    }),
    amountMinor: integer({
      validation: { isRequired: true, min: 1 },
      ui: { description: 'Positive amount in the currency minor unit.' },
    }),
    currencyCode: text({ validation: { isRequired: true } }),
    description: text({ validation: { isRequired: true } }),
    serviceDate: timestamp({ validation: { isRequired: true } }),
    postedAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    sourceType: select({
      type: 'string',
      validation: { isRequired: true },
      options: [
        { label: 'Reservation snapshot', value: 'reservation_snapshot' },
        { label: 'Payment', value: 'payment' },
        { label: 'Refund', value: 'refund' },
        { label: 'Operator', value: 'operator' },
        { label: 'Night audit', value: 'night_audit' },
        { label: 'System', value: 'system' },
      ],
    }),
    sourceId: text(),
    taxCategorySnapshot: text(),
    metadataSnapshot: json({ defaultValue: {} }),
    postedBy: relationship({
      ref: 'User',
      ui: { displayMode: 'select', labelField: 'name' },
    }),
    reverses: relationship({
      ref: 'FolioEntry.reversedBy',
      db: { foreignKey: true },
      ui: { displayMode: 'select', labelField: 'postingKey' },
    }),
    reversedBy: relationship({
      ref: 'FolioEntry.reverses',
      ui: { displayMode: 'select', labelField: 'postingKey' },
    }),
    ...trackingFields,
  },
});
