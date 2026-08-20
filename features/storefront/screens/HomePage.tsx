import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SearchWidget } from '@/components/booking/SearchWidget';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import {
  BED_CONFIG_LABELS,
  FALLBACK_HOTEL_IMAGES,
  primaryRoomImage,
  roomCopy,
} from '@/lib/hotel-storefront';
import type { RoomType } from '@/lib/types';
import { getHotelSettings } from '@/features/storefront/lib/hotel-settings';

interface RoomTypesResponse {
  roomTypes: RoomType[];
}

export default async function HomePage() {
  const identity = await getHotelSettings();
  let roomTypes: RoomType[] = [];
  try {
    const data = await graphqlQuery<RoomTypesResponse>(GET_ROOM_TYPES);
    roomTypes = data.roomTypes || [];
  } catch {
    roomTypes = [];
  }

  return (
    <main>
      <section className="relative min-h-[min(92svh,52rem)] overflow-hidden bg-[var(--lodging-night)]">
        <div className="absolute inset-0">
          <img
            src={identity.media.hero.imagePath || FALLBACK_HOTEL_IMAGES.hero}
            alt={identity.media.hero.altText}
            className="lodging-image h-full w-full opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-[var(--lodging-night)] via-[color-mix(in_oklch,var(--lodging-night)_78%,transparent)] to-[color-mix(in_oklch,var(--lodging-night)_35%,transparent)]" />
        </div>

        <div className="lodging-container relative z-10 grid min-h-[min(92svh,52rem)] gap-10 pb-10 pt-16 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-end md:pb-16 md:pt-20">
          <div className="min-w-0 self-end text-[color-mix(in_oklch,var(--lodging-paper)_94%,white)]">
            <p className="lodging-eyebrow mb-5 text-[color-mix(in_oklch,var(--lodging-accent)_85%,white)]">
              {identity.tagline}
            </p>
            <h1 className="lodging-display max-w-[11ch] md:max-w-none">
              Arrive quietly.
              <span className="block text-[color-mix(in_oklch,var(--lodging-accent-pale)_88%,white)]">Stay with intention.</span>
            </h1>
            <p className="mt-6 max-w-md text-[color-mix(in_oklch,var(--lodging-paper)_72%,white)] leading-7">
              A boutique city hotel built for direct reservations—clear room context, front-desk support, and none of the marketplace noise.
            </p>
          </div>

          <div className="min-w-0 self-end">
            <SearchWidget variant="hero" />
          </div>
        </div>
      </section>

      <section className="lodging-container py-[clamp(4rem,9vw,7rem)]">
        <div className="lodging-grid-break border-b border-[var(--lodging-rule)] pb-10">
          <div className="min-w-0">
            <h2 className="lodging-headline">Room types, named and priced clearly.</h2>
          </div>
          <p className="lodging-lead min-w-0">
            Three room categories in the live catalog—Classic Queen, Deluxe King, and Family Suite—each with occupancy, bedding, and nightly rates pulled from the property system.
          </p>
        </div>

        <div className="mt-12 space-y-0">
          {roomTypes.length > 0 ? (
            roomTypes.map((room, index) => {
              const image = primaryRoomImage(room);
              return (
                <article
                  key={room.id}
                  className={`grid gap-8 border-b border-[var(--lodging-rule)] py-10 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] md:items-center ${
                    index % 2 === 1 ? 'md:[&>div:first-child]:order-2' : ''
                  }`}
                >
                  <Link href={`/rooms/${room.id}`} className="group block min-w-0">
                    <div className="aspect-[5/4] overflow-hidden bg-[var(--lodging-paper-3)]">
                      <img
                        src={image}
                        alt={room.name}
                        className="lodging-image h-full w-full transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]"
                      />
                    </div>
                  </Link>
                  <div className="min-w-0 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        {room.eyebrow ? <p className="lodging-eyebrow mb-2">{room.eyebrow}</p> : null}
                        <h3 className="lodging-title">
                          <Link href={`/rooms/${room.id}`} className="hover:text-[var(--lodging-accent-deep)]">
                            {room.name}
                          </Link>
                        </h3>
                      </div>
                      <p className="lodging-serif shrink-0 text-[clamp(1.5rem,2.5vw,2rem)] leading-none">
                        ${room.baseRate}
                        <span className="ml-1 text-sm text-[var(--lodging-ink-faint)]">/ night</span>
                      </p>
                    </div>
                    <p className="max-w-xl text-[var(--lodging-ink-muted)] leading-7">{roomCopy(room)}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--lodging-ink-faint)]">
                      {room.bedConfiguration ? (
                        <span>{BED_CONFIG_LABELS[room.bedConfiguration] || room.bedConfiguration}</span>
                      ) : null}
                      <span>Up to {room.maxOccupancy} guests</span>
                      {room.squareFeet ? <span>{room.squareFeet} sq ft</span> : null}
                    </div>
                    <Link href={`/rooms/${room.id}`} className="lodging-link inline-flex items-center gap-2">
                      View room <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="border border-[var(--lodging-rule)] px-6 py-16 text-center">
              <p className="lodging-lead">Room catalog is loading from the property system. Browse all rooms to check live availability.</p>
              <Link href="/rooms" className="lodging-button mt-8 inline-flex">
                Browse rooms
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="border-y border-[var(--lodging-rule)] bg-[var(--lodging-paper-2)]">
        <div className="lodging-container grid gap-10 py-[clamp(4rem,8vw,6rem)] lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="min-w-0">
            <h2 className="lodging-headline">The house, in three rhythms.</h2>
          </div>
          <div className="grid min-w-0 gap-8 sm:grid-cols-3">
            {[
              {
                title: 'Restore',
                copy: 'Wellness spa with treatment suites and a recovery lounge for slow afternoons.',
              },
              {
                title: 'Dine',
                copy: 'Rooftop dining with seasonal plates and breakfast service for unhurried mornings.',
              },
              {
                title: 'Move',
                copy: 'A compact fitness atelier with strength essentials and stretch space.',
              },
            ].map((item) => (
              <div key={item.title} className="min-w-0 border-l border-[var(--lodging-rule-strong)] pl-5">
                <p className="lodging-eyebrow mb-3 text-[var(--lodging-accent-deep)]">{item.title}</p>
                <p className="text-sm leading-7 text-[var(--lodging-ink-muted)]">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lodging-container py-[clamp(4rem,9vw,7rem)]">
        <div className="lodging-surface grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
          <div className="min-w-0">
            <h2 className="lodging-title max-w-2xl">Plan from the property—not a third-party listing.</h2>
            <p className="mt-4 max-w-xl text-[var(--lodging-ink-muted)] leading-7">
              Compare layouts, review rate plans, and reserve with the front desk on the other side of the confirmation.
            </p>
          </div>
          <Link href="/rooms" className="lodging-button shrink-0">
            Check availability
          </Link>
        </div>
      </section>
    </main>
  );
}
