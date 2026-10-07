'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
export async function loadDerivedRateWorkspace() { const response = await keystoneClient<any>('query{hotelDerivedRateWorkspace}'); return JSON.parse(requireActionData(response).hotelDerivedRateWorkspace); }
export async function saveDerivedRate(payload: Record<string, unknown>, approvalId: string, key: string) {
  const response = await keystoneClient<any>('mutation($payload:String!,$approvalId:ID,$key:String!){updateHotelDerivedRate(payload:$payload,approvalId:$approvalId,idempotencyKey:$key)}', { payload: JSON.stringify(payload), approvalId: approvalId || null, key }); return JSON.parse(requireActionData(response).updateHotelDerivedRate);
}
