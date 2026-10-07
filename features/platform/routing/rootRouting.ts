export const DASHBOARD_ROOT = '/dashboard';

export function getFreshInstallRootRedirect(pathname: string, redirectToInit: boolean) {
  return redirectToInit && pathname === '/' ? DASHBOARD_ROOT : null;
}
