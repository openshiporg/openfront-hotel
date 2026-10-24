import { getHotelAvailability } from '../inventory/roomAvailability';

async function storefrontAvailability(
  _root: unknown,
  { checkInDate, checkOutDate }: { checkInDate: string; checkOutDate: string },
  context: any,
) {
  const [rows, bookablePlans] = await Promise.all([
    getHotelAvailability(context, { checkInDate, checkOutDate }),
    context.prisma.ratePlan.findMany({ where: { status: 'active', isPublic: true }, select: { roomTypeId: true } }),
  ]);
  // Same rule as the catalogue: a room type without a public rate is not shown.
  const bookable = new Set(bookablePlans.map((plan: { roomTypeId: string | null }) => plan.roomTypeId));
  return rows.filter((roomType: any) => bookable.has(roomType.id)).map((roomType: any) => ({
    id: roomType.id,
    name: roomType.name,
    shortDescription: roomType.shortDescription,
    eyebrow: roomType.eyebrow,
    viewDescription: roomType.viewDescription,
    thumbnail: roomType.thumbnail,
    baseRate: roomType.baseRateMinor / 100,
    baseRateMinor: roomType.baseRateMinor,
    maxOccupancy: roomType.maxOccupancy,
    bedConfiguration: roomType.bedConfiguration,
    amenities: roomType.amenities || [],
    squareFeet: roomType.squareFeet,
    availableCount: roomType.availableCount,
    roomImages: roomType.roomImages || [],
  }));
}

export default storefrontAvailability;
