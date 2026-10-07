import { requireHotelApproval } from '../guest-governance/commands';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { assertNoOutstandingStayKeys } from '../operations/stayRegister';
import { permissions } from '../access';
import { ensureBookingFolio } from '../folios/bookingFolio';
import { calculateFolioBalance } from '../folios/ledger';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

function normalize(value: string, label: string, max: number) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}

/**
 * Resolves a genuinely overdue checked-in stay without rewriting history.
 * The outstanding balance is closed by an explicit, append-only write-off,
 * then checkout/folio/room/housekeeping/audit/outbox state commits atomically.
 */
export default async function resolveOverdueCheckedInBooking(
  _root: unknown,
  { bookingId, idempotencyKey, reason, approvalId }: { approvalId?: string | null; bookingId: string; idempotencyKey: string; reason: string },
  context: any,
) {
  if (
    !permissions.canManageBookings({ session: context.session }) ||
    !permissions.canManagePayments({ session: context.session })
  ) {
    throw new Error('Not authorized to resolve overdue stays.');
  }
  const key = normalize(idempotencyKey, 'idempotencyKey', 200);
  const resolutionReason = normalize(reason, 'reason', 500);
  const eventKey = `overdue-stay-resolution:${key}`;
  const identity = {
    request: { bookingId, resolution: 'write_off', reason: resolutionReason },
    aggregateType: 'booking',
    aggregateId: bookingId,
    action: 'overdue_stay_resolved',
  };

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { folio: true } });
      if (!booking?.folio || booking.status !== 'checked_out' || booking.folio.status !== 'closed') {
        throw new Error('Overdue resolution replay evidence is incomplete.');
      }
      return {
        bookingId,
        folioId: booking.folio.id,
        status: booking.status,
        folioStatus: booking.folio.status,
        writtenOffMinor: Number((replay.afterSnapshot as any)?.writtenOffMinor || 0),
        replayed: true,
      };
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: { include: { room: true } }, folio: true },
    });
    if (!booking?.guestProfileId) throw new Error('Booking or required guest profile not found.');
    if (booking.status !== 'checked_in') throw new Error('Only checked-in bookings can use overdue resolution.');
    if (booking.billingFolioId) throw new Error('Group master-folio stays must be resolved through group settlement.');
    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || booking.checkOutDate.getTime() > clock.currentBusinessDate.getTime()) {
      throw new Error('The checked-in booking is not overdue for the current property business date.');
    }

    for (const assignment of [...booking.roomAssignments].sort((a: any, b: any) => a.id.localeCompare(b.id))) {
      if (assignment.roomId) {
        await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-room:${assignment.roomId}`);
      }
    }

    await assertNoOutstandingStayKeys(prisma, bookingId);
    const ensured = await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
    const entries = await prisma.folioEntry.findMany({
      where: { folioId: ensured.folioId },
      select: { direction: true, amountMinor: true, currencyCode: true },
    });
    const beforeBalance = calculateFolioBalance(entries as any);
    if (beforeBalance.balanceMinor < 0) throw new Error('Credit folios require refund reconciliation before overdue resolution.');
    const now = new Date();
    const postingKey = `${eventKey}:write-off`;
    if (beforeBalance.balanceMinor > 0) {
      const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
      if (beforeBalance.balanceMinor >= Number(settings?.writeOffApprovalThresholdMinor ?? 0)) await requireHotelApproval(prisma, { approvalId, action: "write_off", aggregateId: bookingId, amountMinor: beforeBalance.balanceMinor, actorId: context.session.itemId, operationKey: eventKey });
      await prisma.folioEntry.create({
        data: {
          folioId: ensured.folioId,
          postingKey,
          entryType: 'adjustment',
          direction: 'credit',
          amountMinor: beforeBalance.balanceMinor,
          currencyCode: 'USD',
          description: `Authorized overdue-stay write-off: ${resolutionReason}`,
          serviceDate: clock.currentBusinessDate,
          postedAt: now,
          sourceType: 'operator',
          sourceId: context.session.itemId,
          postedById: context.session.itemId,
          metadataSnapshot: {
            resolution: 'write_off',
            reason: resolutionReason,
            bookingId,
            confirmationNumber: booking.confirmationNumber,
            priorBalanceMinor: beforeBalance.balanceMinor,
          },
        },
      });
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'checked_out', checkedOutAt: now, balanceDueMinor: 0, balanceDue: 0 },
    });
    await prisma.folio.update({ where: { id: ensured.folioId }, data: { status: 'closed', closedAt: now } });

    for (const assignment of booking.roomAssignments) {
      if (!assignment.room) continue;
      const repair = await prisma.maintenanceRequest.findFirst({ where: { roomId: assignment.room.id, status: { in: ['reported', 'assigned', 'in_progress', 'waiting_parts'] } } });
      const nextStatus = assignment.room.status === 'out_of_order' ? 'out_of_order' : repair || assignment.room.status === 'maintenance' ? 'maintenance' : 'cleaning';
      await prisma.room.update({ where: { id: assignment.room.id }, data: { status: nextStatus } });
      const openTask = await prisma.housekeepingTask.findFirst({
        where: {
          roomId: assignment.room.id,
          taskType: 'checkout_clean',
          status: { in: ['pending', 'in_progress', 'inspection_needed', 'on_hold'] },
        },
      });
      if (!openTask) {
        await prisma.housekeepingTask.create({
          data: {
            roomId: assignment.room.id,
            taskType: 'checkout_clean',
            status: 'pending',
            priority: 1,
            notes: `Auto-created after overdue resolution for ${booking.confirmationNumber} (${booking.guestName}).`,
          },
        });
      }
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

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: {
        status: booking.status,
        folioId: ensured.folioId,
        folioStatus: booking.folio?.status || 'open',
        balanceMinor: beforeBalance.balanceMinor,
        roomStatuses: booking.roomAssignments.map((item: any) => ({ id: item.roomId, status: item.room?.status })),
      },
      afterSnapshot: {
        status: updated.status,
        folioId: ensured.folioId,
        folioStatus: 'closed',
        balanceMinor: 0,
        writtenOffMinor: beforeBalance.balanceMinor,
        postingKey: beforeBalance.balanceMinor > 0 ? postingKey : null,
        roomStatus: 'cleaning',
      },
      metadata: { resolution: 'write_off', reason: resolutionReason, confirmationNumber: booking.confirmationNumber },
    });

    return {
      bookingId,
      folioId: ensured.folioId,
      status: updated.status,
      folioStatus: 'closed',
      writtenOffMinor: beforeBalance.balanceMinor,
      replayed: false,
    };
  });
}
