import { randomUUID } from 'node:crypto';

import { createGuestAccessToken, hashGuestAccessToken, setGuestBookingAccess } from '../lib/guestBookingAccess';
import { ensureReservationSnapshots } from '../lib/reservationSnapshots';
import { lockRoomInventory } from '../lib/inventoryLock';
import { ensureBookingFolio } from '../lib/bookingFolio';
import { ensureGuestProfile } from '../lib/guestProfiles';
import { assertHotelAvailability } from '../lib/hotelAvailability';
import { calculateHotelPrice, issueHotelQuoteToken, verifyHotelQuoteToken, type HotelPriceInput } from '../lib/hotelPricing';
import { enforceAbuseLimit } from '../lib/abuseControl';

export type StorefrontBookingInput = HotelPriceInput & {
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
  const checkIn = new Date(data.checkInDate); const checkOut = new Date(data.checkOutDate);
  const guestAccessToken = createGuestAccessToken();

  const booking = await context.transaction(async (tx: any) => {
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    const quote = await calculateHotelPrice(tx, data);
    await assertHotelAvailability(tx, data);
    verifyHotelQuoteToken(String(data.quoteToken || ''), quote);
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
    return tx.sudo().query.Booking.findOne({
      where: { id: created.id },
      query: `
        id confirmationNumber guestName guestEmail guestPhone checkInDate checkOutDate numberOfNights
        numberOfGuests numberOfAdults numberOfChildren roomRate taxAmount feesAmount totalAmount
        depositAmount balanceDue roomRateMinor taxAmountMinor feesAmountMinor totalAmountMinor
        depositAmountMinor balanceDueMinor currencyCode status paymentStatus specialRequests createdAt
        ratePlan { id name cancellationPolicy mealPlan }
        roomAssignments {
          id ratePerNight ratePerNightMinor guestName
          roomType { id name thumbnail roomImages(orderBy: { order: asc }) { id image { url } imagePath altText caption order isPrimary } }
          room { roomNumber }
        }
      `,
    });
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
  setGuestBookingAccess(context, booking.id, guestAccessToken);
  return booking;
}

export default createStorefrontBooking;
