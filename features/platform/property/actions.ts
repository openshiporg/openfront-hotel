'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  boundedEnum,
  boundedInteger,
  boundedText,
  requireActionData,
} from '@/features/platform/lib/actionResult';
import {
  STOREFRONT_ACCENT_PRESET_KEYS,
  type StorefrontAccentPreset,
} from '@/features/storefront/lib/storefront-theme';

const PROPERTY_SETTINGS = String.raw`
  query PropertySettings {
    hotelSettings {
      propertyName tagline contactEmail contactPhone addressLine1 addressLine2 frontDeskCopy
      securityDepositMinor depositPercent loyaltyEnabled loyaltyEarnMinorPerPoint loyaltyRedeemMinorPerPoint loyaltyMinimumRedemptionPoints prearrivalEmailEnabled prearrivalDays groupsEnabled refundApprovalThresholdMinor writeOffApprovalThresholdMinor cashVarianceApprovalThresholdMinor ratePublicationRequiresApproval
      timeZone checkInTime checkOutTime currencyCode taxRateBasisPoints serviceFeeMinor pricingVersion
      storefrontAccentPreset
      heroImagePath heroImageAltText heroImageCaption amenityImagePath amenityImageAltText
      amenityImageCaption locationImagePath locationImageAltText locationImageCaption
    }
  }
`;
const UPDATE_SETTINGS = String.raw`
  mutation($data:HotelPropertySettingsInput!,$key:String!){
    updateHotelPropertySettings(data:$data,idempotencyKey:$key){id propertyName contactEmail pricingVersion}
  }
`;

export async function getPropertySettingsWorkspace() {
  const response = await keystoneClient<any>(PROPERTY_SETTINGS);
  const settings = requireActionData(response).hotelSettings || null;
  return settings
    ? { state: 'configured' as const, settings }
    : { state: 'missing' as const, settings: null };
}

export async function updatePropertySettingsAction(input: Record<string, unknown>) {
  const data = {
    securityDepositMinor: boundedInteger(input.securityDepositMinor, "Security authorization amount", { min: 0, max: 2147483647 }),
    depositPercent: boundedInteger(input.depositPercent, "Booking deposit percentage", { min: 1, max: 100 }),
    loyaltyEnabled: input.loyaltyEnabled === "true",
    loyaltyEarnMinorPerPoint: boundedInteger(input.loyaltyEarnMinorPerPoint, "Loyalty configuration", { min: 1, max: 1000000 }),
    loyaltyRedeemMinorPerPoint: boundedInteger(input.loyaltyRedeemMinorPerPoint, "Loyalty configuration", { min: 1, max: 1000000 }),
    loyaltyMinimumRedemptionPoints: boundedInteger(input.loyaltyMinimumRedemptionPoints, "Loyalty configuration", { min: 1, max: 1000000 }),
    prearrivalEmailEnabled: input.prearrivalEmailEnabled === "true",
    prearrivalDays: boundedInteger(input.prearrivalDays, "Pre-arrival lead time", { min: 1, max: 14 }),
    groupsEnabled: input.groupsEnabled === "true",
    refundApprovalThresholdMinor: boundedInteger(input.refundApprovalThresholdMinor, "Refund approval threshold", { min: 0, max: 2147483647 }),
    writeOffApprovalThresholdMinor: boundedInteger(input.writeOffApprovalThresholdMinor, "Write-off approval threshold", { min: 0, max: 2147483647 }),
    cashVarianceApprovalThresholdMinor: boundedInteger(input.cashVarianceApprovalThresholdMinor, "Cash variance threshold", { min: 0, max: 2147483647 }),
    ratePublicationRequiresApproval: input.ratePublicationRequiresApproval !== "false",
    propertyName: boundedText(input.propertyName, 'Property name', 200, true),
    tagline: boundedText(input.tagline, 'Tagline', 300),
    contactEmail: boundedText(input.contactEmail, 'Contact email', 320, true).toLowerCase(),
    contactPhone: boundedText(input.contactPhone, 'Contact phone', 80, true),
    addressLine1: boundedText(input.addressLine1, 'Address line 1', 250, true),
    addressLine2: boundedText(input.addressLine2, 'Address line 2', 250),
    frontDeskCopy: boundedText(input.frontDeskCopy, 'Front desk copy', 250),
    timeZone: boundedText(input.timeZone, 'Property time zone', 100, true),
    checkInTime: boundedText(input.checkInTime, 'Check-in time', 20, true),
    checkOutTime: boundedText(input.checkOutTime, 'Check-out time', 20, true),
    currencyCode: boundedEnum(String(input.currencyCode || '').toUpperCase(), 'Currency', ['USD'] as const),
    taxRateBasisPoints: boundedInteger(input.taxRateBasisPoints, 'Tax rate', { min: 0, max: 10_000 }),
    serviceFeeMinor: boundedInteger(input.serviceFeeMinor, 'Service fee', { min: 0 }),
    storefrontAccentPreset: boundedEnum(
      input.storefrontAccentPreset,
      'Storefront accent preset',
      STOREFRONT_ACCENT_PRESET_KEYS,
    ) as StorefrontAccentPreset,
    heroImagePath: boundedText(input.heroImagePath, 'Hero image path', 500),
    heroImageAltText: boundedText(input.heroImageAltText, 'Hero image alt text', 300),
    heroImageCaption: boundedText(input.heroImageCaption, 'Hero image caption', 500),
    amenityImagePath: boundedText(input.amenityImagePath, 'Amenity image path', 500),
    amenityImageAltText: boundedText(input.amenityImageAltText, 'Amenity image alt text', 300),
    amenityImageCaption: boundedText(input.amenityImageCaption, 'Amenity image caption', 500),
    locationImagePath: boundedText(input.locationImagePath, 'Location image path', 500),
    locationImageAltText: boundedText(input.locationImageAltText, 'Location image alt text', 300),
    locationImageCaption: boundedText(input.locationImageCaption, 'Location image caption', 500),
  };
  const response = await keystoneClient<any>(UPDATE_SETTINGS, { data, key: randomUUID() });
  return requireActionData(response).updateHotelPropertySettings;
}
