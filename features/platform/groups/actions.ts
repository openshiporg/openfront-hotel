'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
export async function getGroupWorkspace(after?: string) {
  const result = await keystoneClient<any>('query($after:ID){hotelGroupWorkspace(after:$after)}', { after }); return JSON.parse(requireActionData(result).hotelGroupWorkspace);
}
export async function createGroupBlock(input: { name: string; arrivalDate: string; departureDate: string; releaseDate?: string; contactName: string; contactEmail: string; billingType: string; roomTypeId: string; ratePlanId?: string; roomsHeld: number; rateMinor: number; currencyCode: string; idempotencyKey: string }) {
  const result = await keystoneClient<any>('mutation($name:String!,$arrivalDate:DateTime!,$departureDate:DateTime!,$releaseDate:DateTime,$contactName:String!,$contactEmail:String!,$billingType:String!,$roomTypeId:ID!,$ratePlanId:ID,$roomsHeld:Int!,$rateMinor:Int!,$currencyCode:String!,$idempotencyKey:String!){createHotelGroupBlock(name:$name,arrivalDate:$arrivalDate,departureDate:$departureDate,releaseDate:$releaseDate,contactName:$contactName,contactEmail:$contactEmail,billingType:$billingType,roomTypeId:$roomTypeId,ratePlanId:$ratePlanId,roomsHeld:$roomsHeld,rateMinor:$rateMinor,currencyCode:$currencyCode,idempotencyKey:$idempotencyKey){id blockCode}}', input); return requireActionData(result).createHotelGroupBlock;
}
export async function updateGroupStatus(groupBlockId: string, status: string, idempotencyKey: string) {
  const result = await keystoneClient<any>('mutation($groupBlockId:ID!,$status:String!,$idempotencyKey:String!){updateHotelGroupBlockStatus(groupBlockId:$groupBlockId,status:$status,idempotencyKey:$idempotencyKey){id status}}', { groupBlockId, status, idempotencyKey }); return requireActionData(result).updateHotelGroupBlockStatus;
}
export async function createGroupRoomingList(groupBlockId: string, allocationId: string, rows: unknown[], idempotencyKey: string) {
  const result = await keystoneClient<any>('mutation($groupBlockId:ID!,$allocationId:ID!,$rows:String!,$idempotencyKey:String!){createHotelGroupRoomingList(groupBlockId:$groupBlockId,allocationId:$allocationId,rows:$rows,idempotencyKey:$idempotencyKey)}', { groupBlockId, allocationId, rows: JSON.stringify(rows), idempotencyKey }); return JSON.parse(requireActionData(result).createHotelGroupRoomingList);
}
export async function closeGroupMasterFolio(groupBlockId: string, idempotencyKey: string) {
  const result = await keystoneClient<any>('mutation($groupBlockId:ID!,$idempotencyKey:String!){closeHotelGroupMasterFolio(groupBlockId:$groupBlockId,idempotencyKey:$idempotencyKey)}', { groupBlockId, idempotencyKey }); return JSON.parse(requireActionData(result).closeHotelGroupMasterFolio);
}
export async function detachGroupBooking(input: { bookingId: string; checkInDate: string; checkOutDate: string; roomTypeId: string; ratePlanId: string; reason: string; idempotencyKey: string }) {
  const result = await keystoneClient<any>('mutation($bookingId:ID!,$checkInDate:DateTime!,$checkOutDate:DateTime!,$roomTypeId:ID!,$ratePlanId:ID!,$reason:String!,$idempotencyKey:String!){detachHotelGroupBooking(bookingId:$bookingId,checkInDate:$checkInDate,checkOutDate:$checkOutDate,roomTypeId:$roomTypeId,ratePlanId:$ratePlanId,reason:$reason,idempotencyKey:$idempotencyKey)}', input); return JSON.parse(requireActionData(result).detachHotelGroupBooking);
}
