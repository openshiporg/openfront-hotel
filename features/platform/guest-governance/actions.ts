'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';

export async function searchGovernanceGuests(search: string) {
  const response = await keystoneClient<any>('query($search:String!){ hotelGovernanceGuestSearch(search:$search) }', { search });
  return JSON.parse(requireActionData(response).hotelGovernanceGuestSearch);
}
export async function loadGuestGovernance(guestId: string) {
  const response = await keystoneClient<any>('query($id:ID!){ hotelGuestGovernance(guestId:$id) }', { id: guestId });
  return JSON.parse(requireActionData(response).hotelGuestGovernance);
}
export async function applyGuestGovernance(guestId: string, command: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const response = await keystoneClient<any>('mutation($id:ID!,$command:String!,$payload:String!,$key:String!){ updateHotelGuestGovernance(guestId:$id,command:$command,payload:$payload,idempotencyKey:$key) }', { id: guestId, command, payload: JSON.stringify(payload), key: idempotencyKey });
  return JSON.parse(requireActionData(response).updateHotelGuestGovernance);
}
export async function loadHotelApprovals(offset = 0) {
  const response = await keystoneClient<any>('query($offset:Int) { hotelApprovalWorkspace(offset:$offset) }', { offset });
  return JSON.parse(requireActionData(response).hotelApprovalWorkspace);
}
export async function applyHotelApproval(payload: Record<string, unknown>, idempotencyKey: string) {
  const response = await keystoneClient<any>('mutation($payload:String!,$key:String!){ updateHotelApproval(payload:$payload,idempotencyKey:$key) }', { payload: JSON.stringify(payload), key: idempotencyKey });
  return JSON.parse(requireActionData(response).updateHotelApproval);
}
