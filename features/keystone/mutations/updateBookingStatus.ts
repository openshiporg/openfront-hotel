import { permissions } from '../access';

async function updateBookingStatus(
  root: unknown,
  { bookingId, status }: { bookingId: string; status: string },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to update booking status');
  }

  const now = new Date().toISOString();
  const data: Record<string, any> = { status };

  if (status === 'confirmed') data.confirmedAt = now;
  if (status === 'checked_in') data.checkedInAt = now;
  if (status === 'checked_out') data.checkedOutAt = now;
  if (status === 'cancelled') data.cancelledAt = now;

  return context.sudo().query.Booking.updateOne({
    where: { id: bookingId },
    data,
    query: `
      id
      status
      confirmedAt
      checkedInAt
      checkedOutAt
      cancelledAt
    `,
  });
}

export default updateBookingStatus;
