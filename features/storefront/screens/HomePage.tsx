import { ArrowUpRight, BedDouble, Clock, KeyRound, MapPin } from 'lucide-react';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import type { RoomType } from '@/lib/types';
import { StayLink } from '../components/StayProvider';
import { StayPlanner } from '../components/stay/StayPlanner';
import { RoomCard } from '../components/room/RoomCard';
import { getHotelSettings } from '../lib/hotel-settings';

export default async function HomePage() {
  const identity = await getHotelSettings();
  let rooms: RoomType[] = []; let unavailable = false;
  try { rooms = (await graphqlQuery<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES)).roomTypes || []; } catch { unavailable = true; }
  const address = [identity.address.line1, identity.address.line2].filter(Boolean).join(', ');
  return <>
    <section className="sf-hero" aria-labelledby="home-title">
      <div className="sf-hero__media"><img src={identity.media.hero.imagePath} alt={identity.media.hero.altText} fetchPriority="high" /></div>
      <div className="sf-wrap sf-hero__content">
        <p className="sf-eyebrow">{identity.tagline || 'Direct reservations'}</p>
        <h1 id="home-title" className="sf-display">A place to <em>settle in.</em></h1>
        <p className="sf-lead">Find your room at {identity.name}. Choose your dates, compare live rates and reserve directly with the house.</p>
      </div>
      <p className="sf-hero__caption">{identity.media.hero.caption || identity.name}</p>
    </section>
    <div className="sf-wrap sf-planner-dock" id="choose-dates"><StayPlanner /></div>

    <section className="sf-section" aria-labelledby="home-rooms">
      <div className="sf-wrap">
        <div className="sf-pagehead__row" style={{ marginBottom: 'clamp(28px, 4vw, 48px)' }}>
          <div className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
            <p className="sf-eyebrow">Rooms & suites</p>
            <h2 id="home-rooms" className="sf-h2">Find a little room <em>to unwind.</em></h2>
          </div>
          <StayLink href="/rooms" className="sf-link">{rooms.length > 3 ? `All ${rooms.length} rooms` : 'Compare rooms & rates'} <ArrowUpRight aria-hidden="true" /></StayLink>
        </div>
        {rooms.length
          ? <div className="sf-roomgrid sf-roomgrid--scroll" data-count={Math.min(rooms.length, 3)}>{rooms.slice(0, 3).map((room, index) => <RoomCard key={room.id} room={room} href={`/rooms/${room.id}`} priority={index === 0} />)}</div>
          : <div className="sf-empty">
            <span className="sf-state__icon"><BedDouble aria-hidden="true" /></span>
            <h3 className="sf-h3">{unavailable ? 'Rooms are temporarily unavailable.' : 'The room collection is being prepared.'}</h3>
            <p className="sf-muted">Please try the room search again or contact the property for help planning your stay.</p>
            <div className="sf-row"><StayLink href="/rooms" className="sf-btn sf-btn--ghost">Open room search</StayLink><StayLink href="/contact" className="sf-link">Contact the property</StayLink></div>
          </div>}
      </div>
    </section>

    <section className="sf-band sf-section" aria-labelledby="home-house">
      <div className="sf-wrap sf-split">
        <figure className="sf-band__figure">
          <div className="sf-band__media"><img src={identity.media.amenity.imagePath} alt={identity.media.amenity.altText} loading="lazy" /></div>
          {identity.media.amenity.caption && <figcaption>{identity.media.amenity.caption}</figcaption>}
        </figure>
        <div className="sf-stack" style={{ '--stack': '22px' } as React.CSSProperties}>
          <p className="sf-eyebrow">The house</p>
          <h2 id="home-house" className="sf-h2">Before you arrive, <em>get to know the house.</em></h2>
          <p className="sf-lead">Browse the spaces, compare room comforts, and find the practical details for your arrival.</p>
          <div className="sf-row" style={{ gap: '8px 28px' }}>
            <StayLink href="/gallery" className="sf-link">View the gallery <ArrowUpRight aria-hidden="true" /></StayLink>
            <StayLink href="/amenities" className="sf-link">Around the house <ArrowUpRight aria-hidden="true" /></StayLink>
          </div>
        </div>
      </div>
    </section>

    <section className="sf-section" aria-labelledby="home-practical">
      <div className="sf-wrap">
        <div className="sf-stack" style={{ '--stack': '16px', marginBottom: 'clamp(28px, 4vw, 44px)' } as React.CSSProperties}>
          <p className="sf-eyebrow">Good to know</p>
          <h2 id="home-practical" className="sf-h2">The practical part, <em>made simple.</em></h2>
        </div>
        <div className="sf-features">
          <article className="sf-feature">
            <span className="sf-feature__icon"><Clock aria-hidden="true" /></span>
            <h3 className="sf-h3">Arrival & departure</h3>
            <div className="sf-times"><div><small>Check-in from</small><b>{identity.checkIn}</b></div><div><small>Check-out by</small><b>{identity.checkOut}</b></div></div>
            <p className="sf-fine">Local property time. Ask ahead about early arrival or late departure.</p>
          </article>
          <article className="sf-feature">
            <span className="sf-feature__icon"><MapPin aria-hidden="true" /></span>
            <h3 className="sf-h3">We’ll meet you here</h3>
            <p className="sf-muted">{address || 'Contact the property for arrival directions.'}</p>
            <StayLink href="/location" className="sf-link">Location & arrival <ArrowUpRight aria-hidden="true" /></StayLink>
          </article>
          <article className="sf-feature">
            <span className="sf-feature__icon"><KeyRound aria-hidden="true" /></span>
            <h3 className="sf-h3">Already booked?</h3>
            <p className="sf-muted">Find your confirmation, review your statement, or ask about a change to your plans.</p>
            <StayLink href="/bookings/lookup" className="sf-link">Manage your stay <ArrowUpRight aria-hidden="true" /></StayLink>
          </article>
        </div>
      </div>
    </section>
  </>;
}
