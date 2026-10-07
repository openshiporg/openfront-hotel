'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, requireActionData } from '@/features/platform/lib/actionResult';

const CHANNEL_WORKSPACE = String.raw`
  query GetChannelsDashboard {
    hotelChannelOperations(propertyKey: "the-alder-house") {
      channels {
        id name channelType isActive syncInventory syncRates commission syncStatus lastSyncAt
        syncErrorCount latestSyncError latestSyncErrorAt
      }
      reservations {
        id externalId guestName checkInDate checkOutDate channelStatus totalAmount commission
        channel { id name }
        reservation { id confirmationNumber status }
        roomType { id name }
      }
      events {
        id action status message errorMessage attempts nextAttemptAt occurredAt
        channel { id name }
      }
    }
  }
`;

const PUSH_INVENTORY = String.raw`
  mutation PushInventoryToChannel($channelId: ID!, $dateRange: ChannelSyncDateRangeInput) {
    pushInventoryToChannel(channelId: $channelId, dateRange: $dateRange) {
      channelId status syncedAt message processedCount failedCount
    }
  }
`;

const PULL_RESERVATIONS = String.raw`
  mutation PullReservationsFromChannel($channelId: ID!) {
    pullReservationsFromChannel(channelId: $channelId) {
      channelId status syncedAt message processedCount failedCount
    }
  }
`;

const RETRY_FAILED = String.raw`
  mutation RetryFailedChannelSyncs {
    retryFailedChannelSyncs { processed succeeded failed retriedAt }
  }
`;

export async function getChannelWorkspace() {
  const response = await keystoneClient<any>(CHANNEL_WORKSPACE);
  return requireActionData(response).hotelChannelOperations;
}

export async function retryFailedChannelSyncsAction() {
  const response = await keystoneClient<any>(RETRY_FAILED);
  return requireActionData(response).retryFailedChannelSyncs;
}

export async function runChannelSyncAction(channelId: string, requestedMode: 'push' | 'pull') {
  const id = boundedId(channelId, 'Channel ID');
  const mode = boundedEnum(requestedMode, 'Sync mode', ['push', 'pull'] as const);
  if (mode === 'pull') {
    const response = await keystoneClient<any>(PULL_RESERVATIONS, { channelId: id });
    return requireActionData(response).pullReservationsFromChannel;
  }
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 86_400_000);
  const response = await keystoneClient<any>(PUSH_INVENTORY, {
    channelId: id,
    dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
  });
  return requireActionData(response).pushInventoryToChannel;
}

export async function saveChannelDraftAction(input: Record<string, unknown>) {
  const response = await keystoneClient<any>(`mutation($input:JSON!){saveHotelChannelDraft(input:$input)}`, { input });
  return requireActionData(response).saveHotelChannelDraft;
}
