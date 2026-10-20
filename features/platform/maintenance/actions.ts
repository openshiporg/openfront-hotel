'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { safeActionMessage } from '@/features/platform/lib/safeGraphQLError';
import { boundedEnum, boundedId, boundedText, requireActionData } from '@/features/platform/lib/actionResult';

const MAINTENANCE_WORKSPACE = String.raw`
  query GetMaintenanceDashboard($search: String, $status: String, $priority: String, $sort: String, $take: Int, $skip: Int) {
    hotelMaintenanceOperations(propertyKey: "the-alder-house", search: $search, status: $status, priority: $priority, sort: $sort, take: $take, skip: $skip) {
      total statusCounts
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

/** One page of maintenance requests; search, filters and priority order apply to every request. */
export async function getMaintenanceWorkspace(view: { search?: string; status?: string; priority?: string; sort?: string; skip?: number } = {}) {
  const response = await keystoneClient<any>(MAINTENANCE_WORKSPACE, {
    search: view.search ? String(view.search).trim().slice(0, 160) : null,
    status: view.status && view.status !== 'all' ? String(view.status).slice(0, 40) : null,
    priority: view.priority && view.priority !== 'all' ? String(view.priority).slice(0, 20) : null,
    sort: view.sort === 'recent' ? 'recent' : 'priority',
    take: 50,
    skip: Math.min(Math.max(Math.trunc(Number(view.skip) || 0), 0), 100_000),
  });
  const operations = requireActionData(response).hotelMaintenanceOperations;
  return { requests: operations?.requests || [], total: operations?.total || 0, statusCounts: operations?.statusCounts || {} };
}

export async function updateMaintenanceStatusAction(requestId: string, status: string, notes: string) {
  try {
    const response = await keystoneClient<any>(UPDATE_STATUS, {
      requestId: boundedId(requestId, 'Maintenance request ID'),
      status: boundedEnum(status, 'Maintenance status', ['reported', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'] as const),
      notes: boundedText(notes, 'Notes', 1000),
      key: randomUUID(),
    });
    return { ok: true as const, data: requireActionData(response).updateMaintenanceRequestStatus };
  } catch (error) {
    return {
      ok: false as const,
      message: safeActionMessage(error, 'The request was not updated. Refresh and complete any linked room inspection before retrying.'),
    };
  }
}
