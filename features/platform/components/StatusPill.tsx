import * as React from 'react';

import { cn } from '@/lib/utils';
import { statusMeta, TONE_DOT, type StatusKind, type StatusTone } from '../lib/status';

/**
 * Status as a small coloured dot plus plain text, matching the status filter tabs.
 * No pill, border or fill. Use `kind`/`value` for known states. Rendered as a span so it can sit inside text.
 */
export function StatusPill({
  kind,
  value,
  tone,
  label,
  className,
}: {
  kind?: StatusKind;
  value?: string | null;
  tone?: StatusTone;
  label?: React.ReactNode;
  className?: string;
}) {
  const meta = kind ? statusMeta(kind, value) : { label: value || '', tone: 'neutral' as StatusTone };
  const resolvedTone = tone || meta.tone;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-5 text-foreground/80', className)}>
      <span className={cn('inline-block size-2 shrink-0 rounded-full', TONE_DOT[resolvedTone])} aria-hidden="true" />
      {label ?? meta.label}
    </span>
  );
}

/** Secondary fact (source, method, meal plan) as plain muted text. No badge. */
export function Tag({ children, className, icon: Icon }: { children: React.ReactNode; className?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground', className)}>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
