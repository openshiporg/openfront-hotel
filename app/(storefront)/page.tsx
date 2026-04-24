import Link from 'next/link';
import { ArrowRight, MapPin, ShieldCheck, Sparkles, Stars } from 'lucide-react';
import { SearchWidget } from '@/components/booking/SearchWidget';
import { Button } from '@/components/ui/button';

const directBookingPromises = [
  'Flexible arrival and change policies on select direct rates',
  'Priority front-desk help before you arrive',
  'Packages and room choices you will not see in marketplace layouts',
];

const hospitalityNotes = [
  {
    title: 'Direct booking, fewer handoffs',
    description:
      'Talk to the hotel team, not a marketplace message thread, when your arrival time changes or your stay needs adjusting.',
  },
  {
    title: 'Rooms chosen for real stay intent',
    description:
      'Compare layouts, occupancy, breakfast options, and cancellation style in a way that feels like hospitality, not generic inventory.',
  },
  {
    title: 'Designed for trust, not urgency tricks',
    description:
      'Clear totals, calm copy, and direct-support cues make the booking experience feel specific to the property instead of copied from OTA patterns.',
  },
];

export default function Home() {
  return (
    <div className="hotel-page min-h-screen">
      <section className="relative overflow-hidden px-4 pb-18 pt-14 sm:px-6 lg:px-8 lg:pt-18">
        <div className="container mx-auto grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="max-w-3xl">
            <div className="hotel-kicker mb-4">Independent hospitality, booked direct</div>
            <h1 className="hotel-display max-w-4xl font-semibold text-[color:oklch(0.2_0.02_58)]">
              A calmer way to book the city stay you actually want.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[color:oklch(0.38_0.03_58)] sm:text-xl">
              Grand Hotel is built for guests who want clear room choices, direct support,
              and rates that feel like hospitality rather than marketplace guesswork.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <span className="hotel-eyebrow-pill">
                <ShieldCheck className="h-3.5 w-3.5" />
                Flexible direct-booking policies
              </span>
              <span className="hotel-chip">
                <MapPin className="h-3.5 w-3.5" />
                Walkable central location
              </span>
              <span className="hotel-chip">
                <Stars className="h-3.5 w-3.5" />
                Better stay context than OTA grids
              </span>
            </div>
          </div>

          <div className="hotel-surface rounded-[2.25rem] p-6 sm:p-7">
            <div className="hotel-kicker mb-3">Why guests book here first</div>
            <div className="space-y-4">
              {directBookingPromises.map((promise) => (
                <div key={promise} className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-4 w-4 shrink-0 text-[color:oklch(0.44_0.07_48)]" />
                  <p className="text-sm leading-6 text-[color:oklch(0.35_0.03_58)] sm:text-base">
                    {promise}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-[1.75rem] bg-[color:color-mix(in_oklab,white_78%,oklch(0.95_0.02_82))] p-5">
              <div className="hotel-stat-label mb-2">Guest confidence</div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.05em] text-[color:oklch(0.23_0.03_58)]">24/7</div>
                  <div className="mt-1 text-sm text-[color:oklch(0.42_0.03_58)]">Front desk support</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.05em] text-[color:oklch(0.23_0.03_58)]">Direct</div>
                  <div className="mt-1 text-sm text-[color:oklch(0.42_0.03_58)]">Reservation ownership</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.05em] text-[color:oklch(0.23_0.03_58)]">Clear</div>
                  <div className="mt-1 text-sm text-[color:oklch(0.42_0.03_58)]">Room and rate context</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto mt-10">
          <SearchWidget />
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="container mx-auto grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <div className="hotel-kicker mb-3">Why the experience feels different</div>
            <h2 className="hotel-title max-w-xl font-semibold text-[color:oklch(0.2_0.02_58)]">
              Built to earn trust before the stay even begins.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {hospitalityNotes.map((note) => (
              <div key={note.title} className="hotel-surface rounded-[1.8rem] p-6">
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:oklch(0.23_0.02_58)]">
                  {note.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[color:oklch(0.4_0.03_58)]">
                  {note.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-18 sm:px-6 lg:px-8">
        <div className="container mx-auto hotel-surface rounded-[2.4rem] p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="hotel-kicker mb-3">Plan the stay with confidence</div>
              <h2 className="max-w-2xl text-4xl font-semibold tracking-[-0.05em] text-[color:oklch(0.22_0.02_58)]">
                Review room layouts, compare rates, and book without the generic clone feeling.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[color:oklch(0.4_0.03_58)]">
                Start with real availability, then inspect room type details, rate plans, and confirmation flows that feel grounded in hospitality.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-start lg:items-end">
              <Button
                asChild
                className="h-12 rounded-full bg-[color:oklch(0.34_0.08_45)] px-6 text-white hover:bg-[color:oklch(0.3_0.08_42)]"
              >
                <Link href="/rooms">
                  Explore rooms and rates
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <p className="text-sm text-[color:oklch(0.44_0.03_58)]">
                Prefer to look up an existing stay? <Link href="/bookings/lookup" className="hotel-link font-medium">Find a reservation</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5 px-4 py-8 text-sm text-[color:oklch(0.45_0.02_58)] sm:px-6 lg:px-8">
        <div className="container mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>Grand Hotel · Direct booking for quieter stays and clearer support.</p>
          <p>Reservations · (555) 123-4567</p>
        </div>
      </footer>
    </div>
  );
}
