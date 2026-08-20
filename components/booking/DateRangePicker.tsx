'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { rangeFromDayClick } from '@/features/storefront/lib/qa-workflows';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  className?: string;
  variant?: 'card' | 'inline';
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
  variant = 'card',
}: DateRangePickerProps) {
  const label = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, y')}`
      : format(dateRange.from, 'MMM d, y')
    : 'Select dates';

  return (
    <div className={cn('min-w-0', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              variant === 'inline'
                ? 'h-auto min-h-0 w-full min-w-0 justify-between rounded-none border-0 bg-transparent p-0 text-left text-[1.08rem] font-normal leading-7 shadow-none hover:bg-transparent'
                : 'h-12 w-full justify-start rounded-2xl border-[color:oklch(0.84_0.02_75)] bg-white/85 text-left font-normal shadow-none hover:bg-white',
              !dateRange?.from && 'text-[#1b1c1c]'
            )}
          >
            <span className="block min-w-0 truncate">{label}</span>
            <CalendarIcon className="ml-3 h-4 w-4 shrink-0 text-[#775a19]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[calc(100vw-2rem)] max-w-[720px] rounded-none border-[#c3c8c2] p-0 md:w-auto"
          align="start"
          sideOffset={12}
        >
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onDayClick={(selectedDay) => {
              onDateRangeChange(rangeFromDayClick(dateRange, selectedDay));
            }}
            numberOfMonths={1}
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
          />
          {dateRange?.from ? (
            <div className="border-t border-[var(--lodging-rule)] p-3 text-right">
              <button type="button" className="lodging-link" onClick={() => onDateRangeChange(undefined)}>
                Clear dates
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
