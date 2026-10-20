import * as React from 'react';

import { coloredBadgeVariants, standardBadgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusMeta, type StatusKind, type StatusTone } from '../lib/status';

/** Each status tone rendered through the shared colored Badge. */
const TONE_BADGE_COLOR = {
  neutral: 'zinc',
  info: 'sky',
  progress: 'indigo',
  success: 'emerald',
  warning: 'amber',
  danger: 'red',
  accent: 'violet',
} as const satisfies Record<StatusTone, string>;

/**
 * Registry-backed status label in the shared Badge style. Use `kind`/`value` for known states.
 * Rendered as a span so it can sit inside text.
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
    <span className={cn(coloredBadgeVariants({ color: TONE_BADGE_COLOR[resolvedTone] }), 'shrink-0 whitespace-nowrap', className)}>
      {label ?? meta.label}
    </span>
  );
}

/** Secondary fact (source, method, meal plan) in the shared outline Badge style. */
export function Tag({ children, className, icon: Icon }: { children: React.ReactNode; className?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <span className={cn(standardBadgeVariants({ variant: 'outline' }), 'shrink-0 gap-1 whitespace-nowrap font-medium text-muted-foreground', className)}>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
