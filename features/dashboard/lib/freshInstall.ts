export function freshInstallRedirectPath(pathname: string, redirectToInit: boolean) {
  if (!redirectToInit || pathname.startsWith('/dashboard/init')) return null;
  return '/dashboard/init';
}
