import type { RoomImage } from '@/lib/types';
import { imageUrl } from '@/lib/hotel-storefront';

export interface Photo { id: string; src: string; alt: string; caption?: string | null }

export function roomPhotos(images: RoomImage[], roomName: string): Photo[] {
  return images.map((image, index) => ({ id: image.id || String(index), src: imageUrl(image), alt: image.altText || `${roomName}, photograph ${index + 1}`, caption: image.caption }));
}
