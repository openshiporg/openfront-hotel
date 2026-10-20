import { ArrowUpRight, Images } from 'lucide-react';
import { getHotelSettings } from '../lib/hotel-settings';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import type { RoomType } from '@/lib/types';
import { StayLink } from '../components/StayProvider';
import { GalleryGrid } from '../components/room/GalleryGrid';
import { roomPhotos } from '../lib/photos';
import { roomImages } from '@/lib/hotel-storefront';
import { PageHead } from '../components/ui';

export default async function GalleryPage() {
  const identity = await getHotelSettings(); let rooms: RoomType[] = [];
  try { rooms = (await graphqlQuery<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES)).roomTypes || []; } catch { /* Property photographs remain available. */ }
  const house = Object.entries(identity.media).map(([key, media]) => ({ id: key, src: media.imagePath, alt: media.altText, caption: media.caption || media.altText }));
  return <>
    <PageHead eyebrow="The gallery" title={<>Picture <em>your stay.</em></>} lead={`A closer look at ${identity.name}. Explore the house, then the rooms.`}>
      <nav className="sf-segment" aria-label="Gallery sections">
        <a href="#house" className="sf-segment__link">The house</a>
        <a href="#guestrooms" className="sf-segment__link">Guest rooms</a>
      </nav>
    </PageHead>
    <section id="house" className="sf-wrap" aria-labelledby="gallery-house" style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
      <h2 id="gallery-house" className="sf-h2" style={{ marginBottom: 24 }}>Around <em>the house.</em></h2>
      <GalleryGrid photos={house} title={identity.name} />
    </section>
    <section id="guestrooms" className="sf-band sf-section" aria-labelledby="gallery-rooms">
      <div className="sf-wrap">
        <div className="sf-pagehead__row" style={{ marginBottom: 32 }}>
          <div className="sf-stack" style={{ '--stack': '14px' } as React.CSSProperties}><p className="sf-eyebrow">Guest rooms</p><h2 id="gallery-rooms" className="sf-h2">Your own <em>space.</em></h2></div>
          <StayLink href="/rooms" className="sf-link">Rooms & rates <ArrowUpRight aria-hidden="true" /></StayLink>
        </div>
        {rooms.length ? <div className="sf-stack" style={{ '--stack': 'clamp(40px, 6vw, 64px)' } as React.CSSProperties}>
          {rooms.map(room => <article key={room.id} aria-labelledby={`gallery-${room.id}`}>
            <div className="sf-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 id={`gallery-${room.id}`} className="sf-h3">{room.name}</h3>
              <StayLink href={`/rooms/${room.id}`} className="sf-link">Explore this room <ArrowUpRight aria-hidden="true" /></StayLink>
            </div>
            <GalleryGrid photos={roomPhotos(roomImages(room), room.name)} title={room.name} />
          </article>)}
        </div> : <div className="sf-empty" style={{ borderColor: 'oklch(100% 0 0 / 0.2)' }}>
          <span className="sf-state__icon"><Images aria-hidden="true" /></span>
          <p>Room photographs are unavailable right now.</p>
          <StayLink href="/rooms" className="sf-btn sf-btn--light">Try the room collection</StayLink>
        </div>}
      </div>
    </section>
  </>;
}
