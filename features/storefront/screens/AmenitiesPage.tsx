import { ArrowUpRight, BedDouble, MapPin, MessageCircle } from 'lucide-react';
import { getHotelSettings } from '../lib/hotel-settings';
import { StayLink } from '../components/StayProvider';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import type { RoomType } from '@/lib/types';
import { AmenityList } from '../components/room/AmenityIcon';
import { RoomFacts } from '../components/room/RoomCard';
import { PageHead } from '../components/ui';

export default async function AmenitiesPage() {
  const identity = await getHotelSettings(); let rooms: RoomType[] = [];
  try { rooms = (await graphqlQuery<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES)).roomTypes || []; } catch { /* Scoped catalog fallback below. */ }
  return <>
    <PageHead eyebrow="Around the house" title={<>The details <em>of your stay.</em></>} lead={`Get to know ${identity.name}, from the spaces you see to the comforts in your room.`} />
    <section className="sf-wrap" aria-labelledby="amenities-closer" style={{ paddingBottom: 'clamp(48px, 7vw, 96px)' }}>
      <div className="sf-split">
        <div className="sf-band__media"><img src={identity.media.amenity.imagePath} alt={identity.media.amenity.altText} /></div>
        <div className="sf-stack" style={{ '--stack': '20px' } as React.CSSProperties}>
          <p className="sf-eyebrow">A closer look</p>
          <h2 id="amenities-closer" className="sf-h2">Make room for <em>your kind of stay.</em></h2>
          {identity.media.amenity.caption && <p className="sf-lead">{identity.media.amenity.caption}</p>}
          <p className="sf-body">Room features vary by category. Review the published amenities below, and check your selected rate for any meals included.</p>
          <StayLink href="/gallery" className="sf-link">Explore the gallery <ArrowUpRight aria-hidden="true" /></StayLink>
        </div>
      </div>
    </section>
    <section className="sf-panel" aria-labelledby="amenities-rooms" style={{ borderRadius: 0 }}>
      <div className="sf-wrap sf-section">
        <div className="sf-pagehead__row" style={{ marginBottom: 32 }}>
          <div className="sf-stack" style={{ '--stack': '14px' } as React.CSSProperties}><p className="sf-eyebrow">In your room</p><h2 id="amenities-rooms" className="sf-h2">Comforts, <em>room by room.</em></h2></div>
          <StayLink href="/rooms" className="sf-link">Compare rooms & rates <ArrowUpRight aria-hidden="true" /></StayLink>
        </div>
        {rooms.length ? <div className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>{rooms.map(room => <article key={room.id} className="sf-card sf-roomrow" aria-labelledby={`amenities-${room.id}`}>
          <div className="sf-media" style={{ borderRadius: 0, minHeight: 240 }}><img src={primaryRoomImage(room)} alt={room.name} loading="lazy" style={{ position: 'absolute', inset: 0 }} /></div>
          <div className="sf-pad sf-stack" style={{ '--stack': '14px' } as React.CSSProperties}>
            <div className="sf-row" style={{ justifyContent: 'space-between' }}><h3 id={`amenities-${room.id}`} className="sf-h3">{room.name}</h3><StayLink href={`/rooms/${room.id}`} className="sf-link">Room details <ArrowUpRight aria-hidden="true" /></StayLink></div>
            <RoomFacts room={room} />
            {room.amenities?.length ? <AmenityList amenities={room.amenities} /> : <p className="sf-muted">Ask the property about the amenities in this room.</p>}
          </div>
        </article>)}</div> : <div className="sf-empty"><span className="sf-state__icon"><BedDouble aria-hidden="true" /></span><p>Room amenities are unavailable right now. Contact the property for details.</p></div>}
      </div>
    </section>
    <section className="sf-wrap sf-section" aria-label="Planning help">
      <div className="sf-features" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        <article className="sf-feature"><span className="sf-feature__icon"><MessageCircle aria-hidden="true" /></span><h2 className="sf-h3">Something specific in mind?</h2><p className="sf-muted">Ask about accessibility, dietary needs, parking, or other requirements before reserving. Requests depend on the property’s confirmation.</p><StayLink href="/contact?subject=Stay%20requirements" className="sf-link">Ask the property <ArrowUpRight aria-hidden="true" /></StayLink></article>
        <article className="sf-feature"><span className="sf-feature__icon"><MapPin aria-hidden="true" /></span><h2 className="sf-h3">A little planning, a calmer arrival.</h2><p className="sf-muted">Find the address and published arrival times, then review the terms attached to your selected rate.</p><div className="sf-row" style={{ gap: '4px 24px' }}><StayLink href="/location" className="sf-link">Arrival details <ArrowUpRight aria-hidden="true" /></StayLink><StayLink href="/policies" className="sf-link">Booking & stay policies <ArrowUpRight aria-hidden="true" /></StayLink></div></article>
      </div>
    </section>
  </>;
}
