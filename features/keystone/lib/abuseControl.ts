import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

function normalizeIp(value: string) {
  const ip = value.trim().replace(/^::ffff:/, '');
  return /^[a-f0-9:.]{2,64}$/i.test(ip) ? ip : 'unknown';
}

export function requestNetworkIdentity(context: any) {
  const req = context?.req;
  const trustMode = String(process.env.TRUST_PROXY || 'off').toLowerCase();
  const railwayRequestId = String(req?.headers?.['x-railway-request-id'] || '');
  const railwayBoundary = trustMode === 'railway' && Boolean(process.env.RAILWAY_ENVIRONMENT) && /^[a-zA-Z0-9_-]{8,128}$/.test(railwayRequestId);
  if (railwayBoundary) {
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0];
    if (forwarded) return normalizeIp(forwarded);
  }
  return normalizeIp(String(req?.socket?.remoteAddress || 'unknown'));
}

export async function enforceAbuseLimit(
  context: any,
  options: { scope: string; identity?: string; limit: number; windowMs: number; includeNetwork?: boolean },
) {
  const now = new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / options.windowMs) * options.windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + options.windowMs * 2);
  const network = options.includeNetwork === false ? 'global' : requestNetworkIdentity(context);
  const identity = `${network}:${String(options.identity || '').trim().toLowerCase().slice(0, 200)}`;
  const digest = createHash('sha256').update(`${options.scope}:${identity}:${windowStartedAt.toISOString()}`).digest('hex');
  const rows = await context.prisma.$queryRaw(Prisma.sql`
    INSERT INTO "HotelAbuseBucket" ("id", "bucketKey", "count", "windowStartedAt", "expiresAt")
    VALUES (${`abuse_${digest.slice(0, 24)}`}, ${digest}, 1, ${windowStartedAt}, ${expiresAt})
    ON CONFLICT ("bucketKey") DO UPDATE SET "count" = "HotelAbuseBucket"."count" + 1
    RETURNING "count"
  `) as Array<{ count: number }>;
  const count = Number(rows[0]?.count || 0);
  if (count > options.limit) {
    const error = new Error('Too many requests. Please wait and try again.');
    (error as any).rateLimitEvidence = { scope: options.scope, count, limit: options.limit };
    throw error;
  }
}
