import { Accessibility, AirVent, Bath, BedDouble, Building2, Coffee, ConciergeBell, CookingPot, Croissant, Fence, Flame, Flower2, Heater, LampDesk, Landmark, Lock, Moon, Shirt, ShowerHead, Sofa, Sparkles, Trees, Tv, Waves, Wifi, Wind, Wine, type LucideIcon } from 'lucide-react';
import { AMENITY_LABELS } from '@/lib/hotel-storefront';

const ICONS: Record<string, LucideIcon> = {
  wifi: Wifi, tv: Tv, minibar: Wine, balcony: Fence, coffee_maker: Coffee, safe: Lock, bathtub: Bath,
  shower: ShowerHead, rain_shower: ShowerHead, ac: AirVent, heating: Heater, desk: LampDesk, work_desk: LampDesk,
  iron: Shirt, hair_dryer: Wind, room_service: ConciergeBell, ocean_view: Waves, city_view: Building2,
  garden_view: Flower2, courtyard_view: Trees, kitchenette: CookingPot, jacuzzi: Bath, fireplace: Flame,
  premium_linens: BedDouble, blackout_drapes: Moon, sitting_area: Sofa, breakfast_available: Croissant,
  accessible: Accessibility, heritage_details: Landmark,
};

export function amenityLabel(key: string) {
  return AMENITY_LABELS[key] || key.replaceAll('_', ' ');
}

export function AmenityIcon({ amenity, className }: { amenity: string; className?: string }) {
  const Icon = ICONS[amenity] || Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}

export function AmenityList({ amenities, className = 'sf-amenitygrid' }: { amenities: string[]; className?: string }) {
  return <ul className={className}>{amenities.map(item => <li key={item}><AmenityIcon amenity={item} />{amenityLabel(item)}</li>)}</ul>;
}
