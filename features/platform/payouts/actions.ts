'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
import type { ManageHotelPayoutInput } from '@/features/keystone/finance/hotelPayoutReconciliation';
export async function getPayoutWorkspace() { return requireActionData(await keystoneClient<any>('query{hotelPayoutOperations}')).hotelPayoutOperations; }
export async function payoutAction(input: ManageHotelPayoutInput) { return requireActionData(await keystoneClient<any>('mutation($input:JSON!){manageHotelPayout(input:$input)}', { input })).manageHotelPayout; }
