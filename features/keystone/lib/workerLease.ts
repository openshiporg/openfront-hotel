import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

/** A distinct owner for each scheduled invocation, not a PID shared by overlapping ticks. */
export function createWorkerLeaseOwnerId(worker: string) {
  const prefix = String(worker || '').trim();
  if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(prefix)) throw new Error('Worker lease identity is invalid.');
  return `${prefix}:${randomUUID()}`;
}

/** Prevent setInterval from starting a second effect while this process is still running the first. */
export type NonOverlappingTick = (() => Promise<boolean>) & { drain: () => Promise<void> };

export function createNonOverlappingTick(task: () => Promise<void>): NonOverlappingTick {
  let inFlight: Promise<void> | null = null;
  const run = (async () => {
    if (inFlight) return false;
    const current = Promise.resolve().then(task);
    inFlight = current;
    try { await current; return true; }
    finally { if (inFlight === current) inFlight = null; }
  }) as NonOverlappingTick;
  run.drain = async () => {
    const current = inFlight;
    if (current) await current.catch(() => undefined);
  };
  return run;
}

/**
 * Atomically acquire or renew a lease using the database clock. An active owner
 * may renew; a different owner may take over only after expiry. An expired
 * owner cannot resurrect its old claim, which fences stale work.
 */
export async function acquireWorkerLease(prisma: any, options: { leaseKey: string; ownerId: string; ttlMs: number }) {
  if (!options.leaseKey || options.leaseKey.length > 160 || !options.ownerId || options.ownerId.length > 200 || !Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1_000 || options.ttlMs > 30 * 60_000) {
    throw new Error('Worker lease request is invalid.');
  }
  const rows = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO "HotelWorkerLease" ("id", "leaseKey", "ownerId", "expiresAt", "heartbeatAt")
    VALUES (${`lease_${options.leaseKey}`}, ${options.leaseKey}, ${options.ownerId},
      CURRENT_TIMESTAMP + (${options.ttlMs} * INTERVAL '1 millisecond'), CURRENT_TIMESTAMP)
    ON CONFLICT ("leaseKey") DO UPDATE SET
      "ownerId" = EXCLUDED."ownerId", "expiresAt" = EXCLUDED."expiresAt", "heartbeatAt" = CURRENT_TIMESTAMP
    WHERE ("HotelWorkerLease"."ownerId" = ${options.ownerId} AND "HotelWorkerLease"."expiresAt" > CURRENT_TIMESTAMP)
       OR ("HotelWorkerLease"."ownerId" <> ${options.ownerId} AND "HotelWorkerLease"."expiresAt" <= CURRENT_TIMESTAMP)
    RETURNING "ownerId"
  `) as Array<{ ownerId: string }>;
  return rows[0]?.ownerId === options.ownerId;
}

/** Release only this invocation's claim; stale owners cannot release a successor's lease. */
export async function releaseWorkerLease(prisma: any, options: { leaseKey: string; ownerId: string }) {
  if (!options.leaseKey || options.leaseKey.length > 160 || !options.ownerId || options.ownerId.length > 200) {
    throw new Error('Worker lease release is invalid.');
  }
  const removed = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "HotelWorkerLease"
    WHERE "leaseKey" = ${options.leaseKey} AND "ownerId" = ${options.ownerId}
  `);
  return removed === 1;
}
