import { getContext } from '@keystone-6/core/context'
import type { KeystoneConfig } from '@keystone-6/core/types'
import * as PrismaModule from '@prisma/client'
import { pullReservationsFromChannel, pushInventoryToChannel, retryFailedChannelSyncs } from '../lib/channelSync'

const INVENTORY_SYNC_INTERVAL_MS = 15 * 60 * 1000
const RESERVATION_SYNC_INTERVAL_MS = 5 * 60 * 1000
const RETRY_INTERVAL_MS = 2 * 60 * 1000

export function startChannelSyncJobs(config: KeystoneConfig) {
  if (process.env.CHANNEL_SYNC_JOBS_ENABLED !== 'true') {
    return
  }

  if (process.env.CHANNEL_SYNC_JOBS_DISABLED === 'true') {
    return
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }

  if ((globalThis as any).__channelSyncJobsStarted) {
    return
  }

  ;(globalThis as any).__channelSyncJobsStarted = true

  const context = getContext(config, PrismaModule)

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

  syncInventory()
  syncReservations()
  retryFailed()

  setInterval(syncInventory, INVENTORY_SYNC_INTERVAL_MS)
  setInterval(syncReservations, RESERVATION_SYNC_INTERVAL_MS)
  setInterval(retryFailed, RETRY_INTERVAL_MS)
}
