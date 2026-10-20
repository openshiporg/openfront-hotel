import type { KeystoneConfig } from '@keystone-6/core/types';
import { getHotelWorkerContext } from './runtimeContext';

import { reconcileSecurityAuthorizations } from '../security/authorization';
import { dispatchRefundIntentBatch } from '../refunds/refundIntentWorker';
import { dispatchPaymentSessionRetirements } from '../payments/settlement';
import { recordWorkerProgress } from '../lib/workerProgress';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';

const GLOBAL_KEY = '__hotelRefundJobsState';

/**
 * The three financial recovery queues run as separate loops. Slow or failing card-hold
 * reconciliation or payment retirement can never hold back an ordinary refund, and an error in
 * one queue does not stop the others. Each loop never overlaps itself; per-booking locks and
 * provider idempotency keys still serialize work on the same money.
 */
const QUEUES = {
  refunds: async (context: any, workerId: string) => {
    const result = await dispatchRefundIntentBatch(context, { workerId, limit: 10 });
    if (!result.retried && !result.deadLettered) await recordWorkerProgress(context.prisma, 'refunds');
  },
  security: async (context: any) => {
    if (!(await reconcileSecurityAuthorizations(context))) await recordWorkerProgress(context.prisma, 'security');
  },
  retirements: async (context: any) => {
    if (!(await dispatchPaymentSessionRetirements(context)).unresolved) await recordWorkerProgress(context.prisma, 'retirements');
  },
} as const;

export async function runHotelRefundWorkerCycle(context: any, workerId: string) {
  for (const queue of Object.values(QUEUES)) {
    try { await queue(context, workerId); } catch (error) { console.error(safeOperationalErrorMessage('worker', error)); }
  }
}

export function startHotelRefundJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return;
  const globalState = globalThis as any;
  if (globalState[GLOBAL_KEY]) return;
  const context = getHotelWorkerContext(config);
  const workerId = process.env.HOTEL_REFUND_WORKER_ID || `hotel-refund-${process.pid}`;
  const intervalMs = Math.max(1_000, Number(process.env.HOTEL_REFUND_INTERVAL_MS || 5_000));
  let stopping = false;
  const inFlight = new Map<string, Promise<void>>();
  const dispatch = (name: keyof typeof QUEUES) => {
    if (stopping || inFlight.has(name)) return;
    const current = QUEUES[name](context, workerId)
      .catch(error => { console.error(safeOperationalErrorMessage('worker', error)); })
      .finally(() => { if (inFlight.get(name) === current) inFlight.delete(name); });
    inFlight.set(name, current);
  };
  const dispatchAll = () => { for (const name of Object.keys(QUEUES) as Array<keyof typeof QUEUES>) dispatch(name); };
  const interval = setInterval(dispatchAll, intervalMs);
  interval.unref();
  const shutdown = async () => {
    stopping = true;
    clearInterval(interval);
    await Promise.all(inFlight.values());
  };
  globalState[GLOBAL_KEY] = { interval, shutdown };
  dispatchAll();
  return shutdown;
}
