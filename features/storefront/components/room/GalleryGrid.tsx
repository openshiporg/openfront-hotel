'use client';

import { useRef } from 'react';
import { PhotoLightbox, type Photo, type PhotoLightboxHandle } from './PhotoLightbox';

/** Masonry photo grid; every photograph opens the full-screen viewer at its position. */
export function GalleryGrid({ photos, title }: { photos: Photo[]; title: string }) {
  const viewer = useRef<PhotoLightboxHandle>(null);
  return <>
    <div className="sf-gallerygrid">
      {photos.map((photo, index) => <figure key={photo.id}>
        <button type="button" aria-label={`Open photograph: ${photo.alt}`} onClick={() => viewer.current?.open(index)}>
          <img src={photo.src} alt={photo.alt} loading={index < 2 ? 'eager' : 'lazy'} />
        </button>
        {photo.caption && <figcaption>{photo.caption}</figcaption>}
      </figure>)}
    </div>
    <PhotoLightbox ref={viewer} photos={photos} title={title} />
  </>;
}
