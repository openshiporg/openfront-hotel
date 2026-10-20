import type { StayPriceSummary } from '@/lib/types';

export interface NightlyRate { date: string; amountMinor: number }

export interface StayQuote extends StayPriceSummary {
  roomTypeId:string; roomTypeName:string; ratePlanId:string;
  checkInDate:string; checkOutDate:string; numberOfGuests:number; quoteToken:string;
  /** null without a code; false when the code doesn't apply to this rate, so the price is the regular rate. */
  promoCodeApplied?: boolean | null;
  /** Room charge for each night, exactly as the signed quote priced it. */
  nightlyRates?: NightlyRate[];
}

export function selectDisplayedStayPrice(
  bookingId: string | null,
  currentQuote: StayQuote | null,
  bookedTerms: StayPriceSummary | null | undefined,
): StayPriceSummary | null {
  return bookingId ? bookedTerms ?? null : currentQuote;
}
