import { cache } from 'react';

import { graphqlQuery } from '@/lib/graphql-client';
import {
  DEFAULT_STOREFRONT_ACCENT_PRESET,
  resolveStorefrontAccentPreset,
  type StorefrontAccentPreset,
} from './storefront-theme';

export type HotelSettingsState = 'configured' | 'missing' | 'unavailable';

export interface HotelIdentity {
  state: HotelSettingsState;
  name: string;
  tagline: string;
  address: {
    line1: string;
    line2: string;
  };
  phone: string;
  email: string;
  hours: string;
  checkIn: string;
  checkOut: string;
  accentPreset: StorefrontAccentPreset;
  media: {
    hero: HotelMedia;
    amenity: HotelMedia;
    location: HotelMedia;
  };
}

export interface HotelMedia {
  imagePath: string;
  altText: string;
  caption: string;
}

type SettingsRecord = Record<string, unknown>;

const BANNED_PUBLIC_BRANDS = /\b(?:grand hotel|openfront(?: hotel)?|acme|elite auto dealership|demo)\b/i;
const SAFE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_IMAGE_PATH = /^\/images\/(?!.*(?:\.\.|\\))/;

function neutralHotelIdentity(
  state: Exclude<HotelSettingsState, 'configured'>,
  accentPreset: StorefrontAccentPreset = DEFAULT_STOREFRONT_ACCENT_PRESET,
): HotelIdentity {
  return {
    state,
    name: 'Hotel',
    tagline: 'Direct reservations',
    address: { line1: '', line2: '' },
    phone: '',
    email: '',
    hours: '',
    checkIn: '3:00 PM',
    checkOut: '11:00 AM',
    accentPreset,
    media: {
      hero: {
        imagePath: '/images/rooms/hotel-lobby-hero.svg',
        altText: 'Hotel lobby and reception',
        caption: 'Hotel lobby',
      },
      amenity: {
        imagePath: '/images/rooms/amenities-spa.svg',
        altText: 'Hotel amenity',
        caption: 'Hotel amenities',
      },
      location: {
        imagePath: '/images/rooms/location-neighborhood.svg',
        altText: 'Hotel neighborhood',
        caption: 'Neighborhood guide',
      },
    },
  };
}

export const NEUTRAL_HOTEL_FALLBACK = neutralHotelIdentity('missing');

const PUBLIC_HOTEL_SETTINGS_QUERY = String.raw`
  query PublicHotelSettings {
    publicHotelSettings {
      state
      accentPreset
      propertyName
      tagline
      contactEmail
      contactPhone
      addressLine1
      addressLine2
      frontDeskCopy
      checkInTime
      checkOutTime
      heroImagePath
      heroImageAltText
      heroImageCaption
      amenityImagePath
      amenityImageAltText
      amenityImageCaption
      locationImagePath
      locationImageAltText
      locationImageCaption
    }
  }
`;

function firstString(record: SettingsRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function publicText(record: SettingsRecord, key: string, fallback: string) {
  const value = firstString(record, key);
  if (!value || BANNED_PUBLIC_BRANDS.test(value)) return fallback;
  return value;
}

function publicEmail(record: SettingsRecord, key: string, fallback: string) {
  const value = firstString(record, key);
  if (!value || !SAFE_EMAIL.test(value) || BANNED_PUBLIC_BRANDS.test(value)) return fallback;
  return value;
}

function imagePath(record: SettingsRecord, key: string, fallback: string) {
  const value = firstString(record, key);
  return value && SAFE_IMAGE_PATH.test(value) ? value : fallback;
}

export function normalizeHotelSettings(input: unknown): HotelIdentity {
  const record = input && typeof input === 'object' ? (input as SettingsRecord) : {};
  const accentPreset = resolveStorefrontAccentPreset(record.accentPreset).key;
  const explicitState = firstString(record, 'state');
  const hasSingleton = explicitState === 'configured' || (!explicitState && Boolean(firstString(record, 'propertyName')));

  if (!hasSingleton) return neutralHotelIdentity('missing', accentPreset);

  const neutral = neutralHotelIdentity('missing', accentPreset);
  const name = publicText(record, 'propertyName', neutral.name);

  return {
    state: 'configured',
    name,
    tagline: publicText(record, 'tagline', neutral.tagline),
    address: {
      line1: publicText(record, 'addressLine1', neutral.address.line1),
      line2: publicText(record, 'addressLine2', neutral.address.line2),
    },
    phone: publicText(record, 'contactPhone', neutral.phone),
    email: publicEmail(record, 'contactEmail', neutral.email),
    hours: publicText(record, 'frontDeskCopy', neutral.hours),
    checkIn: publicText(record, 'checkInTime', neutral.checkIn),
    checkOut: publicText(record, 'checkOutTime', neutral.checkOut),
    accentPreset,
    media: {
      hero: {
        imagePath: imagePath(record, 'heroImagePath', neutral.media.hero.imagePath),
        altText: publicText(record, 'heroImageAltText', `Lobby and reception at ${name}`),
        caption: publicText(record, 'heroImageCaption', `${name} lobby`),
      },
      amenity: {
        imagePath: imagePath(record, 'amenityImagePath', neutral.media.amenity.imagePath),
        altText: publicText(record, 'amenityImageAltText', `Amenities at ${name}`),
        caption: publicText(record, 'amenityImageCaption', `${name} amenities`),
      },
      location: {
        imagePath: imagePath(record, 'locationImagePath', neutral.media.location.imagePath),
        altText: publicText(record, 'locationImageAltText', `Neighborhood around ${name}`),
        caption: publicText(record, 'locationImageCaption', `${name} neighborhood`),
      },
    },
  };
}

export const getHotelSettings = cache(async function getHotelSettings(): Promise<HotelIdentity> {
  try {
    const response = await graphqlQuery<{ publicHotelSettings: SettingsRecord }>(
      PUBLIC_HOTEL_SETTINGS_QUERY,
    );
    return normalizeHotelSettings(response.publicHotelSettings);
  } catch {
    return neutralHotelIdentity('unavailable');
  }
});

export function calendarDomain(identity: HotelIdentity) {
  const domain = identity.email.split('@')[1];
  return domain && /^[a-z0-9.-]+$/i.test(domain) ? domain : 'reservations.invalid';
}
