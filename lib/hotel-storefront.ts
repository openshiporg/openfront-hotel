import type { RoomImage, RoomType } from './types';
import { NEUTRAL_HOTEL_FALLBACK } from '@/features/storefront/lib/hotel-settings';

/** @deprecated Pass the identity returned by getHotelSettings into storefront UI. */
export const HOTEL_IDENTITY = NEUTRAL_HOTEL_FALLBACK;

export const FALLBACK_HOTEL_IMAGES = {
  hero: NEUTRAL_HOTEL_FALLBACK.media.hero.imagePath,
  room: '/images/generated/deluxe-king-room.png',
  amenity: NEUTRAL_HOTEL_FALLBACK.media.amenity.imagePath,
  location: NEUTRAL_HOTEL_FALLBACK.media.location.imagePath,
};

const ROOM_IMAGE_BY_NAME: Record<string, string> = {
  'Classic Queen': '/images/generated/classic-queen-room.png',
  'Deluxe King': '/images/generated/deluxe-king-room.png',
  'Family Suite': '/images/generated/family-suite-room.png',
};

export const AMENITY_LABELS: Record<string, string> = {
  wifi: 'High-speed Wi-Fi',
  tv: 'Smart TV',
  minibar: 'Minibar',
  balcony: 'Private balcony',
  coffee_maker: 'Coffee maker',
  safe: 'In-room safe',
  bathtub: 'Soaking bathtub',
  shower: 'Rain shower',
  rain_shower: 'Rain shower',
  ac: 'Climate control',
  heating: 'Heating',
  desk: 'Writing desk',
  work_desk: 'Writing desk',
  iron: 'Iron',
  hair_dryer: 'Hair dryer',
  room_service: 'Room service',
  ocean_view: 'Ocean view',
  city_view: 'Skyline view',
  garden_view: 'Garden view',
  courtyard_view: 'Courtyard view',
  kitchenette: 'Kitchenette',
  jacuzzi: 'Jacuzzi',
  fireplace: 'Fireplace',
  premium_linens: 'Premium linens',
  blackout_drapes: 'Blackout drapes',
  sitting_area: 'Sitting area',
  breakfast_available: 'Breakfast available',
  accessible: 'Accessible details',
  heritage_details: 'Heritage details',
};

export const BED_CONFIG_LABELS: Record<string, string> = {
  king: '1 king bed',
  queen: '1 queen bed',
  double_queen: '2 queen beds',
  twin: '1 twin bed',
  double_twin: '2 twin beds',
  king_sofa: 'King bed + sofa',
  queen_sofa: 'Queen bed + sofa',
  suite: 'Suite layout',
};

export function imageUrl(image?: RoomImage | null, fallback = FALLBACK_HOTEL_IMAGES.room) {
  return image?.image?.url || image?.url || image?.imagePath || fallback;
}

export function roomImages(roomType?: Pick<RoomType, 'roomImages' | 'name'> | null) {
  const images = [...(roomType?.roomImages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (images.length) return images;
  const fallbackPath = ROOM_IMAGE_BY_NAME[roomType?.name || ''] || FALLBACK_HOTEL_IMAGES.room;
  return [
    {
      id: 'fallback',
      imagePath: fallbackPath,
      altText: `${roomType?.name || 'Hotel room'} image`,
      caption: `${roomType?.name || 'Guest room'} interior`,
      order: 0,
      isPrimary: true,
    },
  ];
}

export function primaryRoomImage(roomType?: Pick<RoomType, 'roomImages' | 'thumbnail' | 'name'> | null) {
  const primary = roomType?.roomImages?.find((image) => image.isPrimary) || roomType?.roomImages?.[0];
  return (
    primary?.image?.url ||
    primary?.url ||
    primary?.imagePath ||
    roomType?.thumbnail ||
    ROOM_IMAGE_BY_NAME[roomType?.name || ''] ||
    FALLBACK_HOTEL_IMAGES.room
  );
}

export function roomCopy(roomType: Pick<RoomType, 'shortDescription' | 'viewDescription' | 'name'>) {
  return (
    roomType.shortDescription ||
    roomType.viewDescription ||
    `A composed ${roomType.name.toLowerCase()} designed for direct booking guests.`
  );
}
