import { createHmac } from 'node:crypto';

/** Use an explicit secret override or derive a domain-separated reset token from the validated session secret. */
export function hotelResetActionSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = String(env.RESET_ACTION_SECRET || '').trim();
  if (configured) return configured;
  const sessionSecret = String(env.SESSION_SECRET || (env.NODE_ENV === 'production' ? '' : 'local-development-session-secret-change-me'));
  if (!sessionSecret) return '';
  return createHmac('sha256', sessionSecret).update('hotel-password-reset-action:v1').digest('hex');
}
