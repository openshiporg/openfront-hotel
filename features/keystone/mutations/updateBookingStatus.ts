import { permissions } from '../access';
import { ensureBookingFolio } from '../lib/bookingFolio';
import { requestBookingCancellation } from '../lib/bookingCancellation';
import { assertFolioCanClose } from '../lib/folioLedger';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { queueBookingCommunication } from '../lib/hotelCommunications';

const BLOCKED_CHECK_IN_ROOM_STATUSES = new Set(['occupied', 'cleaning', 'maintenance', 'out_of_order']);
const TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(['confirmed']),
  confirmed: new Set(['checked_in', 'no_show']),
  checked_in: new Set(['checked_out']),
  checked_out: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

export default async function updateBookingStatus(
  root: unknown,
  {
    bookingId,
    status,
    idempotencyKey,
  }: { bookingId: string; status: string; idempotencyKey: string },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to update booking status.');
  }
  if (!TRANSITIONS[status]) throw new Error('Unsupported booking status.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  if (status === 'no_show') {
    return requestBookingCancellation({
      context,
      bookingId,
      refundReason: 'No-show policy settlement',
      idempotencyKey: eventKey,
      actorId: context.session.itemId,
      source: 'no_show',
    });
  }
  const request = { bookingId, status };
  const identity = {
    request,
    aggregateType: 'booking',
    aggregateId: bookingId,
    action: 'status_changed',
  };

  await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: { include: { room: true } }, billingFolio: true },
    });
    if (!booking?.guestProfileId) throw new Error('Booking or required guest profile not found.');
    if (booking.status === status) throw new Error(`Booking is already ${status}.`);
    if (!TRANSITIONS[booking.status]?.has(status)) {
      throw new Error(`Booking status cannot transition from ${booking.status} to ${status}.`);
    }
    const rooms = booking.roomAssignments.map((assignment: any) => assignment.room).filter(Boolean);
    for (const room of [...rooms].sort((a: any, b: any) => a.id.localeCompare(b.id))) {
      await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${room.id}`);
    }
    if (status === 'checked_in') {
      if (!rooms.length) throw new Error('Assign a room before checking this guest in.');
      const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
      if (!clock) throw new Error('Property business date is not configured.');
      const businessDay = clock.currentBusinessDate.toISOString().slice(0, 10);
      const arrivalDay = booking.checkInDate.toISOString().slice(0, 10);
      const departureDay = booking.checkOutDate.toISOString().slice(0, 10);
      if (arrivalDay > businessDay) throw new Error(`This reservation arrives on ${arrivalDay}; the current business date is ${businessDay}.`);
      if (departureDay < businessDay) throw new Error('This reservation has already passed its departure business date.');
      const blocked = rooms.find((room: any) => BLOCKED_CHECK_IN_ROOM_STATUSES.has(room.status));
      if (blocked) throw new Error(`Room ${blocked.roomNumber} is ${blocked.status.replaceAll('_', ' ')} and cannot be checked in.`);
    }
    if (status === 'cancelled') {
      throw new Error('Use the policy-aware cancellation operation.');
    }

    const now = new Date();
    let folioId: string | null = null;
    if (status === 'checked_out') {
      const ensured = await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
      folioId = ensured.folioId;
      const entries = await prisma.folioEntry.findMany({
        where: { folioId },
        select: { direction: true, amountMinor: true },
      });
      // A master group folio settles at the group level, not when an
      // individual guest checks out. The room still cannot leave the desk
      // workflow with an invalid folio, but its group balance remains open.
      if (!booking.billingFolioId) assertFolioCanClose(entries);
    }

    const timestamps: Record<string, Date> = {};
    if (status === 'confirmed') timestamps.confirmedAt = booking.confirmedAt || now;
    if (status === 'checked_in') timestamps.checkedInAt = booking.checkedInAt || now;
    if (status === 'checked_out') timestamps.checkedOutAt = booking.checkedOutAt || now;
    if (status === 'cancelled') timestamps.cancelledAt = booking.cancelledAt || now;
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status, ...timestamps },
    });

    if (status === 'checked_in') {
      await prisma.room.updateMany({ where: { id: { in: rooms.map((room: any) => room.id) } }, data: { status: 'occupied' } });
    }
    if (status === 'checked_out') {
      for (const room of rooms) {
        await prisma.room.update({ where: { id: room.id }, data: { status: 'cleaning' } });
        const existingTask = await prisma.housekeepingTask.findFirst({
          where: {
            roomId: room.id,
            taskType: 'checkout_clean',
            status: { in: ['pending', 'in_progress', 'inspection_needed', 'on_hold'] },
          },
        });
        if (!existingTask) {
          await prisma.housekeepingTask.create({
            data: {
              roomId: room.id,
              taskType: 'checkout_clean',
              status: 'pending',
              priority: 1,
              notes: `Auto-created after checkout for ${booking.confirmationNumber} (${booking.guestName}).`,
            },
          });
        }
      }
      if (folioId && !booking.billingFolioId) {
        await prisma.folio.update({ where: { id: folioId }, data: { status: 'closed', closedAt: now } });
      }
      const completed = await prisma.booking.aggregate({
        where: { guestProfileId: booking.guestProfileId, status: 'checked_out' },
        _count: { id: true },
        _sum: { totalAmountMinor: true },
        _max: { checkedOutAt: true },
      });
      await prisma.guest.update({
        where: { id: booking.guestProfileId },
        data: {
          totalStays: String(completed._count.id),
          totalSpent: (Number(completed._sum.totalAmountMinor || 0) / 100).toFixed(2),
          lastStayAt: completed._max.checkedOutAt || now,
        },
      });
    }

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: booking.status, roomStatuses: rooms.map((room: any) => ({ id: room.id, status: room.status })) },
      afterSnapshot: { status: updated.status, roomStatus: status === 'checked_in' ? 'occupied' : status === 'checked_out' ? 'cleaning' : null, folioId },
      metadata: { confirmationNumber: booking.confirmationNumber, guestProfileId: booking.guestProfileId },
    });
    if (status === 'confirmed') {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: 'booking_confirmation',
        eventKey: `booking:${bookingId}:confirmation:v${booking.pricingRevision || 1}`,
      });
    }
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });

  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}
