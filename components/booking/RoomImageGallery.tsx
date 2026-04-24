'use client';

import * as React from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface RoomImage {
  id: string;
  url: string;
  alt: string;
  isPrimary?: boolean;
}

interface RoomImageGalleryProps {
  images: RoomImage[];
  roomName: string;
}

export function RoomImageGallery({ images, roomName }: RoomImageGalleryProps) {
  const [selectedImage, setSelectedImage] = React.useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = React.useState(false);

  if (!images || images.length === 0) {
    return (
      <div className="hotel-surface-muted flex aspect-video items-center justify-center rounded-[1.75rem]">
        <p className="text-[color:oklch(0.46_0.03_58)]">No images available</p>
      </div>
    );
  }

  const handlePrevious = () => {
    setSelectedImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setSelectedImage((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isLightboxOpen) return;

    if (e.key === 'ArrowLeft') {
      handlePrevious();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    } else if (e.key === 'Escape') {
      setIsLightboxOpen(false);
    }
  };

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  return (
    <>
      <div className="space-y-4">
        {/* Main Image */}
        <div className="group relative aspect-video overflow-hidden rounded-[1.75rem] bg-[color:oklch(0.94_0.01_82)]">
          <Image
            src={images[selectedImage].url}
            alt={images[selectedImage].alt || `${roomName} - Image ${selectedImage + 1}`}
            fill
            className="object-cover"
            priority={selectedImage === 0}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 66vw, 50vw"
          />

          {/* Fullscreen Button */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => setIsLightboxOpen(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>

          {/* Navigation Arrows */}
          {images.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleNext}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>

              {/* Image Counter */}
              <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {selectedImage + 1} / {images.length}
              </div>
            </>
          )}
        </div>

        {/* Thumbnail Grid */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setSelectedImage(index)}
                className={cn(
                  "relative aspect-video rounded-md overflow-hidden border-2 transition-all",
                  selectedImage === index
                    ? "border-[color:oklch(0.41_0.07_45)] ring-2 ring-[color:oklch(0.41_0.07_45)]"
                    : "border-transparent hover:border-[color:oklch(0.82_0.02_75)]"
                )}
              >
                <Image
                  src={image.url}
                  alt={image.alt || `${roomName} thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 25vw, 10vw"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="h-[90vh] w-full max-w-7xl overflow-hidden rounded-[2rem] p-0">
          <div className="relative w-full h-full bg-black">
            <Image
              src={images[selectedImage].url}
              alt={images[selectedImage].alt || `${roomName} - Image ${selectedImage + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
            />

            {/* Lightbox Controls */}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={handlePrevious}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={handleNext}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full">
                  {selectedImage + 1} / {images.length}
                </div>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white"
              onClick={() => setIsLightboxOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
