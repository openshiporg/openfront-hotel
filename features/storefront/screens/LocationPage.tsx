import { Building2, Coffee, Landmark, MapPin, Plane, ShoppingBag, Train } from 'lucide-react';
import { FALLBACK_HOTEL_IMAGES } from '@/lib/hotel-storefront';
import { getHotelSettings } from '@/features/storefront/lib/hotel-settings';

const nearbyAttractions = [
  { name: 'City Museum', distance: '0.3 miles', icon: Landmark },
  { name: 'Shopping District', distance: '0.5 miles', icon: ShoppingBag },
  { name: 'Business Center', distance: '0.8 miles', icon: Building2 },
  { name: 'Central Station', distance: '1.2 miles', icon: Train },
  { name: 'International Airport', distance: '12 miles', icon: Plane },
  { name: 'Artisan Coffee Row', distance: '0.2 miles', icon: Coffee },
];

export default async function LocationPage() {
  const identity = await getHotelSettings();

  return (
    <main>
      <section className="relative min-h-[28rem] overflow-hidden bg-[var(--lodging-night)]">
        <img
          src={identity.media.location.imagePath || FALLBACK_HOTEL_IMAGES.location}
          alt={identity.media.location.altText}
          className="lodging-image absolute inset-0 h-full w-full opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--lodging-night)] via-[color-mix(in_oklch,var(--lodging-night)_55%,transparent)] to-transparent" />
        <div className="lodging-container relative z-10 flex min-h-[28rem] items-end pb-16 pt-24">
          <div className="min-w-0 max-w-3xl text-[color-mix(in_oklch,var(--lodging-paper)_94%,white)]">
            <p className="lodging-eyebrow mb-4 text-[color-mix(in_oklch,var(--lodging-accent)_85%,white)]">
              Location & neighborhood
            </p>
            <h1 className="lodging-display">The city, softened at the edges.</h1>
          </div>
        </div>
      </section>

      <section className="lodging-container grid gap-10 py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="lodging-surface flex min-h-[24rem] min-w-0 items-center justify-center bg-[var(--lodging-paper-2)] p-10 text-center">
          <div>
            <MapPin className="mx-auto mb-5 h-12 w-12 text-[var(--lodging-accent-deep)]" />
            <p className="lodging-eyebrow mb-3">Property address</p>
            <p className="lodging-title">{identity.address.line1}</p>
            <p className="mt-2 text-[var(--lodging-ink-muted)]">{identity.address.line2}</p>
            <p className="mt-4 text-sm leading-7 text-[var(--lodging-ink-muted)]">
              Two blocks from Grand Plaza Station with valet access on Main Street.
            </p>
          </div>
        </div>
        <div className="min-w-0 space-y-8">
          <div>
            <p className="lodging-eyebrow mb-4">Getting here</p>
            <h2 className="lodging-headline">Arrive by train, car, or a short airport transfer.</h2>
          </div>
          <div className="space-y-5 border-l border-[var(--lodging-rule-strong)] pl-6 text-[var(--lodging-ink-muted)] leading-7">
            <p>
              <strong className="text-[var(--lodging-ink)]">From airport:</strong> Airport Express to Central Station, then Metro Line 2 to Grand Plaza.
            </p>
            <p>
              <strong className="text-[var(--lodging-ink)]">By car:</strong> Follow Downtown/City Center signs; valet parking is available at the main entrance.
            </p>
            <p>
              <strong className="text-[var(--lodging-ink)]">On foot:</strong> Museums, coffee, dining, and boutiques sit within a ten-minute walk.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--lodging-rule)] bg-[var(--lodging-paper-2)]">
        <div className="lodging-container py-20">
          <div className="lodging-grid-break mb-10 border-b border-[var(--lodging-rule)] pb-8">
            <h2 className="lodging-headline min-w-0">Nearby highlights.</h2>
            <p className="lodging-lead min-w-0">Distances from the property entrance—useful for planning walks between meetings and evenings out.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nearbyAttractions.map((attraction) => {
              const Icon = attraction.icon;
              return (
                <div key={attraction.name} className="lodging-surface min-w-0 p-6">
                  <Icon className="mb-5 h-5 w-5 text-[var(--lodging-accent-deep)]" />
                  <h3 className="lodging-serif text-2xl">{attraction.name}</h3>
                  <p className="mt-2 text-sm text-[var(--lodging-ink-faint)]">{attraction.distance}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
