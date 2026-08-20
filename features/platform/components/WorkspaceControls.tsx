'use client';

import * as React from 'react';
import { AlertCircle, Loader2, Search, SlidersHorizontal } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function WorkspaceControls({
  search,
  onSearchChange,
  searchLabel,
  resultLabel,
  children,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  resultLabel: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center', className)}>
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => onSearchChange(event.target.value)} className="pl-9" placeholder={searchLabel} aria-label={searchLabel} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children ? <SlidersHorizontal aria-hidden="true" className="hidden h-4 w-4 text-muted-foreground sm:block" /> : null}
        {children}
      </div>
      <p className="text-xs tabular-nums text-muted-foreground sm:ml-auto" aria-live="polite">{resultLabel}</p>
    </div>
  );
}

export function WorkspaceSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</select></label>;
}

export function WorkspaceLoading({ label = 'Loading workspace' }: { label?: string }) {
  return <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground" role="status"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />{label}</div>;
}

export function WorkspaceError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Alert variant="destructive" role="alert"><AlertCircle className="h-4 w-4" /><AlertTitle>Workspace unavailable</AlertTitle><AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><span>{message}</span>{onRetry ? <Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button> : null}</AlertDescription></Alert>;
}

export function WorkspaceEmpty({ title, description, onClear }: { title: string; description: string; onClear?: () => void }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center"><p className="font-medium">{title}</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>{onClear ? <Button className="mt-4" type="button" size="sm" variant="outline" onClick={onClear}>Clear filters</Button> : null}</div>;
}
