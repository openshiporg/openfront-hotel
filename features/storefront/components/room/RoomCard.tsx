import { ArrowRight, BedDouble, Ruler, Users } from 'lucide-react';
import type { RoomType } from '@/lib/types';
import { BED_CONFIG_LABELS, primaryRoomImage, roomCopy } from '@/lib/hotel-storefront';
import { money } from '../../lib/stay-context';
import { StayLink } from '../StayProvider';

/** Lowest public, non-promotional base rate. A reference, not a dated price. */
export function referenceRate(room: Pick<RoomType, 'ratePlans'>) {
  const plans = (room.ratePlans || []).filter(plan => !plan.isPromotional && Number.isSafeInteger(plan.baseRateMinor) && plan.currencyCode);
  if (!plans.length) return null;
  const lowest = plans.reduce((best, plan) => (plan.baseRateMinor! < best.baseRateMinor! ? plan : best));
  try { return money(lowest.baseRateMinor!, lowest.currencyCode); } catch { return null; }
}

export function RoomFacts({ room }: { room: Pick<RoomType, 'bedConfiguration' | 'maxOccupancy' | 'squareFeet'> }) {
  return <ul className="sf-facts">
    {room.bedConfiguration && <li><BedDouble aria-hidden="true" />{BED_CONFIG_LABELS[room.bedConfiguration] || room.bedConfiguration.replaceAll('_', ' ')}</li>}
    <li><Users aria-hidden="true" />Sleeps {room.maxOccupancy}</li>
    {room.squareFeet ? <li><Ruler aria-hidden="true" />{room.squareFeet} sq ft</li> : null}
  </ul>;
}

/** Editorial room card for browsing without dates; the link carries remembered stay choices. */
export function RoomCard({ room, href, priority = false }: { room: RoomType; href: string; priority?: boolean }) {
  const rate = referenceRate(room);
  return <article className="sf-roomcard">
    <div className="sf-media">
      <img src={primaryRoomImage(room)} alt={room.roomImages?.[0]?.altText || room.name} loading={priority ? 'eager' : 'lazy'} />
      {room.eyebrow && <div className="sf-media__badges"><span className="sf-badge sf-badge--onphoto">{room.eyebrow}</span></div>}
    </div>
    <div className="sf-roomcard__body">
      <div className="sf-roomcard__title"><h3 className="sf-h3"><StayLink href={href}>{room.name}</StayLink></h3></div>
      <p className="sf-roomcard__copy">{roomCopy(room)}</p>
      <RoomFacts room={room} />
      <div className="sf-roomcard__rate">
        <span>{rate ? <>Base rate <b>{rate}</b> / night<br /><small className="sf-faint">Before tax · varies by date</small></> : 'Choose dates for live rates'}</span>
        <span className="sf-roomcard__go" aria-hidden="true">Explore <ArrowRight /></span>
      </div>
    </div>
  </article>;
}
