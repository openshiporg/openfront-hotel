import * as React from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Operator ledgers and queues on the shared Table primitives. Tables keep a minimum
 * width and scroll horizontally inside their panel instead of the page.
 */
export function DataTable({ className, minWidth = 'min-w-[720px]', children }: { className?: string; minWidth?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <Table className={minWidth}>{children}</Table>
    </div>
  );
}

export function THead({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  return <TableHeader className={cn(sticky && 'sticky top-0 z-10 bg-background')}>{children}</TableHeader>;
}

export function Th({ className, align = 'left', children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <TableHead
      scope="col"
      className={cn('whitespace-nowrap', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}
      {...props}
    >
      {children}
    </TableHead>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <TableBody>{children}</TableBody>;
}

export function Tr({ className, selected, interactive, children, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean; interactive?: boolean }) {
  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className={cn(interactive && 'cursor-pointer', className)}
      {...props}
    >
      {children}
    </TableRow>
  );
}

export function Td({ className, align = 'left', numeric, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; numeric?: boolean }) {
  return (
    <TableCell
      className={cn(align === 'right' && 'text-right', align === 'center' && 'text-center', numeric && 'whitespace-nowrap tabular-nums', className)}
      {...props}
    >
      {children}
    </TableCell>
  );
}

/** Primary line + muted secondary line, the default cell content shape. */
export function CellStack({ primary, secondary, className }: { primary: React.ReactNode; secondary?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate font-medium text-foreground">{primary}</div>
      {secondary ? <div className="truncate text-xs text-muted-foreground">{secondary}</div> : null}
    </div>
  );
}
