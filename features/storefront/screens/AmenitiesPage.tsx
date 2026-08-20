import { Dumbbell, Sparkles, Utensils } from 'lucide-react';
import Link from 'next/link';
import { FALLBACK_HOTEL_IMAGES } from '@/lib/hotel-storefront';
import { getHotelSettings } from '@/features/storefront/lib/hotel-settings';

const amenities = [
  {
    title: 'Breakfast Lounge',
    icon: Utensils,
    image: FALLBACK_HOTEL_IMAGES.amenity,
    copy: 'A bright lounge and generous breakfast buffet designed for an unhurried start before the city wakes up.',
    items: ['Breakfast available daily', 'Fresh coffee and pastries', 'Comfortable lounge seating'],
  },
  {
    title: 'Alder Street Arrival',
    icon: Sparkles,
    image: FALLBACK_HOTEL_IMAGES.location,
    copy: 'A tree-lined city block puts independent restaurants, galleries, and neighborhood walks just outside the front door.',
    items: ['Walkable neighborhood', 'Front desk available 24 hours', 'Local recommendations on request'],
  },
  {
    title: 'Guestroom Comfort',
    icon: Dumbbell,
    image: FALLBACK_HOTEL_IMAGES.room,
    copy: 'Calm rooms pair thoughtful work space, soft lighting, and straightforward comforts for short visits and longer stays.',
    items: ['Premium linens', 'In-room coffee and climate control', 'Reliable high-speed Wi-Fi'],
  },
];

export default async function AmenitiesPage() {
  const identity = await getHotelSettings();

  return (
    <main>
      <section className="lodging-container py-16 md:py-24">
        <div className="lodging-grid-break border-b border-[var(--lodging-rule)] pb-10">
          <h1 className="lodging-display min-w-0">Amenities composed around rest.</h1>
          <p className="lodging-lead min-w-0">
            {identity.name} favors a quieter version of luxury: fewer noisy promises, more thoughtful details exactly where the guest feels them.
          </p>
        </div>
      </section>

      <section className="lodging-container pb-20">
        <div className="space-y-0">
          {amenities.map((amenity, index) => {
            const Icon = amenity.icon;
            return (
              <article
                key={amenity.title}
                className={`grid gap-8 border-b border-[var(--lodging-rule)] py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center ${
                  index % 2 === 1 ? 'lg:[&>div:first-child]:order-2' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="mb-5 flex items-center gap-3 text-[var(--lodging-accent-deep)]">
                    <Icon className="h-5 w-5" />
                    <p className="lodging-eyebrow">{amenity.title}</p>
                  </div>
                  <h2 className="lodging-headline">{amenity.title}</h2>
                  <p className="mt-5 max-w-xl leading-7 text-[var(--lodging-ink-muted)]">{amenity.copy}</p>
                  <ul className="mt-8 space-y-2 border-l border-[var(--lodging-rule-strong)] pl-5 text-sm text-[var(--lodging-ink-muted)]">
                    {amenity.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="aspect-[5/4] min-w-0 overflow-hidden bg-[var(--lodging-paper-3)]">
                  <img src={amenity.image} alt={amenity.title} className="lodging-image h-full w-full" />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-[var(--lodging-rule)] bg-[var(--lodging-paper-2)]">
        <div className="lodging-container flex flex-col gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="lodging-title">Need something specific for your stay?</h2>
            <p className="mt-3 max-w-lg text-[var(--lodging-ink-muted)] leading-7">
              The concierge desk can arrange dining, spa appointments, and accessibility details before arrival.
            </p>
          </div>
          <Link href="/contact" className="lodging-button shrink-0">
            Contact concierge
          </Link>
        </div>
      </section>
    </main>
  );
}
