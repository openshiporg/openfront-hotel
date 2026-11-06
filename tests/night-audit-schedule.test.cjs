// Automatic night audit: which business date is due, and the cycle closes it with a date-bound key. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { dueNightAuditDate } = require('../features/keystone/jobs/hotelNightAuditJobs.ts');

const NY = 'America/New_York';
const day = value => new Date(`${value}T00:00:00.000Z`);

test('nothing is due while the business date is the property calendar date', () => {
  assert.equal(dueNightAuditDate(day('2026-11-05'), new Date('2026-11-05T20:00:00Z'), NY), null);
});

test('yesterday waits until 3am property time, then is due', () => {
  // 01:30 New York on Nov 6 (EST, UTC-5) is 06:30Z.
  assert.equal(dueNightAuditDate(day('2026-11-05'), new Date('2026-11-06T06:30:00Z'), NY), null);
  // 03:05 New York on Nov 6 is 08:05Z.
  assert.equal(dueNightAuditDate(day('2026-11-05'), new Date('2026-11-06T08:05:00Z'), NY)?.toISOString(), '2026-11-05T00:00:00.000Z');
});

test('a property several days behind catches up oldest first, at any hour', () => {
  assert.equal(dueNightAuditDate(day('2026-11-02'), new Date('2026-11-05T05:00:00Z'), NY)?.toISOString(), '2026-11-02T00:00:00.000Z');
});

test('uses the property zone, not UTC: Nov 6 00:30Z is still Nov 5 evening in New York', () => {
  assert.equal(dueNightAuditDate(day('2026-11-05'), new Date('2026-11-06T00:30:00Z'), NY), null);
});
