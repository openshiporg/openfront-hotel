'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import type { Photo } from '../../lib/photos';

export type { Photo };
export interface PhotoLightboxHandle { open: (index: number) => void }

/** Full-screen photo viewer on a native modal dialog: focus trap, Escape and arrow keys. */
export const PhotoLightbox = forwardRef<PhotoLightboxHandle, { photos: Photo[]; title: string }>(function PhotoLightbox({ photos, title }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const heading = useId();
  const [index, setIndex] = useState(0);
  const count = photos.length;
  const current = photos[Math.min(index, count - 1)];
  const go = (step: number) => setIndex(value => (value + step + count) % count);

  useImperativeHandle(ref, () => ({ open: (start: number) => { setIndex(start); dialog.current?.showModal(); } }), []);
  useEffect(() => { thumbs.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [index]);

  if (!current) return null;
  return <dialog ref={dialog} className="sf-lightbox sf-portal" aria-labelledby={heading}
    onKeyDown={event => { if (count > 1 && event.key === 'ArrowRight') go(1); if (count > 1 && event.key === 'ArrowLeft') go(-1); }}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="sf-lightbox__bar">
      <h2 id={heading}>{title}</h2>
      <button type="button" className="sf-iconbtn sf-iconbtn--onnight" aria-label="Close photographs" onClick={() => dialog.current?.close()} autoFocus><X aria-hidden="true" /></button>
    </div>
    <div className="sf-lightbox__stage">
      <img key={current.id} src={current.src} alt={current.alt} className="sf-updated" />
      {count > 1 && <>
        <button type="button" className="sf-iconbtn sf-lightbox__prev" aria-label="Previous photograph" onClick={() => go(-1)}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" className="sf-iconbtn sf-lightbox__next" aria-label="Next photograph" onClick={() => go(1)}><ChevronRight aria-hidden="true" /></button>
      </>}
    </div>
    <div className="sf-lightbox__foot">
      <div className="sf-lightbox__caption"><span>{current.caption || current.alt}</span><span className="sf-num" aria-live="polite">{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span></div>
      {count > 1 && <div className="sf-thumbs" ref={thumbs}>
        {photos.map((photo, position) => <button key={photo.id} type="button" aria-current={position === index} aria-label={`Show photograph ${position + 1}: ${photo.alt}`} onClick={() => setIndex(position)}><img src={photo.src} alt="" loading="lazy" /></button>)}
      </div>}
    </div>
  </dialog>;
});
