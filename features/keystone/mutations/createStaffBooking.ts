import { randomUUID } from 'node:crypto';

import { permissions } from '../access';
import { ensureBookingFolio } from '../lib/bookingFolio';
import { createGuestAccessToken, hashGuestAccessToken } from '../lib/guestBookingAccess';
import { ensureGuestProfile } from '../lib/guestProfiles';
import { assertHotelAvailability } from '../lib/hotelAvailability';
import { queueBookingCommunication } from '../lib/hotelCommunications';
import { calculateHotelPrice, type HotelPriceInput } from '../lib/hotelPricing';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { lockRoomInventory } from '../lib/inventoryLock';
import { ensureReservationSnapshots } from '../lib/reservationSnapshots';

const STAFF_SOURCES = new Set(['direct', 'phone', 'walk_in']);
const STAFF_CREATE_STATUSES = new Set(['pending', 'confirmed']);

export type StaffBookingInput = HotelPriceInput & {
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  specialRequests?: string | null;
  internalNotes?: string | null;
  source?: string | null;
  status?: string | null;
  idempotencyKey: string;
};

function bounded(value: unknown, label: string, max: number, required = true) {
  const normalized = String(value || '').trim();
  if ((required && !normalized) || normalized.length > max) {
    throw new Error(`${label} ${required ? 'is required and ' : ''}must be at most ${max} characters.`);
  }
  return normalized;
}

export default async function createStaffBooking(
  _root: unknown,
  { data }: { data: StaffBookingInput },
  context: any,
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to create staff reservations.');
  }
  const idempotencyKey = bounded(data.idempotencyKey, 'idempotencyKey', 200);
  const eventKey = `staff-booking:create:${idempotencyKey}`;
  const guestName = bounded(data.guestName, 'Guest name', 255);
  const guestEmail = bounded(data.guestEmail, 'Guest email', 320).toLowerCase();
  const guestPhone = bounded(data.guestPhone, 'Guest phone', 80, false);
  const specialRequests = bounded(data.specialRequests, 'Special requests', 2_000, false);
  const internalNotes = bounded(data.internalNotes, 'Internal notes', 4_000, false);
  const source = String(data.source || 'phone').trim();
  const status = String(data.status || 'confirmed').trim();
  if (!STAFF_SOURCES.has(source)) throw new Error('Staff reservation source must be direct, phone, or walk in.');
  if (!STAFF_CREATE_STATUSES.has(status)) throw new Error('Staff reservations must start pending or confirmed.');

  const request = {
    roomTypeId: data.roomTypeId,
    ratePlanId: data.ratePlanId,
    checkInDate: new Date(data.checkInDate).toISOString(),
    checkOutDate: new Date(data.checkOutDate).toISOString(),
    numberOfAdults: data.numberOfAdults,
    numberOfChildren: data.numberOfChildren || 0,
    promoCode: data.promoCode || null,
    guestName,
    guestEmail,
    guestPhone,
    specialRequests,
    internalNotes,
    source,
    status,
  };
  const identity = {
    request,
    aggregateType: 'booking',
    aggregateId: idempotencyKey,
    action: 'staff_created',
  };
  const guestAccessToken = createGuestAccessToken();

  const bookingId = await context.transaction(async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) {
      const replayId = String((replay.afterSnapshot as any)?.bookingId || '');
      if (!replayId) throw new Error('Staff reservation replay evidence is incomplete.');
      return replayId;
    }

    const checkIn = new Date(data.checkInDate);
    const checkOut = new Date(data.checkOutDate);
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    const quote = await calculateHotelPrice(tx, data);
    await assertHotelAvailability(tx, data);
    const guest = await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: guestPhone });
    const now = new Date();
    const created = await tx.prisma.booking.create({
      data: {
        confirmationNumber: `BK-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        guestName,
        guestEmail,
        guestPhone,
        guestProfileId: guest.id,
        checkInDate: quote.checkIn,
        checkOutDate: quote.checkOut,
        numberOfGuests: quote.numberOfGuests,
        numberOfAdults: quote.adults,
        numberOfChildren: quote.children,
        roomRateMinor: quote.roomSubtotalMinor,
        taxAmountMinor: quote.taxMinor,
        feesAmountMinor: quote.feesMinor,
        totalAmountMinor: quote.totalMinor,
        depositAmountMinor: 0,
        balanceDueMinor: quote.totalMinor,
        currencyCode: quote.currencyCode,
        roomRate: quote.roomSubtotalMinor / 100,
        taxAmount: quote.taxMinor / 100,
        feesAmount: quote.feesMinor / 100,
        totalAmount: quote.totalMinor / 100,
        depositAmount: 0,
        balanceDue: quote.totalMinor / 100,
        ratePlanId: quote.ratePlan.id,
        pricingVersion: quote.pricingVersion,
        pricingRevision: 1,
        pricingSnapshot: {
          snapshotKeyPrefix: 'v1',
          source: 'staff',
          ratePlanId: quote.ratePlan.id,
          ratePlanName: quote.ratePlan.name,
          cancellationPolicy: quote.ratePlan.cancellationPolicy,
          mealPlan: quote.ratePlan.mealPlan,
          taxRateBasisPoints: quote.taxRateBasisPoints,
          nightlyRates: quote.nightlyRates,
          roomSubtotalMinor: quote.roomSubtotalMinor,
          taxMinor: quote.taxMinor,
          feesMinor: quote.feesMinor,
          totalMinor: quote.totalMinor,
          currencyCode: quote.currencyCode,
        },
        status,
        paymentStatus: 'unpaid',
        source,
        holdExpiresAt: status === 'pending' ? new Date(now.getTime() + 2 * 60 * 60_000) : null,
        confirmedAt: status === 'confirmed' ? now : null,
        specialRequests,
        internalNotes,
        guestAccessTokenHash: hashGuestAccessToken(guestAccessToken),
        guestAccessTokenIssuedAt: now,
      },
    });
    const averageNightMinor = Math.round(quote.roomSubtotalMinor / quote.nightlyRates.length);
    await tx.prisma.roomAssignment.create({
      data: {
        bookingId: created.id,
        roomTypeId: quote.roomType.id,
        guestName,
        ratePerNightMinor: averageNightMinor,
        ratePerNight: averageNightMinor / 100,
        specialRequests,
      },
    });
    await ensureReservationSnapshots(tx, created.id);
    await ensureBookingFolio(tx, created.id);
    await recordHotelLifecycleEvent({
      prisma: tx.prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      afterSnapshot: {
        bookingId: created.id,
        confirmationNumber: created.confirmationNumber,
        status,
        source,
        totalAmountMinor: quote.totalMinor,
        currencyCode: quote.currencyCode,
      },
    });
    if (status === 'confirmed') {
      await queueBookingCommunication(tx.prisma, {
        bookingId: created.id,
        kind: 'booking_confirmation',
        eventKey: `booking:${created.id}:confirmation:v1`,
      });
    }
    return created.id;
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });

  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}
