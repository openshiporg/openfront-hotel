'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FALLBACK_HOTEL_IMAGES } from '@/lib/hotel-storefront';

interface RoomImage {
  id: string;
  url?: string | null;
  imagePath?: string | null;
  image?: { url?: string | null } | null;
  alt?: string;
  altText?: string | null;
  caption?: string | null;
}

interface RoomImageGalleryProps {
  images: RoomImage[];
  roomName: string;
}

function getUrl(image: RoomImage) {
  return image.url || image.image?.url || image.imagePath || FALLBACK_HOTEL_IMAGES.room;
}

function getAlt(image: RoomImage, roomName: string) {
  return image.alt || image.altText || `${roomName} image`;
}

export function RoomImageGallery({ images, roomName }: RoomImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const safeImages = images.length ? images : [{ id: 'fallback', imagePath: FALLBACK_HOTEL_IMAGES.room, altText: roomName }];
  const currentImage = safeImages[currentIndex];

  const nextImage = () => setCurrentIndex((current) => (current + 1) % safeImages.length);
  const prevImage = () => setCurrentIndex((current) => (current - 1 + safeImages.length) % safeImages.length);

  return (
    <div className="group space-y-4">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--lodging-paper-3)]">
        <img src={getUrl(currentImage)} alt={getAlt(currentImage, roomName)} className="lodging-image h-full w-full" />
        {safeImages.length > 1 ? (
          <>
            <button
              type="button"
              onClick={prevImage}
              className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-[color-mix(in_oklch,var(--lodging-paper)_90%,white)] text-[var(--lodging-ink)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lodging-focus)]"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={nextImage}
              className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-[color-mix(in_oklch,var(--lodging-paper)_90%,white)] text-[var(--lodging-ink)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lodging-focus)]"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="lodging-eyebrow absolute bottom-4 right-4 bg-[color-mix(in_oklch,var(--lodging-paper)_92%,white)] px-3 py-2 text-[10px] text-[var(--lodging-ink-muted)] backdrop-blur-sm">
              {currentIndex + 1} / {safeImages.length}
            </div>
          </>
        ) : null}
      </div>

      {currentImage.caption ? <p className="text-sm text-[var(--lodging-ink-faint)]">{currentImage.caption}</p> : null}

      {safeImages.length > 1 ? (
        <div className="grid grid-cols-4 gap-3">
          {safeImages.slice(0, 4).map((image, index) => (
            <button
              type="button"
              key={image.id}
              onClick={() => setCurrentIndex(index)}
              className={`aspect-[4/3] overflow-hidden border ${
                index === currentIndex ? 'border-[var(--lodging-ink)]' : 'border-[var(--lodging-rule)]'
              }`}
            >
              <img src={getUrl(image)} alt={getAlt(image, roomName)} className="lodging-image h-full w-full" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
