'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { RoomType } from '@/lib/types';
import { primaryRoomImage, roomCopy } from '@/lib/hotel-storefront';
import type { StayQuote } from '../../lib/quote';
import { cancellationHeadline, money } from '../../lib/stay-context';
import { AmenityIcon, amenityLabel } from './AmenityIcon';
import { RoomFacts, referenceRate } from './RoomCard';
import { Skeleton } from '../ui';

interface RoomResultProps {
  room: RoomType;
  query: string;
  quote?: StayQuote;
  dated: boolean;
  pricing: boolean;
  availableCount?: number;
  compared: boolean;
  compareDisabled: boolean;
  onCompare: () => void;
}

/** One room type in search results, with the live full-stay quote when dates are chosen. */
export function RoomResult({ room, query, quote, dated, pricing, availableCount, compared, compareDisabled, onCompare }: RoomResultProps) {
  const params = new URLSearchParams(query);
  if (quote) params.set('ratePlanId', quote.ratePlanId || room.ratePlans?.find(plan => plan.name === quote.ratePlanName)?.id || '');
  const href = `/rooms/${room.id}${params.size ? `?${params}` : ''}`;
  const rate = referenceRate(room);
  // Open rooms are only an offer when a published rate can sell them online.
  const hasPublicRate = (room.ratePlans || []).length > 0;
  const amenities = (room.amenities || []).slice(0, 4);
  return <article className="sf-card sf-result">
    <Link href={href} className="sf-media" aria-label={`Explore ${room.name}`} tabIndex={-1}>
      <img src={primaryRoomImage(room)} alt={room.roomImages?.[0]?.altText || room.name} loading="lazy" />
    </Link>
    <div className="sf-result__body">
      <div className="sf-result__info">
        {room.eyebrow && <p className="sf-eyebrow">{room.eyebrow}</p>}
        <h3 className="sf-h3"><Link href={href}>{room.name}</Link></h3>
        <p className="sf-muted sf-small">{roomCopy(room)}</p>
        <RoomFacts room={room} />
        {dated && typeof availableCount === 'number' && <p className="sf-avail" data-tone={availableCount > 0 && hasPublicRate ? 'open' : 'closed'}>
          {availableCount > 0 && hasPublicRate ? 'Available for your dates' : availableCount > 0 ? 'Reserve by contacting the property' : 'Unavailable for these dates'}
        </p>}
        {amenities.length > 0 && <div className="sf-result__amenities">{amenities.map(item => <span key={item}><AmenityIcon amenity={item} />{amenityLabel(item)}</span>)}{room.amenities.length > amenities.length && <span>+{room.amenities.length - amenities.length} more</span>}</div>}
      </div>
      <div className="sf-result__offer">
        <div className="sf-offer__price" aria-live="polite">
          {quote ? <>
            <span className="sf-amount">{money(quote.totalAmountMinor, quote.currencyCode)}</span>
            <small>{quote.nights} {quote.nights === 1 ? 'night' : 'nights'} · taxes & fees included · {quote.ratePlanName}</small>
            <small className="sf-row" style={{ gap: 6, marginTop: 4 }}><CalendarClock aria-hidden="true" style={{ width: 14, height: 14 }} />{cancellationHeadline(quote.cancellationPolicy)}</small>
          </> : dated && pricing ? <>
            <Skeleton height={28} width={140} />
            <small role="status">Checking the full stay price…</small>
          </> : dated && !hasPublicRate ? <>
            <b className="sf-h4">Not bookable online</b>
            <small>No published rate for these dates. Contact the property to reserve this room.</small>
          </> : dated ? <>
            <b className="sf-h4">Review rates</b>
            <small>See the available rates on the room page for a full stay total.</small>
          </> : <>
            {rate ? <span><span className="sf-amount" style={{ fontSize: '1.5rem' }}>{rate}</span> <small>/ night base rate</small></span> : <b className="sf-h4">Live rates by date</b>}
            <small>Choose dates for a full stay price.</small>
          </>}
        </div>
        <div className="sf-offer__actions">
          <label className="sf-compare-toggle"><input type="checkbox" checked={compared} disabled={compareDisabled} onChange={onCompare} />Compare<span className="sf-sr"> {room.name}</span></label>
          <Link href={href} className="sf-btn">{quote ? 'Select room' : 'View room'} <ArrowRight className="sf-btn__go" aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  </article>;
}
