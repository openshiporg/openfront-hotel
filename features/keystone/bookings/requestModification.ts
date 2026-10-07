import { createHash, randomUUID } from 'node:crypto';
import { assertGuestBookingAccess } from '../lib/guestBookingAccess';

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STAY_DAYS = 365;

function boundedDate(value: string | null | undefined, name: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} is invalid.`);
  return date;
}

export default async function requestBookingModification(
  root: unknown,
  { bookingId, guestEmail, requestedCheckInDate, requestedCheckOutDate, message }: {
    bookingId: string; guestEmail: string; requestedCheckInDate?: string | null;
    requestedCheckOutDate?: string | null; message?: string | null;
  },
  context: any,
) {
  await assertGuestBookingAccess(context, bookingId);
  const normalizedEmail = String(guestEmail || '').trim().toLowerCase();
  const requestedIn = boundedDate(requestedCheckInDate, 'Requested check-in');
  const requestedOut = boundedDate(requestedCheckOutDate, 'Requested check-out');
  const guestMessage = String(message || '').trim();
  if (!requestedIn && !requestedOut && !guestMessage) throw new Error('At least one requested stay date or message is required.');
  if (requestedIn && requestedOut) {
    const days = (requestedOut.getTime() - requestedIn.getTime()) / 86_400_000;
    if (days <= 0 || days > MAX_STAY_DAYS) throw new Error('Requested stay dates are outside the supported range.');
  }
  if (guestMessage.length > MAX_MESSAGE_LENGTH) throw new Error('Modification message is too long.');

  return context.transaction(async (tx: any) => {
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const booking = await tx.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found.');
    if (String(booking.guestEmail || '').trim().toLowerCase() !== normalizedEmail) throw new Error('Email does not match this booking.');
    if (!['pending', 'confirmed'].includes(booking.status)) throw new Error('Only upcoming pending or confirmed bookings can request changes.');

    const nextIn = requestedIn || booking.checkInDate;
    const nextOut = requestedOut || booking.checkOutDate;
    const days = (nextOut.getTime() - nextIn.getTime()) / 86_400_000;
    if (days <= 0 || days > MAX_STAY_DAYS) throw new Error('Requested stay dates are outside the supported range.');
    const existing = await tx.prisma.bookingModificationRequest.findFirst({
      where: { bookingId, status: 'pending' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (existing) {
      if (
        existing.requestedCheckInDate?.getTime() === nextIn.getTime() &&
        existing.requestedCheckOutDate?.getTime() === nextOut.getTime() &&
        String(existing.guestMessage || '') === guestMessage
      ) return booking;
      throw new Error('This booking already has a pending modification request.');
    }
    const createdAt = new Date();
    const request = await tx.prisma.bookingModificationRequest.create({ data: {
      requestKey: `guest-modification:${randomUUID()}`,
      bookingId,
      requestedCheckInDate: nextIn,
      requestedCheckOutDate: nextOut,
      guestMessage: guestMessage || null,
      requestedByEmailHash: createHash('sha256').update(normalizedEmail).digest('hex'),
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    } });
    await tx.prisma.booking.update({ where: { id: bookingId }, data: {
      internalNotes: [booking.internalNotes, `Guest modification request ${request.id} is pending staff review.`].filter(Boolean).join('\n\n'),
    } });
    return booking;
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
}
