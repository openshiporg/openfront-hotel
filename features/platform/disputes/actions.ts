'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
export async function getDisputesWorkspace() { return requireActionData(await keystoneClient<any>('query{hotelDisputeOperations}')).hotelDisputeOperations; }
export async function recordDisputeEvidence(input: { id: string; note: string; idempotencyKey: string }) { return requireActionData(await keystoneClient<any>('mutation($input:JSON!){annotateHotelDispute(input:$input)}', { input })).annotateHotelDispute; }
