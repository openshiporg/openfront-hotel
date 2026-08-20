import { getHotelAvailability } from '../lib/hotelAvailability';

async function storefrontAvailability(
  _root: unknown,
  { checkInDate, checkOutDate }: { checkInDate: string; checkOutDate: string },
  context: any,
) {
  const rows = await getHotelAvailability(context, { checkInDate, checkOutDate });
  return rows.map((roomType: any) => ({
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
