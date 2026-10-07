import { randomUUID } from 'node:crypto';

import { permissions } from '../access';
import { ensureBookingFolio } from '../folios/bookingFolio';
import { createGuestAccessToken, hashGuestAccessToken } from '../lib/guestBookingAccess';
import { ensureGuestProfile } from '../lib/guestProfiles';
import { assertHotelAvailability, hotelStayDates } from '../inventory/roomAvailability';
import { queueBookingCommunication } from '../communications/commands';
import { calculateHotelPrice, hotelQuoteCommercialTermsHash, verifyHotelQuoteToken, type HotelPriceInput } from '../rates/pricing';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { lockRoomInventory } from '../inventory/roomNightLocks';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { ensureReservationSnapshots } from '../folios/reservationSnapshots';
import { isRetryableTransactionError, runSerializableTransaction } from '../lib/serializableTransaction';

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
  quoteToken: string;
  idempotencyKey: string;
};

function requirePrismaResult<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

function isPrismaFailure(error: any) {
  return error?.extensions?.code === 'KS_PRISMA_ERROR' || /^P\d{4}$/.test(String(error?.code || ''));
}

async function runStaffBookingTransaction(context: any, operation: (tx: any) => Promise<string>) {
  try {
    return await runSerializableTransaction(context, operation, { maxWait: 5_000, timeout: 30_000 });
  } catch (error) {
    if (isRetryableTransactionError(error)) {
      throw new Error('Room inventory changed while creating this reservation. Refresh availability and retry.');
    }
    throw error;
  }
}

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

  const { checkIn, checkOut } = hotelStayDates(data.checkInDate, data.checkOutDate);
  const quoteToken = bounded(data.quoteToken, 'quoteToken', 4096);
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
    request: { ...request, quoteToken },
    aggregateType: 'booking',
    aggregateId: idempotencyKey,
    action: 'staff_created',
  };
  const guestAccessToken = createGuestAccessToken();
  let pinnedQuote: Awaited<ReturnType<typeof calculateHotelPrice>> | null = null;
  let pinnedQuoteHash: string | null = null;

  const bookingId = await runStaffBookingTransaction(context, async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await lockHotelBusinessDate(tx.prisma);
    const replay = requirePrismaResult(await findHotelLifecycleReplay(tx.prisma, eventKey, identity));
    if (replay) {
      const replayId = String((replay.afterSnapshot as any)?.bookingId || '');
      if (!replayId) throw new Error('Staff reservation replay evidence is incomplete.');
      return replayId;
    }

    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    let currentQuote: Awaited<ReturnType<typeof calculateHotelPrice>>;
    try {
      currentQuote = await calculateHotelPrice(tx, data);
    } catch (error) {
      if (pinnedQuote && !isPrismaFailure(error) && !isRetryableTransactionError(error)) {
        throw new Error('Rate changed while creating this reservation. Request a fresh rate and retry.');
      }
      throw error;
    }
    verifyHotelQuoteToken(quoteToken, currentQuote);
    const currentQuoteHash = hotelQuoteCommercialTermsHash(currentQuote);
    if (pinnedQuote) {
      if (!pinnedQuoteHash || currentQuoteHash !== pinnedQuoteHash) {
        throw new Error('Rate changed while creating this reservation. Request a fresh rate and retry.');
      }
    } else {
      pinnedQuote = currentQuote;
      pinnedQuoteHash = currentQuoteHash;
    }
    const quote = pinnedQuote;
    await assertHotelAvailability(tx, data);
    const guest = requirePrismaResult(await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: guestPhone }));
    const now = new Date();
    const created = requirePrismaResult(await tx.prisma.booking.create({
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
          securityDepositMinor: Number(quote.settings.securityDepositMinor || 0),
          depositPercent: Number(quote.settings.depositPercent ?? 100),
          arrivalInstant: quote.arrivalInstant, propertyTimeZone: quote.propertyTimeZone,
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
    }));
    const averageNightMinor = Math.round(quote.roomSubtotalMinor / quote.nightlyRates.length);
    requirePrismaResult(await tx.prisma.roomAssignment.create({
      data: {
        bookingId: created.id,
        roomTypeId: quote.roomType.id,
        guestName,
        ratePerNightMinor: averageNightMinor,
        ratePerNight: averageNightMinor / 100,
        specialRequests,
      },
    }));
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
  });

  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}
