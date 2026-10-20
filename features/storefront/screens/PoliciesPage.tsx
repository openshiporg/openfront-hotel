import { ArrowUpRight } from 'lucide-react';
import { getHotelSettings } from '../lib/hotel-settings';
import { StayLink } from '../components/StayProvider';
import { PageHead } from '../components/ui';

const SECTIONS = [['rates', 'Rates & payment'], ['changes', 'Changes & cancellation'], ['arrival', 'Arrival & departure'], ['access', 'Your details & access']] as const;

export default async function PoliciesPage() {
  const identity = await getHotelSettings();
  return <>
    <PageHead eyebrow="Booking & stay policies" title={<>A clear plan <em>for your stay.</em></>} lead="Review the terms for your chosen room and rate before reserving. Your reservation and statement show the amounts recorded for your booking." />
    <div className="sf-wrap sf-policy" style={{ paddingBottom: 'clamp(56px, 8vw, 112px)' }}>
      <nav className="sf-policy__nav" aria-label="Policy sections">{SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      <div>
        <article id="rates">
          <h2 className="sf-h2">Rates & payment.</h2>
          <p>The full stay quote itemizes the room subtotal, taxes and fees. The amount due now may be a deposit or the full stay amount, depending on your rate.</p>
          <p>A security authorization, when required, is separate from the room payment. Its amount and handling appear during booking.</p>
          <p>Availability and price are checked when your booking is submitted. A quote or pending payment does not by itself confirm a reservation.</p>
          <StayLink href="/rooms" className="sf-link">Choose a room & review rates <ArrowUpRight aria-hidden="true" /></StayLink>
        </article>
        <article id="changes">
          <h2 className="sf-h2">When plans change.</h2>
          <p>Cancellation terms depend on the booked rate. Open your reservation to review its current cancellation quote, deadline and any applicable fee before confirming cancellation.</p>
          <p>A request to change dates is reviewed by the property. Your existing dates remain in place until a change is approved.</p>
          <p>A pending refund is still processing. Check the statement for settlement; a cancellation message alone does not mean funds have been returned.</p>
          <StayLink href="/bookings/lookup" className="sf-link">Review your reservation <ArrowUpRight aria-hidden="true" /></StayLink>
        </article>
        <article id="arrival">
          <h2 className="sf-h2">Arrival & departure.</h2>
          <div className="sf-times" style={{ maxWidth: 480 }}><div><small>Check-in from</small><b>{identity.checkIn}</b></div><div><small>Check-out by</small><b>{identity.checkOut}</b></div></div>
          <p>Check-in from {identity.checkIn}; check-out by {identity.checkOut}, in the property’s local time.</p>
          <p>Ask ahead about early arrival, late departure, parking, pets, accessibility, and any requirements that affect your choice of room. Only arrangements confirmed by the property are assured.</p>
          <StayLink href="/location" className="sf-link">Plan your arrival <ArrowUpRight aria-hidden="true" /></StayLink>
        </article>
        <article id="access">
          <h2 className="sf-h2">Your details & booking access.</h2>
          <p>Use your booking reference and email to access your stay. Keep signed reservation links private. Only dates and guest counts are remembered as shopping choices on this device.</p>
          <p>For a question about personal data or your booking records, contact {identity.name} directly.</p>
          <StayLink href="/contact" className="sf-link">Contact the property <ArrowUpRight aria-hidden="true" /></StayLink>
        </article>
      </div>
    </div>
  </>;
}
