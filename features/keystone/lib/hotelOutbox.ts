import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from './hotelLifecycle';

export const OUTBOX_DEFAULT_MAX_ATTEMPTS = 5;
export const OUTBOX_DEFAULT_LEASE_MS = 60_000;
export const OUTBOX_DEFAULT_BATCH_SIZE = 25;

export type HotelOutboxEventRecord = {
  id: string;
  eventKey: string;
  propertyKey: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payloadSnapshot: unknown;
  status: string;
  attempts: number;
  maxAttempts: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
};

export type OutboxDispatchResult = {
  delivered: number;
  retried: number;
  deadLettered: number;
  skipped: number;
};

export type OutboxHandler = (event: HotelOutboxEventRecord) => Promise<unknown>;

export type HotelOutboxEnvelope = {
  eventKey: string;
  propertyKey: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
};

export type HotelOutboxReceiptAck = {
  accepted: true;
  receiptId: string;
  eventKey: string;
  propertyKey: string;
  bodyHash: string;
  credentialKeyId: string;
  replayed: boolean;
};

function normalizePropertyKey(value: string) {
  const propertyKey = String(value || '').trim();
  if (!propertyKey || propertyKey !== HOTEL_PROPERTY_KEY) {
    throw new Error('Unknown hotel property.');
  }
  return propertyKey;
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number) {
  const candidate = Number(value ?? fallback);
  if (!Number.isInteger(candidate)) return fallback;
  return Math.min(max, Math.max(min, candidate));
}

