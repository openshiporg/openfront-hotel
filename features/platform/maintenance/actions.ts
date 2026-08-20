'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedEnum, boundedId, boundedText, requireActionData } from '@/features/platform/lib/actionResult';

const MAINTENANCE_WORKSPACE = String.raw`
  query GetMaintenanceDashboard {
    hotelMaintenanceOperations(propertyKey: "the-alder-house") {
      requests {
        id title category priority status notes completedAt createdAt
        room { id roomNumber status }
        assignedTo { id name }
      }
    }
  }
`;
const UPDATE_STATUS = String.raw`
  mutation($requestId:ID!,$status:String!,$notes:String,$key:String!){
    updateMaintenanceRequestStatus(requestId:$requestId,status:$status,notes:$notes,idempotencyKey:$key){
      id status completedAt notes room { id roomNumber status }
    }
  }
`;

export async function getMaintenanceWorkspace() {
  const response = await keystoneClient<any>(MAINTENANCE_WORKSPACE);
  return requireActionData(response).hotelMaintenanceOperations?.requests || [];
}

export async function updateMaintenanceStatusAction(requestId: string, status: string, notes: string) {
  const response = await keystoneClient<any>(UPDATE_STATUS, {
    requestId: boundedId(requestId, 'Maintenance request ID'),
    status: boundedEnum(status, 'Maintenance status', ['reported', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'] as const),
    notes: boundedText(notes, 'Notes', 1000),
    key: randomUUID(),
  });
  return requireActionData(response).updateMaintenanceRequestStatus;
}
