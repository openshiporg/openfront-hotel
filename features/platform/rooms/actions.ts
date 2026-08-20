'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, boundedText, requireActionData } from '@/features/platform/lib/actionResult';

const ROOMS_WORKSPACE = String.raw`
  query GetRoomsDashboard {
    hotelRoomOperations(propertyKey: "the-alder-house") {
      rooms {
        id roomNumber floor status notes lastCleaned roomType { id name }
        activeTask { id taskType status priority }
      }
    }
  }
`;
const UPDATE_ROOM = String.raw`
  mutation($roomId:ID!,$status:String!,$notes:String,$key:String!){
    updateRoomOperationalStatus(roomId:$roomId,status:$status,notes:$notes,idempotencyKey:$key){
      id status notes lastCleaned
    }
  }
`;

export async function getRoomsWorkspace() {
  const response = await keystoneClient<any>(ROOMS_WORKSPACE);
  return requireActionData(response).hotelRoomOperations?.rooms || [];
}

export async function updateRoomStatusAction(roomId: string, status: string, notes: string) {
  const response = await keystoneClient<any>(UPDATE_ROOM, {
    roomId: boundedId(roomId, 'Room ID'),
    status: boundedEnum(status, 'Room status', ['vacant', 'cleaning', 'maintenance', 'out_of_order'] as const),
    notes: boundedText(notes, 'Notes', 1000),
    key: randomUUID(),
  });
  return requireActionData(response).updateRoomOperationalStatus;
}
