'use client';

import * as React from 'react';
import { ChevronDown, CircleAlert, CircleCheck, Info } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Dense control height shared by inputs and selects inside operator forms. */
const CONTROL = 'h-9 px-3 text-sm';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-[13px] font-medium leading-5 text-foreground">
        <span>{label}</span>
        {optional ? <span className="text-[11px] font-normal text-muted-foreground">Optional</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const FieldInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function FieldInput({ className, ...props }, ref) {
  return <Input ref={ref} className={cn(CONTROL, className)} {...props} />;
});

export function FieldTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <Textarea className={cn('min-h-20 text-sm', className)} {...props} />;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <select
        ref={ref}
        className={cn(
          CONTROL,
          'w-full min-w-0 appearance-none truncate rounded-md border border-input bg-background pr-8 shadow-xs outline-none transition-[color,box-shadow]',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          props.multiple && 'h-auto min-h-32 py-1.5 pr-3',
        )}
        {...props}
      >
        {children}
      </select>
      {props.multiple ? null : <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
    </div>
  );
});

export function CheckboxField({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const generated = React.useId();
  const inputId = id || generated;
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-2.5 text-sm', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block font-medium leading-5">{label}</span>
        {description ? <span className="block text-xs leading-5 text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

export function FormGrid({ columns = 2, className, children }: { columns?: 1 | 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return <div className={cn('grid gap-4', cols, className)}>{children}</div>;
}

export type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function feedbackFromError(error: unknown, fallback: string): Feedback {
  return { tone: 'error', text: error instanceof Error && error.message ? error.message : fallback };
}

/** Inline outcome line for a form or panel action. */
export function ActionMessage({ feedback, className }: { feedback: Feedback; className?: string }) {
  if (!feedback?.text) return null;
  const Icon = feedback.tone === 'error' ? CircleAlert : feedback.tone === 'success' ? CircleCheck : Info;
  return (
    <p
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md px-3 py-2 text-sm leading-5',
        feedback.tone === 'error' && 'bg-rose-500/[0.07] text-rose-800 dark:text-rose-200',
        feedback.tone === 'success' && 'bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200',
        feedback.tone === 'info' && 'bg-muted text-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{feedback.text}</span>
    </p>
  );
}

/** Small explanatory copy under a form or panel. */
export function FormNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-xs leading-5 text-muted-foreground text-pretty', className)}>{children}</p>;
}
