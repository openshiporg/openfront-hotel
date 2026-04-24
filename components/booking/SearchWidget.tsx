'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { CalendarDays, Search, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DateRangePicker } from './DateRangePicker';
import { GuestSelector } from './GuestSelector';

interface GuestCounts {
  adults: number;
  children: number;
}

export function SearchWidget() {
  const router = useRouter();
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [guests, setGuests] = React.useState<GuestCounts>({
    adults: 2,
    children: 0,
  });
  const [validationMessage, setValidationMessage] = React.useState<string | null>(null);

  const handleSearch = () => {
    if (!dateRange?.from || !dateRange?.to) {
      setValidationMessage('Choose arrival and departure dates to see live availability.');
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
    <Card className="hotel-surface w-full overflow-hidden rounded-[2rem] border-0 bg-transparent shadow-none">
      <CardContent className="p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="hotel-eyebrow-pill">
            <ShieldCheck className="h-3.5 w-3.5" />
            Best rate when you book direct
          </span>
          <span className="hotel-chip">
            <CalendarDays className="h-3.5 w-3.5" />
            Flexible stay planning
          </span>
          <span className="hotel-chip">
            <Sparkles className="h-3.5 w-3.5" />
            Direct support before arrival
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_auto] lg:items-end lg:gap-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:oklch(0.43_0.04_55)]">
              Stay dates
            </label>
            <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:oklch(0.43_0.04_55)]">
              Guests
            </label>
            <GuestSelector guests={guests} onGuestsChange={setGuests} />
          </div>

          <Button
            onClick={handleSearch}
            className="h-12 rounded-full bg-[color:oklch(0.34_0.08_45)] px-6 text-sm font-medium text-white shadow-sm transition hover:bg-[color:oklch(0.3_0.08_42)] lg:min-w-[180px]"
            size="lg"
          >
            <Search className="mr-2 h-4 w-4" />
            Check availability
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-[color:oklch(0.4_0.03_58)]">
            Book direct for quieter inventory, flexible changes, and front-desk support without OTA back-and-forth.
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:oklch(0.46_0.04_55)]">
            No prepayment required on select rates
          </p>
        </div>

        {validationMessage ? (
          <div className="mt-3 rounded-2xl border border-[color:oklch(0.83_0.05_45)] bg-[color:oklch(0.97_0.02_70)] px-4 py-3 text-sm text-[color:oklch(0.38_0.05_45)]">
            {validationMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
