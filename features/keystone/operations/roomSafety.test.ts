import assert from 'node:assert/strict';
import test from 'node:test';
import { preserveRoomOccupancy, roomConditionAfterMaintenanceClosed } from './roomSafety';

test('closing a repair keeps the room in maintenance while another repair is active', () => {
  assert.equal(roomConditionAfterMaintenanceClosed(['in_progress'], 0), 'maintenance');
});
test('closing a repair that is only waiting on verification sends the room to cleaning', () => {
  assert.equal(roomConditionAfterMaintenanceClosed(['completed'], 0), 'cleaning');
  assert.equal(roomConditionAfterMaintenanceClosed([], 2), 'cleaning');
});
test('closing the last repair with no open work frees the room', () => {
  assert.equal(roomConditionAfterMaintenanceClosed([], 0), 'vacant');
});
test('an occupied or out-of-order room is never released', () => {
  assert.equal(preserveRoomOccupancy('out_of_order', 'vacant', 0), 'out_of_order');
  assert.equal(preserveRoomOccupancy('maintenance', 'vacant', 1), 'occupied');
});
