import { BOOKABLE_ROOM_TYPE, ROOM_TYPE_QUERY } from './storefrontRoomTypes';

async function storefrontRoomType(
  root: unknown,
  { id }: { id: string },
  context: any
) {
  const [roomType] = await context.sudo().query.RoomType.findMany({
    where: { id: { equals: id }, ...BOOKABLE_ROOM_TYPE },
    take: 1,
    query: ROOM_TYPE_QUERY,
  });
  return roomType || null;
}

export default storefrontRoomType;
