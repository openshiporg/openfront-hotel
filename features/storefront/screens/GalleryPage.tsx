import { getHotelSettings } from '../lib/hotel-settings';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import type { RoomType } from '@/lib/types';
import { RoomImageGallery } from '@/components/booking/RoomImageGallery';
import { StayLink } from '../components/StayProvider';
export default async function GalleryPage() {
  const identity=await getHotelSettings(); let rooms:RoomType[]=[];
  try { rooms=(await graphqlQuery<{roomTypes:RoomType[]}>(GET_ROOM_TYPES)).roomTypes || []; } catch { /* Property photographs remain available. */ }
  return <main className="lodging-container"><div className="hotel-page-head"><p className="lodging-eyebrow">The gallery</p><h1 className="lodging-display">Picture your stay.</h1><p>A closer look at {identity.name}. Explore the house, then the rooms.</p></div><nav className="hotel-subnav" aria-label="Gallery sections"><a href="#house">The house</a><a href="#guestrooms">Guest rooms</a><StayLink href="/rooms">Rooms & rates ↗</StayLink></nav><section id="house" className="hotel-section"><h2 className="lodging-headline mb-8">Around the house.</h2><div className="hotel-gallery-grid">{Object.entries(identity.media).map(([key,media])=><figure key={key}><img src={media.imagePath} alt={media.altText} loading="lazy" /><figcaption>{media.caption || media.altText}</figcaption></figure>)}</div></section><section id="guestrooms" className="pb-16"><h2 className="lodging-headline mb-8">Your own space.</h2><div className="space-y-14">{rooms.map(room=><article key={room.id}><div className="hotel-section-heading"><h3 className="lodging-title">{room.name}</h3><StayLink href={`/rooms/${room.id}`} className="lodging-link">Explore this room ↗</StayLink></div><RoomImageGallery images={room.roomImages || []} roomName={room.name} /></article>)}</div>{!rooms.length && <div className="hotel-notice"><p>Room photographs are unavailable right now.</p><StayLink href="/rooms" className="lodging-link">Try the room collection</StayLink></div>}</section></main>;
}
