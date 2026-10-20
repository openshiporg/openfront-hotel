'use client';

import * as React from 'react';
import { ChevronDown, CircleAlert, Inbox, RotateCcw, Search, SearchX, type LucideIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Search + filter row in the platform filter-bar layout: a full-width search
 * with domain filters and actions on the right.
 */
export function WorkspaceControls({
  search,
  onSearchChange,
  searchLabel,
  resultLabel,
  children,
  actions,
  className,
  searchClassName,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  resultLabel?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  searchClassName?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      <div className={cn('relative min-w-56 flex-1', searchClassName)}>
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-10 w-full rounded-lg pl-9 placeholder:text-muted-foreground/80"
          placeholder={searchLabel}
          aria-label={searchLabel}
        />
      </div>
      {children ? <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div> : null}
      {resultLabel || actions ? (
        <div className="flex items-center gap-3">
          {resultLabel ? <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" aria-live="polite">{resultLabel}</p> : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceSelect({ label, value, onChange, children, className }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('relative inline-flex min-w-0', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}

/** Skeleton rows shaped like the list that will replace them. */
export function WorkspaceLoading({ label = 'Loading workspace', rows = 5, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-2.5 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3.5">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${48 - (index % 3) * 9}%` }} />
              <div className="h-2.5 animate-pulse rounded bg-muted/70" style={{ width: `${30 - (index % 2) * 8}%` }} />
            </div>
            <div className="hidden h-5 w-16 animate-pulse rounded-full bg-muted sm:block" />
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Failed read: the shared destructive Alert with a retry. */
export function WorkspaceError({ message, onRetry, title = 'This workspace could not load' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert className="size-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="[overflow-wrap:anywhere]">
        <p>{message}</p>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** Empty or filtered-empty list: the shared EmptyState, with clear-filters or a domain action. */
export function WorkspaceEmpty({
  title,
  description,
  onClear,
  icon,
  action,
  className,
  compact,
}: {
  title: string;
  description: string;
  onClear?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const Icon = (icon || (onClear ? SearchX : Inbox)) as LucideIcon;
  return (
    <div className={className}>
      <EmptyState
        title={title}
        description={description}
        icons={[Icon]}
        action={onClear ? { label: 'Clear filters', onClick: onClear } : undefined}
        className={compact ? 'p-8' : undefined}
      />
      {action ? <div className="-mt-6 flex flex-wrap justify-center gap-2 pb-8">{action}</div> : null}
    </div>
  );
}
