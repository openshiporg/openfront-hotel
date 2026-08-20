import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { requestBookingCancellation } from '../lib/bookingCancellation';
import { permissions } from '../access';

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
  return requestBookingCancellation({
    context,
    bookingId,
    refundReason,
    idempotencyKey,
    actorId: isStaff ? context.session.itemId : null,
    source: isStaff ? 'staff' : 'guest',
  });
}
