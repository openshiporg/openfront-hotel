'use client';

import { useRef } from 'react';
import { Images } from 'lucide-react';
import type { RoomImage } from '@/lib/types';
import { roomPhotos } from '../../lib/photos';
import { PhotoLightbox, type PhotoLightboxHandle } from './PhotoLightbox';

/** Photo mosaic (up to three tiles) that opens a full-screen viewer. */
export function RoomGallery({ images, roomName }: { images: RoomImage[]; roomName: string }) {
  const viewer = useRef<PhotoLightboxHandle>(null);
  const photos = roomPhotos(images, roomName);
  const tiles = photos.slice(0, 3);
  return <section aria-label={`${roomName} photographs`}>
    <div className="sf-mosaic" data-count={tiles.length}>
      {tiles.map((photo, index) => <button key={photo.id} type="button" className="sf-mosaic__tile" aria-label={`Open photograph ${index + 1} of ${photos.length}: ${photo.alt}`} onClick={() => viewer.current?.open(index)}>
        <img src={photo.src} alt={photo.alt} fetchPriority={index === 0 ? 'high' : undefined} loading={index === 0 ? 'eager' : 'lazy'} />
      </button>)}
      <button type="button" className="sf-btn sf-btn--light sf-btn--sm sf-mosaic__all" onClick={() => viewer.current?.open(0)}><Images aria-hidden="true" />{photos.length > 1 ? `All ${photos.length} photos` : 'View photo'}</button>
    </div>
    <PhotoLightbox ref={viewer} photos={photos} title={roomName} />
  </section>;
}
