'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, boundedText, requireActionData, toActionResult } from '@/features/platform/lib/actionResult';

const ROOMS_WORKSPACE = String.raw`
  query GetRoomsDashboard($search: String, $status: String, $sort: String, $take: Int, $skip: Int) {
    hotelRoomOperations(propertyKey: "the-alder-house", search: $search, status: $status, sort: $sort, take: $take, skip: $skip) {
      total
      statusCounts { all vacant occupied cleaning maintenance out_of_order }
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

const ROOM_PAGE_SIZE = 100;
export type RoomListView = { search: string; status: string; sort: string; page: number; pageSize?: number };
export type RoomStatusCounts = { all: number; vacant: number; occupied: number; cleaning: number; maintenance: number; out_of_order: number };
export type RoomListPage = { rooms: any[]; total: number; pageSize: number; statusCounts: RoomStatusCounts };

/** One page of rooms for the given search, status and sort, with totals per status. */
export async function getRoomsWorkspace(view: RoomListView): Promise<RoomListPage> {
  const page = Math.max(1, Math.trunc(view.page) || 1);
  const pageSize = Math.min(Math.max(Math.trunc(Number(view.pageSize)) || ROOM_PAGE_SIZE, 1), 250);
  const search = view.search ? boundedText(view.search, 'Search', 120) : null;
  const response = await keystoneClient<any>(ROOMS_WORKSPACE, {
    search: search || null,
    status: ['vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order', 'out_of_service'].includes(view.status) ? view.status : null,
    sort: ['floor', 'status'].includes(view.sort) ? view.sort : null,
    take: pageSize,
    skip: (page - 1) * pageSize,
  });
  const operations = requireActionData(response).hotelRoomOperations;
  return {
    rooms: operations?.rooms || [],
    total: operations?.total || 0,
    pageSize,
    statusCounts: operations?.statusCounts || { all: 0, vacant: 0, occupied: 0, cleaning: 0, maintenance: 0, out_of_order: 0 },
  };
}

export async function updateRoomStatusAction(roomId: string, status: string, notes: string) {
  return toActionResult(async () => {
    const response = await keystoneClient<any>(UPDATE_ROOM, {
      roomId: boundedId(roomId, 'Room ID'),
      status: boundedEnum(status, 'Room status', ['vacant', 'cleaning', 'maintenance', 'out_of_order'] as const),
      notes: boundedText(notes, 'Notes', 1000),
      key: randomUUID(),
    });
    return requireActionData(response).updateRoomOperationalStatus;
  });
}
