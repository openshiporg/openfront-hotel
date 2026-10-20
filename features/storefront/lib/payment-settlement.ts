import { graphqlClient, graphqlSettlementClient } from '@/lib/graphql-client';
import { COMPLETE_BOOKING_PAYMENT, GET_GUEST_BOOKING } from '@/lib/queries';

const RECHECK_DELAYS_MS = [1_500, 3_000, 5_000, 8_000, 12_000];

type ReservationPaymentState = { status: string; paymentStatus?: string | null; balanceDueMinor?: number | null };

/** The reservation shows this payment once its balance drops, it is paid, or it reached a final state. */
function showsPayment(booking: ReservationPaymentState | null, balanceBeforeMinor: number | null) {
  if (!booking) return false;
  if (['cancelled', 'cancellation_pending', 'no_show', 'checked_in', 'checked_out'].includes(booking.status)) return true;
  if (booking.paymentStatus === 'paid') return true;
  if (balanceBeforeMinor !== null && typeof booking.balanceDueMinor === 'number') return booking.balanceDueMinor < balanceBeforeMinor;
  return booking.status === 'confirmed' && booking.paymentStatus === 'partial';
}

/**
 * After the provider accepts a payment, record it against the reservation. The completion
 * call and the provider webhook can each settle it, so when the call fails or times out we
 * read the reservation itself for a short while before reporting an unknown outcome.
 */
export async function settleBookingPayment(input: { bookingId: string; paymentSessionId: string; providerPaymentId: string; balanceBeforeMinor: number | null }): Promise<'settled' | 'unknown'> {
  try {
    await graphqlSettlementClient.request(COMPLETE_BOOKING_PAYMENT, { bookingId: input.bookingId, paymentSessionId: input.paymentSessionId, providerPaymentId: input.providerPaymentId });
    return 'settled';
  } catch {
    // Fall through to the reservation, which is authoritative.
  }
  for (const delay of RECHECK_DELAYS_MS) {
    await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const { booking } = await graphqlClient.request<{ booking: ReservationPaymentState | null }>(GET_GUEST_BOOKING, { bookingId: input.bookingId });
      if (showsPayment(booking, input.balanceBeforeMinor)) return 'settled';
    } catch {
      // Keep checking until the window closes.
    }
  }
  return 'unknown';
}
