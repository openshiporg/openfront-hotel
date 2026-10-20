'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

import { RadioGroup } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { TONE_DOT, type StatusTone } from '../lib/status';

export type FilterTab = { value: string; label: string; count?: number; tone?: StatusTone };

/**
 * Status filter with live counts in the platform status-tab style: blue underline on the
 * selected tab, muted hover surface and bordered count badges. Each tab is a real button.
 * Scrolls horizontally on narrow screens instead of wrapping.
 */
export function FilterTabs({
  tabs,
  value,
  onChange,
  className,
  label = 'Filter by status',
}: {
  tabs: FilterTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('-mb-px flex min-w-0 items-center space-x-[6px] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)} role="group" aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] px-3 py-2 text-sm font-medium leading-5 text-muted-foreground transition-colors duration-300 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              active && 'text-foreground after:absolute after:inset-x-0 after:-bottom-1 after:h-[2px] after:bg-blue-500',
            )}
          >
            {tab.tone ? <span className={cn('inline-block size-2 shrink-0 rounded-full', TONE_DOT[tab.tone])} aria-hidden="true" /> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <span className="inline-flex h-[18px] items-center rounded-sm border bg-background px-1.5 py-0 text-[10px] font-medium leading-[14px] tabular-nums text-zinc-600 shadow-xs dark:bg-zinc-800 dark:text-zinc-400">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact segmented control for small option sets (views, modes). Built on the shared
 * radio group, so it is one Tab stop and arrow keys move the selection.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label: string;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      orientation="horizontal"
      className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border bg-muted/50 p-0.5', className)}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'h-7 shrink-0 whitespace-nowrap rounded-[3px] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-xs data-[state=checked]:ring-1 data-[state=checked]:ring-border',
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroup>
  );
}
