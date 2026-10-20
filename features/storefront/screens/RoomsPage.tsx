'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, BedDouble, Check, RefreshCw, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_ROOM_TYPES, GET_AVAILABLE_ROOMS, GET_STOREFRONT_QUOTE } from '@/lib/queries';
import type { RoomType } from '@/lib/types';
import type { StayQuote } from '../lib/quote';
import { BED_CONFIG_LABELS, primaryRoomImage } from '@/lib/hotel-storefront';
import { roomSearchValidationMessage, selectInitialPublicRatePlan } from '../lib/qa-workflows';
import { stayNights, money, cancellationTerms } from '../lib/stay-context';
import { rangeLabel } from '../lib/calendar';
import { StayPlanner } from '../components/stay/StayPlanner';
import { RoomResult } from '../components/room/RoomResult';
import { AmenityIcon, amenityLabel } from '../components/room/AmenityIcon';
import { PageHead, Skeleton } from '../components/ui';

type AvailableRoom = RoomType & { availableCount?: number };
const SORTS = (dated: boolean) => [['price_asc', dated ? 'Stay total: low to high' : 'Base rate: low to high'], ['price_desc', dated ? 'Stay total: high to low' : 'Base rate: high to low'], ['occupancy_asc', 'Guests: fewer to more'], ['occupancy_desc', 'Guests: more to fewer'], ['size_asc', 'Size: smaller first'], ['size_desc', 'Size: larger first']];

