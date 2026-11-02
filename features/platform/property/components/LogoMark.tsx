'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeStoreLogoSvg } from '../lib/sanitize-store-logo';

/**
 * Logo preview. Every value reaching this component is either a library icon,
 * sanitized custom SVG, or a saved value the model already sanitized; it is
 * sanitized again here so nothing unsafe is ever injected into the page.
 */
export function LogoMark({ svg, hue, className }: { svg: string; hue: string; className?: string }) {
  const safe = useMemo(() => sanitizeStoreLogoSvg(svg), [svg]);
  if (!safe) {
    return <span className={cn('flex items-center justify-center', className)} aria-hidden="true"><span className="size-2.5 rotate-45 rounded-[999px_999px_999px_2px] bg-amber-700" /></span>;
  }
  return (
    <span
      className={cn('flex items-center justify-center overflow-hidden [&>svg]:block [&>svg]:size-full', className)}
      style={{ filter: `hue-rotate(${hue}deg)` }}
      dangerouslySetInnerHTML={{ __html: safe }}
      aria-hidden="true"
    />
  );
}
