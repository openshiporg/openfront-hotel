'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
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
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
}: DateRangePickerProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              'h-12 w-full justify-start rounded-2xl border-[color:oklch(0.84_0.02_75)] bg-white/85 text-left font-normal shadow-none hover:bg-white',
              !dateRange && 'text-[color:oklch(0.54_0.02_58)]'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-[color:oklch(0.45_0.05_48)]" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                </>
              ) : (
                format(dateRange.from, 'LLL dd, y')
              )
            ) : (
              <span>Select check-in and check-out dates</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-3xl border-[color:oklch(0.85_0.02_75)] p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={onDateRangeChange}
            numberOfMonths={2}
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
