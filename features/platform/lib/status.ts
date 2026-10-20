import { humanize } from './format';

export type StatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger' | 'accent';

type StatusEntry = { label: string; tone: StatusTone };

/**
 * One vocabulary for operational state across the hotel workspace, so the
 * same fact (for example "checked in") always reads and colors the same way.
 */
const STATUS_REGISTRY = {
  booking: {
    pending: { label: 'Pending', tone: 'warning' },
    confirmed: { label: 'Confirmed', tone: 'info' },
    checked_in: { label: 'In house', tone: 'success' },
    checked_out: { label: 'Checked out', tone: 'neutral' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
    cancellation_pending: { label: 'Cancellation pending', tone: 'warning' },
    no_show: { label: 'No show', tone: 'danger' },
  },
  room: {
    vacant: { label: 'Vacant', tone: 'success' },
    inspected: { label: 'Inspected', tone: 'success' },
    occupied: { label: 'Occupied', tone: 'info' },
    cleaning: { label: 'Cleaning', tone: 'warning' },
    maintenance: { label: 'Maintenance', tone: 'danger' },
    out_of_order: { label: 'Out of order', tone: 'danger' },
  },
  task: {
    pending: { label: 'Pending', tone: 'neutral' },
    in_progress: { label: 'In progress', tone: 'progress' },
    inspection_needed: { label: 'Inspection', tone: 'accent' },
    on_hold: { label: 'On hold', tone: 'warning' },
    completed: { label: 'Completed', tone: 'success' },
  },
  maintenance: {
    reported: { label: 'Reported', tone: 'warning' },
    assigned: { label: 'Assigned', tone: 'info' },
    in_progress: { label: 'In progress', tone: 'progress' },
    completed: { label: 'Needs verification', tone: 'accent' },
    verified: { label: 'Back in service', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
  },
  priority: {
    emergency: { label: 'Emergency', tone: 'danger' },
    urgent: { label: 'Urgent', tone: 'danger' },
    high: { label: 'High', tone: 'warning' },
    medium: { label: 'Medium', tone: 'info' },
    normal: { label: 'Normal', tone: 'neutral' },
    low: { label: 'Low', tone: 'neutral' },
  },
  payment: {
    completed: { label: 'Completed', tone: 'success' },
    pending: { label: 'Pending', tone: 'warning' },
    processing: { label: 'Processing', tone: 'progress' },
    failed: { label: 'Failed', tone: 'danger' },
    refunded: { label: 'Refunded', tone: 'neutral' },
    partially_refunded: { label: 'Partly refunded', tone: 'neutral' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
  },
  folio: {
    open: { label: 'Open', tone: 'info' },
    closed: { label: 'Closed', tone: 'neutral' },
  },
  rate: {
    active: { label: 'Active', tone: 'success' },
    inactive: { label: 'Paused', tone: 'neutral' },
    draft: { label: 'Draft', tone: 'warning' },
  },
  delivery: {
    pending: { label: 'Pending', tone: 'neutral' },
    processing: { label: 'Processing', tone: 'progress' },
    failed: { label: 'Retrying', tone: 'warning' },
    dead_letter: { label: 'Dead letter', tone: 'danger' },
    completed: { label: 'Delivered', tone: 'success' },
    delivered: { label: 'Delivered', tone: 'success' },
    succeeded: { label: 'Processed', tone: 'success' },
  },
  channel: {
    active: { label: 'Active', tone: 'success' },
    success: { label: 'Healthy', tone: 'success' },
    error: { label: 'Error', tone: 'danger' },
    failed: { label: 'Failed', tone: 'danger' },
    paused: { label: 'Paused', tone: 'warning' },
    processing: { label: 'Syncing', tone: 'progress' },
    idle: { label: 'Idle', tone: 'neutral' },
  },
  shift: {
    open: { label: 'Open', tone: 'success' },
    awaiting_review: { label: 'Awaiting review', tone: 'warning' },
    closed: { label: 'Closed', tone: 'neutral' },
    approved: { label: 'Reviewed', tone: 'neutral' },
  },
  invoice: {
    open: { label: 'Open', tone: 'info' },
    paid: { label: 'Paid', tone: 'success' },
    credit_due: { label: 'Credit due', tone: 'warning' },
    written_off: { label: 'Written off', tone: 'neutral' },
    refunded: { label: 'Refunded', tone: 'neutral' },
  },
  aging: {
    current: { label: 'Current', tone: 'success' },
    '1-30': { label: '1–30 days', tone: 'warning' },
    '31-60': { label: '31–60 days', tone: 'warning' },
    '61-90': { label: '61–90 days', tone: 'danger' },
    '90+': { label: '90+ days', tone: 'danger' },
  },
  group: {
    tentative: { label: 'Tentative', tone: 'warning' },
    definite: { label: 'Definite', tone: 'success' },
    released: { label: 'Released', tone: 'neutral' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
    completed: { label: 'Completed', tone: 'neutral' },
  },
  service: {
    open: { label: 'Open', tone: 'info' },
    assigned: { label: 'Assigned', tone: 'info' },
    in_progress: { label: 'In progress', tone: 'progress' },
    resolved: { label: 'Resolved', tone: 'success' },
    closed: { label: 'Closed', tone: 'neutral' },
  },
  dispute: {
    needs_response: { label: 'Needs response', tone: 'danger' },
    warning_needs_response: { label: 'Needs response', tone: 'danger' },
    under_review: { label: 'Under review', tone: 'warning' },
    warning_under_review: { label: 'Under review', tone: 'warning' },
    won: { label: 'Won', tone: 'success' },
    lost: { label: 'Lost', tone: 'danger' },
    warning_closed: { label: 'Closed', tone: 'neutral' },
  },
  approval: {
    pending: { label: 'Awaiting decision', tone: 'warning' },
    approved: { label: 'Approved', tone: 'success' },
    declined: { label: 'Declined', tone: 'danger' },
    used: { label: 'Consumed', tone: 'neutral' },
  },
  payout: {
    imported: { label: 'Imported', tone: 'info' },
    exceptions: { label: 'Exceptions', tone: 'danger' },
    ready: { label: 'Ready to match', tone: 'info' },
    matched: { label: 'Matched', tone: 'success' },
  },
  relocation: {
    requested: { label: 'Requested', tone: 'warning' },
    arranged: { label: 'Arranged', tone: 'info' },
    transferred: { label: 'Transferred', tone: 'progress' },
    completed: { label: 'Completed', tone: 'success' },
  },
} satisfies Record<string, Record<string, StatusEntry>>;

export type StatusKind = keyof typeof STATUS_REGISTRY;

export function statusMeta(kind: StatusKind, value?: string | null): StatusEntry {
  const key = String(value || '').toLowerCase();
  const entry = (STATUS_REGISTRY[kind] as Record<string, StatusEntry>)[key];
  return entry || { label: humanize(value), tone: 'neutral' };
}

export const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-zinc-400 dark:bg-zinc-500',
  info: 'bg-sky-500',
  progress: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  accent: 'bg-violet-500',
};

export const TONE_PILL: Record<StatusTone, string> = {
  neutral: 'bg-zinc-500/[0.07] text-zinc-700 ring-zinc-500/20 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10',
  info: 'bg-sky-500/[0.08] text-sky-800 ring-sky-600/20 dark:text-sky-300 dark:ring-sky-400/20',
  progress: 'bg-indigo-500/[0.08] text-indigo-800 ring-indigo-600/20 dark:text-indigo-300 dark:ring-indigo-400/20',
  success: 'bg-emerald-500/[0.08] text-emerald-800 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/20',
  warning: 'bg-amber-500/[0.1] text-amber-900 ring-amber-600/25 dark:text-amber-200 dark:ring-amber-400/20',
  danger: 'bg-rose-500/[0.08] text-rose-800 ring-rose-600/20 dark:text-rose-300 dark:ring-rose-400/20',
  accent: 'bg-violet-500/[0.08] text-violet-800 ring-violet-600/20 dark:text-violet-300 dark:ring-violet-400/20',
};

/** Left-edge accent used by queue rows and calendar bars. */
export const TONE_EDGE: Record<StatusTone, string> = {
  neutral: 'border-l-zinc-300 dark:border-l-zinc-600',
  info: 'border-l-sky-500',
  progress: 'border-l-indigo-500',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-rose-500',
  accent: 'border-l-violet-500',
};

/** Soft surface tint for blocks (room tiles, calendar bars). */
export const TONE_SURFACE: Record<StatusTone, string> = {
  neutral: 'bg-zinc-500/[0.06] border-zinc-500/20 text-zinc-800 dark:text-zinc-200',
  info: 'bg-sky-500/[0.09] border-sky-500/30 text-sky-950 dark:text-sky-100',
  progress: 'bg-indigo-500/[0.09] border-indigo-500/30 text-indigo-950 dark:text-indigo-100',
  success: 'bg-emerald-500/[0.09] border-emerald-500/30 text-emerald-950 dark:text-emerald-100',
  warning: 'bg-amber-500/[0.12] border-amber-500/35 text-amber-950 dark:text-amber-100',
  danger: 'bg-rose-500/[0.09] border-rose-500/30 text-rose-950 dark:text-rose-100',
  accent: 'bg-violet-500/[0.09] border-violet-500/30 text-violet-950 dark:text-violet-100',
};
