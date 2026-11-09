import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { findStorefrontBooking } from '../lib/storefrontBooking';

async function guestBooking(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: any
) {
  await assertGuestBookingAccess(context, bookingId);
  const booking = await findStorefrontBooking(context, bookingId);
  if (!booking) return null;
  const [pending, changeRequest] = await Promise.all([
    context.prisma.refundIntent.aggregate({ where: { bookingId, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } }, _sum: { amountMinor: true } }),
    // The guest's latest change request and the property's decision, so it survives a refresh.
    context.prisma.bookingModificationRequest.findFirst({
      where: { bookingId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, status: true, requestedCheckInDate: true, requestedCheckOutDate: true, guestMessage: true, staffNote: true, createdAt: true, resolvedAt: true },
    }),
  ]);
  return {
    ...booking,
    changeRequest,
    refundPendingMinor: Number(pending._sum.amountMinor || 0),
  };
}

export default guestBooking;
