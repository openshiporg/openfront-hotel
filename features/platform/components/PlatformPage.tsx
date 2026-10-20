import * as React from 'react';

import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { cn } from '@/lib/utils';

type Crumb = { label: string; href?: string };

/**
 * Standard frame for every hotel platform screen, matching the platform list pages:
 * Dashboard > Platform > page breadcrumbs, the shared heading, and an action rail.
 * The dashboard shell (sidebar, trigger, auth) stays owned by PageContainer.
 */
export function PlatformPage({
  title,
  description,
  crumbs,
  meta,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  /** Extra crumbs between Platform and the page (for detail views). */
  crumbs?: Crumb[];
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    ...(crumbs || []).map((crumb) => crumb.href
      ? { type: 'link' as const, label: crumb.label, href: crumb.href }
      : { type: 'page' as const, label: crumb.label }),
    { type: 'page' as const, label: title },
  ];

  const header = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );

  return (
    <PageContainer title={title} header={header} breadcrumbs={breadcrumbs}>
      <div className={cn('min-w-0 max-w-full space-y-6 px-4 pb-16 md:px-6', className)}>{children}</div>
    </PageContainer>
  );
}

export function MetaItem({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
