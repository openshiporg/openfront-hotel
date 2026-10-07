import type { KeystoneConfig } from '@keystone-6/core/types';

import { startChannelSyncJobs } from './jobs/channelSyncJobs';
import { startHotelHoldJobs } from './jobs/hotelHoldJobs';
import { startHotelOutboxJobs } from './jobs/hotelOutboxJobs';
import { startHotelRefundJobs } from './jobs/hotelRefundJobs';
import { registerHotelWorkerShutdown } from './jobs/runtimeContext';

/** Explicit Node runtime entrypoint; never call during schema generation or build. */
export async function startHotelWorkers(config: KeystoneConfig) {
  const shutdowns: Array<() => Promise<void>> = [];
  const starts = [
    () => startChannelSyncJobs(config),
    () => startHotelOutboxJobs(config),
    () => startHotelRefundJobs(config),
    () => startHotelHoldJobs(config),
  ];

  try {
    for (const start of starts) {
      const shutdown = start();
      if (shutdown) shutdowns.push(shutdown);
    }
  } catch (error) {
    await Promise.allSettled(shutdowns.map(shutdown => shutdown()));
    throw error;
  }

  const shutdown = async () => {
    const results = await Promise.allSettled(shutdowns.map(stop => stop()));
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  };
  registerHotelWorkerShutdown(shutdown);
  return shutdown;
}
