import { loadRoomOutages, roomOutageOverlaps } from '../operations/roomOutages';
const UNSAFE_SELL_STATUSES = new Set(['maintenance', 'out_of_order']);
export const MAX_PUBLIC_STAY_NIGHTS = 31;

export function hotelStayDates(checkInValue: string | Date, checkOutValue: string | Date) {
  const checkIn = new Date(checkInValue); const checkOut = new Date(checkOutValue);
  checkIn.setUTCHours(0, 0, 0, 0); checkOut.setUTCHours(0, 0, 0, 0);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    throw new Error('Invalid stay dates.');
  }
  if ((checkOut.getTime() - checkIn.getTime()) / 86_400_000 > MAX_PUBLIC_STAY_NIGHTS) throw new Error(`Stays may not exceed ${MAX_PUBLIC_STAY_NIGHTS} nights.`);
  const days: Date[] = [];
  for (const day = new Date(checkIn); day < checkOut; day.setUTCDate(day.getUTCDate() + 1)) days.push(new Date(day));
  if (days.length > MAX_PUBLIC_STAY_NIGHTS) throw new Error(`Stays may not exceed ${MAX_PUBLIC_STAY_NIGHTS} nights.`);
  return { checkIn, checkOut, days };
}

function key(date: Date) { return date.toISOString().slice(0, 10); }

export async function getHotelAvailability(context: any, options: {
  roomTypeId?: string;
  checkInDate: string | Date;
  checkOutDate: string | Date;
  excludeBookingId?: string;
  excludeInventoryBooking?: { roomTypeId: string; checkInDate: Date; checkOutDate: Date };
}) {
  const { checkIn, checkOut, days } = hotelStayDates(options.checkInDate, options.checkOutDate);
  const roomTypes = await context.prisma.roomType.findMany({
    where: options.roomTypeId ? { id: options.roomTypeId } : undefined,
    orderBy: [{ baseRateMinor: 'asc' }, { id: 'asc' }],
    take: options.roomTypeId ? 1 : 100,
    include: {
      rooms: { select: { id: true, status: true } },
      roomImages: { orderBy: { order: 'asc' }, take: 12 },
    },
  });
  if (options.roomTypeId && !roomTypes.length) throw new Error('Room type not found.');
  const roomTypeIds = roomTypes.map((item: any) => item.id);
  const [bookings, inventories, allocations] = await Promise.all([
    context.prisma.booking.findMany({
      where: {
        OR: [
          { status: { in: ['confirmed', 'checked_in', 'cancellation_pending'] } },
          { status: 'pending', holdExpiresAt: { gt: new Date() } },
        ],
        checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn },
        roomAssignments: { some: { roomTypeId: { in: roomTypeIds } } },
        ...(options.excludeBookingId ? { id: { not: options.excludeBookingId } } : {}),
      },
      select: { id: true, checkInDate: true, checkOutDate: true, roomAssignments: { select: { roomTypeId: true, roomId: true } } },
    }),
    context.prisma.roomInventory.findMany({
      where: { roomTypeId: { in: roomTypeIds }, date: { gte: checkIn, lt: checkOut } },
      take: roomTypeIds.length * days.length,
    }),
    context.prisma.groupBlockAllocation.findMany({
      where: {
        roomTypeId: { in: roomTypeIds },
        groupBlock: { OR: [{ releaseDate: null }, { releaseDate: { gt: new Date() } }], status: { in: ['tentative', 'definite'] }, arrivalDate: { lt: checkOut }, departureDate: { gt: checkIn } },
      },
      include: { groupBlock: { select: { arrivalDate: true, departureDate: true, releaseDate: true } } },
    }),
  ]);
  const outages = await loadRoomOutages(context.prisma);
  const repairs = await context.prisma.maintenanceRequest.findMany({ where: { status: { notIn: ['verified', 'cancelled'] }, room: { roomTypeId: { in: roomTypeIds } } }, select: { roomId: true } });
  const repairRooms = new Set(repairs.map((repair: any) => repair.roomId));
  const inventoryMap = new Map(inventories.map((item: any) => [`${item.roomTypeId}:${key(item.date)}`, item]));
  return roomTypes.map((roomType: any) => {
    const byDay = days.map(day => {
      const next = new Date(day); next.setUTCDate(next.getUTCDate() + 1);
      const booked = bookings.reduce((count: number, booking: any) => count + (
        booking.checkInDate < next && booking.checkOutDate > day
          ? booking.roomAssignments.filter((assignment: any) => assignment.roomTypeId === roomType.id).length : 0
      ), 0);
      const held = allocations.filter((allocation: any) =>
        (!allocation.groupBlock.releaseDate || new Date(allocation.groupBlock.releaseDate) > new Date()) && allocation.roomTypeId === roomType.id && allocation.groupBlock.arrivalDate < next && allocation.groupBlock.departureDate > day
      ).reduce((sum: number, allocation: any) => sum + Math.max(0, allocation.roomsHeld - allocation.roomsPickedUp), 0);
      const inventory: any = inventoryMap.get(`${roomType.id}:${key(day)}`);
      const occupiedPhysical = new Set(bookings.filter((booking: any) => booking.checkInDate < next && booking.checkOutDate > day).flatMap((booking: any) => booking.roomAssignments.map((assignment: any) => assignment.roomId).filter(Boolean)));
      const unavailablePhysical = roomType.rooms.filter((room: any) => !occupiedPhysical.has(room.id) && (UNSAFE_SELL_STATUSES.has(room.status) || repairRooms.has(room.id) || outages.some(outage => roomOutageOverlaps(outage, room.id, day, next)))).length;
      const total = Math.min(inventory?.totalRooms ?? roomType.rooms.length, roomType.rooms.length);
      const blocked = Math.max(inventory?.blockedRooms ?? 0, unavailablePhysical);
      const excludedInventory = options.excludeInventoryBooking;
      const selfInventory = excludedInventory && excludedInventory.roomTypeId === roomType.id &&
        excludedInventory.checkInDate < next && excludedInventory.checkOutDate > day ? 1 : 0;
      const occupied = Math.max(Math.max(0, Number(inventory?.bookedRooms ?? 0) - selfInventory), booked);
      return { date: key(day), available: Math.max(0, total - blocked - occupied - held), booked: occupied, held, blocked, total };
    });
    return { ...roomType, availabilityByDay: byDay, availableCount: Math.min(...byDay.map(day => day.available)) };
  });
}

export async function assertHotelAvailability(context: any, options: { roomTypeId: string; checkInDate: string | Date; checkOutDate: string | Date; excludeBookingId?: string; excludeInventoryBooking?: { roomTypeId: string; checkInDate: Date; checkOutDate: Date } }) {
  const result = (await getHotelAvailability(context, options))[0];
  if (!result || result.availableCount < 1) {
    const soldOut = result?.availabilityByDay.find((day: any) => day.available < 1);
    throw new Error(`Room type is sold out${soldOut ? ` on ${soldOut.date}` : ''}.`);
  }
  return result;
}
