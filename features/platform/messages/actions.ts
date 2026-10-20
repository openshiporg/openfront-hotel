'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';

export async function getGuestMessages() {
  const response = await keystoneClient<any>('query { hotelGuestMessages }');
  return requireActionData(response).hotelGuestMessages;
}
