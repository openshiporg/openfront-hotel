import { gql } from 'graphql-request';

export const GET_HOUSEKEEPING_DATA = gql`
  query GetHousekeepingData {
    rooms(orderBy: { roomNumber: asc }) {
      id
      roomNumber
      floor
      status
      roomType {
        id
        name
      }
    }
    housekeepingTasks(
      where: { 
        OR: [
          { status: { equals: "pending" } },
          { status: { equals: "in_progress" } },
          { status: { equals: "on_hold" } },
          { status: { equals: "inspection_needed" } }
        ]
      }
      orderBy: { priority: asc }
    ) {
      id
      status
      taskType
      priority
      notes
      startedAt
      completedAt
      room {
        id
        roomNumber
        floor
        status
      }
      assignedTo {
        id
        name
      }
    }
    users(where: { role: { name: { equals: "Housekeeping" } } }) {
      id
      name
    }
  }
`;

export const UPDATE_HOUSEKEEPING_TASK = gql`
  mutation UpdateHousekeepingTask($id: ID!, $data: HousekeepingTaskUpdateInput!) {
    updateHousekeepingTask(where: { id: $id }, data: $data) {
      id
      status
    }
  }
`;

export const UPDATE_ROOM_STATUS = gql`
  mutation UpdateRoomStatus($id: ID!, $status: String!) {
    updateRoom(where: { id: $id }, data: { status: $status }) {
      id
      status
    }
  }
`;
