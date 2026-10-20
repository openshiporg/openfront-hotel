import {
  DEFAULT_STOREFRONT_ACCENT_PRESET,
  resolveStorefrontAccentPreset,
} from '../../storefront/lib/storefront-theme';
import { normalizeStoreLogoColor } from '../../platform/property/lib/store-logo';
import { sanitizeStoreLogoSvg } from '../utils/storeLogo';

const PUBLIC_HOTEL_SETTINGS_QUERY = `
  propertyName
  tagline
  contactEmail
  contactPhone
  addressLine1
  addressLine2
  frontDeskCopy
  checkInTime
  checkOutTime
  timeZone
  storefrontAccentPreset
  heroImagePath
  heroImageAltText
  heroImageCaption
  amenityImagePath
  amenityImageAltText
  amenityImageCaption
  locationImagePath
  locationImageAltText
  locationImageCaption
  logoIcon
  logoColor
`;

export default async function publicHotelSettings(
  _root: unknown,
  _args: unknown,
  context: any,
) {
  const settings = await context.sudo().query.HotelSettings.findOne({
    where: { id: '1' },
    query: PUBLIC_HOTEL_SETTINGS_QUERY,
  });

  if (!settings) {
    return {
      state: 'missing',
      accentPreset: DEFAULT_STOREFRONT_ACCENT_PRESET,
    };
  }

  const { storefrontAccentPreset, logoIcon, logoColor, ...publicSettings } = settings;
  return {
    state: 'configured',
    accentPreset: resolveStorefrontAccentPreset(storefrontAccentPreset).key,
    ...publicSettings,
    // Re-sanitize on the public boundary; an empty logo keeps the accent mark.
    logoIcon: logoIcon ? sanitizeStoreLogoSvg(logoIcon) || null : null,
    logoColor: normalizeStoreLogoColor(logoColor),
  };
}
