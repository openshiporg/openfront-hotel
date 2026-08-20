import { ROOM_TYPE_QUERY } from './storefrontRoomTypes';

async function storefrontRoomType(
  root: unknown,
  { id }: { id: string },
  context: any
) {
  return context.sudo().query.RoomType.findOne({
    where: { id },
    query: ROOM_TYPE_QUERY,
  });
}

export default storefrontRoomType;
