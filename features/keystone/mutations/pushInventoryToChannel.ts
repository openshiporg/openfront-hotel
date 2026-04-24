import { permissions } from '../access'
import { pushInventoryToChannel } from '../lib/channelSync'

type PushInventoryInput = {
  channelId: string
  dateRange?: {
    startDate?: string | null
    endDate?: string | null
  } | null
}

export default async function pushInventoryToChannelMutation(
  root: unknown,
  { channelId, dateRange }: PushInventoryInput,
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to sync channel inventory')
  }

  return pushInventoryToChannel(context, channelId, dateRange || undefined)
}
