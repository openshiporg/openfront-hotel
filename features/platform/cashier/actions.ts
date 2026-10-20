'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData, toActionResult } from '@/features/platform/lib/actionResult';
import type { ManageHotelCashierInput } from '@/features/keystone/cashier/commands';
export async function getCashierWorkspace() {
  return requireActionData(await keystoneClient<any>('query{hotelCashierOperations}')).hotelCashierOperations;
}
export async function cashierAction(input: ManageHotelCashierInput) {
  return toActionResult(async () => {
    return requireActionData(await keystoneClient<any>('mutation($input:JSON!){manageHotelCashier(input:$input)}', { input })).manageHotelCashier;
  });
}
export async function getFolioReceipt(folioId: string) {
  return requireActionData(await keystoneClient<any>('query($folioId:ID!){hotelFolioReceipt(folioId:$folioId)}', { folioId })).hotelFolioReceipt;
}
