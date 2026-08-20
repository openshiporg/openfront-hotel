export type HotelCancellationPolicy =
  | 'flexible'
  | 'moderate'
  | 'strict'
  | 'non_refundable';

export type CancellationTerms = {
  policy: HotelCancellationPolicy;
  refundableMinor: number;
  cancellationFeeMinor: number;
  capturedMinor: number;
  summary: string;
  fullRefundDeadline: Date | null;
};

function safeMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer amount.`);
  }
  return value;
}

export function normalizeCancellationPolicy(value: unknown): HotelCancellationPolicy {
  const policy = String(value || '').trim().toLowerCase();
  if (policy === 'flexible' || policy === 'moderate' || policy === 'strict' || policy === 'non_refundable') {
    return policy;
  }
  // An absent legacy snapshot must fail conservatively rather than inventing a
  // full-refund promise that was never part of the booked terms.
  return 'non_refundable';
}

export function cancellationPolicyDescription(policyValue: unknown) {
  const policy = normalizeCancellationPolicy(policyValue);
  if (policy === 'flexible') {
    return 'Full refund until 48 hours before arrival; after that, the first night is retained.';
  }
  if (policy === 'moderate') {
    return 'Full refund until 7 days before arrival, 50% refund until 48 hours before arrival, then non-refundable.';
  }
  if (policy === 'strict') {
    return '50% refund until 14 days before arrival; after that, the stay is non-refundable.';
  }
  return 'This rate is non-refundable after booking.';
}

export function calculateCancellationTerms({
  policy: policyValue,
  checkInDate,
  cancelledAt = new Date(),
  capturedMinor,
  firstNightMinor,
  bookingTotalMinor = capturedMinor,
}: {
  policy: unknown;
  checkInDate: string | Date;
  cancelledAt?: string | Date;
  capturedMinor: number;
  firstNightMinor: number;
  bookingTotalMinor?: number;
}): CancellationTerms {
  const policy = normalizeCancellationPolicy(policyValue);
  const captured = safeMinor(capturedMinor, 'capturedMinor');
  const firstNight = safeMinor(firstNightMinor, 'firstNightMinor');
  const bookingTotal = safeMinor(bookingTotalMinor, 'bookingTotalMinor');
  const checkIn = new Date(checkInDate);
  const cancellation = new Date(cancelledAt);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(cancellation.getTime())) {
    throw new Error('Cancellation dates are invalid.');
  }

  const hoursBeforeArrival = (checkIn.getTime() - cancellation.getTime()) / 3_600_000;
  let cancellationFeeMinor = bookingTotal;
  let fullRefundDeadline: Date | null = null;

  if (policy === 'flexible') {
    fullRefundDeadline = new Date(checkIn.getTime() - 48 * 3_600_000);
    cancellationFeeMinor = hoursBeforeArrival >= 48 ? 0 : Math.min(bookingTotal, firstNight);
  } else if (policy === 'moderate') {
    fullRefundDeadline = new Date(checkIn.getTime() - 7 * 24 * 3_600_000);
    cancellationFeeMinor = hoursBeforeArrival >= 7 * 24
      ? 0
      : hoursBeforeArrival >= 48
        ? Math.ceil(bookingTotal / 2)
        : bookingTotal;
  } else if (policy === 'strict') {
    cancellationFeeMinor = hoursBeforeArrival >= 14 * 24 ? Math.ceil(bookingTotal / 2) : bookingTotal;
  }

  const refundableMinor = Math.max(0, captured - cancellationFeeMinor);
  return {
    policy,
    refundableMinor,
    cancellationFeeMinor,
    capturedMinor: captured,
    summary: cancellationPolicyDescription(policy),
    fullRefundDeadline,
  };
}
