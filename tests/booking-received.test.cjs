// Hotel "request received" communication: queued once, deduped on its event key, copy states the hold. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { queueBookingCommunication, HOTEL_COMMUNICATION_TOPICS } = require('../features/keystone/communications/commands.ts');

const HOLD = new Date('2026-11-02T20:30:00.000Z');
function prisma(over = {}) {
  const events = new Map();
  return {
    events,
    booking: { findUnique: async () => ({
      id: 'b1', guestEmail: 'delivered@resend.dev', guestName: 'QA Test', confirmationNumber: 'BK-ABC123',
      checkInDate: new Date('2026-12-01T00:00:00Z'), checkOutDate: new Date('2026-12-03T00:00:00Z'), numberOfGuests: 2,
      totalAmountMinor: 50000, currencyCode: 'usd', holdExpiresAt: HOLD, pricingSnapshot: { propertyTimeZone: 'America/Chicago' },
      ratePlan: null, roomAssignments: [{ roomType: { name: 'King' } }], lineItems: [], ...over,
    }) },
    hotelSettings: { findUnique: async () => ({ propertyName: 'The Alder House', contactEmail: 'stay@alder.test' }) },
    hotelOutboxEvent: {
      findUnique: async ({ where }) => events.get(where.eventKey) || null,
      create: async ({ data }) => { const row = { id: `e${events.size}`, ...data }; events.set(data.eventKey, row); return row; },
    },
  };
}

test('booking_received is a registered communication topic', () => {
  assert.ok(HOTEL_COMMUNICATION_TOPICS.includes('hotel.communication.booking_received'));
});

test('queues one pending received event carrying the hold expiry and zone', async () => {
  const db = prisma();
  const { event, replayed } = await queueBookingCommunication(db, { bookingId: 'b1', kind: 'booking_received', eventKey: 'booking:b1:received:v1' });
  assert.equal(replayed, false);
  assert.equal(event.topic, 'hotel.communication.booking_received');
  assert.equal(event.status, 'pending');
  assert.equal(event.eventKey, 'hotel-communication:booking_received:booking:b1:received:v1');
  assert.equal(event.payloadSnapshot.to, 'delivered@resend.dev');
  assert.equal(event.payloadSnapshot.holdExpiresAt, HOLD.toISOString());
  assert.equal(event.payloadSnapshot.propertyTimeZone, 'America/Chicago');
});

test('replay (same event key) does not queue a second email', async () => {
  const db = prisma();
  await queueBookingCommunication(db, { bookingId: 'b1', kind: 'booking_received', eventKey: 'booking:b1:received:v1' });
  const again = await queueBookingCommunication(db, { bookingId: 'b1', kind: 'booking_received', eventKey: 'booking:b1:received:v1' });
  assert.equal(again.replayed, true);
  assert.equal(db.events.size, 1);
});

test('email copy says request/hold received, not confirmed until paid, with the hold time and the existing lookup link', async () => {
  const sent = [];
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async (m) => { sent.push(m); return { accepted: [m.to], rejected: [], messageId: '<id@test>', response: '250 Accepted\r\n abc-resend-id ' }; } }), getTestMessageUrl: () => '' };
    return origLoad.call(this, request, ...rest);
  };
  Object.assign(process.env, { SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'stay@alder.test', NEXT_PUBLIC_SITE_URL: 'https://hotel.test', NODE_ENV: 'test' });
  const { sendHotelCommunicationEmail } = require('../features/keystone/lib/mail.ts');
  const db = prisma();
  const { event } = await queueBookingCommunication(db, { bookingId: 'b1', kind: 'booking_received', eventKey: 'booking:b1:received:v1' });
  const result = await sendHotelCommunicationEmail(event.payloadSnapshot);
  Module._load = origLoad;
  assert.equal(result.messageId, '<id@test>');
  assert.equal(result.providerResponse, '250 Accepted  abc-resend-id');
  assert.match(sent[0].subject, /Reservation request received/);
  assert.match(sent[0].html, /not confirmed until payment is complete/);
  assert.match(sent[0].html, /BK-ABC123/);
  assert.match(sent[0].html, /2:30 PM CST|2:30 PM/);
  assert.match(sent[0].html, /\/bookings\/lookup\?confirmation=BK-ABC123/);
  assert.doesNotMatch(sent[0].html, /has been confirmed/);
});

test('a provider that returns no response line leaves the delivery result without providerResponse', async () => {
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async (m) => ({ accepted: [m.to], rejected: [], messageId: '<id@test>' }) }), getTestMessageUrl: () => '' };
    return origLoad.call(this, request, ...rest);
  };
  Object.assign(process.env, { SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'stay@alder.test', NEXT_PUBLIC_SITE_URL: 'https://hotel.test', NODE_ENV: 'test' });
  delete require.cache[require.resolve('../features/keystone/lib/mail.ts')];
  const { sendHotelCommunicationEmail } = require('../features/keystone/lib/mail.ts');
  const { event } = await queueBookingCommunication(prisma(), { bookingId: 'b1', kind: 'booking_received', eventKey: 'booking:b1:received:v2' });
  const result = await sendHotelCommunicationEmail(event.payloadSnapshot);
  Module._load = origLoad;
  assert.equal(result.messageId, '<id@test>');
  assert.equal('providerResponse' in result, false);
});
