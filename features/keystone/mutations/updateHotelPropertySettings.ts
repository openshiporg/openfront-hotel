import { createHash } from 'node:crypto';

import { permissions } from '../access';
import { findHotelLifecycleReplay, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { haveHotelPricingInputsChanged } from '../lib/hotelPropertySettings';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { parseStorefrontAccentPreset } from '../../storefront/lib/storefront-theme';

function text(value: unknown, label: string, max: number, required = false) {
  const normalized = String(value || '').trim();
  if ((required && !normalized) || normalized.length > max) throw new Error(`${label} is invalid.`);
  return normalized;
}

function stayTime(value: unknown, label: string) {
  const normalized = text(value, label, 20, true);
  if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM))$/i.test(normalized)) {
    throw new Error(`${label} must use 24-hour HH:mm or h:mm AM/PM format.`);
  }
  return normalized;
}

function imagePath(value: unknown, label: string) {
  const normalized = text(value, label, 500);
  if (!normalized) return '';
  if (normalized.startsWith('/images/') && !normalized.includes('..') && !normalized.includes('\\')) return normalized;
  throw new Error(`${label} must be a canonical local /images/ path.`);
}

export default async function updateHotelPropertySettings(
  _root: unknown,
  { data, idempotencyKey }: { data: Record<string, unknown>; idempotencyKey: string },
  context: any,
) {
  if (!permissions.canManageOnboarding({ session: context.session })) throw new Error('Not authorized to configure the property.');
  const key = String(idempotencyKey || '').trim();
  if (!key || key.length > 180) throw new Error('A bounded idempotency key is required.');
  const eventKey = `hotel-settings:${key}`;
  const currencyCode = text(data.currencyCode, 'Currency code', 3, true).toUpperCase();
  if (currencyCode !== 'USD') throw new Error('The bounded initial release supports USD settlement only.');
  const taxRateBasisPoints = Number(data.taxRateBasisPoints);
  const serviceFeeMinor = Number(data.serviceFeeMinor);
  if (!Number.isSafeInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10_000) throw new Error('Tax rate basis points must be between 0 and 10000.');
  if (!Number.isSafeInteger(serviceFeeMinor) || serviceFeeMinor < 0) throw new Error('Service fee must be a non-negative integer amount.');
  const contactEmail = text(data.contactEmail, 'Contact email', 320, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Contact email is invalid.');
  const propertyName = text(data.propertyName, 'Property name', 200, true);
  if (/\b(?:grand hotel|openfront(?: hotel)?|acme|demo)\b/i.test(propertyName)) throw new Error('Property name must use the real public hotel brand.');
  const normalized = {
    propertyName,
    tagline: text(data.tagline, 'Tagline', 300),
    contactEmail,
    contactPhone: text(data.contactPhone, 'Contact phone', 80, true),
    addressLine1: text(data.addressLine1, 'Address line 1', 250, true),
    addressLine2: text(data.addressLine2, 'Address line 2', 250),
    frontDeskCopy: text(data.frontDeskCopy, 'Front desk copy', 250),
    checkInTime: stayTime(data.checkInTime, 'Check-in time'),
    checkOutTime: stayTime(data.checkOutTime, 'Check-out time'),
    currencyCode,
    taxRateBasisPoints,
    serviceFeeMinor,
    storefrontAccentPreset: parseStorefrontAccentPreset(data.storefrontAccentPreset),
    heroImagePath: imagePath(data.heroImagePath, 'Hero image path'),
    heroImageAltText: text(data.heroImageAltText, 'Hero image alt text', 300),
    heroImageCaption: text(data.heroImageCaption, 'Hero image caption', 500),
    amenityImagePath: imagePath(data.amenityImagePath, 'Amenity image path'),
    amenityImageAltText: text(data.amenityImageAltText, 'Amenity image alt text', 300),
    amenityImageCaption: text(data.amenityImageCaption, 'Amenity image caption', 500),
    locationImagePath: imagePath(data.locationImagePath, 'Location image path'),
    locationImageAltText: text(data.locationImageAltText, 'Location image alt text', 300),
    locationImageCaption: text(data.locationImageCaption, 'Location image caption', 500),
  };
  for (const [pathKey, altKey] of [['heroImagePath', 'heroImageAltText'], ['amenityImagePath', 'amenityImageAltText'], ['locationImagePath', 'locationImageAltText']] as const) {
    if (normalized[pathKey] && !normalized[altKey]) throw new Error(`${altKey} is required when ${pathKey} is set.`);
  }
  const identity = { request: normalized, aggregateType: 'hotel_settings', aggregateId: HOTEL_PROPERTY_KEY, action: 'updated' };
  await runSerializableTransaction(context, async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-settings:${HOTEL_PROPERTY_KEY}`);
    if (await findHotelLifecycleReplay(tx.prisma, eventKey, identity)) return;
    const [before, clock, nightAuditCount, bookingCount] = await Promise.all([
      tx.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
      tx.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
      tx.prisma.nightAuditRun.count(),
      tx.prisma.booking.count(),
    ]);
    const pricingChanged = haveHotelPricingInputsChanged(before, normalized);
    const pricingVersion = pricingChanged
      ? `hotel-pricing-${createHash('sha256').update(eventKey).digest('hex').slice(0, 16)}`
      : before.pricingVersion;
    const updated = await tx.prisma.hotelSettings.upsert({
      where: { id: 1 },
      create: { id: 1, pricingVersion, ...normalized },
      update: { ...normalized, pricingVersion },
    });
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    let businessDateAfter = clock?.currentBusinessDate || null;
    if (!clock && (nightAuditCount || bookingCount)) {
      throw new Error('Business date is missing for an operational property; restore it from audited evidence before setup.');
    }
    if (!clock) {
      await tx.prisma.hotelBusinessDate.create({ data: { id: 1, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: utcToday } });
      businessDateAfter = utcToday;
    } else if (!nightAuditCount && !bookingCount && clock.currentBusinessDate.getTime() !== utcToday.getTime()) {
      await tx.prisma.hotelBusinessDate.update({ where: { id: 1 }, data: { currentBusinessDate: utcToday } });
      businessDateAfter = utcToday;
    }
    await ensureDefaultPaymentProviders(tx);
    await tx.prisma.user.update({
      where: { id: context.session.itemId },
      data: { onboardingStatus: 'completed' },
    });
    await recordHotelLifecycleEvent({
      prisma: tx.prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: before && { propertyName: before.propertyName, contactEmail: before.contactEmail, currencyCode: before.currencyCode, taxRateBasisPoints: before.taxRateBasisPoints, serviceFeeMinor: before.serviceFeeMinor, storefrontAccentPreset: before.storefrontAccentPreset },
      afterSnapshot: { propertyName: updated.propertyName, contactEmail: updated.contactEmail, currencyCode: updated.currencyCode, taxRateBasisPoints: updated.taxRateBasisPoints, serviceFeeMinor: updated.serviceFeeMinor, storefrontAccentPreset: updated.storefrontAccentPreset, pricingVersion: updated.pricingVersion, businessDateBefore: clock?.currentBusinessDate || null, businessDateAfter },
    });
  });
  return context.prisma.hotelSettings.findUnique({ where: { id: 1 } });
}
