'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
import type { ManageHotelReceivableInput } from '@/features/keystone/receivables/contracts';
export async function getReceivablesWorkspace(afterAccountId?: string | null, afterInvoiceId?: string | null) {
  const response = await keystoneClient<any>(
    'query($afterAccountId:ID,$afterInvoiceId:ID,$pageSize:Int){hotelReceivableOperationsPage(afterAccountId:$afterAccountId,afterInvoiceId:$afterInvoiceId,pageSize:$pageSize)}',
    { afterAccountId: afterAccountId || null, afterInvoiceId: afterInvoiceId || null, pageSize: 50 },
  );
  return requireActionData(response).hotelReceivableOperationsPage;
}
export async function receivableAction(input: ManageHotelReceivableInput) { return requireActionData(await keystoneClient<any>('mutation($input:JSON!){manageHotelReceivable(input:$input)}', { input })).manageHotelReceivable; }

export async function getPayerWindows(folioId: string, bookingId?: string) { return requireActionData(await keystoneClient<any>('query($folioId:ID!,$bookingId:ID){hotelPayerWindows(folioId:$folioId,bookingId:$bookingId)}', { folioId, bookingId: bookingId || null })).hotelPayerWindows; }