function RoomsContent() {
  const params = useSearchParams(); const router = useRouter(); const query = params?.toString() || '';
  const from = params?.get('checkIn') || ''; const to = params?.get('checkOut') || ''; const adults = params?.get('adults') || '2'; const children = params?.get('children') || '0';
  const queryError = roomSearchValidationMessage(from, to, adults, children); const dated = Boolean(from && to && !queryError); const nights = stayNights(from, to);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]); const [quotes, setQuotes] = useState<Record<string, StayQuote>>({}); const [loading, setLoading] = useState(true); const [pricing, setPricing] = useState(false); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const amenityQuery = params?.get('amenities') || ''; const amenities = useMemo(() => amenityQuery.split(',').filter(Boolean), [amenityQuery]); const sort = params?.get('sortBy') || 'price_asc'; const price = params?.get('priceRange') || ''; const comparison = (params?.get('compare') || '').split(',').filter(Boolean).slice(0, 3);
  const update = (values: Record<string, string | null>) => { const next = new URLSearchParams(query); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); router.push(`/rooms?${next}#results`, { scroll: false }); };
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setQuotes({}); setPricing(false); setRooms([]);
    async function fetchRooms() {
      if (queryError) { setLoading(false); return; } try {
        const catalog = (await graphqlClient.request<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES)).roomTypes || [];
        let rows: AvailableRoom[] = catalog;
        if (dated) { const data = await graphqlClient.request<{ roomTypes: AvailableRoom[] }>(GET_AVAILABLE_ROOMS, { checkInDate: `${from}T00:00:00Z`, checkOutDate: `${to}T00:00:00Z` }); rows = (data.roomTypes || []).map(room => ({ ...room, ratePlans: catalog.find(item => item.id === room.id)?.ratePlans })); }
        if (!active) return; setRooms(rows); setLoading(false);
        if (dated) {
          setPricing(true); const queue = rows.filter(room => (room.availableCount || 0) > 0 && room.maxOccupancy >= Number(adults) + Number(children)); let cursor = 0;
          await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (active && cursor < queue.length) { const room = queue[cursor++]; const plan = selectInitialPublicRatePlan(room.ratePlans?.filter(plan => !plan.isPromotional && plan.minimumStay <= nights), null); if (!plan || plan.minimumStay > nights) continue; try { const data = await graphqlClient.request<{ storefrontQuote: StayQuote }>(GET_STOREFRONT_QUOTE, { roomTypeId: room.id, ratePlanId: plan.id, checkInDate: `${from}T00:00:00Z`, checkOutDate: `${to}T00:00:00Z`, numberOfAdults: Number(adults), numberOfChildren: Number(children) }); if (active) setQuotes(previous => ({ ...previous, [room.id]: data.storefrontQuote })); } catch { /* A missing quote is not a zero price or proof of sold-out inventory. */ } } }));
          if (active) setPricing(false);
        }
      } catch { if (active) { setError('We could not load the room collection. Your search choices are still here.'); setLoading(false); setPricing(false); } }
    }
    void fetchRooms(); return () => { active = false; };
  }, [from, to, adults, children, queryError, dated, nights, retry]);
  const shown = useMemo(() => {
    let rows = rooms.filter(room => room.maxOccupancy >= Number(adults) + Number(children) && (!dated || (room.availableCount || 0) > 0) && amenities.every(item => room.amenities?.includes(item)));
    if (price) { const [min, max] = price.split('-').map(Number); if (Number.isFinite(min) && Number.isFinite(max)) rows = rows.filter(room => room.baseRate >= min && room.baseRate <= max); }
    const direction = sort.endsWith('desc') ? -1 : 1; return rows.sort((a, b) => { if (sort.startsWith('occupancy')) return direction * (a.maxOccupancy - b.maxOccupancy); if (sort.startsWith('size')) return direction * ((a.squareFeet || 0) - (b.squareFeet || 0)); if (dated) { const aq = quotes[a.id], bq = quotes[b.id]; if (!aq || !bq) return aq ? -1 : bq ? 1 : 0; if (aq.currencyCode !== bq.currencyCode) return aq.currencyCode.localeCompare(bq.currencyCode); return direction * (aq.totalAmountMinor - bq.totalAmountMinor); } return direction * (a.baseRate - b.baseRate); });
  }, [rooms, adults, children, dated, amenities, price, sort, quotes]);
  const selected = rooms.filter(room => comparison.includes(room.id)); const options = [...new Set(rooms.flatMap(room => room.amenities || []))].sort();
  const guests = Number(adults) + Number(children);
  const filterCount = amenities.length + (price ? 1 : 0);
  const clearFilters = () => update({ amenities: null, priceRange: null });

  return <>
    <PageHead eyebrow="Rooms & suites" title={<>Find your place <em>in the house.</em></>} lead="Compare the details that matter. Choose dates to see live availability and the full stay price, including taxes and fees." />
    <div className="sf-wrap" id="choose-dates"><StayPlanner query={query} variant="bar" /></div>
    <section className="sf-wrap sf-section--tight" id="results" aria-label="Room results">
      <div data-qa-layout="room-results-grid" className="sf-results">
        <aside className="sf-filters" data-open={filtersOpen} aria-label="Refine rooms">
          <button type="button" className="sf-btn sf-btn--ghost sf-filters__toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal aria-hidden="true" />Filters{filterCount ? ` · ${filterCount}` : ''}</button>
          <div className="sf-filters__body">
            {options.length > 0 && <fieldset>
              <legend><h2>Room comforts</h2></legend>
              <div className="sf-chips">{options.map(item => <button key={item} type="button" className="sf-chip" aria-pressed={amenities.includes(item)} onClick={() => update({ amenities: (amenities.includes(item) ? amenities.filter(a => a !== item) : [...amenities, item]).join(',') })}>{amenities.includes(item) ? <Check aria-hidden="true" /> : <AmenityIcon amenity={item} />}{amenityLabel(item)}</button>)}</div>
            </fieldset>}
            <form key={price} className="sf-stack" style={{ '--stack': '12px' } as React.CSSProperties} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); update({ priceRange: `${data.get('min') || 0}-${data.get('max') || 100000}` }); }}>
              <h2>Base nightly rate</h2>
              <div className="sf-formgrid" style={{ gap: 10 }}>
                <label className="sf-field"><span className="sf-label">Minimum</span><input className="sf-input" name="min" type="number" min="0" inputMode="numeric" defaultValue={price.split('-')[0] || ''} /></label>
                <label className="sf-field"><span className="sf-label">Maximum</span><input className="sf-input" name="max" type="number" min="0" inputMode="numeric" defaultValue={price.split('-')[1] || ''} /></label>
              </div>
              <p className="sf-hint">Reference rate only; the dated total may differ.</p>
              <button className="sf-btn sf-btn--ghost sf-btn--sm sf-btn--block">Apply budget</button>
            </form>
            {filterCount > 0 && <button type="button" className="sf-link" onClick={clearFilters}>Clear all filters</button>}
          </div>
        </aside>
        <div data-qa-layout="room-results-content" style={{ minWidth: 0 }}>
          <div data-qa-layout="room-results-toolbar" className="sf-toolbar">
            <div className="sf-toolbar__count" role="status">
              <b>{loading ? 'Checking rooms…' : `${shown.length} ${shown.length === 1 ? 'room type' : 'room types'}`}</b>
              <span>{dated ? `${rangeLabel(from, to)} · ${nights} ${nights === 1 ? 'night' : 'nights'} · ${guests} ${guests === 1 ? 'guest' : 'guests'}${pricing ? ' · pricing your stay…' : ''}` : 'Add dates for live availability and full stay prices'}</span>
            </div>
            <label className="sf-field" style={{ minWidth: 230 }}><span className="sf-sr">Sort available rooms</span>
              <select data-qa-layout="room-results-sort" className="sf-select" value={sort} onChange={event => update({ sortBy: event.target.value })} aria-label="Sort available rooms">{SORTS(dated).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
          </div>
          {filterCount > 0 && <div className="sf-active-filters">
            {amenities.map(item => <button key={item} type="button" className="sf-chip" aria-label={`Remove ${amenityLabel(item)} filter`} onClick={() => update({ amenities: amenities.filter(a => a !== item).join(',') })}>{amenityLabel(item)}<X aria-hidden="true" /></button>)}
            {price && <button type="button" className="sf-chip" aria-label="Remove budget filter" onClick={() => update({ priceRange: null })}>Base rate {price.replace('-', '–')}<X aria-hidden="true" /></button>}
            <button type="button" className="sf-link" onClick={clearFilters}>Clear filters</button>
          </div>}
          {queryError ? <div role="alert" className="sf-empty">
            <span className="sf-state__icon"><TriangleAlert aria-hidden="true" /></span>
            <h2 className="sf-h3">Let’s fix the search.</h2><p className="sf-muted">{queryError}</p>
            <a href="#choose-dates" className="sf-btn sf-btn--ghost">Edit your stay</a>
          </div> : error ? <div role="alert" className="sf-empty">
            <span className="sf-state__icon"><TriangleAlert aria-hidden="true" /></span>
            <h2 className="sf-h3">The rooms didn’t load.</h2><p className="sf-muted">{error}</p>
            <button type="button" className="sf-btn" onClick={() => setRetry(value => value + 1)}><RefreshCw aria-hidden="true" />Try again</button>
          </div> : loading ? <div role="status" aria-label="Loading room details">
            {[0, 1, 2].map(index => <div key={index} className="sf-card sf-result" aria-hidden="true"><Skeleton height={220} radius={0} className="sf-media" /><div className="sf-result__info"><Skeleton height={28} width="55%" /><Skeleton height={16} /><Skeleton height={16} width="80%" /><Skeleton height={44} width="40%" /></div></div>)}
          </div> : !shown.length ? <div className="sf-empty">
            <span className="sf-state__icon"><BedDouble aria-hidden="true" /></span>
            <h2 className="sf-h3">No rooms match this stay.</h2>
            <p className="sf-muted">Try other dates, fewer guests in one room, or clear your filters. For multiple rooms, contact the property.</p>
            <div className="sf-row">{filterCount > 0 && <button type="button" className="sf-btn sf-btn--ghost" onClick={clearFilters}>Clear filters</button>}<Link className="sf-link" href="/contact">Ask the property</Link></div>
          </div> : shown.map(room => <RoomResult key={room.id} room={room} query={query} dated={dated} availableCount={dated ? room.availableCount : undefined} quote={quotes[room.id]} pricing={dated && pricing && !quotes[room.id]}
            compared={comparison.includes(room.id)} compareDisabled={!comparison.includes(room.id) && comparison.length >= 3}
            onCompare={() => update({ compare: (comparison.includes(room.id) ? comparison.filter(id => id !== room.id) : [...comparison, room.id]).join(',') })} />)}
          {selected.length > 0 && <section id="compare" className="sf-section--tight" aria-labelledby="compare-title">
            <div className="sf-stack" style={{ '--stack': '10px', marginBottom: 22 } as React.CSSProperties}>
              <p className="sf-eyebrow">Side by side</p>
              <h2 id="compare-title" className="sf-h2">A closer comparison.</h2>
              <p className="sf-muted sf-small">Select up to three rooms. Quotes apply to the named rate; review other plans on the room page.</p>
            </div>
            <div className="sf-compare" tabIndex={0} role="region" aria-label="Room comparison, scroll horizontally on small screens">
              <table>
                <thead><tr><th scope="col"><span className="sf-sr">Detail</span></th>{selected.map(room => <th scope="col" key={room.id}>{room.name}</th>)}</tr></thead>
                <tbody>{['Full stay total', 'Bed', 'Guests', 'Size', 'Amenities', 'Cancellation', 'Explore'].map(label => <tr key={label}><th scope="row">{label}</th>{selected.map(room => <td key={room.id}>{label === 'Full stay total' ? quotes[room.id] ? <><b className="sf-num">{money(quotes[room.id].totalAmountMinor, quotes[room.id].currencyCode)}</b><br /><span className="sf-muted">{quotes[room.id].ratePlanName} · taxes & fees included</span></> : dated ? 'Review rates for a current total' : 'Choose dates' : label === 'Bed' ? BED_CONFIG_LABELS[room.bedConfiguration || ''] || room.bedConfiguration || 'Ask the property' : label === 'Guests' ? `Up to ${room.maxOccupancy}` : label === 'Size' ? room.squareFeet ? `${room.squareFeet} sq ft` : 'Not published' : label === 'Amenities' ? (room.amenities || []).map(amenityLabel).join(', ') || 'Not published' : label === 'Cancellation' ? cancellationTerms(quotes[room.id]?.cancellationPolicy) : <Link className="sf-link" href={`/rooms/${room.id}?${query}`}>View {room.name}</Link>}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>}
        </div>
      </div>
    </section>
    {comparison.length > 0 && <div className="sf-comparebar sf-noprint" role="region" aria-label="Room comparison">
      <div className="sf-comparebar__thumbs">{selected.map(room => <img key={room.id} src={primaryRoomImage(room)} alt="" />)}<span><b>{selected.length}</b> <span className="sf-comparebar__label">{selected.length === 1 ? 'room' : 'rooms'} selected</span></span></div>
      <div className="sf-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <button type="button" className="sf-btn sf-btn--onnight sf-btn--sm" onClick={() => update({ compare: null })}>Clear</button>
        <a href="#compare" className="sf-btn sf-btn--light sf-btn--sm">Compare <ArrowDown aria-hidden="true" /></a>
      </div>
    </div>}
  </>;
}

export default function RoomsPage() {
  return <Suspense fallback={<div className="sf-wrap sf-section" role="status"><Skeleton height={64} width="40%" /><div style={{ height: 24 }} /><Skeleton height={80} radius={28} /></div>}><RoomsContent /></Suspense>;
}
