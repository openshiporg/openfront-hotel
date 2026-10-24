import { getStorefrontBookingQuote } from '../bookings/createStorefrontBooking';
import { GraphQLError } from 'graphql';
import { enforceAbuseLimit } from '../lib/abuseControl';
import { isGuestRuleError } from '../lib/guestRuleError';

async function storefrontQuote(
  _root: unknown,
  args: {
    roomTypeId: string; ratePlanId: string; checkInDate: string; checkOutDate: string;
    numberOfAdults: number; numberOfChildren?: number; promoCode?: string | null;
  },
  context: any,
) {
  await enforceAbuseLimit(context, { scope: 'storefront-quote', identity: args.roomTypeId, limit: 60, windowMs: 60_000 });
  let quote: Awaited<ReturnType<typeof getStorefrontBookingQuote>>;
  try {
    quote = await getStorefrontBookingQuote(args, context);
  } catch (error) {
    // Rate rules a guest can act on are returned as-is; everything else stays masked.
    if (isGuestRuleError(error)) throw new GraphQLError(error.message, { extensions: { code: 'HOTEL_BOOKING_RULE' } });
    throw error;
  }
  return {
    roomTypeId: quote.roomType.id,
    roomTypeName: quote.roomType.name,
    ratePlanId: quote.ratePlan.id,
    ratePlanName: quote.ratePlan.name,
    cancellationPolicy: quote.ratePlan.cancellationPolicy,
    mealPlan: quote.ratePlan.mealPlan,
    checkInDate: quote.checkIn,
    checkOutDate: quote.checkOut,
    nights: quote.nightlyRates.length,
    numberOfGuests: quote.numberOfGuests,
    ratePerNight: quote.nightlyRates.length ? quote.roomSubtotalMinor / quote.nightlyRates.length / 100 : 0,
    roomSubtotal: quote.roomSubtotalMinor / 100,
    taxAmount: quote.taxMinor / 100,
    feesAmount: quote.feesMinor / 100,
    totalAmount: quote.totalMinor / 100,
    roomSubtotalMinor: quote.roomSubtotalMinor,
    taxAmountMinor: quote.taxMinor,
    feesAmountMinor: quote.feesMinor,
    totalAmountMinor: quote.totalMinor,
    currencyCode: quote.currencyCode,
    securityDepositMinor: quote.securityDepositMinor,
    depositPercent: quote.depositPercent,
    pricingVersion: quote.pricingVersion,
    quoteToken: quote.quoteToken,
    // A code only changes promotional rates; say so instead of silently ignoring it.
    promoCodeApplied: String(args.promoCode || '').trim() ? Boolean(quote.ratePlan.isPromotional) : null,
    // Same nights the signed quote binds; seasonal rule names stay internal.
    nightlyRates: quote.nightlyRates.map(({ date, amountMinor }: { date: string; amountMinor: number }) => ({ date, amountMinor })),
  };
}

export default storefrontQuote;
