import { ArrowRight, BedDouble, ChevronRight, Clock, ConciergeBell, KeyRound, MapPin } from 'lucide-react';
import { graphqlQuery } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import type { RatePlan, RoomType } from '@/lib/types';
import { BED_CONFIG_LABELS, primaryRoomImage, roomCopy } from '@/lib/hotel-storefront';
import { StayLink } from '../components/StayProvider';
import { StayPlanner } from '../components/stay/StayPlanner';
import { AmenityIcon, amenityLabel } from '../components/room/AmenityIcon';
import { CancellationBar } from '../components/CancellationBar';
import { getHotelSettings } from '../lib/hotel-settings';
import { cancellationHeadline, mealPlanLabel, nightMoney } from '../lib/stay-context';

/** Lowest public, non-promotional nightly base rate, without cents when whole. */
function fromRate(room: RoomType) {
  const plans = (room.ratePlans || []).filter(plan => !plan.isPromotional && Number.isSafeInteger(plan.baseRateMinor) && plan.currencyCode);
  if (!plans.length) return null;
  const lowest = plans.reduce((best, plan) => (plan.baseRateMinor! < best.baseRateMinor! ? plan : best));
  try { return nightMoney(lowest.baseRateMinor!, lowest.currencyCode); } catch { return null; }
}

function planRate(plan: RatePlan) {
  if (!Number.isSafeInteger(plan.baseRateMinor) || !plan.currencyCode) return null;
  try { return nightMoney(plan.baseRateMinor!, plan.currencyCode); } catch { return null; }
}

const SHORT_BEDS: Record<string, string> = { king: 'King', queen: 'Queen', double_queen: '2 queens', twin: 'Twin', double_twin: '2 twins', king_sofa: 'King + sofa', queen_sofa: 'Queen + sofa', suite: 'Suite' };

function bedLabel(room: RoomType) {
  if (!room.bedConfiguration) return `Sleeps ${room.maxOccupancy}`;
  return SHORT_BEDS[room.bedConfiguration] || BED_CONFIG_LABELS[room.bedConfiguration] || room.bedConfiguration.replaceAll('_', ' ');
}

