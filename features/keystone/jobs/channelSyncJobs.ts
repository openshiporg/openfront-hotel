import type { KeystoneConfig } from '@keystone-6/core/types'
import { getHotelWorkerContext } from './runtimeContext'
import { pullReservationsFromChannel, pushInventoryToChannel, retryFailedChannelSyncs } from '../channels/commands'
import { acquireWorkerLease, createNonOverlappingTick, createWorkerLeaseOwnerId } from '../lib/workerLease'
import { safeOperationalErrorMessage } from '../lib/safeOperationalError'

const INVENTORY_SYNC_INTERVAL_MS = 15 * 60 * 1000
const RESERVATION_SYNC_INTERVAL_MS = 5 * 60 * 1000
const RETRY_INTERVAL_MS = 2 * 60 * 1000
const WORKER_LEASE_TTL_MS = 120_000

export function startChannelSyncJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return
  if ((globalThis as any).__channelSyncJobsState) return

  const context = getHotelWorkerContext(config)
  let stopping = false
  const leased = async (leaseKey: string, job: (renewLease: () => Promise<boolean>) => Promise<void>) => {
    if (stopping) return
    const ownerId = createWorkerLeaseOwnerId(`hotel-channel-${leaseKey}`)
    const renewLease = async () => !stopping && await acquireWorkerLease(context.prisma, { leaseKey, ownerId, ttlMs: WORKER_LEASE_TTL_MS })
    try {
      if (!(await renewLease())) return
      await job(renewLease)
    } catch (error) {
      console.error(safeOperationalErrorMessage('worker', error))
    }
  }

  const syncInventory = createNonOverlappingTick(() => leased('channel-inventory', async renewLease => {
    const channels = await context.sudo().query.Channel.findMany({
      where: { isActive: { equals: true } },
      query: 'id name',
    })
    for (const channel of channels) {
      if (!(await renewLease())) return
      try {
        await pushInventoryToChannel(context, channel.id, undefined, fetch, renewLease)
      } catch (error) {
        console.error(safeOperationalErrorMessage('channel', error), channel.id)
      }
    }
  }))

  const syncReservations = createNonOverlappingTick(() => leased('channel-reservations', async renewLease => {
    const channels = await context.sudo().query.Channel.findMany({
      where: { isActive: { equals: true } },
      query: 'id name',
    })
    for (const channel of channels) {
      if (!(await renewLease())) return
      try {
        await pullReservationsFromChannel(context, channel.id, fetch, renewLease)
      } catch (error) {
        console.error(safeOperationalErrorMessage('channel', error), channel.id)
      }
    }
  }))

  const retryFailed = createNonOverlappingTick(() => leased('channel-retries', async renewLease => {
    await retryFailedChannelSyncs(context, renewLease)
  }))

  const intervals = [
    setInterval(() => void syncInventory(), INVENTORY_SYNC_INTERVAL_MS),
    setInterval(() => void syncReservations(), RESERVATION_SYNC_INTERVAL_MS),
    setInterval(() => void retryFailed(), RETRY_INTERVAL_MS),
  ]
  intervals.forEach(interval => interval.unref())
  const shutdown = async () => {
    stopping = true;
    intervals.forEach(clearInterval);
    await Promise.all([syncInventory.drain(), syncReservations.drain(), retryFailed.drain()]);
  }
  ;(globalThis as any).__channelSyncJobsState = { intervals, shutdown }
  void syncInventory(); void syncReservations(); void retryFailed()
  return shutdown
}
