import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

function normalizeIp(value: string) {
  const ip = value.trim().replace(/^::ffff:/, '');
  return /^[a-f0-9:.]{2,64}$/i.test(ip) ? ip : 'unknown';
}

function trustedProxyIps() {
  return new Set(String(process.env.TRUSTED_PROXY_IPS || '').split(',').map(normalizeIp).filter(ip => ip !== 'unknown'));
}

/**
 * The client network for abuse limits. Forwarding headers count only when the connection
 * itself comes from a configured proxy (TRUSTED_PROXY_IPS); then the client is the right-most
 * address in X-Forwarded-For that is not one of those proxies. Any other request is bound to
 * its socket address, whatever headers it sends.
 */
export function requestNetworkIdentity(context: any) {
  const req = context?.req;
  const remote = normalizeIp(String(req?.socket?.remoteAddress || 'unknown'));
  const trusted = trustedProxyIps();
  if (!trusted.has(remote)) return remote;
  const chain = String(req?.headers?.['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const hop = normalizeIp(chain[index]);
    if (hop !== 'unknown' && !trusted.has(hop)) return hop;
  }
  return remote;
}

/** Remove counters whose window has ended, a bounded batch at a time. */
export async function pruneExpiredAbuseBuckets(prisma: any, batchSize = 1_000) {
  const deleted = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "HotelAbuseBucket"
    WHERE "id" IN (SELECT "id" FROM "HotelAbuseBucket" WHERE "expiresAt" < now() ORDER BY "expiresAt" ASC LIMIT ${batchSize})
  `);
  return Number(deleted) || 0;
}

export async function enforceAbuseLimit(
  context: any,
  options: { scope: string; identity?: string; limit: number; windowMs: number; includeNetwork?: boolean },
) {
  // Public browsing and availability reads must not consume shared network
  // buckets. Server rendering can make every visitor appear to share one IP.
  // Keep limits on credential, contact, verification and booking writes.
  if (['guest-search', 'storefront-quote', 'storefront-stay-calendar'].includes(options.scope)) return;

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
