export const GROUP_OPERATIONS_DISABLED_MESSAGE = 'Enable group operations in durable property settings before creating or changing group blocks.';
/** Source-backed groups remain opt-in; missing configuration fails closed. */
export async function assertHotelGroupsEnabled(prisma: any) {
  const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
  if (settings?.groupsEnabled !== true) throw new Error(GROUP_OPERATIONS_DISABLED_MESSAGE);
  return settings;
}
/** Kept for older external callers; no experimental operation silently enables itself. */
export function rejectDisabledGroupOperation(): never { throw new Error(GROUP_OPERATIONS_DISABLED_MESSAGE); }
