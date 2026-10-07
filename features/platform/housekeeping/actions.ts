'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, boundedText, requireActionData } from '@/features/platform/lib/actionResult';
import {
  GET_HOUSEKEEPING_DATA,
  REPORT_ROOM_MAINTENANCE_ISSUE,
  UPDATE_HOUSEKEEPING_TASK,
} from './queries';

export async function getHousekeepingWorkspace() {
  const response = await keystoneClient<any>(GET_HOUSEKEEPING_DATA);
  return requireActionData(response).hotelHousekeepingOperations;
}

export async function updateHousekeepingTaskAction(taskId: string, status: string, options?: { assignedToId?: string | null; notes?: string; idempotencyKey?: string; expectedStatus?: string; expectedUpdatedAt?: string }) {
  const response = await keystoneClient<any>(UPDATE_HOUSEKEEPING_TASK, {
    taskId: boundedId(taskId, 'Task ID'),
    status: boundedEnum(status, 'Task status', ['pending', 'in_progress', 'completed', 'inspection_needed', 'on_hold'] as const),
    assignedToId: options?.assignedToId === undefined ? undefined : options.assignedToId ? boundedId(options.assignedToId, 'Staff ID') : null,
    notes: options?.notes ? boundedText(options.notes, 'Task notes', 2000, true) : null,
    expectedStatus: options?.expectedStatus || null,
    expectedUpdatedAt: options?.expectedUpdatedAt || null,
    idempotencyKey: options?.idempotencyKey || randomUUID(),
  });
  return requireActionData(response).updateHousekeepingTaskStatus;
}

export async function reportHousekeepingMaintenanceIssue(roomId: string) {
  const response = await keystoneClient<any>(REPORT_ROOM_MAINTENANCE_ISSUE, {
    roomId: boundedId(roomId, 'Room ID'),
    title: 'Room issue reported by housekeeping',
    description: 'Housekeeping escalated this room for maintenance follow-up from the housekeeping dashboard.',
    category: 'cleaning',
    priority: 'medium',
    idempotencyKey: randomUUID(),
  });
  return requireActionData(response).reportRoomMaintenanceIssue;
}

export async function getRoomOutagesAction() {
  const response = await keystoneClient<any>('query{hotelRoomOutages}');
  return JSON.parse(requireActionData(response).hotelRoomOutages);
}
export async function updateRoomOutageAction(input: { roomId: string; outageId?: string; startDate?: string; endDate?: string; reason: string; action: 'schedule' | 'cancel'; idempotencyKey: string }) {
  const response = await keystoneClient<any>('mutation($roomId:ID!,$outageId:ID,$startDate:DateTime,$endDate:DateTime,$reason:String!,$action:String!,$idempotencyKey:String!){updateHotelRoomOutage(roomId:$roomId,outageId:$outageId,startDate:$startDate,endDate:$endDate,reason:$reason,action:$action,idempotencyKey:$idempotencyKey)}', { ...input, roomId: boundedId(input.roomId, 'Room ID'), reason: boundedText(input.reason, 'Reason', 1000, true), idempotencyKey: boundedText(input.idempotencyKey, 'Idempotency key', 200, true) });
  return JSON.parse(requireActionData(response).updateHotelRoomOutage);
}
export async function getHousekeepingStaffCapabilities() {
  const result = await keystoneClient<any>('query{hotelHousekeepingStaffCapabilities}'); return JSON.parse(requireActionData(result).hotelHousekeepingStaffCapabilities);
}
export async function updateHousekeepingStaffCapability(staffId: string, configuration: unknown, expectedRevision: number, idempotencyKey: string) {
  const result = await keystoneClient<any>('mutation($staffId:ID!,$configuration:String!,$expectedRevision:Int!,$idempotencyKey:String!){updateHotelHousekeepingStaffCapability(staffId:$staffId,configuration:$configuration,expectedRevision:$expectedRevision,idempotencyKey:$idempotencyKey)}', { staffId, configuration: JSON.stringify(configuration), expectedRevision, idempotencyKey }); return JSON.parse(requireActionData(result).updateHotelHousekeepingStaffCapability);
}
