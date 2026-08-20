import { permissions } from '../access';
import { rejectDisabledGroupOperation } from '../lib/boundedLaunch';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export default async function pickupHotelGroupBlock(
  _root: unknown,
  { groupBlockId, allocationId, bookingId, idempotencyKey }: {
    groupBlockId: string;
    allocationId: string;
    bookingId: string;
    idempotencyKey: string;
  },
  context: any,
) {
  rejectDisabledGroupOperation();
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to pick up group rooms.');
  }
  const key = String(idempotencyKey || '').trim();
  if (!key || key.length > 200) throw new Error('A stable idempotency key is required.');
  const eventKey = `group-block:pickup:${key}`;
  const identity = {
    request: { groupBlockId, allocationId, bookingId },
    aggregateType: 'group_block',
    aggregateId: groupBlockId,
    action: 'room_picked_up',
  };

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-group:${groupBlockId}`);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) return prisma.booking.findUnique({ where: { id: bookingId } });

    const [block, allocation, booking] = await Promise.all([
      prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { masterFolio: true } }),
      prisma.groupBlockAllocation.findUnique({ where: { id: allocationId } }),
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          groupBlock: true,
          groupBlockAllocation: true,
          folio: { include: { entries: { take: 1 } } },
          roomAssignments: true,
        },
      }),
    ]);
    if (!block || !allocation || allocation.groupBlockId !== block.id || !booking) {
      throw new Error('Group block, allocation, or booking was not found.');
    }
    if (!['tentative', 'definite'].includes(block.status)) throw new Error('This group block is no longer open for pickup.');
    if (block.releaseDate && new Date() >= block.releaseDate) throw new Error('The group pickup cutoff has passed.');
    if (allocation.roomsPickedUp >= allocation.roomsHeld) throw new Error('The group allocation is fully picked up.');
    if (booking.groupBlockId || booking.groupBlockAllocationId) throw new Error('Booking is already attached to a group block.');
    if (booking.checkInDate.getTime() !== block.arrivalDate.getTime() || booking.checkOutDate.getTime() !== block.departureDate.getTime()) {
      throw new Error('Booking dates must match the group block dates.');
    }
    if (!booking.roomAssignments.some((assignment: any) => assignment.roomTypeId === allocation.roomTypeId)) {
      throw new Error('Booking room type does not match the group allocation.');
    }
    if (block.billingType === 'master_folio' && !block.masterFolio) {
      throw new Error('Master-folio group is missing its master folio.');
    }
    if (block.billingType === 'master_folio' && booking.folio?.entries?.length) {
      throw new Error('A reservation with posted folio history cannot be rerouted to a master folio.');
    }

    const updated = await prisma.groupBlockAllocation.update({
      where: { id: allocation.id },
      data: { roomsPickedUp: { increment: 1 } },
    });
    const linked = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        groupBlock: { connect: { id: block.id } },
        groupBlockAllocation: { connect: { id: allocation.id } },
        ...(block.billingType === 'master_folio' && block.masterFolio
          ? { billingFolio: { connect: { id: block.masterFolio.id } } }
          : {}),
      },
    });

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { roomsPickedUp: allocation.roomsPickedUp, bookingGroupBlockId: booking.groupBlockId },
      afterSnapshot: {
        roomsPickedUp: updated.roomsPickedUp,
        bookingId: linked.id,
        billingFolioId: block.masterFolio?.id || null,
      },
    });
    return linked;
  });
}
