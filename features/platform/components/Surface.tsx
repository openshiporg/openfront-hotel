'use client';

import * as React from 'react';
import { AlertTriangle, Check, ChevronDown, CircleAlert, CircleCheck, Copy, Info } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Section surface on the shared Card, with the platform's muted header band. */
export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={cn('min-w-0 overflow-hidden', className)} {...props}>
      {children}
    </Card>
  );
}

export function PanelHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <CardHeader className={cn('space-y-0 border-b bg-muted/40 px-4 py-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {Icon ? <Icon className="size-4 shrink-0" /> : null}
            {title}
          </CardTitle>
          {description ? <CardDescription className="text-pretty">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </CardHeader>
  );
}

export function PanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <CardContent className={cn('p-4', className)}>{children}</CardContent>;
}

export function PanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <CardFooter className={cn('flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end', className)}>{children}</CardFooter>;
}

/** A thin band inside a panel for search/filter controls. */
export function PanelToolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('border-b px-4 py-3', className)}>{children}</div>;
}

type CalloutTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

const CALLOUT_TONE: Record<CalloutTone, { box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: { box: 'border-sky-500/25 bg-sky-500/[0.05] text-sky-950 dark:text-sky-100', icon: 'text-sky-600 dark:text-sky-400', Icon: Info },
  warning: { box: 'border-amber-500/30 bg-amber-500/[0.07] text-amber-950 dark:text-amber-100', icon: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
  danger: { box: 'border-rose-500/30 bg-rose-500/[0.06] text-rose-950 dark:text-rose-100', icon: 'text-rose-600 dark:text-rose-400', Icon: CircleAlert },
  success: { box: 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-950 dark:text-emerald-100', icon: 'text-emerald-600 dark:text-emerald-400', Icon: CircleCheck },
  neutral: { box: 'border-border bg-muted/40 text-foreground', icon: 'text-muted-foreground', Icon: Info },
};

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
  role,
}: {
  tone?: CalloutTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  role?: string;
}) {
  const style = CALLOUT_TONE[tone];
  const Icon = icon || style.Icon;
  return (
    <div role={role} className={cn('flex flex-wrap gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-nowrap', style.box, className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', style.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] space-y-1 sm:basis-auto">
        {title ? <p className="font-medium leading-5">{title}</p> : null}
        {children ? <div className="leading-5 opacity-90 [&_a]:underline [&_a]:underline-offset-2">{children}</div> : null}
      </div>
      {/* On phones the action sits under the copy so the guidance keeps its full width. */}
      {action ? <div className="ml-7 shrink-0 sm:ml-0 sm:self-center">{action}</div> : null}
    </div>
  );
}

/**
 * Styled <details> for secondary workflows. `onOpen` fires on every expand so
 * callers can lazily fetch evidence only when an operator asks for it.
 */
export function Disclosure({
  title,
  description,
  icon: Icon,
  badge,
  onOpen,
  defaultOpen,
  className,
  bodyClassName,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  onOpen?: () => void;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn('min-w-0 rounded-lg border bg-card', className)}
      onToggle={(event) => { if (event.currentTarget.open) onOpen?.(); }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {Icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/50 text-muted-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-5">{title}</span>
          {description ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span> : null}
        </span>
        {badge ? <span className="shrink-0">{badge}</span> : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [details[open]>summary_&]:rotate-180" aria-hidden="true" />
      </summary>
      <div className={cn('border-t px-4 py-4', bodyClassName)}>{children}</div>
    </details>
  );
}

export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode; hidden?: boolean }>;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
}) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols, className)}>
      {items.filter((item) => !item.hidden).map((item, index) => (
        <div key={index} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-medium [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Monospace identifier with one-click copy, for approval targets and references. */
export function CopyId({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label || 'identifier'}`}
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      {label ? <span className="shrink-0 font-sans font-medium">{label}</span> : null}
      <span className="truncate">{value}</span>
      {copied ? <Check className="size-3 shrink-0 text-emerald-600" aria-hidden="true" /> : <Copy className="size-3 shrink-0" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  );
}

/** Titled group inside a panel, drawer or tab; stack several with `divide-y`. */
export function SubSection({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn('min-w-0 space-y-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-6">{title}</h3>
          {description ? <p className="text-xs leading-5 text-muted-foreground text-pretty">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground', className)}>{children}</p>;
}

export function InitialsAvatar({ name, className, tone = 'neutral' }: { name: string; className?: string; tone?: 'neutral' | 'vip' | 'restricted' }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length ? `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() : '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-1 ring-inset',
        tone === 'vip' && 'bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-200',
        tone === 'restricted' && 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300',
        tone === 'neutral' && 'bg-muted text-muted-foreground ring-border',
        className,
      )}
    >
      {text}
    </span>
  );
}
