import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { requestBookingCancellation } from '../bookings/cancellation';
import { permissions } from '../access';
import { dispatchRefundIntentBatch } from '../refunds/refundIntentWorker';

type CancelBookingInput = {
  bookingId: string;
  refundReason?: string | null;
  idempotencyKey: string;
};

export default async function cancelBooking(
  _root: unknown,
  { bookingId, refundReason, idempotencyKey }: CancelBookingInput,
  context: any,
) {
  const isStaff = permissions.canManageBookings({ session: context.session });
  if (!isStaff) await assertGuestBookingAccess(context, bookingId);
  await ensureDefaultPaymentProviders(context);
  const result = await requestBookingCancellation({
    context,
    bookingId,
    refundReason,
    idempotencyKey,
    actorId: isStaff ? context.session.itemId : null,
    source: isStaff ? 'staff' : 'guest',
  });
  // No background sender: the cancellation's refund goes to the provider on this request; the Refund queue Refresh retries any that fail.
  await dispatchRefundIntentBatch(context, { workerId: 'request-cancel', limit: 10 }).catch(() => undefined);
  return result;
}
