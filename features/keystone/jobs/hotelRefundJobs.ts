import { getContext } from '@keystone-6/core/context';
import type { KeystoneConfig } from '@keystone-6/core/types';
import * as PrismaModule from '@prisma/client';

import { dispatchRefundIntentBatch } from '../lib/bookingCancellation';

const GLOBAL_KEY = '__hotelRefundJobsState';

export function startHotelRefundJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return;
  const globalState = globalThis as any;
  if (globalState[GLOBAL_KEY]) return;
  const context = getContext(config, PrismaModule);
  const workerId = process.env.HOTEL_REFUND_WORKER_ID || `hotel-refund-${process.pid}`;
  const intervalMs = Math.max(1_000, Number(process.env.HOTEL_REFUND_INTERVAL_MS || 5_000));
  let stopping = false;
  let running = false;
  const dispatch = async () => {
    if (stopping || running) return;
    running = true;
    try {
      await dispatchRefundIntentBatch(context, { workerId, limit: 10 });
    } catch (error) {
      console.error('Hotel refund dispatch failed:', error instanceof Error ? error.message : 'unknown error');
    } finally {
      running = false;
    }
  };
  const interval = setInterval(() => void dispatch(), intervalMs);
  interval.unref();
  const shutdown = () => { stopping = true; clearInterval(interval); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  globalState[GLOBAL_KEY] = { interval, shutdown };
  void dispatch();
}
