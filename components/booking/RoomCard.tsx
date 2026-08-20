'use client';

import Link from 'next/link';
import { ArrowUpRight, BedDouble, Maximize2, UsersRound } from 'lucide-react';
import { RoomType } from '@/lib/types';
import { AMENITY_LABELS, BED_CONFIG_LABELS, primaryRoomImage, roomCopy } from '@/lib/hotel-storefront';

interface RoomCardProps {
  roomType: RoomType;
  availableCount?: number;
  nights?: number;
  totalPrice?: number;
  searchParams?: string;
  layout?: 'card' | 'list';
}

export function RoomCard({
  roomType,
  availableCount,
  nights = 1,
  totalPrice,
  searchParams,
  layout = 'card',
}: RoomCardProps) {
  const pricePerNight = roomType.baseRate;
  const calculatedTotal = totalPrice || pricePerNight * nights;
  const bookingUrl = searchParams ? `/rooms/${roomType.id}?${searchParams}` : `/rooms/${roomType.id}`;
  const displayedAmenities = roomType.amenities?.slice(0, 4) || [];
  const image = primaryRoomImage(roomType);

  if (layout === 'list') {
    return (
      <article className="group grid gap-6 border-b border-[var(--lodging-rule)] py-8 md:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] md:items-center">
        <Link href={bookingUrl} className="block min-w-0">
          <div className="relative aspect-[4/3] overflow-hidden bg-[var(--lodging-paper-3)]">
            <img
              src={image}
              alt={roomType.roomImages?.[0]?.altText || `${roomType.name} room`}
              className="lodging-image h-full w-full transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]"
            />
            {availableCount !== undefined ? (
              <div className="absolute left-3 top-3 bg-[color-mix(in_oklch,var(--lodging-paper)_92%,white)] px-2.5 py-1.5 backdrop-blur-sm">
                <p className="lodging-eyebrow text-[10px] text-[var(--lodging-ink)]">
                  {availableCount > 0 ? `${availableCount} available` : 'Unavailable'}
                </p>
              </div>
            ) : null}
          </div>
        </Link>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {roomType.eyebrow ? <p className="lodging-eyebrow mb-2">{roomType.eyebrow}</p> : null}
              <h3 className="lodging-title">
                <Link href={bookingUrl} className="hover:text-[var(--lodging-accent-deep)]">
                  {roomType.name}
                </Link>
              </h3>
            </div>
            <p className="lodging-serif shrink-0 text-2xl leading-none">
              ${pricePerNight}
              <span className="ml-1 text-sm text-[var(--lodging-ink-faint)]">/ night</span>
            </p>
          </div>
          <p className="text-sm leading-7 text-[var(--lodging-ink-muted)]">{roomCopy(roomType)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--lodging-ink-faint)]">
            {roomType.bedConfiguration ? (
              <span>{BED_CONFIG_LABELS[roomType.bedConfiguration] || roomType.bedConfiguration}</span>
            ) : null}
            <span>Up to {roomType.maxOccupancy} guests</span>
            {roomType.squareFeet ? <span>{roomType.squareFeet} sq ft</span> : null}
          </div>
          <Link href={bookingUrl} className="lodging-link inline-flex items-center gap-2">
            View room <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="group min-w-0">
      <Link href={bookingUrl} className="block">
        <div className="relative mb-5 aspect-[4/5] overflow-hidden bg-[var(--lodging-paper-3)]">
          <img
            src={image}
            alt={roomType.roomImages?.[0]?.altText || `${roomType.name} room`}
            className="lodging-image h-full w-full transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]"
          />
          {availableCount !== undefined ? (
            <div className="absolute left-3 top-3 bg-[color-mix(in_oklch,var(--lodging-paper)_92%,white)] px-2.5 py-1.5 backdrop-blur-sm">
              <p className="lodging-eyebrow text-[10px] text-[var(--lodging-ink)]">
                {availableCount > 0 ? `${availableCount} available` : 'Unavailable'}
              </p>
            </div>
          ) : null}
        </div>
      </Link>

      <div className="space-y-4">
        <div className="min-w-0">
          {roomType.eyebrow ? <p className="lodging-eyebrow mb-2">{roomType.eyebrow}</p> : null}
          <div className="flex items-start justify-between gap-4">
            <Link href={bookingUrl} className="lodging-serif text-[clamp(1.5rem,2.5vw,1.9rem)] leading-tight hover:text-[var(--lodging-accent-deep)]">
              {roomType.name}
            </Link>
            <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-[var(--lodging-ink-faint)] transition-colors group-hover:text-[var(--lodging-accent-deep)]" />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--lodging-ink-muted)]">{roomCopy(roomType)}</p>
        </div>

        <div className="grid gap-3 border-y border-[var(--lodging-rule)] py-4 text-sm text-[var(--lodging-ink-muted)] sm:grid-cols-3">
          {roomType.bedConfiguration ? (
            <div className="flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-[var(--lodging-accent-deep)]" />
              <span>{BED_CONFIG_LABELS[roomType.bedConfiguration] || roomType.bedConfiguration}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-[var(--lodging-accent-deep)]" />
            <span>Up to {roomType.maxOccupancy}</span>
          </div>
          {roomType.squareFeet ? (
            <div className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4 text-[var(--lodging-accent-deep)]" />
              <span>{roomType.squareFeet} sq ft</span>
            </div>
          ) : null}
        </div>

        {displayedAmenities.length ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--lodging-ink-faint)]">
            {displayedAmenities.map((amenity) => (
              <span key={amenity}>{AMENITY_LABELS[amenity] || amenity}</span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-[var(--lodging-ink-faint)]">
            From <span className="text-lg text-[var(--lodging-ink)]">${pricePerNight}</span> / night
            {nights > 1 ? (
              <span className="block text-xs">${calculatedTotal.toFixed(2)} total before fees</span>
            ) : null}
          </div>
          <Link href={bookingUrl} className="lodging-link">
            Explore
          </Link>
        </div>
      </div>
    </article>
  );
}
