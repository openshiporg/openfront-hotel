import { calculateCancellationTerms } from '../lib/cancellationPolicy';
import { refundablePaymentMinor } from '../lib/bookingRefund';
import { assertGuestBookingAccess } from '../lib/guestBookingAccess';

export default async function guestCancellationQuote(
  _root: unknown,
  { bookingId }: { bookingId: string },
  context: any,
) {
  await assertGuestBookingAccess(context, bookingId);
  const booking = await context.prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      ratePlan: true,
      lineItems: {
        where: { snapshotStatus: 'active' },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      },
      payments: {
        where: { status: 'completed', paymentType: { not: 'refund' } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!booking) throw new Error('Booking not found.');
  const available = await Promise.all(
    booking.payments.map((payment: any) => refundablePaymentMinor(context.prisma, payment)),
  );
  const capturedMinor = available.reduce((sum: number, amount: number) => sum + amount, 0);
  const firstRoomNight = booking.lineItems.find((line: any) => line.type === 'room');
  const policy = firstRoomNight?.cancellationPolicySnapshot ||
    (booking.pricingSnapshot as any)?.cancellationPolicy || booking.ratePlan?.cancellationPolicy;
  const stayNights = Math.max(1, Math.round((booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 86_400_000));
  const bookingTotalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
  const firstNightMinor = Number(firstRoomNight?.totalPrice || 0) || Math.ceil(bookingTotalMinor / stayNights);
  const terms = calculateCancellationTerms({
    policy,
    checkInDate: booking.checkInDate,
    capturedMinor,
    firstNightMinor,
    bookingTotalMinor,
  });
  return {
    ...terms,
    canCancel: ['pending', 'confirmed'].includes(booking.status),
    fullRefundDeadline: terms.fullRefundDeadline,
    currencyCode: booking.currencyCode || 'USD',
  };
}
