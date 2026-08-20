import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

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
    idempotencyKey,
  }: {
    roomTypeId: string;
    date: string;
    totalRooms?: number | null;
    bookedRooms?: number | null;
    blockedRooms?: number | null;
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
  const day = getInventoryDay(date);
  const inventoryKey = buildInventoryKey(roomTypeId, day);
  const request = { roomTypeId, date: day.toISOString(), totalRooms, bookedRooms, blockedRooms };
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
    const next = {
      totalRooms: totalRooms ?? existing?.totalRooms ?? physicalRoomCount,
      bookedRooms: bookedRooms ?? existing?.bookedRooms ?? 0,
      blockedRooms: blockedRooms ?? existing?.blockedRooms ?? 0,
    };
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
