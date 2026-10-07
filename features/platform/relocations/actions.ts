'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
export async function getRelocation(bookingId: string) { const result = await keystoneClient<any>('query($bookingId:ID!){hotelRelocation(bookingId:$bookingId)}', { bookingId }); return JSON.parse(requireActionData(result).hotelRelocation); }
export async function updateRelocation(input: { bookingId: string; status: string; expectedRevision: number; propertyName: string; contact: string; confirmation: string; costMinor: number; guestAgreement: string; followUp: string; costEvidence: string; idempotencyKey: string }) {
  const result = await keystoneClient<any>('mutation($bookingId:ID!,$status:String!,$expectedRevision:Int!,$propertyName:String,$contact:String,$confirmation:String,$costMinor:Int,$guestAgreement:String,$followUp:String,$costEvidence:String,$idempotencyKey:String!){updateHotelRelocation(bookingId:$bookingId,status:$status,expectedRevision:$expectedRevision,propertyName:$propertyName,contact:$contact,confirmation:$confirmation,costMinor:$costMinor,guestAgreement:$guestAgreement,followUp:$followUp,costEvidence:$costEvidence,idempotencyKey:$idempotencyKey)}', input); return JSON.parse(requireActionData(result).updateHotelRelocation);
}
