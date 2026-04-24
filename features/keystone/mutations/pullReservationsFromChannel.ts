import { permissions } from '../access'
import { pullReservationsFromChannel } from '../lib/channelSync'

type PullReservationsInput = {
  channelId: string
}

export default async function pullReservationsFromChannelMutation(
  root: unknown,
  { channelId }: PullReservationsInput,
  context: any
) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error('Not authorized to sync channel reservations')
  }

  return pullReservationsFromChannel(context, channelId)
}
