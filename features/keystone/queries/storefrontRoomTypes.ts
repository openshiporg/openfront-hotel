const ROOM_TYPE_QUERY = `
  id
  name
  shortDescription
  eyebrow
  viewDescription
  thumbnail
  baseRate
  baseRateMinor
  maxOccupancy
  bedConfiguration
  amenities
  squareFeet
  roomsCount
  roomImages(orderBy: { order: asc }) {
    id
    image { url }
    imagePath
    altText
    caption
    order
    isPrimary
  }
  ratePlans(where: { status: { equals: "active" }, isPublic: { equals: true } }) {
    id
    name
    description
    baseRate
    baseRateMinor
    currencyCode
    minimumStay
    cancellationPolicy
    mealPlan
    isPromotional
  }
`;

async function storefrontRoomTypes(root: unknown, args: unknown, context: any) {
  return context.sudo().query.RoomType.findMany({
    orderBy: [{ baseRateMinor: 'asc' }, { id: 'asc' }],
    take: 100,
    query: ROOM_TYPE_QUERY,
  });
}

export { ROOM_TYPE_QUERY };
export default storefrontRoomTypes;
