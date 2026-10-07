import { SearchWidget } from '@/components/booking/SearchWidget';
import { RoomCard } from '@/components/booking/RoomCard';
import { StayLink } from '../components/StayProvider';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import type { RoomType } from '@/lib/types';
import { getHotelSettings } from '../lib/hotel-settings';
export default async function HomePage() {
  const identity = await getHotelSettings();
  let rooms: RoomType[] = []; let unavailable = false;
  try { rooms = (await graphqlQuery<{roomTypes: RoomType[]}>(GET_ROOM_TYPES)).roomTypes || []; } catch { unavailable = true; }
  return <main>
    <section className="lodging-container hotel-arrival">
      <div className="hotel-arrival-copy"><p className="lodging-eyebrow">{identity.tagline || 'Direct reservations'}</p><h1 className="lodging-display">A place to<br />settle in.</h1><p>Find your room at {identity.name}. Choose your dates, take a closer look, and make the stay your own.</p><StayLink href="/rooms" className="lodging-link mt-5">Explore the rooms ↗</StayLink></div>
      <figure className="hotel-arrival-photo"><img src={identity.media.hero.imagePath} alt={identity.media.hero.altText} fetchPriority="high" /><figcaption>{identity.media.hero.caption || identity.name}</figcaption></figure>
    </section>
    <div className="lodging-container" id="choose-dates"><SearchWidget /></div>
    <section className="lodging-container hotel-section"><div className="hotel-section-heading"><div><p className="lodging-eyebrow">Your room, your rhythm</p><h2 className="lodging-headline">Find a little room to unwind.</h2></div><StayLink href="/rooms" className="lodging-link">All rooms & rates ↗</StayLink></div>
      {rooms.length ? <div className="hotel-room-grid">{rooms.slice(0,3).map(room=><RoomCard key={room.id} roomType={room} />)}</div> : <div className="hotel-notice"><h3 className="lodging-title">{unavailable ? 'Rooms are temporarily unavailable.' : 'The room collection is being prepared.'}</h3><p>Please try the room search again or contact the property for help planning your stay.</p><StayLink href="/rooms" className="lodging-link">Open room search</StayLink></div>}
    </section>
    <section className="hotel-band"><div className="lodging-container hotel-section hotel-editorial"><img src={identity.media.amenity.imagePath} alt={identity.media.amenity.altText} loading="lazy" /><div><p className="lodging-eyebrow">Take a closer look</p><h2 className="lodging-headline">Before you arrive,<br />get to know the house.</h2><p>Browse the spaces, compare room comforts, and find the practical details for your arrival.</p><div className="flex flex-wrap gap-6 mt-6"><StayLink href="/gallery" className="lodging-link">View the gallery ↗</StayLink><StayLink href="/amenities" className="lodging-link">Around the house ↗</StayLink></div></div></div></section>
    <section className="lodging-container hotel-section hotel-details-grid"><article><p className="lodging-eyebrow">Plan your arrival</p><h2>We’ll meet you here.</h2><p>{[identity.address.line1,identity.address.line2].filter(Boolean).join(', ') || 'Contact the property for arrival directions.'}</p><StayLink href="/location" className="lodging-link">Location & arrival ↗</StayLink></article><article><p className="lodging-eyebrow">Already have a reservation?</p><h2>Your stay, in one place.</h2><p>Find your confirmation, review your statement, or ask about a change to your plans.</p><StayLink href="/bookings/lookup" className="lodging-link">Manage your stay ↗</StayLink></article></section>
  </main>;
}
