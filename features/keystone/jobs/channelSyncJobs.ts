import { getContext } from '@keystone-6/core/context'
import type { KeystoneConfig } from '@keystone-6/core/types'
import * as PrismaModule from '@prisma/client'
import { pullReservationsFromChannel, pushInventoryToChannel, retryFailedChannelSyncs } from '../lib/channelSync'
import { acquireWorkerLease } from '../lib/workerLease'

const INVENTORY_SYNC_INTERVAL_MS = 15 * 60 * 1000
const RESERVATION_SYNC_INTERVAL_MS = 5 * 60 * 1000
const RETRY_INTERVAL_MS = 2 * 60 * 1000

export function startChannelSyncJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  if ((globalThis as any).__channelSyncJobsState) return

  const context = getContext(config, PrismaModule)
  const ownerId = process.env.CHANNEL_SYNC_WORKER_ID || `hotel-channel-${process.pid}`
  let stopping = false
  const leased = async (leaseKey: string, ttlMs: number, job: () => Promise<void>) => {
    if (stopping || !(await acquireWorkerLease(context.prisma, { leaseKey, ownerId, ttlMs }))) return
    await job()
  }

  const syncInventory = async () => {
    const channels = await context.sudo().query.Channel.findMany({
      where: { isActive: { equals: true } },
      query: 'id name',
    })

    for (const channel of channels) {
      try {
        await pushInventoryToChannel(context, channel.id)
      } catch (error) {
        console.error('Inventory sync failed for channel:', channel.id, error)
      }
    }
  }

  const syncReservations = async () => {
    const channels = await context.sudo().query.Channel.findMany({
      where: { isActive: { equals: true } },
      query: 'id name',
    })

    for (const channel of channels) {
      try {
        await pullReservationsFromChannel(context, channel.id)
      } catch (error) {
        console.error('Reservation pull failed for channel:', channel.id, error)
      }
    }
  }

  const retryFailed = async () => {
    try {
      await retryFailedChannelSyncs(context)
    } catch (error) {
      console.error('Channel sync retry failed:', error)
    }
  }

  const inventory = () => leased('channel-inventory', INVENTORY_SYNC_INTERVAL_MS * 2, syncInventory)
  const reservations = () => leased('channel-reservations', RESERVATION_SYNC_INTERVAL_MS * 2, syncReservations)
  const retries = () => leased('channel-retries', RETRY_INTERVAL_MS * 2, retryFailed)
  const intervals = [
    setInterval(() => void inventory(), INVENTORY_SYNC_INTERVAL_MS),
    setInterval(() => void reservations(), RESERVATION_SYNC_INTERVAL_MS),
    setInterval(() => void retries(), RETRY_INTERVAL_MS),
  ]
  intervals.forEach(interval => interval.unref())
  const shutdown = () => { stopping = true; intervals.forEach(clearInterval) }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  ;(globalThis as any).__channelSyncJobsState = { intervals, shutdown }
  void inventory(); void reservations(); void retries()
}
