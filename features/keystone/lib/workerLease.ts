import { Prisma } from '@prisma/client';

export async function acquireWorkerLease(prisma: any, options: { leaseKey: string; ownerId: string; ttlMs: number }) {
  const now = new Date(); const expiresAt = new Date(now.getTime() + options.ttlMs);
  const rows = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO "HotelWorkerLease" ("id", "leaseKey", "ownerId", "expiresAt", "heartbeatAt")
    VALUES (${`lease_${options.leaseKey}`}, ${options.leaseKey}, ${options.ownerId}, ${expiresAt}, ${now})
    ON CONFLICT ("leaseKey") DO UPDATE SET
      "ownerId" = EXCLUDED."ownerId", "expiresAt" = EXCLUDED."expiresAt", "heartbeatAt" = EXCLUDED."heartbeatAt"
    WHERE "HotelWorkerLease"."expiresAt" <= ${now} OR "HotelWorkerLease"."ownerId" = ${options.ownerId}
    RETURNING "ownerId"
  `) as Array<{ ownerId: string }>;
  return rows[0]?.ownerId === options.ownerId;
}
