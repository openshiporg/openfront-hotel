import { handleDashboardRoutes, getAuthenticatedUser } from '@/features/dashboard/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { freshInstallRedirectPath } from '@/features/dashboard/lib/freshInstall';

export async function proxy(request: NextRequest) {
  // GraphQL parsing, reset authority, and abuse limits run in pages/api/graphql,
  // where JSON and multipart requests share the same parsed operation boundary.
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
     * API routes stay matched for route-specific authorization. Exclude only:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.svg (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.svg).*)',
  ],
};
