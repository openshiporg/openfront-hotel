/** Only a local dashboard path can survive an authentication redirect. */
export function safeDashboardReturnPath(value: unknown) {
  if (typeof value !== 'string' || /[\\\u0000-\u001f\u007f]/.test(value)) return '/dashboard';
  try {
    const target = new URL(value, 'https://hotel.invalid');
    if (target.origin !== 'https://hotel.invalid' || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
    if (target.pathname !== '/dashboard' && !target.pathname.startsWith('/dashboard/')) return '/dashboard';
    if (/^\/dashboard\/(?:signin|reset|no-access)(?:\/|$)/.test(target.pathname)) return '/dashboard';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return '/dashboard'; }
}
