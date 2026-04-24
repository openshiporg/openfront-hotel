'use client';

import * as React from 'react';
import { Minus, Plus, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface GuestCounts {
  adults: number;
  children: number;
}

interface GuestSelectorProps {
  guests: GuestCounts;
  onGuestsChange: (guests: GuestCounts) => void;
  className?: string;
}

export function GuestSelector({ guests, onGuestsChange, className }: GuestSelectorProps) {
  const totalGuests = guests.adults + guests.children;

  const updateGuests = (type: 'adults' | 'children', delta: number) => {
    const newValue = guests[type] + delta;
    if (newValue >= 0 && (type === 'children' || newValue >= 1)) {
      onGuestsChange({ ...guests, [type]: newValue });
    }
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'h-12 w-full justify-start rounded-2xl border-[color:oklch(0.84_0.02_75)] bg-white/85 text-left font-normal shadow-none hover:bg-white',
              totalGuests === 0 && 'text-[color:oklch(0.54_0.02_58)]'
            )}
          >
            <Users className="mr-2 h-4 w-4 text-[color:oklch(0.45_0.05_48)]" />
            {totalGuests > 0 ? (
              <span>
                {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                {guests.adults > 0 && ` · ${guests.adults} ${guests.adults === 1 ? 'adult' : 'adults'}`}
                {guests.children > 0 && ` · ${guests.children} ${guests.children === 1 ? 'child' : 'children'}`}
              </span>
            ) : (
              <span>Select guests</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 rounded-3xl border-[color:oklch(0.85_0.02_75)] p-4" align="start">
          <div className="space-y-4">
            {[
              {
                key: 'adults' as const,
                label: 'Adults',
                description: 'Ages 13+',
                min: 1,
              },
              {
                key: 'children' as const,
                label: 'Children',
                description: 'Ages 0-12',
                min: 0,
              },
            ].map((group) => (
              <div key={group.key} className="flex items-center justify-between rounded-2xl bg-[color:oklch(0.98_0.01_80)] px-3 py-3">
                <div>
                  <div className="font-medium text-[color:oklch(0.25_0.02_58)]">{group.label}</div>
                  <div className="text-sm text-[color:oklch(0.47_0.02_58)]">{group.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateGuests(group.key, -1)}
                    disabled={guests[group.key] <= group.min}
                    className="h-9 w-9 rounded-full border-[color:oklch(0.84_0.02_75)] bg-white"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-base font-semibold text-[color:oklch(0.24_0.02_58)]">
                    {guests[group.key]}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateGuests(group.key, 1)}
                    className="h-9 w-9 rounded-full border-[color:oklch(0.84_0.02_75)] bg-white"
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
  );
}
