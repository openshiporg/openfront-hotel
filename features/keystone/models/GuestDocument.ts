import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import {
  text,
  select,
  timestamp,
  checkbox,
  relationship,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { requiredRelationshipDb } from './requiredRelationship'

export const GuestDocument = list({
  access: {
    operation: {
      query: permissions.canManageGuestPrivacy,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['guest', 'documentType', 'documentNumber', 'issuingCountry', 'expiryDate', 'verified'],
    },
    itemView: {
      defaultFieldMode: 'read',
    },
    labelField: 'documentNumber',
  },
  fields: {
    // Guest relationship
    guest: relationship({
      ref: 'Guest',
      db: requiredRelationshipDb,
      ui: {
        displayMode: 'select',
        labelField: 'email',
      },
      label: 'Guest',
    }),

    // Document type
    documentType: select({
      type: 'string',
      options: [
        { label: 'Passport', value: 'passport' },
        { label: 'ID Card', value: 'id_card' },
        { label: "Driver's License", value: 'drivers_license' },
        { label: 'Other', value: 'other' },
      ],
      validation: { isRequired: true },
      label: 'Document Type',
      ui: {
        description: 'Type of identification document',
      },
    }),

    // Document details
    documentNumber: text({
      access: { read: denyAll },
      validation: { isRequired: true },
      label: 'Document Number',
      ui: {
        description: 'ID/Passport number',
      },
    }),

    issuingCountry: text({
      label: 'Issuing Country',
      ui: {
        description: 'Country that issued the document',
      },
    }),

    expiryDate: timestamp({
      label: 'Expiry Date',
      ui: {
        description: 'When the document expires',
      },
    }),

    // Document images (S3 URLs)
    frontImage: text({
      access: { read: denyAll },
      label: 'Front Image URL',
      ui: {
        description: 'S3 URL to front image of document',
      },
    }),

    backImage: text({
      access: { read: denyAll },
      label: 'Back Image URL',
      ui: {
        description: 'S3 URL to back image of document',
      },
    }),

    // Verification
    verified: checkbox({
      defaultValue: false,
      label: 'Verified',
      ui: {
        description: 'Whether document has been verified',
      },
    }),

    verifiedAt: timestamp({
      label: 'Verified At',
      ui: {
        description: 'When the document was verified',
        itemView: { fieldMode: 'read' },
      },
    }),

    verifiedBy: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'name',
        description: 'Staff member who verified the document',
      },
      label: 'Verified By',
    }),

    ...trackingFields,
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === 'update' && resolvedData.verified === true && !item?.verifiedAt) {
        resolvedData.verifiedAt = new Date().toISOString()
      }
    },
  },
})
