// Hotel outbox: adapter-less topics are closed through the claim path; readiness reads the heartbeat row. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('tsx/cjs');
const { dispatchHotelOutboxBatch, adapterlessOutboxHandler, OUTBOX_NO_ADAPTER_RESULT, closeUndeliverableDeadLetters, isReservedRecipient } = require('../features/keystone/communications/outbox.ts');
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

test('adapter-less topics are closed as skipped with a clear "nothing was sent" reason; communication topics are left alone', async () => {
  const rows = [ev(1, 'hotel.night_audit.completed'), ev(2, 'hotel.hotel_settings.updated'), ev(3, 'hotel.communication.booking_received')];
  const prisma = fakePrisma(rows);
  const result = await dispatchHotelOutboxBatch(prisma, { propertyKey: 'the-alder-house', workerId: 'w', limit: 50, excludeTopics: ['hotel.communication.booking_received'] }, adapterlessOutboxHandler);
  assert.equal(result.delivered, 2);
  assert.equal(rows[0].status, 'skipped'); assert.equal(rows[1].status, 'skipped');
  assert.equal(rows[0].deliveredAt, null);
  assert.deepEqual(rows[0].dispatchResultSnapshot, { ...OUTBOX_NO_ADAPTER_RESULT });
  assert.match(rows[0].lastError, /^skipped: no delivery adapter.*nothing was sent/);
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

test('a real delivery still closes as delivered, not skipped', async () => {
  const rows = [ev(1, 'hotel.communication.booking_received')];
  const prisma = fakePrisma(rows);
  await dispatchHotelOutboxBatch(prisma, { propertyKey: 'the-alder-house', workerId: 'w', topics: ['hotel.communication.booking_received'] }, async () => ({ channel: 'smtp', messageId: '<m>' }));
  assert.equal(rows[0].status, 'delivered');
  assert.notEqual(rows[0].deliveredAt, null);
});

test('the status is allowed by the model, the DB CHECK constraint (additive migration) and the outbox screens', () => {
  const read = (p) => fs.readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
  assert.match(read('features/keystone/models/HotelOutboxEvent.ts'), /value: 'skipped'/);
  const migration = fs.readdirSync(require('node:path').join(__dirname, '../migrations')).filter((d) => /outbox_skipped_status/.test(d)).map((d) => read(`migrations/${d}/migration.sql`)).join('');
  assert.match(migration, /CHECK \("status" IN \('pending', 'processing', 'delivered', 'failed', 'dead_letter', 'skipped'\)\)/);
  assert.doesNotMatch(migration, /DELETE|UPDATE "HotelOutboxEvent"|DROP TABLE/);
  assert.match(read('features/platform/lib/status.ts'), /skipped: \{ label: 'Skipped'/);
  assert.match(read('features/platform/outbox/screens/OutboxPage.tsx'), /'skipped', 'completed'/);
});

test('reserved test-domain recipients are recognised; real ones are not', () => {
  for (const a of ['qa@example.com', 'x@EXAMPLE.org', 'a@b.test', 'a@mail.example.net', 'a@host.invalid', 'a@localhost']) assert.equal(isReservedRecipient(a), true, a);
  for (const a of ['guest@gmail.com', 'delivered@resend.dev', 'a@examples.com', 'a@myexample.com', '', undefined]) assert.equal(isReservedRecipient(a), false, String(a));
});

test('undeliverable dead letters close as skipped; a real recipient stays dead-lettered for operator replay', async () => {
  const mk = (id, to, status = 'dead_letter', topic = 'hotel.communication.booking_confirmation') => ({ id, status, topic, propertyKey: 'the-alder-house', payloadSnapshot: { to } });
  const rows = [mk(1, 'qa@example.com'), mk(2, 'guest@gmail.com'), mk(3, 'x@example.com', 'delivered'), mk(4, 'y@example.com', 'dead_letter', 'hotel.night_audit.completed')];
  const prisma = { hotelOutboxEvent: {
    findMany: async ({ where }) => rows.filter((r) => r.status === where.status && r.topic.startsWith(where.topic.startsWith)),
    updateMany: async ({ where, data }) => { const r = rows.find((x) => x.id === where.id && x.status === where.status); if (!r) return { count: 0 }; Object.assign(r, data); return { count: 1 }; },
  } };
  assert.equal(await closeUndeliverableDeadLetters(prisma, 'the-alder-house'), 1);
  assert.equal(rows[0].status, 'skipped'); assert.match(rows[0].lastError, /undeliverable recipient/);
  assert.equal(rows[1].status, 'dead_letter');
  assert.equal(rows[2].status, 'delivered'); assert.equal(rows[3].status, 'dead_letter');
  assert.equal(await closeUndeliverableDeadLetters(prisma, 'the-alder-house'), 0);
});

test('readiness accepts a fictional contact email on a Stripe TEST (demo) store and rejects it on a live store', () => {
  const { realContactEmail, stripeTestModeStore } = require('../features/keystone/queries/hotelReadiness.ts');
  assert.equal(stripeTestModeStore({ STRIPE_SECRET_KEY: 'sk_test_abc' }), true);
  assert.equal(stripeTestModeStore({ STRIPE_SECRET_KEY: 'sk_live_abc' }), false);
  assert.equal(stripeTestModeStore({}), false);
  for (const a of ['stay@thealderhouse.example', 'a@example.com', 'a@b.test']) {
    assert.equal(realContactEmail(a, true), true, `${a} on a demo store`);
    assert.equal(realContactEmail(a, false), false, `${a} on a live store`);
  }
  for (const a of ['', '   ', 'no-at-sign', undefined]) assert.equal(realContactEmail(a, true), false, `${String(a)} is never valid`);
  assert.equal(realContactEmail('front@thealderhouse.com', false), true);
});
