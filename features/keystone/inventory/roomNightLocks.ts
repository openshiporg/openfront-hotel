function utcDay(date: Date) {
  const day = new Date(date.getTime());
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export function getInventoryLockKeys(
  roomTypeId: string,
  checkIn: Date,
  checkOut: Date
) {
  if (
    !roomTypeId ||
    Number.isNaN(checkIn.getTime()) ||
    Number.isNaN(checkOut.getTime()) ||
    checkOut <= checkIn
  ) {
    throw new Error('Invalid booking dates.');
  }

  const keys: string[] = [];
  const current = utcDay(checkIn);
  const end = utcDay(checkOut);
  // Outage operations support up to 366 nights; commercial callers enforce 31.
  if ((end.getTime() - current.getTime()) / 86_400_000 > 366) throw new Error('Inventory lock range cannot exceed 366 nights.');
  while (current < end) {
    keys.push(
      `hotel-inventory:${roomTypeId}:${current.toISOString().slice(0, 10)}`
    );
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys.sort();
}

export async function lockRoomInventory(
  prisma: any,
  roomTypeId: string,
  checkIn: Date,
  checkOut: Date
) {
  for (const key of getInventoryLockKeys(roomTypeId, checkIn, checkOut)) {
    await prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      key
    );
  }
}