/** Amenities ranked by how many room types offer them. */
function houseAmenities(rooms: RoomType[]) {
  const counts = new Map<string, number>();
  rooms.forEach(room => (room.amenities || []).forEach(item => counts.set(item, (counts.get(item) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([item]) => item);
}

function RoomTile({ room, priority }: { room: RoomType; priority: boolean }) {
  const rate = fromRate(room);
  const href = `/rooms/${room.id}`;
  return <article className="rg-room">
    <StayLink href={href} className="rg-room__media" tabIndex={-1} aria-hidden="true">
      <img src={primaryRoomImage(room)} alt="" loading={priority ? 'eager' : 'lazy'} />
      <span className="rg-room__tag">{room.name}<ChevronRight /></span>
    </StayLink>
    <div className="rg-room__body">
      <h3 className="rg-room__name"><StayLink href={href}>{room.name}</StayLink></h3>
      <p className="rg-room__copy">{roomCopy(room)}</p>
      <div className="rg-room__foot">
        <span className="rg-room__bed"><BedDouble aria-hidden="true" />{bedLabel(room)}</span>
        {rate
          ? <span className="rg-room__price"><small className="rg-room__from">from</small><b>{rate}</b><small className="rg-room__night">night</small></span>
          : <span className="rg-room__price"><small>Rates by date</small></span>}
        <StayLink href={href} className="sf-btn rg-room__go" aria-label={`View ${room.name}`}><span className="rg-desk">View room</span><span className="rg-phone">Details</span></StayLink>
      </div>
    </div>
  </article>;
}

export default async function HomePage() {
  const identity = await getHotelSettings();
  let rooms: RoomType[] = []; let unavailable = false;
  try { rooms = (await graphqlQuery<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES)).roomTypes || []; } catch { unavailable = true; }
  const amenities = houseAmenities(rooms);
  const plans = rooms.flatMap(room => (room.ratePlans || []).filter(plan => !plan.isPromotional).map(plan => ({ plan, room })));
  const flexible = plans.find(({ plan }) => plan.cancellationPolicy === 'flexible');
  const city = identity.address.line2 || identity.address.line1;
  const address = [identity.address.line1, identity.address.line2].filter(Boolean).join(', ');
  // Featured rate: the lowest flexible nightly rate (else the lowest public rate); the rest follow as a list.
  const priced = plans.map(entry => ({ ...entry, rate: planRate(entry.plan) }));
  const byPrice = [...priced].sort((a, b) => (a.plan.baseRateMinor ?? Infinity) - (b.plan.baseRateMinor ?? Infinity));
  const featured = byPrice.find(({ plan }) => plan.cancellationPolicy === 'flexible') || byPrice[0];
  const others = priced.filter(entry => entry !== featured).slice(0, 3);

  return <>
    <section className="rg-hero" aria-labelledby="home-title">
      <div className="rg-hero__media">
        <picture>
          <img src={identity.media.hero.imagePath} alt={identity.media.hero.altText} fetchPriority="high" />
        </picture>
      </div>
      <div className="rg-hero__title">
        <h1 id="home-title">{identity.name}</h1>
        {identity.tagline && <p><span>{identity.tagline.split('·')[0].trim()}</span></p>}
      </div>
      <div className="rg-hero__search" id="choose-dates"><StayPlanner /></div>
    </section>

    <section className="rg-section rg-rooms" aria-labelledby="home-rooms">
      <div className="rg-wrap">
        <header className="rg-head">
          <p className="rg-eyebrow">Our rooms</p>
          <h2 id="home-rooms" className="rg-h2"><span className="rg-desk">Thoughtful comfort. Timeless style.</span><span className="rg-phone">Relax in comfort</span></h2>
          <p className="rg-head__lead">{rooms.length ? `${rooms.length} ${rooms.length === 1 ? 'room type' : 'room types'}, each designed for rest and relaxation.` : ''}</p>
        </header>
        {rooms.length
          ? <div className="rg-roomgrid" data-count={Math.min(rooms.length, 3)}>{rooms.slice(0, 3).map((room, index) => <RoomTile key={room.id} room={room} priority={index === 0} />)}</div>
          : <div className="sf-empty">
            <span className="sf-state__icon"><BedDouble aria-hidden="true" /></span>
            <h3 className="sf-h3">{unavailable ? 'Rooms are temporarily unavailable.' : 'The room collection is being prepared.'}</h3>
            <p className="sf-muted">Please try the room search again or contact the property for help planning your stay.</p>
            <div className="sf-row"><StayLink href="/rooms" className="sf-btn sf-btn--ghost">Open room search</StayLink><StayLink href="/contact" className="sf-link">Contact the property</StayLink></div>
          </div>}
        {rooms.length > 3 && <p className="rg-more"><StayLink href="/rooms" className="rg-textlink">All {rooms.length} rooms <ArrowRight aria-hidden="true" /></StayLink></p>}
      </div>
    </section>

    {amenities.length > 0 && <section className="rg-band rg-band--tint rg-amen" aria-labelledby="home-amenities">
      <div className="rg-wrap">
        <header className="rg-bandhead">
          <p className="rg-eyebrow">Amenities</p>
          <h2 id="home-amenities" className="rg-h2">Thoughtful amenities</h2>
        </header>
        <ul className="rg-amen__list">{amenities.slice(0, 6).map(item => <li key={item}><AmenityIcon amenity={item} /><span>{amenityLabel(item)}</span></li>)}</ul>
        <p className="rg-band__more"><StayLink href="/amenities" className="rg-textlink">All amenities <ArrowRight aria-hidden="true" /></StayLink></p>
      </div>
    </section>}

    <section className="rg-band rg-loc" aria-labelledby="home-location">
      <div className="rg-wrap">
        <header className="rg-bandhead">
          <p className="rg-eyebrow">Location</p>
          <h2 id="home-location" className="rg-h2">{city ? `In ${city}` : 'Finding us'}</h2>
        </header>
        <StayLink href="/location" className="rg-loc__photo" aria-label={`Directions to ${identity.name}`}>
          <img src={identity.media.location.imagePath} alt={identity.media.location.altText} loading="lazy" />
          {address && <span className="rg-loc__addr"><MapPin aria-hidden="true" />{address}</span>}
        </StayLink>
        <ul className="rg-facts">
          <li><Clock aria-hidden="true" /><span><b>Check-in from {identity.checkIn}</b><small>Check-out by {identity.checkOut}</small></span></li>
          <li><ConciergeBell aria-hidden="true" /><span><b>{identity.hours || 'Front desk'}</b><small>{identity.phone ? <a href={`tel:${identity.phone.replace(/[^+\d]/g, '')}`}>{identity.phone}</a> : 'Here when you need us.'}</small></span></li>
          <li><KeyRound aria-hidden="true" /><span><b>Already booked?</b><small><StayLink href="/bookings/lookup">Find your reservation</StayLink></small></span></li>
        </ul>
        <p className="rg-band__more"><StayLink href="/location" className="rg-textlink">Directions <ArrowRight aria-hidden="true" /></StayLink></p>
      </div>
    </section>

    {featured && <section className="rg-band rg-band--tint rg-rates" aria-labelledby="home-offers">
      <div className="rg-wrap">
        <header className="rg-bandhead">
          <p className="rg-eyebrow">Rates & packages</p>
          <h2 id="home-offers" className="rg-h2">Book direct. Stay your way.</h2>
        </header>
        <article className="rg-ratecard">
          <div className="rg-ratecard__text">
            <h3>{featured.plan.name}</h3>
            <p>{featured.plan.description || `${mealPlanLabel(featured.plan.mealPlan)} · ${cancellationHeadline(featured.plan.cancellationPolicy)}`}</p>
          </div>
          {featured.rate && <p className="rg-ratecard__price"><small>from</small><b>{featured.rate}</b><small>per night</small></p>}
          <StayLink href={`/rooms/${featured.room.id}#rate-plans`} className="sf-btn sf-btn--block rg-ratecard__go">Check availability</StayLink>
        </article>
        {others.length > 0 && <ul className="rg-ratelist">{others.map(({ plan, room, rate }) => <li key={plan.id}>
          <StayLink href={`/rooms/${room.id}#rate-plans`} aria-label={`${plan.name}, ${room.name}`}>
            <span><b>{plan.name}</b><small>{room.name}</small></span>
            {rate && <em>from {rate}</em>}
            <ArrowRight aria-hidden="true" />
          </StayLink>
        </li>)}</ul>}
        <p className="rg-band__more"><StayLink href="/rooms" className="rg-textlink">See all rates <ArrowRight aria-hidden="true" /></StayLink></p>
      </div>
    </section>}

    {flexible && <CancellationBar text={`Flexible cancellation. ${cancellationHeadline('flexible')} on ${flexible.plan.name.toLowerCase().includes('flexible') ? 'flexible rates' : flexible.plan.name}.`} />}
  </>;
}
