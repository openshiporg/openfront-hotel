'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { TONE_DOT, type StatusTone } from '../lib/status';

export type StatItem = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatusTone;
  icon?: React.ComponentType<{ className?: string }>;
  /** When provided the stat behaves as a filter toggle. */
  onSelect?: () => void;
  active?: boolean;
};

const COLUMN_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-1 min-[420px]:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
};

/**
 * Hairline-divided KPI band. One surface instead of a row of floating cards
 * keeps headline numbers scannable and visually subordinate to the work queue.
 */
export function StatStrip({ items, className, loading }: { items: StatItem[]; className?: string; loading?: boolean }) {
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-lg border bg-border shadow-xs', COLUMN_CLASS[items.length] || 'grid-cols-2 lg:grid-cols-4', className)}>
      {items.map((item) => <StatCell key={item.label} item={item} loading={loading} />)}
    </div>
  );
}

function StatCell({ item, loading }: { item: StatItem; loading?: boolean }) {
  const Icon = item.icon;
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {item.tone ? <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[item.tone])} aria-hidden="true" /> : null}
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{item.label}</span>
      </span>
      <span className="mt-1.5 block text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted align-middle" /> : item.value}
      </span>
      {item.hint ? <span className="mt-0.5 block text-pretty text-xs text-muted-foreground">{item.hint}</span> : null}
    </>
  );
  if (item.onSelect) {
    return (
      <button
        type="button"
        onClick={item.onSelect}
        aria-pressed={Boolean(item.active)}
        className={cn(
          'relative min-w-0 bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          item.active && 'bg-muted/50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground',
        )}
      >
        {body}
      </button>
    );
  }
  return <div className="min-w-0 bg-card px-4 py-3.5">{body}</div>;
}

export function Meter({ value, max, tone = 'success', className, label }: { value: number; max: number; tone?: StatusTone; className?: string; label?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', TONE_DOT[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}
