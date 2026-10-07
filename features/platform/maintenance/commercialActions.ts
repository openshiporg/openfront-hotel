'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';

export async function loadMaintenanceCommercial(requestId: string) {
  const response = await keystoneClient<any>('query($id:ID!){hotelMaintenanceCommercial(requestId:$id)}', { id: requestId }); return JSON.parse(requireActionData(response).hotelMaintenanceCommercial);
}
export async function saveMaintenanceCommercial(requestId: string, command: string, payload: Record<string, unknown>, key: string) {
  const response = await keystoneClient<any>('mutation($id:ID!,$command:String!,$payload:String!,$key:String!){updateHotelMaintenanceCommercial(requestId:$id,command:$command,payload:$payload,idempotencyKey:$key)}', { id: requestId, command, payload: JSON.stringify(payload), key }); return JSON.parse(requireActionData(response).updateHotelMaintenanceCommercial);
}
