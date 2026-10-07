import type { KeystoneConfig } from '@keystone-6/core/types';
import { getHotelWorkerContext } from './runtimeContext';

import { reconcileSecurityAuthorizations } from '../security/authorization';
import { dispatchRefundIntentBatch } from '../refunds/refundIntentWorker';
import { dispatchPaymentSessionRetirements } from '../payments/settlement';
import { recordWorkerProgress } from '../lib/workerProgress';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';

const GLOBAL_KEY = '__hotelRefundJobsState';

export async function runHotelRefundWorkerCycle(context: any, workerId: string) {
  const securityFailures = await reconcileSecurityAuthorizations(context);
  const retirements = await dispatchPaymentSessionRetirements(context);
  const result = await dispatchRefundIntentBatch(context, { workerId, limit: 10 });
  if (!securityFailures && !retirements.unresolved && !result.retried && !result.deadLettered) {
    await recordWorkerProgress(context.prisma, 'refunds');
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
  let inFlight: Promise<void> | null = null;
  const dispatch = () => {
    if (stopping || inFlight) return;
    const current = runHotelRefundWorkerCycle(context, workerId)
      .catch(error => { console.error(safeOperationalErrorMessage('worker', error)); })
      .finally(() => { if (inFlight === current) inFlight = null; });
    inFlight = current;
    return current;
  };
  const interval = setInterval(() => void dispatch(), intervalMs);
  interval.unref();
  const shutdown = async () => {
    stopping = true;
    clearInterval(interval);
    await inFlight;
  };
  globalState[GLOBAL_KEY] = { interval, shutdown };
  void dispatch();
  return shutdown;
}
