import { handleDashboardRoutes, getAuthenticatedUser } from '@/features/dashboard/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { enforceAbuseLimit } from '@/features/keystone/lib/abuseControl';
import { freshInstallRedirectPath } from '@/features/dashboard/lib/freshInstall';

const globalForRateLimit = globalThis as unknown as { hotelRateLimitPrisma?: PrismaClient };
const rateLimitPrisma = globalForRateLimit.hotelRateLimitPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForRateLimit.hotelRateLimitPrisma = rateLimitPrisma;

function argumentIdentity(query: string, argument: string, variables: Record<string, unknown> | undefined) {
  const variableName = query.match(new RegExp(`${argument}\\s*:\\s*\\$(\\w+)`))?.[1];
  if (variableName) return String(variables?.[variableName] || '');
  return query.match(new RegExp(`${argument}\\s*:\\s*"([^"]{0,255})"`))?.[1] || '';
}

function nestedGuestEmail(variables: Record<string, unknown> | undefined) {
  for (const value of Object.values(variables || {})) {
    if (value && typeof value === 'object' && 'guestEmail' in value) return String((value as any).guestEmail || '');
  }
  return '';
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/graphql' && request.method === 'POST') {
    const body = await request.clone().json().catch(() => null) as { query?: string; variables?: Record<string, unknown> } | null;
    const query = String(body?.query || '');
    const resetRequest = /sendUserPasswordResetLink/.test(query);
    const resetRedemption = /redeem(?:User|Hotel)PasswordResetToken/.test(query);
    const unsafeBuiltInRedemption = /redeemUserPasswordResetToken/.test(query) && !/redeemHotelPasswordResetToken/.test(query);
    const rules = [
      { pattern: /authenticateUserWithPassword/, scope: 'auth-login', identity: argumentIdentity(query, 'email', body?.variables), limit: 8, windowMs: 15 * 60_000 },
      { pattern: /sendUserPasswordResetLink/, scope: 'auth-reset-request', identity: argumentIdentity(query, 'email', body?.variables), limit: 5, windowMs: 60 * 60_000 },
      { pattern: /redeem(?:User|Hotel)PasswordResetToken/, scope: 'auth-reset-redeem', identity: argumentIdentity(query, 'email', body?.variables), limit: 8, windowMs: 15 * 60_000 },
      { pattern: /verifyGuestBooking/, scope: 'guest-booking-verify-http', identity: argumentIdentity(query, 'confirmationNumber', body?.variables), limit: 10, windowMs: 15 * 60_000 },
      { pattern: /createStorefrontBooking/, scope: 'booking-create-http', identity: nestedGuestEmail(body?.variables), limit: 8, windowMs: 60 * 60_000 },
    ];
    const rule = rules.find(item => item.pattern.test(query));
    if (rule) {
      try {
        const abuseContext = {
          prisma: rateLimitPrisma,
          req: { headers: Object.fromEntries(request.headers.entries()), socket: { remoteAddress: 'unknown' } },
        };
        await enforceAbuseLimit(abuseContext, rule);
        if (resetRequest || resetRedemption) {
          await enforceAbuseLimit(abuseContext, {
            scope: resetRequest ? 'auth-reset-request-account' : 'auth-reset-redeem-account',
            identity: argumentIdentity(query, 'email', body?.variables), limit: resetRequest ? 10 : 12,
            windowMs: resetRequest ? 60 * 60_000 : 15 * 60_000, includeNetwork: false,
          });
        }
      } catch {
        return NextResponse.json({ errors: [{ message: 'Too many requests. Please wait and try again.' }] }, { status: 429 });
      }
    }
    if (unsafeBuiltInRedemption) {
      return NextResponse.json({ errors: [{ message: 'This password reset operation is unavailable.' }] }, { status: 400 });
    }
    if (resetRequest) {
      const supplied = request.headers.get('x-hotel-reset-action') || '';
      const expected = process.env.RESET_ACTION_SECRET || '';
      if (!expected || supplied !== expected) {
        return NextResponse.json({ data: { sendUserPasswordResetLink: true } }, { status: 200 });
      }
    }
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  // Get authenticated user once
  const { user, redirectToInit } = await getAuthenticatedUser(request);

  // Fresh installs should not expose the storefront until the initial admin exists.
  // Match canonical Openfront: any non-init route redirects to dashboard init.
  const initRedirect = freshInstallRedirectPath(request.nextUrl.pathname, redirectToInit);
  if (initRedirect) return NextResponse.redirect(new URL(initRedirect, request.url));

  // Let dashboard handler manage its routes
  const dashboardResponse = await handleDashboardRoutes(request, user, redirectToInit);
  if (dashboardResponse) return dashboardResponse;

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * API routes stay matched so GraphQL abuse controls run above. Exclude only:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.svg (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.svg).*)',
  ],
};
