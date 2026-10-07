import { list } from '@keystone-6/core';
import { checkbox, integer, text } from '@keystone-6/core/fields';

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
    refundApprovalThresholdMinor: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    writeOffApprovalThresholdMinor: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    cashVarianceApprovalThresholdMinor: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    prearrivalEmailEnabled: checkbox({ defaultValue: false }),
    prearrivalDays: integer({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 14 } }),
    loyaltyEnabled: checkbox({ defaultValue: false }),
    loyaltyEarnMinorPerPoint: integer({ defaultValue: 100, validation: { isRequired: true, min: 1, max: 1000000 } }),
    loyaltyRedeemMinorPerPoint: integer({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 1000000 } }),
    loyaltyMinimumRedemptionPoints: integer({ defaultValue: 100, validation: { isRequired: true, min: 1, max: 1000000 } }),
    securityDepositMinor: integer({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 2147483647 } }),
    depositPercent: integer({ defaultValue: 100, validation: { isRequired: true, min: 1, max: 100 } }),
    groupsEnabled: checkbox({ defaultValue: false }),
    ratePublicationRequiresApproval: checkbox({ defaultValue: true }),
    timeZone: text({ validation: { isRequired: true }, defaultValue: 'UTC' }),
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
