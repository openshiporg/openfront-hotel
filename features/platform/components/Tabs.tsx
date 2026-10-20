'use client';

import * as React from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * Tab set for switching between sections of one record or tool, in the shared tabs style.
 * Inactive panels unmount, so tools inside them load only when opened.
 */
export const WorkspaceTabs = Tabs;

export function WorkspaceTabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsList className={cn('justify-start', className)}>{children}</TabsList>
    </div>
  );
}

export function WorkspaceTabsTrigger({ value, className, children, count }: { value: string; className?: string; children: React.ReactNode; count?: number }) {
  return (
    <TabsTrigger value={value} className={cn('shrink-0 gap-2', className)}>
      {children}
      {count !== undefined ? <span className="inline-flex h-[18px] items-center rounded-sm border bg-background px-1.5 text-[10px] font-medium leading-[14px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{count}</span> : null}
    </TabsTrigger>
  );
}

export function WorkspaceTabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  return <TabsContent value={value} className={className}>{children}</TabsContent>;
}
