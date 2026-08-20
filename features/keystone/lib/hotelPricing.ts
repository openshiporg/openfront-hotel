import { createHmac, timingSafeEqual } from 'node:crypto';
import { hotelStayDates } from './hotelAvailability';

const QUOTE_TTL_MS = 15 * 60_000;

function minor(value: unknown, legacy: unknown) {
  const direct = Number(value);
  if (Number.isSafeInteger(direct) && direct >= 0) return direct;
  const converted = Math.round(Number(legacy || 0) * 100);
  if (!Number.isSafeInteger(converted) || converted < 0) throw new Error('Invalid monetary configuration.');
  return converted;
}

function quoteSecret() {
  const value = process.env.HOTEL_QUOTE_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-hotel-quote-secret-at-least-32');
  if (value.length < 32) throw new Error('Hotel quote signing is not configured.');
  return value;
}

function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function signature(payload: string) { return createHmac('sha256', quoteSecret()).update(payload).digest('base64url'); }
function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type HotelPriceInput = {
  roomTypeId: string;
  ratePlanId: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfAdults: number;
  numberOfChildren?: number | null;
  promoCode?: string | null;
};

export async function calculateHotelPrice(context: any, input: HotelPriceInput) {
  const { checkIn, checkOut, days } = hotelStayDates(input.checkInDate, input.checkOutDate);
  const adults = Number(input.numberOfAdults); const children = Number(input.numberOfChildren || 0);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) throw new Error('Invalid guest count.');
  const [roomType, ratePlan, settings, seasonalRates] = await Promise.all([
    context.prisma.roomType.findUnique({ where: { id: input.roomTypeId } }),
    context.prisma.ratePlan.findUnique({ where: { id: input.ratePlanId } }),
    context.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
    context.prisma.seasonalRate.findMany({
      where: { roomTypeId: input.roomTypeId, isActive: true, startDate: { lt: checkOut }, endDate: { gte: checkIn } },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }], take: 100,
    }),
  ]);
  if (!roomType || !ratePlan || ratePlan.roomTypeId !== roomType.id || ratePlan.status !== 'active' || !ratePlan.isPublic) {
    throw new Error('Selected rate plan is not bookable.');
  }
  if (!settings) throw new Error('Hotel pricing settings are not configured.');
  if (adults + children > roomType.maxOccupancy) throw new Error(`${roomType.name} supports up to ${roomType.maxOccupancy} guests.`);
  if (days.length < Number(ratePlan.minimumStay || 1) || (ratePlan.maximumStay && days.length > ratePlan.maximumStay)) {
    throw new Error('Stay length does not satisfy the selected rate plan.');
  }
  const now = new Date(); const advanceDays = Math.floor((checkIn.getTime() - new Date(now.toISOString().slice(0, 10)).getTime()) / 86_400_000);
  if (advanceDays < Number(ratePlan.advanceBookingMin || 0) || (ratePlan.advanceBookingMax && advanceDays > ratePlan.advanceBookingMax)) {
    throw new Error('Booking window does not satisfy the selected rate plan.');
  }
  if ((ratePlan.validFrom && checkIn < ratePlan.validFrom) || (ratePlan.validTo && checkOut > ratePlan.validTo)) {
    throw new Error('Selected rate plan is not valid for the complete stay.');
  }
  const expectedPromo = String(ratePlan.promoCode || '').trim().toLowerCase();
  if (ratePlan.isPromotional && (!expectedPromo || String(input.promoCode || '').trim().toLowerCase() !== expectedPromo)) {
    throw new Error('A valid promotional code is required for this rate plan.');
  }
  const applicableDays = (ratePlan.applicableDays || {}) as Record<string, boolean>;
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  if (days.some(day => applicableDays[weekdays[day.getUTCDay()]] === false)) throw new Error('Selected rate plan is unavailable on one or more stay nights.');

  const baseRateMinor = minor(ratePlan.baseRateMinor, ratePlan.baseRate);
  const nightlyRates = days.map(day => {
    const season = seasonalRates.find((candidate: any) => candidate.startDate <= day && candidate.endDate >= day);
    let amount = baseRateMinor;
    if (season) {
      if (season.priceMultiplier !== null && season.priceMultiplier !== undefined) amount = Math.round(amount * Number(season.priceMultiplier));
      amount += Number(season.priceAdjustment || 0);
      if (days.length < Number(season.minimumStay || 1)) throw new Error(`Stay does not satisfy seasonal rule ${season.name}.`);
    }
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Seasonal pricing produced an invalid amount.');
    return { date: day.toISOString().slice(0, 10), amountMinor: amount, seasonalRateId: season?.id || null, seasonalRateName: season?.name || null };
  });
  const roomSubtotalMinor = nightlyRates.reduce((sum, night) => sum + night.amountMinor, 0);
  const taxRateBasisPoints = Number(settings.taxRateBasisPoints || 0);
  const taxMinor = Math.round(roomSubtotalMinor * taxRateBasisPoints / 10_000);
  const feesMinor = Number(settings.serviceFeeMinor || 0);
  const totalMinor = roomSubtotalMinor + taxMinor + feesMinor;
  const currencyCode = String(ratePlan.currencyCode || roomType.currencyCode || settings.currencyCode || 'USD').toUpperCase();
  if (new Set([ratePlan.currencyCode, roomType.currencyCode, settings.currencyCode].filter(Boolean).map((v: string) => v.toUpperCase())).size > 1) {
    throw new Error('Pricing currency configuration is inconsistent.');
  }
  return {
    roomType, ratePlan, settings, checkIn, checkOut, adults, children, numberOfGuests: adults + children,
    nightlyRates, roomSubtotalMinor, taxMinor, feesMinor, totalMinor, currencyCode,
    taxRateBasisPoints, pricingVersion: settings.pricingVersion || 'hotel-pricing-v2',
  };
}

export function issueHotelQuoteToken(quote: any) {
  const claims = {
    roomTypeId: quote.roomType.id, ratePlanId: quote.ratePlan.id,
    checkInDate: quote.checkIn.toISOString(), checkOutDate: quote.checkOut.toISOString(),
    adults: quote.adults, children: quote.children, roomSubtotalMinor: quote.roomSubtotalMinor,
    taxMinor: quote.taxMinor, feesMinor: quote.feesMinor, totalMinor: quote.totalMinor,
    currencyCode: quote.currencyCode, pricingVersion: quote.pricingVersion,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
  const payload = encode(claims);
  return `${payload}.${signature(payload)}`;
}

export function verifyHotelQuoteToken(token: string, quote: any) {
  const [payload, supplied] = String(token || '').split('.');
  if (!payload || !supplied || !safeEqual(signature(payload), supplied)) throw new Error('Quote identity is invalid.');
  let claims: any;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new Error('Quote identity is invalid.'); }
  const expected = {
    roomTypeId: quote.roomType.id, ratePlanId: quote.ratePlan.id,
    checkInDate: quote.checkIn.toISOString(), checkOutDate: quote.checkOut.toISOString(),
    adults: quote.adults, children: quote.children, roomSubtotalMinor: quote.roomSubtotalMinor,
    taxMinor: quote.taxMinor, feesMinor: quote.feesMinor, totalMinor: quote.totalMinor,
    currencyCode: quote.currencyCode, pricingVersion: quote.pricingVersion,
  };
  if (claims.expiresAt < Date.now() || Object.entries(expected).some(([key, value]) => claims[key] !== value)) {
    throw new Error('Quote is stale; request a current price before booking.');
  }
  return claims;
}
