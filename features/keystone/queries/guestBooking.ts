import { assertGuestBookingAccess } from '../lib/guestBookingAccess';
import { findStorefrontBooking } from '../lib/storefrontBooking';
import { bookingCommunicationStatus } from '../communications/commands';

async function guestBooking(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: any
) {
  await assertGuestBookingAccess(context, bookingId);
  const [booking, communication] = await Promise.all([
    findStorefrontBooking(context, bookingId),
    bookingCommunicationStatus(context.prisma, bookingId),
  ]);
  if (!booking) return null;
  const pending = await context.prisma.refundIntent.aggregate({ where: { bookingId, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } }, _sum: { amountMinor: true } });
  return {
    ...booking,
    refundPendingMinor: Number(pending._sum.amountMinor || 0),
    confirmationDeliveryStatus: communication.confirmation?.status || null,
    updateDeliveryStatus: communication.modification?.status || communication.update?.status || null,
    cancellationDeliveryStatus: communication.cancellation?.status || null,
  };
}

export default guestBooking;
