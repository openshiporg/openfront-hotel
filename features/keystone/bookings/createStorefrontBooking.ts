import { randomUUID, createHash } from 'node:crypto';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

import { createGuestAccessToken, hashGuestAccessToken, setGuestBookingAccess } from '../lib/guestBookingAccess';
import { ensureReservationSnapshots } from '../folios/reservationSnapshots';
import { lockRoomInventory } from '../inventory/roomNightLocks';
import { ensureBookingFolio } from '../folios/bookingFolio';
import { ensureGuestProfile } from '../lib/guestProfiles';
import { assertHotelAvailability, hotelStayDates } from '../inventory/roomAvailability';
import { calculateHotelPrice, issueHotelQuoteToken, verifyHotelQuoteToken, type HotelPriceInput } from '../rates/pricing';
import { enforceAbuseLimit } from '../lib/abuseControl';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { STOREFRONT_BOOKING_QUERY } from '../lib/storefrontBooking';

export type StorefrontBookingInput = HotelPriceInput & {
  idempotencyKey: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  specialRequests?: string | null;
  quoteToken?: string | null;
};

function required(value: string, label: string) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 255) throw new Error(`${label} is required.`);
  return normalized;
}

export async function getStorefrontBookingQuote(input: HotelPriceInput, context: any) {
  const quote = await calculateHotelPrice(context, input);
  await assertHotelAvailability(context, input);
  return { ...quote, quoteToken: issueHotelQuoteToken(quote) };
}

async function createStorefrontBooking(
  _root: unknown,
  { data }: { data: StorefrontBookingInput },
  context: any,
) {
  await enforceAbuseLimit(context, { scope: 'storefront-booking-create', identity: data.guestEmail, limit: 5, windowMs: 60 * 60_000 });
  const guestName = required(data.guestName, 'Guest name');
  const guestEmail = required(data.guestEmail, 'Guest email').toLowerCase();
  // Bound and normalize before building room-night locks, even for anonymous invalid requests.
  const { checkIn, checkOut } = hotelStayDates(data.checkInDate, data.checkOutDate);
  const guestAccessToken = createGuestAccessToken();

  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(String(data.idempotencyKey || ''))) throw new Error('A random stable booking attempt key is required.');
  const attemptId = createHash('sha256').update(data.idempotencyKey).digest('hex');
  const eventKey = `guest-booking:${attemptId}`;
  const { quoteToken: _quote, idempotencyKey: _key, ...request } = data;
  const identity = { request: { ...request, guestName, guestEmail }, aggregateType: 'booking_attempt', aggregateId: attemptId, action: 'created' };
  const booking = await runSerializableTransaction(context, async (tx: any) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await lockHotelBusinessDate(tx.prisma);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) {
      const id = replay.afterSnapshot?.bookingId;
      if (!id) throw new Error('Booking attempt recovery evidence is missing.');
      // The unguessable attempt capability and exact payload bind recovery; rotate guest proof after a lost response.
      await tx.prisma.booking.update({ where: { id }, data: { guestAccessTokenHash: hashGuestAccessToken(guestAccessToken), guestAccessTokenIssuedAt: new Date() } });
      return tx.sudo().query.Booking.findOne({ where: { id }, query: STOREFRONT_BOOKING_QUERY });
    }
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    const quote = await calculateHotelPrice(tx, data);
    verifyHotelQuoteToken(String(data.quoteToken || ''), quote);
    await assertHotelAvailability(tx, data);
    const guest = await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: data.guestPhone });
    const created = await tx.prisma.booking.create({
      data: {
        confirmationNumber: `BK-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        guestName, guestEmail, guestPhone: data.guestPhone?.trim() || '', guestProfileId: guest.id,
        checkInDate: quote.checkIn, checkOutDate: quote.checkOut,
        numberOfGuests: quote.numberOfGuests, numberOfAdults: quote.adults, numberOfChildren: quote.children,
        roomRateMinor: quote.roomSubtotalMinor, taxAmountMinor: quote.taxMinor, feesAmountMinor: quote.feesMinor,
        totalAmountMinor: quote.totalMinor, depositAmountMinor: 0, balanceDueMinor: quote.totalMinor,
        currencyCode: quote.currencyCode,
        roomRate: quote.roomSubtotalMinor / 100, taxAmount: quote.taxMinor / 100, feesAmount: quote.feesMinor / 100,
        totalAmount: quote.totalMinor / 100, depositAmount: 0, balanceDue: quote.totalMinor / 100,
        ratePlanId: quote.ratePlan.id, pricingVersion: quote.pricingVersion,
        pricingRevision: 1,
        pricingSnapshot: {
          securityDepositMinor: quote.securityDepositMinor, depositPercent: quote.depositPercent, arrivalInstant: quote.arrivalInstant, propertyTimeZone: quote.propertyTimeZone,
          snapshotKeyPrefix: 'v1',
          ratePlanId: quote.ratePlan.id, ratePlanName: quote.ratePlan.name,
          cancellationPolicy: quote.ratePlan.cancellationPolicy, mealPlan: quote.ratePlan.mealPlan,
          taxRateBasisPoints: quote.taxRateBasisPoints, nightlyRates: quote.nightlyRates,
          roomSubtotalMinor: quote.roomSubtotalMinor, taxMinor: quote.taxMinor,
          feesMinor: quote.feesMinor, totalMinor: quote.totalMinor, currencyCode: quote.currencyCode,
        },
        status: 'pending', paymentStatus: 'unpaid', source: 'website',
        holdExpiresAt: new Date(Date.now() + 30 * 60_000),
        specialRequests: data.specialRequests?.trim() || '',
        guestAccessTokenHash: hashGuestAccessToken(guestAccessToken), guestAccessTokenIssuedAt: new Date(),
      },
    });
    const averageNightMinor = Math.round(quote.roomSubtotalMinor / quote.nightlyRates.length);
    await tx.prisma.roomAssignment.create({
      data: {
        bookingId: created.id, roomTypeId: quote.roomType.id, guestName,
        ratePerNightMinor: averageNightMinor, ratePerNight: averageNightMinor / 100,
        specialRequests: data.specialRequests?.trim() || '',
      },
    });
    await ensureReservationSnapshots(tx, created.id);
    await ensureBookingFolio(tx, created.id);
    await recordHotelLifecycleEvent({ prisma: tx.prisma, eventKey, identity, afterSnapshot: { bookingId: created.id }, metadata: { source: 'website' } });
    return tx.sudo().query.Booking.findOne({
      where: { id: created.id },
      query: STOREFRONT_BOOKING_QUERY,
    });
  });
  setGuestBookingAccess(context, booking.id, guestAccessToken);
  return booking;
}

export default createStorefrontBooking;
