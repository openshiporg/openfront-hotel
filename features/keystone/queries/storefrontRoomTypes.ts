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
    maximumStay
    advanceBookingMax
    cancellationPolicy
    mealPlan
    isPromotional
  }
`;

// A room type is public only while it has a rate guests can book.
const BOOKABLE_ROOM_TYPE = { ratePlans: { some: { status: { equals: 'active' }, isPublic: { equals: true } } } };

async function storefrontRoomTypes(root: unknown, args: unknown, context: any) {
  return context.sudo().query.RoomType.findMany({
    where: BOOKABLE_ROOM_TYPE,
    orderBy: [{ baseRateMinor: 'asc' }, { id: 'asc' }],
    take: 100,
    query: ROOM_TYPE_QUERY,
  });
}

export { BOOKABLE_ROOM_TYPE, ROOM_TYPE_QUERY };
export default storefrontRoomTypes;
