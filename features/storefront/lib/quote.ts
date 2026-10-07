import type { StayPriceSummary } from '@/lib/types';

export interface StayQuote extends StayPriceSummary {
  roomTypeId:string; roomTypeName:string; ratePlanId:string;
  checkInDate:string; checkOutDate:string; numberOfGuests:number; quoteToken:string;
}

export function selectDisplayedStayPrice(
  bookingId: string | null,
  currentQuote: StayQuote | null,
  bookedTerms: StayPriceSummary | null | undefined,
): StayPriceSummary | null {
  return bookingId ? bookedTerms ?? null : currentQuote;
}
