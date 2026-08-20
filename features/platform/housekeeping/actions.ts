'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, requireActionData } from '@/features/platform/lib/actionResult';
import {
  GET_HOUSEKEEPING_DATA,
  REPORT_ROOM_MAINTENANCE_ISSUE,
  UPDATE_HOUSEKEEPING_TASK,
} from './queries';

export async function getHousekeepingWorkspace() {
  const response = await keystoneClient<any>(GET_HOUSEKEEPING_DATA);
  return requireActionData(response).hotelHousekeepingOperations;
}

export async function updateHousekeepingTaskAction(taskId: string, status: string) {
  const response = await keystoneClient<any>(UPDATE_HOUSEKEEPING_TASK, {
    taskId: boundedId(taskId, 'Task ID'),
    status: boundedEnum(status, 'Task status', ['pending', 'in_progress', 'completed', 'inspection_needed', 'on_hold'] as const),
    assignedToId: null,
    notes: null,
    idempotencyKey: randomUUID(),
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
