export const GET_HOUSEKEEPING_DATA = String.raw`
  query GetHousekeepingData {
    hotelHousekeepingOperations(propertyKey: "the-alder-house") {
      rooms { id roomNumber floor status roomType { id name } }
      tasks {
        id status taskType priority notes startedAt completedAt updatedAt
        room { id roomNumber floor status }
        assignedTo { id name }
      }
      assignees { id name }
      metrics { completedToday averageCleanMinutes }
    }
  }
`;

export const UPDATE_HOUSEKEEPING_TASK = String.raw`
  mutation UpdateHousekeepingTask(
    $taskId: ID!
    $status: String!
    $assignedToId: ID
    $notes: String
    $idempotencyKey: String!, $expectedStatus: String, $expectedUpdatedAt: DateTime
  ) {
    updateHousekeepingTaskStatus(
      taskId: $taskId
      status: $status
      assignedToId: $assignedToId
      notes: $notes
      idempotencyKey: $idempotencyKey, expectedStatus: $expectedStatus, expectedUpdatedAt: $expectedUpdatedAt
    ) {
      id
      status
    }
  }
`;

export const REPORT_ROOM_MAINTENANCE_ISSUE = String.raw`
  mutation ReportRoomMaintenanceIssue(
    $roomId: ID!
    $title: String!
    $description: String
    $category: String
    $priority: String
    $idempotencyKey: String!
  ) {
    reportRoomMaintenanceIssue(
      roomId: $roomId
      title: $title
      description: $description
      category: $category
      priority: $priority
      idempotencyKey: $idempotencyKey
    ) {
      id
      title
      status
      priority
      room {
        id
        roomNumber
      }
    }
  }
`;
