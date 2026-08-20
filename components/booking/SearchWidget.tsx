'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { CalendarDays, ChevronDown, Minus, Plus, Search, UsersRound } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import { rangeFromDayClick } from '@/features/storefront/lib/qa-workflows';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface GuestCounts {
  adults: number;
  children: number;
}

const today = new Date(new Date().setHours(0, 0, 0, 0));
const defaultDateRange: DateRange = {
  from: addDays(today, 7),
  to: addDays(today, 10),
};

function formatStayLabel(dateRange: DateRange | undefined) {
  if (!dateRange?.from || !dateRange?.to) return 'Choose dates';
  return `${format(dateRange.from, 'MMM d')} — ${format(dateRange.to, 'MMM d')}`;
}

function formatStayMeta(dateRange: DateRange | undefined) {
  if (!dateRange?.from || !dateRange?.to) return 'Arrival and departure';
  const nights = Math.max(1, differenceInCalendarDays(dateRange.to, dateRange.from));
  return `${nights} night${nights === 1 ? '' : 's'}`;
}

function formatGuestLabel(guests: GuestCounts) {
  const total = guests.adults + guests.children;
  return `${total} guest${total === 1 ? '' : 's'}`;
}

function formatGuestMeta(guests: GuestCounts) {
  const parts = [`${guests.adults} adult${guests.adults === 1 ? '' : 's'}`];
  if (guests.children > 0) {
    parts.push(`${guests.children} child${guests.children === 1 ? '' : 'ren'}`);
  }
  return parts.join(' · ');
}

