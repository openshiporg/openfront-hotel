import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';
import { getHotelAvailability } from '../inventory/roomAvailability';

export function getInventoryDay(dateInput: string | Date) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid inventory date.');
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function buildInventoryKey(roomTypeId: string, dateInput: string | Date) {
  return `${roomTypeId}:${getInventoryDay(dateInput).toISOString().slice(0, 10)}`;
}

export default async function updateRoomInventoryControls(
  root: unknown,
  {
    roomTypeId,
    date,
    totalRooms,
    bookedRooms,
    blockedRooms,
    blockedRoomsDelta,
    idempotencyKey,
  }: {
    roomTypeId: string;
    date: string;
    totalRooms?: number | null;
    bookedRooms?: number | null;
    blockedRooms?: number | null;
    /** Block (+) or release (−) rooms relative to the stored block, instead of sending absolute counts. */
    blockedRoomsDelta?: number | null;
    idempotencyKey: string;
  },
  context: any
) {
  const canManageInventory =
    permissions.canManageRooms({ session: context.session }) ||
    permissions.canManageBookings({ session: context.session });
  if (!canManageInventory) throw new Error('Not authorized to manage room inventory.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  for (const [name, value] of Object.entries({ totalRooms, bookedRooms, blockedRooms })) {
    if (value != null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }
  if (blockedRoomsDelta != null) {
    if (!Number.isSafeInteger(blockedRoomsDelta) || blockedRoomsDelta === 0 || Math.abs(blockedRoomsDelta) > 10_000) throw new Error('blockedRoomsDelta must be a non-zero whole number.');
    if (totalRooms != null || bookedRooms != null || blockedRooms != null) throw new Error('Send either a block change or absolute counts, not both.');
  }
  const day = getInventoryDay(date);
  const inventoryKey = buildInventoryKey(roomTypeId, day);
  const request = { roomTypeId, date: day.toISOString(), totalRooms, bookedRooms, blockedRooms, blockedRoomsDelta };
  const identity = {
    request,
    aggregateType: 'room_inventory',
    aggregateId: inventoryKey,
    action: 'controls_changed',
  };

  let inventoryId = '';
  await runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await lockHotelBusinessDate(prisma);
    await prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-inventory:${inventoryKey}`
    );
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const current = await prisma.roomInventory.findUnique({ where: { inventoryKey } });
      if (!current) throw new Error('Replayed inventory record no longer exists.');
      inventoryId = current.id;
      return;
    }

    const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!roomType) throw new Error('Room type not found.');
    const physicalRoomCount = await prisma.room.count({ where: { roomTypeId } });
    const existing = await prisma.roomInventory.findUnique({ where: { inventoryKey } });
    const currentBlocked = existing?.blockedRooms ?? 0;
    const next = {
      totalRooms: totalRooms ?? existing?.totalRooms ?? physicalRoomCount,
      bookedRooms: bookedRooms ?? existing?.bookedRooms ?? 0,
      blockedRooms: blockedRoomsDelta != null ? currentBlocked + blockedRoomsDelta : blockedRooms ?? currentBlocked,
    };
    if (next.blockedRooms < 0) throw new Error('There are no blocked rooms to release on this date.');
    if (blockedRoomsDelta != null && blockedRoomsDelta > 0) {
      // Blocking may only take rooms that are still unsold: bookings, holds and outages come from
      // the same calculation the booking flow uses.
      const nextDay = new Date(day.getTime() + 86_400_000);
      const [availability] = await getHotelAvailability(transactionContext, { roomTypeId, checkInDate: day, checkOutDate: nextDay });
      const today = availability?.availabilityByDay?.[0];
      if (!today || today.available < blockedRoomsDelta) throw new Error('Every remaining room is already booked, held or blocked on this date.');
    }
    if (next.totalRooms > physicalRoomCount) {
      throw new Error('Inventory total cannot exceed the physical room count.');
    }
    if (next.bookedRooms + next.blockedRooms > next.totalRooms) {
      throw new Error('Booked plus blocked rooms cannot exceed total rooms.');
    }

    const updated = existing
      ? await prisma.roomInventory.update({ where: { id: existing.id }, data: next })
      : await prisma.roomInventory.create({
          data: { inventoryKey, date: day, roomTypeId, ...next },
        });
    inventoryId = updated.id;
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: existing && {
        totalRooms: existing.totalRooms,
        bookedRooms: existing.bookedRooms,
        blockedRooms: existing.blockedRooms,
      },
      afterSnapshot: next,
      metadata: { roomTypeName: roomType.name },
    });
  });

  return context.prisma.roomInventory.findUnique({ where: { id: inventoryId } });
}
