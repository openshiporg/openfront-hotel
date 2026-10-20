import { ArrowUpRight, Car, Clock, Luggage, Mail, Navigation, Phone } from 'lucide-react';
import { getHotelSettings } from '../lib/hotel-settings';
import { StayLink } from '../components/StayProvider';
import { PageHead } from '../components/ui';

export default async function LocationPage() {
  const identity = await getHotelSettings(); const address = [identity.address.line1, identity.address.line2].filter(Boolean).join(', ');
  const phone = identity.phone.replace(/[^+\d]/g, '');
  return <>
    <PageHead eyebrow="Location & arrival" title={<>Find your way <em>here.</em></>} lead={`A few practical details before your stay at ${identity.name}.`} />
    <section className="sf-wrap" aria-labelledby="location-address" style={{ paddingBottom: 'clamp(48px, 7vw, 96px)' }}>
      <div className="sf-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', overflow: 'hidden' }}>
        <div className="sf-media" style={{ borderRadius: 0, minHeight: 360 }}><img src={identity.media.location.imagePath} alt={identity.media.location.altText} style={{ position: 'absolute', inset: 0 }} /></div>
        <div className="sf-pad-lg sf-stack" style={{ '--stack': '18px', alignSelf: 'center' } as React.CSSProperties}>
          <p className="sf-eyebrow">{identity.name}</p>
          <h2 id="location-address" className="sf-h2">{identity.address.line1 || <>Your arrival <em>starts here.</em></>}</h2>
          {identity.address.line2 && <p className="sf-lead">{identity.address.line2}</p>}
          {address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="sf-btn" style={{ width: 'fit-content' }}><Navigation aria-hidden="true" />Open directions<span className="sf-sr"> (opens a new tab)</span></a> : <StayLink href="/contact" className="sf-btn" style={{ width: 'fit-content' }}>Ask for directions</StayLink>}
          {identity.media.location.caption && <p className="sf-fine">{identity.media.location.caption}</p>}
        </div>
      </div>
    </section>
    <section className="sf-panel" style={{ borderRadius: 0 }} aria-label="Arrival details">
      <div className="sf-wrap sf-section sf-features" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        <article className="sf-feature">
          <span className="sf-feature__icon"><Clock aria-hidden="true" /></span>
          <p className="sf-eyebrow">On the day</p>
          <h2 className="sf-h3">Arrival & departure</h2>
          <div className="sf-times"><div><small>Check-in from</small><b>{identity.checkIn}</b></div><div><small>Check-out by</small><b>{identity.checkOut}</b></div></div>
          <p className="sf-muted sf-small">Times are local to the property. For early arrival or late departure, ask the team before making plans; availability and charges must be confirmed.</p>
        </article>
        <article className="sf-feature">
          <span className="sf-feature__icon"><Luggage aria-hidden="true" /></span>
          <p className="sf-eyebrow">Before you travel</p>
          <h2 className="sf-h3">A direct line to the house</h2>
          <p className="sf-muted sf-small">Confirm parking, transfers, step-free access, or luggage arrangements directly with the property.</p>
          <div className="sf-stack" style={{ '--stack': '8px' } as React.CSSProperties}>
            {phone && <a className="sf-action" href={`tel:${phone}`}><Phone aria-hidden="true" /><span>{identity.phone}</span></a>}
            {identity.email && <a className="sf-action" href={`mailto:${identity.email}`} style={{ overflowWrap: 'anywhere' }}><Mail aria-hidden="true" /><span>{identity.email}</span></a>}
          </div>
          {identity.hours && <p className="sf-fine">{identity.hours}</p>}
          <StayLink href="/contact?subject=Arrival%20question" className="sf-link">Send an arrival question <ArrowUpRight aria-hidden="true" /></StayLink>
        </article>
        <article className="sf-feature">
          <span className="sf-feature__icon"><Car aria-hidden="true" /></span>
          <p className="sf-eyebrow">Getting here</p>
          <h2 className="sf-h3">Plan the last mile</h2>
          <p className="sf-muted sf-small">{address ? `Navigate to ${address}. ` : ''}Ask the property about parking and transport options before you set off; arrangements are assured only once confirmed.</p>
          <StayLink href="/policies#arrival" className="sf-link">Arrival policies <ArrowUpRight aria-hidden="true" /></StayLink>
        </article>
      </div>
    </section>
  </>;
}
