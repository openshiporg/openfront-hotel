import { queueBookingCommunication } from './commands';
import { propertyCalendarDate } from '../lib/hotelBusinessTime';
import { runSerializableTransaction } from '../lib/serializableTransaction';

/** One durable pre-arrival email per confirmed reservation arrival date. No marketing subscription is inferred. */
export async function queueHotelPrearrivalCommunications(context: any, now = new Date()) {
  const settings = await context.prisma.hotelSettings.findUnique({ where: { id: 1 } });
  if (settings?.prearrivalEmailEnabled !== true) return { queued: 0, failures: 0 };
  const days = Number(settings.prearrivalDays);
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error('Pre-arrival lead time must be 1–14 days.');
  const today = propertyCalendarDate(now, settings.timeZone || 'UTC');
  const target = new Date(today.getTime() + days * 86_400_000);
  const bookings = await context.prisma.booking.findMany({ where: { status: 'confirmed', checkInDate: { gt: today, lte: target } }, select: { id: true } });
  let queued = 0; let failures = 0;
  for (const candidate of bookings) {
    try {
      const created = await runSerializableTransaction(context, async tx => {
        await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${candidate.id}`);
        const booking = await tx.prisma.booking.findUnique({ where: { id: candidate.id } });
        if (!booking || booking.status !== 'confirmed' || booking.checkInDate <= today || booking.checkInDate > target) return;
        const eventKey = `${booking.id}:${booking.checkInDate.toISOString().slice(0, 10)}`;
        const existing = await tx.prisma.hotelOutboxEvent.findUnique({ where: { eventKey: `hotel-communication:booking_prearrival:${eventKey}` } });
        if (existing) return;
        await queueBookingCommunication(tx.prisma, { bookingId: booking.id, kind: 'booking_prearrival', eventKey });
        return true;
      });
      if (created) queued += 1;
    } catch { failures += 1; }
  }
  return { queued, failures };
}

export async function prearrivalStillEligible(prisma: any, payload: any, now = new Date()) {
  const [booking, settings] = await Promise.all([prisma.booking.findUnique({ where: { id: payload.bookingId } }), prisma.hotelSettings.findUnique({ where: { id: 1 } })]);
  return Boolean(settings?.prearrivalEmailEnabled && booking?.status === 'confirmed' && booking.checkInDate.toISOString() === payload.checkInDate && booking.checkInDate > propertyCalendarDate(now, settings.timeZone || 'UTC') && booking.guestEmail.trim().toLowerCase() === payload.to);
}
