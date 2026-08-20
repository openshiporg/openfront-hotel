import { permissions } from '../access'
import { retryFailedChannelSyncs } from '../lib/channelSync'

export default async function retryFailedChannelSyncsMutation(
  root: unknown,
  args: Record<string, never>,
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error('Not authorized to retry channel syncs')
  }

  return retryFailedChannelSyncs(context)
}
