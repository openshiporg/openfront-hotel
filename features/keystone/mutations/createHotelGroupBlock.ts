import { createHash, randomUUID } from 'node:crypto';

import { rejectDisabledGroupOperation } from '../lib/boundedLaunch';
import { lockRoomInventory } from '../lib/inventoryLock';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

function requiredText(value: string, label: string, max = 200) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}

export default async function createHotelGroupBlock(
  _root: unknown,
  args: {
    name: string;
    arrivalDate: string;
    departureDate: string;
    releaseDate?: string | null;
    contactName: string;
    contactEmail: string;
    billingType: string;
    roomTypeId: string;
    roomsHeld: number;
    rateMinor: number;
    currencyCode: string;
    idempotencyKey: string;
  },
  context: any
) {
  rejectDisabledGroupOperation();
  if (!context.session?.data?.role?.canManageBookings) {
    throw new Error('Not authorized to manage group blocks.');
  }
  const idempotencyKey = requiredText(args.idempotencyKey, 'Idempotency key');
  const contactEmail = requiredText(args.contactEmail, 'Contact email', 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Contact email must be valid.');
  const currencyCode = requiredText(args.currencyCode, 'Currency', 3).toUpperCase();
  if (currencyCode !== 'USD') throw new Error('The bounded hotel scope supports USD group references only.');
  const arrivalDate = new Date(args.arrivalDate);
  const departureDate = new Date(args.departureDate);
  const releaseDate = args.releaseDate ? new Date(args.releaseDate) : null;
  if (
    Number.isNaN(arrivalDate.getTime()) ||
    Number.isNaN(departureDate.getTime()) ||
    (releaseDate && (Number.isNaN(releaseDate.getTime()) || releaseDate > arrivalDate)) ||
    departureDate <= arrivalDate ||
    departureDate.getTime() - arrivalDate.getTime() > 366 * 86_400_000
  ) {
    throw new Error('Group stay dates are invalid or exceed one year.');
  }
  if (!Number.isInteger(args.roomsHeld) || args.roomsHeld < 1) {
    throw new Error('Rooms held must be a positive integer.');
  }
  if (!Number.isSafeInteger(args.rateMinor) || args.rateMinor < 0) {
    throw new Error('Group rate must be a nonnegative minor-unit integer.');
  }
  if (!['guest_pays', 'master_folio', 'split'].includes(args.billingType)) {
    throw new Error('Unsupported group billing type.');
  }

  const eventKey = `group-block:create:${idempotencyKey}`;
  const groupId = `grp_${createHash('sha256').update(eventKey).digest('hex').slice(0, 24)}`;
  const identity = {
    request: { ...args, arrivalDate: arrivalDate.toISOString(), departureDate: departureDate.toISOString() },
    aggregateType: 'group_block',
    aggregateId: groupId,
    action: 'created',
  };

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const existingId = (replay.afterSnapshot as any)?.id;
      if (!existingId) throw new Error('Group block replay evidence is incomplete.');
      return prisma.groupBlock.findUnique({
        where: { id: existingId },
        include: { allocations: { include: { roomType: true } } },
      });
    }

    await lockRoomInventory(prisma, args.roomTypeId, arrivalDate, departureDate);
    const roomType = await prisma.roomType.findUnique({
      where: { id: args.roomTypeId },
      include: { rooms: true },
    });
    if (!roomType) throw new Error('Room type not found.');

    const [overlappingGroups, overlappingBookings, inventories] = await Promise.all([
      prisma.groupBlockAllocation.findMany({
        where: {
          roomTypeId: args.roomTypeId,
          groupBlock: {
            status: { in: ['tentative', 'definite'] },
            arrivalDate: { lt: departureDate },
            departureDate: { gt: arrivalDate },
          },
        },
        include: { groupBlock: true },
      }),
      prisma.booking.findMany({
        where: {
          status: { in: ['pending', 'confirmed', 'checked_in'] },
          checkInDate: { lt: departureDate },
          checkOutDate: { gt: arrivalDate },
          roomAssignments: { some: { roomTypeId: args.roomTypeId } },
        },
        select: { checkInDate: true, checkOutDate: true },
      }),
      prisma.roomInventory.findMany({
        where: {
          roomTypeId: args.roomTypeId,
          date: { gte: arrivalDate, lt: departureDate },
        },
      }),
    ]);
    const inventoryByDay = new Map(
      inventories.map((inventory: any) => [inventory.date.toISOString().slice(0, 10), inventory])
    );
    const physicalTotal = roomType.rooms.length;
    const physicalBlocked = roomType.rooms.filter((room: any) =>
      ['maintenance', 'out_of_order'].includes(room.status)
    ).length;
    for (const day = new Date(arrivalDate); day < departureDate; day.setUTCDate(day.getUTCDate() + 1)) {
      const nextDay = new Date(day);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const existingHeld = overlappingGroups
        .filter((allocation: any) =>
          allocation.groupBlock.arrivalDate < nextDay && allocation.groupBlock.departureDate > day
        )
        .reduce(
          (sum: number, allocation: any) =>
            sum + Math.max(0, allocation.roomsHeld - allocation.roomsPickedUp),
          0
        );
      const booked = overlappingBookings.filter((booking: any) =>
        booking.checkInDate < nextDay && booking.checkOutDate > day
      ).length;
      const inventory = inventoryByDay.get(day.toISOString().slice(0, 10)) as any;
      const total = inventory?.totalRooms ?? physicalTotal;
      const blocked = inventory?.blockedRooms ?? physicalBlocked;
      if (existingHeld + booked + blocked + args.roomsHeld > total) {
        throw new Error(`Group block exceeds sellable capacity on ${day.toISOString().slice(0, 10)}.`);
      }
    }

    const block = await prisma.groupBlock.create({
      data: {
        id: groupId,
        blockCode: `GRP-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
        name: requiredText(args.name, 'Group name'),
        status: 'tentative',
        arrivalDate,
        departureDate,
        releaseDate,
        contactName: requiredText(args.contactName, 'Contact name'),
        contactEmail,
        billingType: args.billingType,
        allocations: {
          create: {
            allocationKey: `${eventKey}:${args.roomTypeId}`,
            roomTypeId: args.roomTypeId,
            roomsHeld: args.roomsHeld,
            roomsPickedUp: 0,
            rateMinor: args.rateMinor,
            currencyCode,
          },
        },
      },
      include: { allocations: { include: { roomType: true } } },
    });

    if (args.billingType === 'master_folio') {
      await prisma.folio.create({
        data: {
          groupBlockId: block.id,
          folioNumber: `GFOL-${block.blockCode}`,
          currencyCode,
          status: 'open',
          openedAt: new Date(),
        },
      });
    }

    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session?.itemId || null,
      identity,
      beforeSnapshot: null,
      afterSnapshot: {
        id: block.id,
        blockCode: block.blockCode,
        status: block.status,
        allocationKey: block.allocations[0]?.allocationKey,
        masterFolio: args.billingType === 'master_folio' ? `GFOL-${block.blockCode}` : null,
      },
    });
    return prisma.groupBlock.findUnique({
      where: { id: block.id },
      include: { allocations: { include: { roomType: true } }, masterFolio: true },
    });
  });
}
