// Hotel outbox: adapter-less topics are closed through the claim path; readiness reads the heartbeat row. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('tsx/cjs');
const { dispatchHotelOutboxBatch, adapterlessOutboxHandler, OUTBOX_NO_ADAPTER_RESULT } = require('../features/keystone/communications/outbox.ts');
const { getWorkerReadiness } = require('../features/keystone/lib/workerProgress.ts');

// A minimal prisma that records the claim query text and applies it to an in-memory table.
function fakePrisma(rows) {
  const queries = [];
  const prisma = {
    queries,
    $queryRaw: async (sql) => {
      const text = (sql.strings || sql.sql || []).join ? sql.strings.join('?') : String(sql);
      const values = sql.values || [];
      queries.push({ text, values });
      if (/WITH candidates/.test(text)) {
        const excluded = /"topic" NOT IN/.test(text) ? values.filter((v) => typeof v === 'string' && v.startsWith('hotel.communication.')) : [];
        const claimed = rows.filter((r) => r.status === 'pending' && !excluded.includes(r.topic)).slice(0, 50);
        for (const r of claimed) { r.status = 'processing'; r.attempts += 1; r.leaseToken = 'tok'; r.leaseExpiresAt = new Date(Date.now() + 60000); }
        return claimed.map((r) => ({ ...r, maxAttempts: 5, propertyKey: 'the-alder-house' }));
      }
      return [];
    },
    hotelOutboxAttempt: { create: async () => ({}), update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    hotelOutboxEvent: {
      updateMany: async ({ where, data }) => {
        const r = rows.find((x) => x.id === where.id);
        if (!r || (where.status && r.status !== where.status)) return { count: 0 };
        Object.assign(r, data); return { count: 1 };
      },
    },
  };
  return prisma;
}
const ev = (id, topic) => ({ id, topic, status: 'pending', attempts: 0, eventKey: `k${id}`, aggregateType: 'x', aggregateId: 'a', payloadSnapshot: {}, leaseToken: '', leaseExpiresAt: null });

test('adapter-less topics are closed as delivered with a clear "nothing was sent" snapshot; communication topics are left alone', async () => {
  const rows = [ev(1, 'hotel.night_audit.completed'), ev(2, 'hotel.hotel_settings.updated'), ev(3, 'hotel.communication.booking_received')];
  const prisma = fakePrisma(rows);
  const result = await dispatchHotelOutboxBatch(prisma, { propertyKey: 'the-alder-house', workerId: 'w', limit: 50, excludeTopics: ['hotel.communication.booking_received'] }, adapterlessOutboxHandler);
  assert.equal(result.delivered, 2);
  assert.equal(rows[0].status, 'delivered'); assert.equal(rows[1].status, 'delivered');
  assert.deepEqual(rows[0].dispatchResultSnapshot, { ...OUTBOX_NO_ADAPTER_RESULT });
  assert.match(rows[0].dispatchResultSnapshot.reason, /nothing was sent/);
  assert.equal(rows[2].status, 'pending');
});

test('a second pass finds nothing to close (idempotent)', async () => {
  const rows = [ev(1, 'hotel.night_audit.completed')];
  const prisma = fakePrisma(rows);
  const opts = { propertyKey: 'the-alder-house', workerId: 'w', excludeTopics: ['hotel.communication.booking_received'] };
  await dispatchHotelOutboxBatch(prisma, opts, adapterlessOutboxHandler);
  const again = await dispatchHotelOutboxBatch(prisma, opts, adapterlessOutboxHandler);
  assert.equal(again.delivered, 0);
});

test('the adapter-less sweep only runs when no HTTP receiver is configured (source contract)', () => {
  const src = fs.readFileSync(require('node:path').join(__dirname, '../features/keystone/jobs/hotelOutboxJobs.ts'), 'utf8');
  assert.match(src, /if \(!httpHandler\) \{\s*await dispatchHotelOutboxBatch\([\s\S]*excludeTopics: HOTEL_COMMUNICATION_TOPICS[\s\S]*adapterlessOutboxHandler/);
});

test('readiness loads the heartbeat row, so a running worker is reported as running', () => {
  const src = fs.readFileSync(require('node:path').join(__dirname, '../features/keystone/queries/hotelReadiness.ts'), 'utf8');
  assert.match(src, /'progress:outbox', 'heartbeat:outbox'/);
  const now = new Date();
  const rows = ['progress:holds', 'progress:refunds', 'progress:outbox', 'heartbeat:outbox'].map((leaseKey) => ({ leaseKey, heartbeatAt: now }));
  const ready = getWorkerReadiness(rows, true, now);
  assert.equal(ready.communicationsWorkerRunning, true);
  assert.equal(ready.communications, true);
  const withoutHeartbeat = getWorkerReadiness(rows.filter((r) => r.leaseKey !== 'heartbeat:outbox'), true, now);
  assert.equal(withoutHeartbeat.communicationsWorkerRunning, false);
});