export function outboxBackoffMs(attemptNumber: number, baseMs = 5_000, maxMs = 15 * 60_000) {
  const attempt = boundedInt(attemptNumber, 1, 1, 30);
  const base = boundedInt(baseMs, 5_000, 100, maxMs);
  return Math.min(maxMs, base * 2 ** (attempt - 1));
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

export async function claimHotelOutboxEvents(
  prisma: any,
  options: {
    propertyKey: string;
    workerId: string;
    limit?: number;
    leaseMs?: number;
    now?: Date;
    topics?: readonly string[];
  }
): Promise<HotelOutboxEventRecord[]> {
  const propertyKey = normalizePropertyKey(options.propertyKey);
  const workerId = String(options.workerId || '').trim();
  if (!workerId || workerId.length > 200) throw new Error('A workerId is required.');
  const limit = boundedInt(options.limit, OUTBOX_DEFAULT_BATCH_SIZE, 1, 100);
  const leaseMs = boundedInt(options.leaseMs, OUTBOX_DEFAULT_LEASE_MS, 1_000, 15 * 60_000);
  const now = options.now || new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const leaseToken = `${workerId}:${randomUUID()}`;
  const topics = [...new Set((options.topics || []).map(topic => String(topic).trim()).filter(Boolean))];
  const topicFilter = topics.length
    ? Prisma.sql`AND "topic" IN (${Prisma.join(topics)})`
    : Prisma.empty;

  const claimed = await prisma.$queryRaw(Prisma.sql`
    WITH candidates AS (
      SELECT "id"
      FROM "HotelOutboxEvent"
      WHERE "propertyKey" = ${propertyKey}
        AND (
          ("status" IN ('pending', 'failed') AND "availableAt" <= ${now})
          OR ("status" = 'processing' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= ${now})
        )
        ${topicFilter}
      ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "HotelOutboxEvent" AS event
    SET "status" = 'processing',
        "attempts" = event."attempts" + 1,
        "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "lastAttemptAt" = ${now},
        "updatedAt" = ${now}
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event."id", event."eventKey", event."propertyKey", event."topic",
      event."aggregateType", event."aggregateId", event."payloadSnapshot", event."status",
      event."attempts", event."maxAttempts", event."leaseToken", event."leaseExpiresAt"
  `);

  for (const event of claimed) {
    await prisma.hotelOutboxAttempt.create({
      data: {
        outboxId: event.id,
        propertyKey,
        attemptNumber: event.attempts,
        workerId,
        status: 'failed',
        errorMessage: 'Dispatch started; completion not yet recorded.',
        startedAt: now,
      },
    });
  }
  return claimed;
}

async function finishAttempt(prisma: any, eventId: string, attemptNumber: number, data: Record<string, unknown>) {
  await prisma.hotelOutboxAttempt.update({
    where: { outboxId_attemptNumber: { outboxId: eventId, attemptNumber } },
    data,
  });
}

async function markDelivered(prisma: any, event: HotelOutboxEventRecord, response: unknown, now: Date) {
  const updated = await prisma.hotelOutboxEvent.updateMany({
    where: { id: event.id, propertyKey: event.propertyKey, status: 'processing', leaseToken: event.leaseToken },
    data: {
      status: 'delivered',
      deliveredAt: now,
      leaseToken: '',
      leaseExpiresAt: null,
      lastError: '',
      dispatchResultSnapshot: response ?? {},
      updatedAt: now,
    },
  });
  if (updated.count !== 1) throw new Error('Outbox lease was lost before delivery could be recorded.');
  await finishAttempt(prisma, event.id, event.attempts, {
    status: 'succeeded',
    errorMessage: '',
    responseSnapshot: response ?? {},
    finishedAt: now,
  });
}

async function markFailed(prisma: any, event: HotelOutboxEventRecord, error: unknown, now: Date) {
  const deadLettered = event.attempts >= event.maxAttempts;
  const availableAt = new Date(now.getTime() + outboxBackoffMs(event.attempts));
  const message = errorMessage(error);
  const updated = await prisma.hotelOutboxEvent.updateMany({
    where: { id: event.id, propertyKey: event.propertyKey, status: 'processing', leaseToken: event.leaseToken },
    data: {
      status: deadLettered ? 'dead_letter' : 'failed',
      availableAt,
      deadLetteredAt: deadLettered ? now : null,
      lastError: message,
      leaseToken: '',
      leaseExpiresAt: null,
      updatedAt: now,
    },
  });
  if (updated.count !== 1) throw new Error('Outbox lease was lost before failure could be recorded.');
  await finishAttempt(prisma, event.id, event.attempts, {
    status: 'failed',
    errorMessage: message,
    finishedAt: now,
  });
  return deadLettered;
}

export async function dispatchHotelOutboxBatch(
  prisma: any,
  options: {
    propertyKey: string;
    workerId: string;
    limit?: number;
    leaseMs?: number;
    now?: Date;
    topics?: readonly string[];
  },
  handler: OutboxHandler,
): Promise<OutboxDispatchResult> {
  const events = await claimHotelOutboxEvents(prisma, options);
  const result: OutboxDispatchResult = { delivered: 0, retried: 0, deadLettered: 0, skipped: 0 };
  for (const event of events) {
    try {
      const response = await handler(event);
      await markDelivered(prisma, event, response, new Date());
      result.delivered += 1;
    } catch (error) {
      const deadLettered = await markFailed(prisma, event, error, new Date());
      if (deadLettered) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

export async function replayHotelDeadLetter(
  prisma: any,
  options: { propertyKey: string; eventId: string; idempotencyKey: string },
) {
  const propertyKey = normalizePropertyKey(options.propertyKey);
  const idempotencyKey = String(options.idempotencyKey || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('A stable replay idempotency key is required.');

  const source = await prisma.hotelOutboxEvent.findUnique({ where: { id: options.eventId } });
  if (!source || source.propertyKey !== propertyKey) throw new Error('Outbox event not found for this property.');
  if (source.status !== 'dead_letter') throw new Error('Only dead-letter events can be replayed.');

  const eventKey = `hotel-outbox:replay:${idempotencyKey}`;
  const request = { sourceEventKey: source.eventKey, eventId: source.id, idempotencyKey };
  const requestHash = hashLifecycleRequest(request);
  const existing = await prisma.hotelOutboxEvent.findUnique({ where: { eventKey } });
  if (existing) {
    if (existing.requestHash !== requestHash || existing.propertyKey !== propertyKey) {
      throw new Error('Outbox replay key is already bound to different evidence.');
    }
    return { event: existing, replayed: true };
  }

  const replay = await prisma.hotelOutboxEvent.create({
    data: {
      eventKey,
      requestHash,
      propertyKey,
      topic: source.topic,
      aggregateType: source.aggregateType,
      aggregateId: source.aggregateId,
      payloadSnapshot: source.payloadSnapshot,
      status: 'pending',
      attempts: 0,
      maxAttempts: source.maxAttempts,
      availableAt: new Date(),
      replayedFromEventKey: source.eventKey,
      dispatchResultSnapshot: {},
    },
  });
  return { event: replay, replayed: false };
}

function outboxBodyHash(body: string) {
  return createHash('sha256').update(body).digest('hex');
}

export function signHotelOutboxBody(body: string, credentialKeyId: string, sentAt: string, secret: string) {
  return createHmac('sha256', secret).update(`${sentAt}.${credentialKeyId}.${body}`).digest('hex');
}

function constantTimeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function persistAuthenticatedHotelOutboxReceipt(
  prisma: any,
  options: {
    body: string;
    eventKeyHeader: string;
    credentialKeyId: string;
    sentAt: string;
    signature: string;
    expectedCredentialKeyId: string;
    secret: string;
    now?: Date;
    maxClockSkewMs?: number;
  },
): Promise<HotelOutboxReceiptAck> {
  const now = options.now || new Date();
  const maxClockSkewMs = boundedInt(options.maxClockSkewMs, 5 * 60_000, 1_000, 15 * 60_000);
  const sentAtMs = Date.parse(options.sentAt);
  if (
    !options.secret ||
    !options.expectedCredentialKeyId ||
    options.credentialKeyId !== options.expectedCredentialKeyId ||
    !Number.isFinite(sentAtMs) ||
    Math.abs(now.getTime() - sentAtMs) > maxClockSkewMs
  ) {
    throw new Error('Outbox receiver authentication failed.');
  }
  const expectedSignature = signHotelOutboxBody(
    options.body,
    options.credentialKeyId,
    options.sentAt,
    options.secret,
  );
  if (!constantTimeHexEqual(options.signature, expectedSignature)) {
    throw new Error('Outbox receiver authentication failed.');
  }

  let envelope: HotelOutboxEnvelope;
  try {
    envelope = JSON.parse(options.body) as HotelOutboxEnvelope;
  } catch {
    throw new Error('Outbox payload is invalid.');
  }
  const propertyKey = normalizePropertyKey(envelope.propertyKey);
  if (
    !envelope.eventKey || envelope.eventKey !== options.eventKeyHeader ||
    !envelope.topic || !envelope.aggregateType || !envelope.aggregateId
  ) {
    throw new Error('Outbox payload identity is invalid.');
  }
  const bodyHash = outboxBodyHash(options.body);

  return prisma.$transaction(async (transaction: any) => {
    await transaction.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-outbox-receipt:${envelope.eventKey}`,
    );
    const existing = await transaction.hotelOutboxReceipt.findUnique({ where: { eventKey: envelope.eventKey } });
    if (existing) {
      if (
        existing.propertyKey !== propertyKey || existing.topic !== envelope.topic ||
        existing.aggregateType !== envelope.aggregateType || existing.aggregateId !== envelope.aggregateId ||
        existing.credentialKeyId !== options.credentialKeyId || existing.bodyHash !== bodyHash
      ) {
        throw new Error('Outbox event key is already bound to different receiver evidence.');
      }
      return {
        accepted: true as const,
        receiptId: existing.id,
        eventKey: existing.eventKey,
        propertyKey: existing.propertyKey,
        bodyHash: existing.bodyHash,
        credentialKeyId: existing.credentialKeyId,
        replayed: true,
      };
    }
    const receipt = await transaction.hotelOutboxReceipt.create({
      data: {
        eventKey: envelope.eventKey,
        propertyKey,
        topic: envelope.topic,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        credentialKeyId: options.credentialKeyId,
        bodyHash,
        payloadSnapshot: envelope.payload ?? {},
        receivedAt: now,
      },
    });
    return {
      accepted: true as const,
      receiptId: receipt.id,
      eventKey: receipt.eventKey,
      propertyKey: receipt.propertyKey,
      bodyHash: receipt.bodyHash,
      credentialKeyId: receipt.credentialKeyId,
      replayed: false,
    };
  }, { maxWait: 5_000, timeout: 15_000, isolationLevel: 'Serializable' });
}

export function createHttpOutboxHandler(options: {
  url: string;
  secret: string;
  credentialKeyId: string;
  timeoutMs?: number;
}): OutboxHandler {
  const url = String(options.url || '').trim();
  const secret = String(options.secret || '');
  const credentialKeyId = String(options.credentialKeyId || '').trim();
  if (!url || !secret || !credentialKeyId) {
    throw new Error('Outbox HTTP dispatch requires a URL, secret, and credential key id.');
  }
  const timeoutMs = boundedInt(options.timeoutMs, 15_000, 1_000, 60_000);
  return async event => {
    const body = JSON.stringify({
      eventKey: event.eventKey,
      propertyKey: event.propertyKey,
      topic: event.topic,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payloadSnapshot,
    });
    const sentAt = new Date().toISOString();
    const bodyHash = outboxBodyHash(body);
    const signature = signHotelOutboxBody(body, credentialKeyId, sentAt, secret);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-openfront-outbox-event-key': event.eventKey,
        'x-openfront-outbox-credential-key-id': credentialKeyId,
        'x-openfront-outbox-sent-at': sentAt,
        'x-openfront-outbox-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Outbox receiver returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Outbox receiver did not return a JSON receipt.');
    const ack = await response.json() as Partial<HotelOutboxReceiptAck>;
    if (
      ack.accepted !== true || !ack.receiptId || ack.eventKey !== event.eventKey ||
      ack.propertyKey !== event.propertyKey || ack.bodyHash !== bodyHash ||
      ack.credentialKeyId !== credentialKeyId
    ) {
      throw new Error('Outbox receiver acknowledgement did not match the dispatched evidence.');
    }
    return ack;
  };
}
