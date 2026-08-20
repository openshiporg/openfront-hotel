import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export interface PublicRatePlanRules {
  minimumStay?: number | null;
  maximumStay?: number | null;
  isPromotional?: boolean | null;
}

export function selectInitialPublicRatePlan<T extends { id: string; isPromotional?: boolean | null }>(
  plans: T[] | null | undefined,
  requestedId: string | null | undefined,
): T | undefined {
  return plans?.find((plan) => plan.id === requestedId)
    || plans?.find((plan) => !plan.isPromotional)
    || plans?.[0];
}

export function quotePreflightMessage(
  range: DateRange | undefined,
  plan: PublicRatePlanRules | null | undefined,
  promoCode: string,
): string | null {
  if (!range?.from || !range.to) return 'Choose arrival and departure dates before continuing to booking.';
  if (!plan) return 'Choose an available rate plan before continuing.';

  const nights = differenceInCalendarDays(range.to, range.from);
  if (nights < 1) return 'Departure must be after arrival.';
  const minimum = Math.max(1, Number(plan.minimumStay || 1));
  if (nights < minimum) return `This rate requires at least ${minimum} night${minimum === 1 ? '' : 's'}.`;
  const maximum = Number(plan.maximumStay || 0);
  if (maximum > 0 && nights > maximum) return `This rate allows at most ${maximum} nights.`;
  if (plan.isPromotional && !promoCode.trim()) return 'Enter the promotional code required for this rate.';
  return null;
}

export function safeQuoteFailureMessage(): string {
  return 'We could not price that stay. Check the dates, guest count, rate terms, and promotional code, then try again.';
}

export function safeGuestWorkflowFailure(action: 'lookup' | 'booking' | 'modification' | 'contact'): string {
  switch (action) {
    case 'lookup':
      return "We couldn't match those details. Check the confirmation number and email, then try again.";
    case 'booking':
      return 'This reservation link is invalid, expired, or no longer available to this guest session.';
    case 'modification':
      return 'We could not send that change request. Review the dates and message, then try again.';
    case 'contact':
      return 'Your message was not accepted. Please try again or contact the property by phone or email.';
  }
}

export function rangeFromDayClick(
  current: DateRange | undefined,
  selectedDay: Date,
): DateRange {
  if (!current?.from || current.to || selectedDay <= current.from) {
    return { from: selectedDay, to: undefined };
  }
  return { from: current.from, to: selectedDay };
}

export function modificationDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error('Use YYYY-MM-DD for requested stay dates.');
  const parsed = parseISO(trimmed);
  if (!isValid(parsed) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error('Use a valid calendar date for requested stay dates.');
  }
  return `${trimmed}T00:00:00.000Z`;
}
