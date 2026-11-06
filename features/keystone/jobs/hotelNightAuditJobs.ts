import type { KeystoneConfig } from '@keystone-6/core/types';

import { closeHotelBusinessDate } from '../operations/nightAudit';
import { propertyCalendarDate } from '../lib/hotelBusinessTime';
import { acquireWorkerLease, createNonOverlappingTick, createWorkerLeaseOwnerId } from '../lib/workerLease';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';
import { getHotelWorkerContext } from './runtimeContext';

/** Property-local hour after which yesterday's business date is closed automatically (like a PMS auto-audit). */
export const AUTO_NIGHT_AUDIT_LOCAL_HOUR = 3;
const RETRY_AFTER_REFUSAL_MS = 15 * 60_000;

function localHour(now: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    .find(part => part.type === 'hour')?.value;
  return Number(hour);
}

/**
 * The business date that is due to close now, or null. A date is due once the property's local
 * calendar has moved past it and the local clock has reached the audit hour on the following day
 * (any later day counts, so a property that fell behind catches up one date per cycle).
 */
export function dueNightAuditDate(currentBusinessDate: Date, now: Date, timeZone: string, auditHour = AUTO_NIGHT_AUDIT_LOCAL_HOUR) {
  const today = propertyCalendarDate(now, timeZone);
  const current = new Date(currentBusinessDate);
  current.setUTCHours(0, 0, 0, 0);
  if (current.getTime() >= today.getTime()) return null;
  const nextDay = new Date(current);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  if (nextDay.getTime() === today.getTime() && localHour(now, timeZone) < auditHour) return null;
  return current;
}

export async function runHotelNightAuditCycle(context: any, now = new Date()) {
  const [clock, settings] = await Promise.all([
    context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
    context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { timeZone: true } }),
  ]);
  if (!clock?.currentBusinessDate || !settings?.timeZone) return { status: 'unconfigured' as const };
  const due = dueNightAuditDate(clock.currentBusinessDate, now, settings.timeZone);
  if (!due) return { status: 'current' as const };
  const day = due.toISOString().slice(0, 10);
  // One key per business date: a retried or concurrent close replays instead of double-posting.
  const run = await closeHotelBusinessDate(context, { businessDate: due.toISOString(), idempotencyKey: `auto:${day}`, actorId: null });
  return { status: 'closed' as const, businessDate: day, runId: run?.id };
}

export function startHotelNightAuditJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return;
  const globalState = globalThis as any; if (globalState.__hotelNightAuditJobsState) return;
  const context = getHotelWorkerContext(config); let stopping = false; let retryAt = 0;
  const ownerId = createWorkerLeaseOwnerId('hotel-night-audit');
  const run = createNonOverlappingTick(async () => {
    if (stopping || Date.now() < retryAt) return;
    if (!(await acquireWorkerLease(context.prisma, { leaseKey: 'night-audit', ownerId, ttlMs: 120_000 }))) return;
    try {
      const result = await runHotelNightAuditCycle(context);
      if (result.status === 'closed') console.info(`Hotel night audit closed business date ${result.businessDate}.`);
    } catch (error) {
      // Refusals (unsettled departures, closed folios) need staff; Front Desk shows the lag and
      // Folios shows the reason when run by hand. Retry later rather than every minute.
      retryAt = Date.now() + RETRY_AFTER_REFUSAL_MS;
      console.error(safeOperationalErrorMessage('worker', error));
    }
  });
  const interval = setInterval(() => void run(), 60_000); interval.unref();
  const shutdown = async () => { stopping = true; clearInterval(interval); await run.drain(); };
  globalState.__hotelNightAuditJobsState = { interval, shutdown };
  void run();
  return shutdown;
}
