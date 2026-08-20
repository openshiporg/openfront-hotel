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
  variant?: 'card' | 'inline';
}

export function GuestSelector({ guests, onGuestsChange, className, variant = 'card' }: GuestSelectorProps) {
  const totalGuests = guests.adults + guests.children;

  const updateGuests = (type: 'adults' | 'children', delta: number) => {
    const newValue = guests[type] + delta;
    if (newValue >= 0 && (type === 'children' || newValue >= 1)) {
      onGuestsChange({ ...guests, [type]: newValue });
    }
  };

  return (
    <div className={cn('min-w-0', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              variant === 'inline'
                ? 'h-auto min-h-0 w-full min-w-0 justify-between rounded-none border-0 bg-transparent p-0 text-left text-[1.08rem] font-normal leading-7 shadow-none hover:bg-transparent'
                : 'h-12 w-full justify-start rounded-2xl border-[color:oklch(0.84_0.02_75)] bg-white/85 text-left font-normal shadow-none hover:bg-white',
              totalGuests === 0 && 'text-[#1b1c1c]'
            )}
          >
            <span className="block min-w-0 truncate">
              {totalGuests > 0 ? (
                <>
                  {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'} · {guests.adults} {guests.adults === 1 ? 'adult' : 'adults'}
                  {guests.children > 0 ? ` · ${guests.children} ${guests.children === 1 ? 'child' : 'children'}` : ''}
                </>
              ) : (
                'Select guests'
              )}
            </span>
            <Users className="ml-3 h-4 w-4 shrink-0 text-[#775a19]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm rounded-none border-[#c3c8c2] p-4" align="start" sideOffset={12}>
          <div className="space-y-3">
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
              <div key={group.key} className="flex items-center justify-between border border-[#e4e2e1] bg-[#fbf9f8] px-4 py-3">
                <div>
                  <div className="font-medium text-[#1b1c1c]">{group.label}</div>
                  <div className="text-sm text-[#747873]">{group.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateGuests(group.key, -1)}
                    disabled={guests[group.key] <= group.min}
                    className="h-9 w-9 rounded-none border-[#c3c8c2] bg-white"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-base font-semibold text-[#1b1c1c]">
                    {guests[group.key]}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateGuests(group.key, 1)}
                    className="h-9 w-9 rounded-none border-[#c3c8c2] bg-white"
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
