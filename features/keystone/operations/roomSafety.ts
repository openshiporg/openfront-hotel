/** Room condition changes must never release a room occupied by a live stay or
 * silently clear an explicit out-of-order decision. Call under hotel-room lock. */
export function preserveRoomOccupancy(currentStatus: string, proposedStatus: string, checkedInCount: number) {
  if (currentStatus === 'out_of_order') return 'out_of_order';
  if (checkedInCount > 0) return 'occupied';
  return proposedStatus;
}

export async function safeRoomCondition(prisma: any, roomId: string, currentStatus: string, proposedStatus: string) {
  const checkedInCount = await prisma.roomAssignment.count({ where: { roomId, booking: { status: 'checked_in' } } });
  return preserveRoomOccupancy(currentStatus, proposedStatus, checkedInCount);
}
