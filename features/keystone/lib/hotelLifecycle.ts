import { createHash } from 'node:crypto';

export const HOTEL_PROPERTY_KEY = 'the-alder-house';

function requirePrismaResult<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function hashLifecycleRequest(request: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(request)))
    .digest('hex');
}

export type LifecycleIdentity = {
  request: unknown;
  aggregateType: string;
  aggregateId: string;
  action: string;
};

export function assertLifecycleReplayMatches(existing: any, identity: LifecycleIdentity) {
  if (
    existing.requestHash !== hashLifecycleRequest(identity.request) ||
    existing.aggregateType !== identity.aggregateType ||
    existing.aggregateId !== identity.aggregateId ||
    existing.action !== identity.action
  ) {
    throw new Error('Lifecycle idempotency key was reused with different evidence.');
  }
}

export async function lockHotelLifecycle(prisma: any, idempotencyKey: string) {
  await prisma.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    `hotel-lifecycle:${idempotencyKey}`
  );
}

export async function findHotelLifecycleReplay(
  prisma: any,
  eventKey: string,
  identity: LifecycleIdentity
) {
  const existing = await prisma.hotelAuditEvent.findUnique({ where: { eventKey } });
  if (!existing) return null;
  assertLifecycleReplayMatches(existing, identity);
  return existing;
}

export async function recordHotelLifecycleEvent({
  prisma,
  eventKey,
  actorId,
  identity,
  beforeSnapshot,
  afterSnapshot,
  metadata = {},
}: {
  prisma: any;
  eventKey: string;
  actorId?: string | null;
  identity: LifecycleIdentity;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const requestHash = hashLifecycleRequest(identity.request);
  const occurredAt = new Date();
  const audit = requirePrismaResult(await prisma.hotelAuditEvent.create({
    data: {
      eventKey,
      requestHash,
      propertyKey: HOTEL_PROPERTY_KEY,
      aggregateType: identity.aggregateType,
      aggregateId: identity.aggregateId,
      action: identity.action,
      actorId: actorId || null,
      beforeSnapshot: stableValue(beforeSnapshot) ?? null,
      afterSnapshot: stableValue(afterSnapshot) ?? null,
      metadataSnapshot: stableValue(metadata),
      occurredAt,
    },
    select: { id: true },
  }));
  requirePrismaResult(await prisma.hotelOutboxEvent.create({
    data: {
      eventKey,
      topic: `hotel.${identity.aggregateType}.${identity.action}`,
      aggregateType: identity.aggregateType,
      aggregateId: identity.aggregateId,
      requestHash,
      propertyKey: HOTEL_PROPERTY_KEY,
      payloadSnapshot: {
        auditEventId: audit.id,
        actorId: actorId || null,
        before: stableValue(beforeSnapshot) ?? null,
        after: stableValue(afterSnapshot) ?? null,
        metadata: stableValue(metadata),
        occurredAt: occurredAt.toISOString(),
      },
      status: 'pending',
      attempts: 0,
      availableAt: occurredAt,
    },
  }));
  return audit;
}
