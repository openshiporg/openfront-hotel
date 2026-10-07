import { permissions } from '../access';
import { getHotelAvailability, hotelStayDates } from '../inventory/roomAvailability';
import { lockHotelBusinessDate, propertyArrivalInstant } from '../lib/hotelBusinessTime';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { createHash, randomUUID } from 'node:crypto';

import { assertHotelGroupsEnabled } from '../lib/boundedLaunch';
import { lockRoomInventory } from '../inventory/roomNightLocks';
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
    ratePlanId?: string | null;
    roomsHeld: number;
    rateMinor: number;
    currencyCode: string;
    idempotencyKey: string;
  },
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
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
  if (!['guest_pays', 'master_folio'].includes(args.billingType)) {
    throw new Error('Unsupported group billing type.');
  }

  hotelStayDates(arrivalDate, departureDate);
  if (arrivalDate.getUTCHours() || arrivalDate.getUTCMinutes() || arrivalDate.getUTCSeconds() || arrivalDate.getUTCMilliseconds() || departureDate.getUTCHours() || departureDate.getUTCMinutes() || departureDate.getUTCSeconds() || departureDate.getUTCMilliseconds()) throw new Error('Group stay dates must be property calendar dates at midnight UTC.');
  const eventKey = `group-block:create:${idempotencyKey}`;
  const groupId = `grp_${createHash('sha256').update(eventKey).digest('hex').slice(0, 24)}`;
  const identity = {
    request: { ...args, arrivalDate: arrivalDate.toISOString(), departureDate: departureDate.toISOString() },
    aggregateType: 'group_block',
    aggregateId: groupId,
    action: 'created',
  };

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    const settings = await assertHotelGroupsEnabled(prisma);
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

    await lockHotelBusinessDate(prisma);
    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || arrivalDate < clock.currentBusinessDate || (releaseDate && releaseDate <= new Date())) throw new Error('Group arrival cannot precede the open business date and pickup cutoff must be in the future.');
    await lockRoomInventory(prisma, args.roomTypeId, arrivalDate, departureDate);
    const roomType = await prisma.roomType.findUnique({
      where: { id: args.roomTypeId },
      include: { rooms: true },
    });
    if (!roomType) throw new Error('Room type not found.');

    const [availability] = await getHotelAvailability(transactionContext, { roomTypeId: args.roomTypeId, checkInDate: arrivalDate, checkOutDate: departureDate });
    if (!availability || availability.availableCount < args.roomsHeld) throw new Error('Group block exceeds available capacity on one or more nights.');
    const ratePlan = args.ratePlanId ? await prisma.ratePlan.findUnique({ where: { id: args.ratePlanId } }) : await prisma.ratePlan.findFirst({ where: { roomTypeId: args.roomTypeId, status: 'active' }, orderBy: { id: 'asc' } });
    if (!ratePlan || ratePlan.roomTypeId !== args.roomTypeId || ratePlan.status !== 'active') throw new Error('Select an active rate plan of the allocated room type for the group contract.');
    const contract = { depositPercent: Number(settings.depositPercent ?? 100), securityDepositMinor: Number(settings.securityDepositMinor ?? 0), ratePlanId: ratePlan.id, ratePlanName: ratePlan.name, cancellationPolicy: ratePlan.cancellationPolicy, mealPlan: ratePlan.mealPlan, taxRateBasisPoints: Number(settings.taxRateBasisPoints || 0), feesMinor: Number(settings.serviceFeeMinor || 0), currencyCode, rateMinor: args.rateMinor, roomTypeId: roomType.id, roomTypeName: roomType.name, maxOccupancy: roomType.maxOccupancy, arrivalInstant: propertyArrivalInstant(arrivalDate, settings.checkInTime || '15:00', settings.timeZone || 'UTC').toISOString(), propertyTimeZone: settings.timeZone || 'UTC' };

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
        contract,
        masterFolio: args.billingType === 'master_folio' ? `GFOL-${block.blockCode}` : null,
      },
    });
    return prisma.groupBlock.findUnique({
      where: { id: block.id },
      include: { allocations: { include: { roomType: true } }, masterFolio: true },
    });
  });
}
