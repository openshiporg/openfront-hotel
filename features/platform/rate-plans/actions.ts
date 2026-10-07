'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  boundedDateRange,
  boundedEnum,
  boundedId,
  boundedInteger,
  boundedIsoDate,
  boundedText,
  requireActionData,
} from '@/features/platform/lib/actionResult';

const RATE_WORKSPACE = String.raw`
  query GetRatePlanDashboard($start: DateTime!, $end: DateTime!) {
    hotelRateOperations(propertyKey: "the-alder-house", start: $start, end: $end) {
      roomTypes { id name totalRooms sellableRooms }
      inventories {
        id date totalRooms bookedRooms blockedRooms availableRooms isAvailable
        roomType { id name }
      }
      ratePlans {
        id name description baseRate minimumStay maximumStay cancellationPolicy mealPlan
        status isPublic isPromotional promoCode priority validFrom validTo
        roomType { id name baseRate }
      }
    }
  }
`;
const UPDATE_INVENTORY = String.raw`
  mutation($roomTypeId:ID!,$date:DateTime!,$totalRooms:Int,$bookedRooms:Int,$blockedRooms:Int,$key:String!){
    updateRoomInventoryControls(roomTypeId:$roomTypeId,date:$date,totalRooms:$totalRooms,bookedRooms:$bookedRooms,blockedRooms:$blockedRooms,idempotencyKey:$key){
      id date totalRooms bookedRooms blockedRooms availableRooms isAvailable roomType { id name }
    }
  }
`;
const UPDATE_RATE = String.raw`
  mutation($ratePlanId:ID!,$status:String,$isPublic:Boolean,$key:String!,$approvalId:ID){
    updateRatePlanPublication(ratePlanId:$ratePlanId,status:$status,isPublic:$isPublic,idempotencyKey:$key,approvalId:$approvalId){id status isPublic}
  }
`;

export async function getRatePlanWorkspace(start: string, end: string) {
  const range = boundedDateRange(start, end, 90);
  const response = await keystoneClient<any>(RATE_WORKSPACE, range);
  return requireActionData(response).hotelRateOperations;
}

export async function updateRoomInventoryAction(input: {
  roomTypeId: string; date: string; totalRooms?: number; bookedRooms?: number; blockedRooms?: number;
}) {
  const variables = {
    roomTypeId: boundedId(input.roomTypeId, 'Room type ID'),
    date: boundedIsoDate(input.date, 'Inventory date'),
    totalRooms: input.totalRooms === undefined ? null : boundedInteger(input.totalRooms, 'Total rooms', { min: 0, max: 10_000 }),
    bookedRooms: input.bookedRooms === undefined ? null : boundedInteger(input.bookedRooms, 'Booked rooms', { min: 0, max: 10_000 }),
    blockedRooms: input.blockedRooms === undefined ? null : boundedInteger(input.blockedRooms, 'Blocked rooms', { min: 0, max: 10_000 }),
    key: randomUUID(),
  };
  const response = await keystoneClient<any>(UPDATE_INVENTORY, variables);
  return requireActionData(response).updateRoomInventoryControls;
}

export async function updateRatePlanPublicationAction(input: {
  idempotencyKey: string; approvalId?: string; ratePlanId: string; status?: string; isPublic?: boolean;
}) {
  if (input.status === undefined && input.isPublic === undefined) throw new Error('A rate-plan change is required.');
  const response = await keystoneClient<any>(UPDATE_RATE, {
    ratePlanId: boundedId(input.ratePlanId, 'Rate plan ID'),
    status: input.status === undefined ? null : boundedEnum(input.status, 'Rate-plan status', ['draft', 'active', 'inactive'] as const),
    isPublic: input.isPublic === undefined ? null : Boolean(input.isPublic),
    key: boundedText(input.idempotencyKey, 'Attempt key', 100, true),
    approvalId: input.approvalId?.trim() ? boundedId(input.approvalId, 'Approval ID') : null,
  });
  return requireActionData(response).updateRatePlanPublication;
}
