import { list } from '@keystone-6/core';
import { integer, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const HotelSettings = list({
  isSingleton: true,
  graphql: {
    plural: 'hotelSettingsItems',
  },
  access: {
    operation: {
      query: permissions.canManageOnboarding,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['propertyName', 'contactEmail', 'contactPhone', 'updatedAt'],
    },
    itemView: { defaultFieldMode: 'read' },
  },
  fields: {
    propertyName: text({ validation: { isRequired: true } }),
    tagline: text(),
    contactEmail: text(),
    contactPhone: text(),
    addressLine1: text(),
    addressLine2: text(),
    frontDeskCopy: text(),
    checkInTime: text(),
    checkOutTime: text(),
    currencyCode: text({ validation: { isRequired: true }, defaultValue: 'USD' }),
    taxRateBasisPoints: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 1000 }),
    serviceFeeMinor: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    pricingVersion: text({ validation: { isRequired: true }, defaultValue: 'hotel-pricing-v2' }),
    storefrontAccentPreset: text({ validation: { isRequired: true }, defaultValue: 'brass' }),
    heroImagePath: text(),
    heroImageAltText: text(),
    heroImageCaption: text(),
    amenityImagePath: text(),
    amenityImageAltText: text(),
    amenityImageCaption: text(),
    locationImagePath: text(),
    locationImageAltText: text(),
    locationImageCaption: text(),
    ...trackingFields,
  },
});
