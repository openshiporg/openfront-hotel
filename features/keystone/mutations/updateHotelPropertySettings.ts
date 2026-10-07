import { createHash } from 'node:crypto';
import { lockHotelBusinessDate, validatePropertyTimeZone, propertyCalendarDate } from '../lib/hotelBusinessTime';
import { loadRoomOutages } from '../operations/roomOutages';

import { permissions } from '../access';
import { findHotelLifecycleReplay, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { haveHotelPricingInputsChanged } from '../lib/hotelPropertySettings';
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
    refundApprovalThresholdMinor: Number(data.refundApprovalThresholdMinor ?? 0),
    writeOffApprovalThresholdMinor: Number(data.writeOffApprovalThresholdMinor ?? 0),
    cashVarianceApprovalThresholdMinor: Number(data.cashVarianceApprovalThresholdMinor ?? 0),
    prearrivalEmailEnabled: data.prearrivalEmailEnabled === true,
    prearrivalDays: Number(data.prearrivalDays ?? 1),
    loyaltyEnabled: data.loyaltyEnabled === true,
    loyaltyEarnMinorPerPoint: Number(data.loyaltyEarnMinorPerPoint ?? 100),
    loyaltyRedeemMinorPerPoint: Number(data.loyaltyRedeemMinorPerPoint ?? 1),
    loyaltyMinimumRedemptionPoints: Number(data.loyaltyMinimumRedemptionPoints ?? 100),
    securityDepositMinor: Number(data.securityDepositMinor ?? 0),
    depositPercent: Number(data.depositPercent ?? 100),
    groupsEnabled: data.groupsEnabled === true,
    ratePublicationRequiresApproval: data.ratePublicationRequiresApproval !== false,
    propertyName,
    tagline: text(data.tagline, 'Tagline', 300),
    contactEmail,
    contactPhone: text(data.contactPhone, 'Contact phone', 80, true),
    addressLine1: text(data.addressLine1, 'Address line 1', 250, true),
    addressLine2: text(data.addressLine2, 'Address line 2', 250),
    frontDeskCopy: text(data.frontDeskCopy, 'Front desk copy', 250),
    timeZone: validatePropertyTimeZone(data.timeZone),
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
  for (const key of ['loyaltyEarnMinorPerPoint', 'loyaltyRedeemMinorPerPoint', 'loyaltyMinimumRedemptionPoints'] as const) if (!Number.isInteger(normalized[key]) || normalized[key] < 1 || normalized[key] > 1000000) throw new Error('Loyalty amounts must be whole units between 1 and 1000000.');
  if (!Number.isInteger(normalized.depositPercent) || normalized.depositPercent < 1 || normalized.depositPercent > 100) throw new Error('Deposit percentage must be 1–100.');
  if (!Number.isInteger(normalized.prearrivalDays) || normalized.prearrivalDays < 1 || normalized.prearrivalDays > 14) throw new Error('Pre-arrival lead time must be 1–14 days.');
  for (const field of ['refundApprovalThresholdMinor', 'writeOffApprovalThresholdMinor', 'cashVarianceApprovalThresholdMinor', 'securityDepositMinor'] as const) { if (!Number.isInteger(normalized[field]) || normalized[field] < 0 || normalized[field] > 2_147_483_647) throw new Error('Approval thresholds must be non-negative 32-bit minor amounts.'); }
  for (const [pathKey, altKey] of [['heroImagePath', 'heroImageAltText'], ['amenityImagePath', 'amenityImageAltText'], ['locationImagePath', 'locationImageAltText']] as const) {
    if (normalized[pathKey] && !normalized[altKey]) throw new Error(`${altKey} is required when ${pathKey} is set.`);
  }
  const identity = { request: normalized, aggregateType: 'hotel_settings', aggregateId: HOTEL_PROPERTY_KEY, action: 'updated' };
  await context.transaction(async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-settings:${HOTEL_PROPERTY_KEY}`);
    if (await findHotelLifecycleReplay(tx.prisma, eventKey, identity)) return;
    // Every booking creator and night audit takes this lock. READ COMMITTED gives the checks
    // a fresh snapshot after a wait, so committed writers cannot hide behind a stale SSI snapshot.
    await lockHotelBusinessDate(tx.prisma);
    const [before, clock, nightAuditCount, bookingCount] = await Promise.all([
      tx.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
      tx.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
      tx.prisma.nightAuditRun.count(),
      tx.prisma.booking.count(),
    ]);
    const policyFields = ['refundApprovalThresholdMinor', 'writeOffApprovalThresholdMinor', 'cashVarianceApprovalThresholdMinor', 'ratePublicationRequiresApproval', 'groupsEnabled', 'securityDepositMinor', 'depositPercent', 'loyaltyEnabled', 'loyaltyEarnMinorPerPoint', 'loyaltyRedeemMinorPerPoint', 'loyaltyMinimumRedemptionPoints'] as const;
    if (before && policyFields.some(field => (before[field] ?? (field === 'groupsEnabled' ? false : field === 'ratePublicationRequiresApproval' ? true : 0)) !== normalized[field]) && !permissions.canManageRoles({ session: context.session })) {
      throw new Error('Changing approval or group capability policy requires role administration permission.');
    }
    // The shared business-date lock serializes supported writers. Preserve dated inventory,
    // rate calendars, open housekeeping/scheduled maintenance, outages and stay/accounting state.
    if ((before?.timeZone ?? 'UTC') !== normalized.timeZone) {
      // Keystone's generic rate-list mutations do not take the property advisory lock.
      // Table locks make their committed dated rows visible before this boundary decision.
      await tx.prisma.$executeRawUnsafe('LOCK TABLE "HousekeepingTask", "RoomInventory", "SeasonalRate", "RatePlan", "MaintenanceRequest" IN SHARE MODE');
      const [folio, folioEntry, groupBlock, channelReservation, openHousekeepingTask, roomInventory, seasonalRate, datedRatePlan, scheduledMaintenance] = await Promise.all([
        tx.prisma.folio.findFirst({ select: { id: true } }),
        tx.prisma.folioEntry.findFirst({ select: { id: true } }),
        tx.prisma.groupBlock.findFirst({ select: { id: true } }),
        tx.prisma.channelReservation.findFirst({ select: { id: true } }),
        tx.prisma.housekeepingTask.findFirst({ where: { status: { not: 'completed' } }, select: { id: true } }),
        tx.prisma.roomInventory.findFirst({ select: { id: true } }),
        tx.prisma.seasonalRate.findFirst({ select: { id: true } }),
        tx.prisma.ratePlan.findFirst({ where: { OR: [{ validFrom: { not: null } }, { validTo: { not: null } }] }, select: { id: true } }),
        tx.prisma.maintenanceRequest.findFirst({ where: { scheduledFor: { not: null }, status: { notIn: ['completed', 'verified', 'cancelled'] } }, select: { id: true } }),
      ]);
      const scheduledRoomOutage = (await loadRoomOutages(tx.prisma)).some(outage => outage.status === 'scheduled');
      if (bookingCount || nightAuditCount || folio || folioEntry || groupBlock || channelReservation || openHousekeepingTask || roomInventory || seasonalRate || datedRatePlan || scheduledMaintenance || scheduledRoomOutage) {
        throw new Error('Property time zone cannot change after hotel operations begin; an explicit time-zone migration workflow is required.');
      }
    }
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
    const propertyToday = propertyCalendarDate(today, normalized.timeZone);
    let businessDateAfter = clock?.currentBusinessDate || null;
    if (!clock && (nightAuditCount || bookingCount)) {
      throw new Error('Business date is missing for an operational property; restore it from audited evidence before setup.');
    }
    if (!clock) {
      await tx.prisma.hotelBusinessDate.create({ data: { id: 1, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: propertyToday } });
      businessDateAfter = propertyToday;
    } else if ((!before || (before.timeZone ?? 'UTC') !== normalized.timeZone) && !nightAuditCount && !bookingCount && clock.currentBusinessDate.getTime() !== propertyToday.getTime()) {
      // Initial setup and a pre-operational time-zone correction finalize the migration's provisional UTC seed in the property's calendar.
      const aligned = await tx.prisma.hotelBusinessDate.updateMany({
        where: { id: clock.id, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: clock.currentBusinessDate },
        data: { currentBusinessDate: propertyToday },
      });
      if (aligned.count !== 1) throw new Error('Initial property business date changed while settings were being saved.');
      businessDateAfter = propertyToday;
    }
    // After initial property configuration, only a completed night audit may advance the domain date.
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
      beforeSnapshot: before && { securityDepositMinor: before.securityDepositMinor, depositPercent: before.depositPercent, loyaltyEnabled: before.loyaltyEnabled, loyaltyEarnMinorPerPoint: before.loyaltyEarnMinorPerPoint, loyaltyRedeemMinorPerPoint: before.loyaltyRedeemMinorPerPoint, loyaltyMinimumRedemptionPoints: before.loyaltyMinimumRedemptionPoints, prearrivalEmailEnabled: before.prearrivalEmailEnabled, prearrivalDays: before.prearrivalDays, groupsEnabled: before.groupsEnabled, refundApprovalThresholdMinor: before.refundApprovalThresholdMinor, writeOffApprovalThresholdMinor: before.writeOffApprovalThresholdMinor, cashVarianceApprovalThresholdMinor: before.cashVarianceApprovalThresholdMinor, ratePublicationRequiresApproval: before.ratePublicationRequiresApproval, propertyName: before.propertyName, contactEmail: before.contactEmail, timeZone: before.timeZone, currencyCode: before.currencyCode, taxRateBasisPoints: before.taxRateBasisPoints, serviceFeeMinor: before.serviceFeeMinor, storefrontAccentPreset: before.storefrontAccentPreset },
      afterSnapshot: { securityDepositMinor: updated.securityDepositMinor, depositPercent: updated.depositPercent, loyaltyEnabled: updated.loyaltyEnabled, loyaltyEarnMinorPerPoint: updated.loyaltyEarnMinorPerPoint, loyaltyRedeemMinorPerPoint: updated.loyaltyRedeemMinorPerPoint, loyaltyMinimumRedemptionPoints: updated.loyaltyMinimumRedemptionPoints, prearrivalEmailEnabled: updated.prearrivalEmailEnabled, prearrivalDays: updated.prearrivalDays, groupsEnabled: updated.groupsEnabled, refundApprovalThresholdMinor: updated.refundApprovalThresholdMinor, writeOffApprovalThresholdMinor: updated.writeOffApprovalThresholdMinor, cashVarianceApprovalThresholdMinor: updated.cashVarianceApprovalThresholdMinor, ratePublicationRequiresApproval: updated.ratePublicationRequiresApproval, propertyName: updated.propertyName, contactEmail: updated.contactEmail, timeZone: updated.timeZone, currencyCode: updated.currencyCode, taxRateBasisPoints: updated.taxRateBasisPoints, serviceFeeMinor: updated.serviceFeeMinor, storefrontAccentPreset: updated.storefrontAccentPreset, pricingVersion: updated.pricingVersion, businessDateBefore: clock?.currentBusinessDate || null, businessDateAfter },
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'ReadCommitted' });
  return context.prisma.hotelSettings.findUnique({ where: { id: 1 } });
}