export function SearchWidget({
  className,
  variant = 'default',
}: {
  className?: string;
  variant?: 'default' | 'hero';
}) {
  const identity = useHotelSettings();
  const router = useRouter();
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(defaultDateRange);
  const [guests, setGuests] = React.useState<GuestCounts>({
    adults: 2,
    children: 0,
  });
  const [validationMessage, setValidationMessage] = React.useState<string | null>(null);

  const isHero = variant === 'hero';

  const updateGuests = (type: keyof GuestCounts, delta: number) => {
    setGuests((current) => {
      const min = type === 'adults' ? 1 : 0;
      return {
        ...current,
        [type]: Math.max(min, current[type] + delta),
      };
    });
  };

  const handleSearch = () => {
    if (!dateRange?.from || !dateRange?.to) {
      setValidationMessage('Select arrival and departure dates to check availability.');
      return;
    }

    setValidationMessage(null);

    const params = new URLSearchParams({
      checkIn: format(dateRange.from, 'yyyy-MM-dd'),
      checkOut: format(dateRange.to, 'yyyy-MM-dd'),
      adults: guests.adults.toString(),
      children: guests.children.toString(),
    });

    router.push(`/rooms?${params.toString()}`);
  };

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div
        className={cn(
          'border shadow-[0_28px_80px_-40px_color-mix(in_oklch,var(--lodging-night)_55%,transparent)]',
          isHero
            ? 'border-[color-mix(in_oklch,var(--lodging-paper)_22%,transparent)] bg-[color-mix(in_oklch,var(--lodging-paper)_96%,white)]'
            : 'border-[var(--lodging-rule)] bg-[color-mix(in_oklch,var(--lodging-paper)_98%,white)]'
        )}
      >
        {isHero ? (
          <div className="border-b border-[var(--lodging-rule)] px-5 py-4 md:px-6">
            <p className="lodging-eyebrow text-[var(--lodging-accent-deep)]">Reservation</p>
            <p className="mt-1 text-sm text-[var(--lodging-ink-muted)]">
              Check live availability at {identity.name}.
            </p>
          </div>
        ) : null}

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
          <div className="border-b border-[var(--lodging-rule)] lg:border-b-0 lg:border-r">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-full w-full min-w-0 items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-[var(--lodging-paper-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lodging-focus)] md:px-6"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--lodging-accent-pale)] text-[var(--lodging-accent-deep)]">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="lodging-eyebrow mb-1 block">Stay dates</span>
                    <span className="block truncate text-lg font-medium leading-6 text-[var(--lodging-ink)]">
                      {formatStayLabel(dateRange)}
                    </span>
                    <span className="block truncate text-sm text-[var(--lodging-ink-faint)]">
                      {formatStayMeta(dateRange)}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--lodging-ink-faint)]" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-2rem)] max-w-[720px] rounded-none border-[var(--lodging-rule)] bg-[var(--lodging-paper)] p-0"
                align="start"
                sideOffset={12}
              >
                <div className="border-b border-[var(--lodging-rule)] px-5 py-4">
                  <p className="lodging-eyebrow">Select your stay</p>
                  <p className="mt-1 text-sm text-[var(--lodging-ink-muted)]">Choose arrival and departure dates.</p>
                </div>
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onDayClick={(selectedDay) => {
                    setDateRange((current) => rangeFromDayClick(current, selectedDay));
                  }}
                  numberOfMonths={1}
                  disabled={(date) => date < today}
                />
                {dateRange?.from ? (
                  <div className="border-t border-[var(--lodging-rule)] p-3 text-right">
                    <button type="button" className="lodging-link" onClick={() => setDateRange(undefined)}>
                      Clear dates
                    </button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>

          <div className="border-b border-[var(--lodging-rule)] lg:border-b-0 lg:border-r">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-full w-full min-w-0 items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-[var(--lodging-paper-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lodging-focus)] md:px-6"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--lodging-accent-pale)] text-[var(--lodging-accent-deep)]">
                    <UsersRound className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="lodging-eyebrow mb-1 block">Guests</span>
                    <span className="block truncate text-lg font-medium leading-6 text-[var(--lodging-ink)]">
                      {formatGuestLabel(guests)}
                    </span>
                    <span className="block truncate text-sm text-[var(--lodging-ink-faint)]">
                      {formatGuestMeta(guests)}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--lodging-ink-faint)]" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-2rem)] max-w-sm rounded-none border-[var(--lodging-rule)] bg-[var(--lodging-paper)] p-0"
                align="start"
                sideOffset={12}
              >
                <div className="border-b border-[var(--lodging-rule)] px-5 py-4">
                  <p className="lodging-eyebrow">Guests</p>
                  <p className="mt-1 text-sm text-[var(--lodging-ink-muted)]">Set occupancy for this stay.</p>
                </div>
                <div className="space-y-0 p-4">
                  {[
                    { key: 'adults' as const, label: 'Adults', description: 'Ages 13+', min: 1 },
                    { key: 'children' as const, label: 'Children', description: 'Ages 0–12', min: 0 },
                  ].map((group) => (
                    <div
                      key={group.key}
                      className="flex items-center justify-between border-b border-[var(--lodging-rule)] py-4 last:border-b-0"
                    >
                      <div>
                        <div className="font-medium text-[var(--lodging-ink)]">{group.label}</div>
                        <div className="text-sm text-[var(--lodging-ink-faint)]">{group.description}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => updateGuests(group.key, -1)}
                          disabled={guests[group.key] <= group.min}
                          className="h-10 w-10 rounded-none border-[var(--lodging-rule)] bg-transparent"
                          aria-label={`Remove ${group.label.toLowerCase()}`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-lg font-semibold text-[var(--lodging-ink)]">
                          {guests[group.key]}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => updateGuests(group.key, 1)}
                          className="h-10 w-10 rounded-none border-[var(--lodging-rule)] bg-transparent"
                          aria-label={`Add ${group.label.toLowerCase()}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="p-4 lg:p-3">
            <button
              type="button"
              onClick={handleSearch}
              className="lodging-button flex h-14 w-full items-center justify-center gap-3 lg:h-full lg:min-w-[11.5rem]"
            >
              <Search className="h-4 w-4" />
              Check availability
            </button>
          </div>
        </div>

        {validationMessage ? (
          <div className="border-t border-[var(--lodging-rule)] bg-[var(--lodging-accent-pale)] px-5 py-3 text-sm text-[var(--lodging-accent-deep)]">
            {validationMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
