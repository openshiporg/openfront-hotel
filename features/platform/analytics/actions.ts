'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedDateRange, requireActionData } from '@/features/platform/lib/actionResult';
import { GET_ANALYTICS_DATA } from './queries';

export async function getOperationalReport(start: string, end: string) {
  const range = boundedDateRange(start, end, 370);
  const response = await keystoneClient<any>(GET_ANALYTICS_DATA, range);
  return requireActionData(response).hotelAnalyticsOperations;
}
