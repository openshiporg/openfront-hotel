'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  boundedEnum,
  boundedId,
  boundedInteger,
  boundedIsoDate,
  boundedText,
  requireActionData,
  toActionResult,
} from '@/features/platform/lib/actionResult';

const RATE_WORKSPACE = String.raw`
  query GetRatePlanDashboard($ratePlanSkip: Int) {
    hotelRateOperations(propertyKey: "the-alder-house", ratePlanSkip: $ratePlanSkip) {
      businessDate start end ratePlanTotal
      roomTypes { id name totalRooms sellableRooms }
      inventories {
        id date totalRooms bookedRooms blockedRooms availableRooms isAvailable
        roomType { id name }
      }
      availability { roomTypeId date total booked held blocked available }
      ratePlans {
        id name description baseRate minimumStay maximumStay cancellationPolicy mealPlan
        status isPublic isPromotional promoCode priority validFrom validTo
        roomType { id name baseRate }
      }
    }
  }
`;
const UPDATE_INVENTORY = String.raw`
  mutation($roomTypeId:ID!,$date:DateTime!,$blockedRoomsDelta:Int!,$key:String!){
    updateRoomInventoryControls(roomTypeId:$roomTypeId,date:$date,blockedRoomsDelta:$blockedRoomsDelta,idempotencyKey:$key){
      id date totalRooms bookedRooms blockedRooms availableRooms isAvailable roomType { id name }
    }
  }
`;
const UPDATE_RATE = String.raw`
  mutation($ratePlanId:ID!,$status:String,$isPublic:Boolean,$key:String!,$approvalId:ID){
    updateRatePlanPublication(ratePlanId:$ratePlanId,status:$status,isPublic:$isPublic,idempotencyKey:$key,approvalId:$approvalId){id status isPublic}
  }
`;

/** The week from the property's business date, with authoritative availability and one page of rate plans. */
export async function getRatePlanWorkspace(ratePlanSkip = 0) {
  const response = await keystoneClient<any>(RATE_WORKSPACE, { ratePlanSkip: boundedInteger(ratePlanSkip, 'Rate plan offset', { min: 0, max: 100_000 }) });
  return requireActionData(response).hotelRateOperations;
}

/** Block (+1) or release (−1) one room; the server applies it to the stored block and checks unsold capacity. */
export async function updateRoomInventoryAction(input: { roomTypeId: string; date: string; blockedRoomsDelta: 1 | -1; idempotencyKey: string }) {
  return toActionResult(async () => {
    const variables = {
      roomTypeId: boundedId(input.roomTypeId, 'Room type ID'),
      date: boundedIsoDate(input.date, 'Inventory date'),
      blockedRoomsDelta: input.blockedRoomsDelta === -1 ? -1 : 1,
      key: boundedText(input.idempotencyKey, 'Idempotency key', 200),
    };
    const response = await keystoneClient<any>(UPDATE_INVENTORY, variables);
    return requireActionData(response).updateRoomInventoryControls;
  });
}

export async function updateRatePlanPublicationAction(input: {
  idempotencyKey: string; approvalId?: string; ratePlanId: string; status?: string; isPublic?: boolean;
}) {
  return toActionResult(async () => {
    if (input.status === undefined && input.isPublic === undefined) throw new Error('A rate-plan change is required.');
    const response = await keystoneClient<any>(UPDATE_RATE, {
      ratePlanId: boundedId(input.ratePlanId, 'Rate plan ID'),
      status: input.status === undefined ? null : boundedEnum(input.status, 'Rate-plan status', ['draft', 'active', 'inactive'] as const),
      isPublic: input.isPublic === undefined ? null : Boolean(input.isPublic),
      key: boundedText(input.idempotencyKey, 'Attempt key', 100, true),
      approvalId: input.approvalId?.trim() ? boundedId(input.approvalId, 'Approval ID') : null,
    });
    return requireActionData(response).updateRatePlanPublication;
  });
}
