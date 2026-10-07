import { enforceAbuseLimit } from '../lib/abuseControl';

declare const require: (name: string) => any;
const bcrypt = require('bcryptjs') as { compare(value: string, hash: string): Promise<boolean>; hash(value: string, rounds: number): Promise<string> };
const dumbPasswords = require('dumb-passwords') as { check(value: string): boolean };

export function hotelResetPasswordCandidateAccepted(value: string) {
  const password = String(value || '');
  return password.length >= 10 && password.length <= 1_000 && !dumbPasswords.check(password);
}

export function hashHotelResetPassword(value: string) {
  return bcrypt.hash(value, 10);
}

const FAKE_TOKEN_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoO5s7g7C2xKj.c0k7.o9KfKQZ7ZfWl8eK';

export default async function redeemHotelPasswordResetToken(
  root: unknown,
  { email, token, password }: { email: string; token: string; password: string },
  context: any,
) {
  const identity = String(email || '').trim().toLowerCase().slice(0, 255);
  await enforceAbuseLimit(context, { scope: 'auth-reset-redeem-backend', identity, limit: 8, windowMs: 15 * 60_000 });
  await enforceAbuseLimit(context, { scope: 'auth-reset-redeem-backend-account', identity, limit: 12, windowMs: 15 * 60_000, includeNetwork: false });
  if (!hotelResetPasswordCandidateAccepted(password)) {
    return { code: 'FAILURE', message: 'Password reset could not be completed.' };
  }
  const ttlMinutes = Math.min(1_440, Math.max(1, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 10)));
  return context.transaction(async (tx: any) => {
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-password-reset:${identity}`);
    const user = await tx.prisma.user.findUnique({ where: { email: identity } });
    const matches = await bcrypt.compare(String(token || ''), user?.passwordResetToken || FAKE_TOKEN_HASH);
    if (!user || !matches) return { code: 'FAILURE', message: 'Password reset could not be completed.' };
    if (user.passwordResetRedeemedAt) return { code: 'TOKEN_REDEEMED', message: 'This password reset token has already been used.' };
    if (!user.passwordResetIssuedAt || Date.now() - user.passwordResetIssuedAt.getTime() > ttlMinutes * 60_000) {
      return { code: 'TOKEN_EXPIRED', message: 'This password reset token has expired.' };
    }
    const passwordHash = await hashHotelResetPassword(password);
    const changed = await tx.prisma.user.updateMany({
      where: { id: user.id, passwordResetRedeemedAt: null, authVersion: user.authVersion },
      data: { password: passwordHash, passwordResetRedeemedAt: new Date(), authVersion: Number(user.authVersion || 1) + 1 },
    });
    if (changed.count !== 1) return { code: 'TOKEN_REDEEMED', message: 'This password reset token has already been used.' };
    return { code: null, message: 'Password reset completed.' };
  }, { maxWait: 5_000, timeout: 15_000, isolationLevel: 'Serializable' });
}
