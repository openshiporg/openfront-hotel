import { releaseDueHotelGroupBlocks } from '../groups/commands';
import type { KeystoneConfig } from '@keystone-6/core/types';
import { getHotelWorkerContext } from './runtimeContext';
import { acquireWorkerLease, createNonOverlappingTick, createWorkerLeaseOwnerId } from '../lib/workerLease';
import { expireHotelHoldBatch } from '../lib/expireHotelHolds';
import { recordWorkerProgress } from '../lib/workerProgress';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';

export async function runHotelHoldWorkerCycle(
  context: any,
  ownerId = createWorkerLeaseOwnerId('hotel-hold'),
  lease = acquireWorkerLease,
) {
  const renewLease = () => lease(context.prisma, { leaseKey: 'booking-hold-expiry', ownerId, ttlMs: 120_000 });
  if (!(await renewLease())) return;
  const result = await expireHotelHoldBatch(context, new Date(), renewLease);
  if (result.leaseLost) return;
  const groupResult = await releaseDueHotelGroupBlocks(context, renewLease);
  if (groupResult.leaseLost) return;
  if (result.failures.length) console.error('Hotel hold expiry records failed:', result.failures.length);
  else await recordWorkerProgress(context.prisma, 'holds');
}

export function startHotelHoldJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return;
  const globalState = globalThis as any; if (globalState.__hotelHoldJobsState) return;
  const context = getHotelWorkerContext(config); let stopping = false;
  const run = createNonOverlappingTick(async () => {
    if (stopping) return;
    const ownerId = createWorkerLeaseOwnerId('hotel-hold');
    const lease = async (prisma: any, options: { leaseKey: string; ownerId: string; ttlMs: number }) =>
      !stopping && await acquireWorkerLease(prisma, options);
    try {
      await runHotelHoldWorkerCycle(context, ownerId, lease);
    } catch (error) {
      console.error(safeOperationalErrorMessage('worker', error));
    }
  });
  const interval=setInterval(()=>void run(),60_000);interval.unref();const shutdown=async()=>{stopping=true;clearInterval(interval);await run.drain()};globalState.__hotelHoldJobsState={interval,shutdown};void run();return shutdown;
}
