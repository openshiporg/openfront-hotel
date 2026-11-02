import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isSignedIn } from '../access';
import { encryptSensitiveText, decryptSensitiveText } from './sensitiveData';
import { enforceAbuseLimit } from './abuseControl';
import { runSerializableTransaction } from './serializableTransaction';
import { HOTEL_PROPERTY_KEY, hashLifecycleRequest } from './hotelLifecycle';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeMfaSecret(bytes: Buffer) {
  let bits = 0; let value = 0; let result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += BASE32[(value << (5 - bits)) & 31]; return result;
}
function decodeSecret(secret: string) {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid authenticator secret.');
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const character of secret) { value = (value << 5) | BASE32.indexOf(character); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
export function hotelTotp(secret: string, counter: number) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid authenticator counter.');
  const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', decodeSecret(secret)).update(input).digest(); const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
export function verifyHotelTotp(secret: string, code: string, lastCounter: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter a six-digit authenticator code.');
  const current = Math.floor(now / 30_000);
  for (const counter of [current, current - 1, current + 1]) if (counter >= 0 && counter > lastCounter && timingSafeEqual(Buffer.from(hotelTotp(secret, counter)), Buffer.from(code))) return counter;
  throw new Error('Authenticator code is invalid, expired or already used.');
}
export function hashHotelRecoveryCode(userId: string, code: string) { return createHash('sha256').update(`${userId}:${code.trim().toUpperCase()}`).digest('hex'); }
export function consumeHotelRecoveryCode(userId: string, hashes: unknown, code: string) {
  const values = Array.isArray(hashes) ? hashes.filter(value => typeof value === 'string') : [];
  const hash = hashHotelRecoveryCode(userId, code);
  const index = values.findIndex(value => value.length === hash.length && timingSafeEqual(Buffer.from(value), Buffer.from(hash)));
  if (index < 0) throw new Error('Recovery code is invalid or already used.');
  return values.filter((_, position) => position !== index);
}

const trustedStarts = new WeakMap<object, number>();
let readPending: ((context: any) => Promise<any>) | undefined;
function attestStart(user: any) { const data = { listKey: 'User', itemId: user.id }; trustedStarts.set(data, Number(user.authVersion)); return data; }
/** Pending cookies never become context.session, including beneath Keystone's sudo session-data wrapper. */
export function createHotelMfaSessionStrategy(base: any, loadCurrent: (context: any, session: any, initial?: boolean) => Promise<any>) {
  async function pending(context: any) {
    const raw = await base.get({ context }); const current = await loadCurrent(context, raw);
    if (!current?.data?.mfaEnabled || raw?.mfaVerified || !raw?.mfaNonce || raw.mfaExpiresAt <= Date.now()) return undefined;
    const consumed = await context.prisma.hotelAuditEvent.findUnique({ where: { eventKey: `mfa-challenge:${raw.mfaNonce}` } });
    return consumed ? undefined : current;
  }
  readPending = pending;
  return {
    get: async ({ context }: any) => {
      const raw = await base.get({ context }); const current = await loadCurrent(context, raw);
      if (!current || (current.data.mfaEnabled && raw.mfaVerified !== true)) return undefined;
      return current;
    },
    start: async ({ context, data }: any) => {
      const current = await loadCurrent(context, data, true);
      if (!current) throw new Error('Authentication is not permitted for this account.');
      const verifiedVersion = trustedStarts.get(data); trustedStarts.delete(data);
      if (verifiedVersion !== undefined && verifiedVersion !== Number(current.data.authVersion)) throw new Error('Account credentials changed during verification. Sign in again.');
      const verified = verifiedVersion !== undefined;
      return base.start({ context, data: { ...current, mfaVerified: verified, mfaNonce: randomBytes(24).toString('hex'), mfaExpiresAt: Date.now() + 5 * 60_000 } });
    },
    end: (args: any) => base.end(args),
  };
}

async function mfaAudit(prisma: any, userId: string, action: string, eventKey = `mfa:${randomBytes(24).toString('hex')}`) {
  await prisma.hotelAuditEvent.create({ data: { eventKey, requestHash: hashLifecycleRequest({ userId, action }), propertyKey: HOTEL_PROPERTY_KEY, actorId: userId, aggregateType: 'staff_mfa', aggregateId: userId, action, afterSnapshot: { action }, beforeSnapshot: null, metadataSnapshot: {}, occurredAt: new Date() } });
}
async function mfaLimit(context: any, userId: string) { await enforceAbuseLimit(context, { scope: 'staff-mfa-account', identity: userId, limit: 8, windowMs: 15 * 60_000, includeNetwork: false }); }
async function mfaLock(prisma: any, id: string) { await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `staff-mfa:${id}`); }
async function currentPassword(context: any, user: any, password: string) {
  const field = context.graphql.schema.getType('User')?.getFields()?.password?.extensions?.keystoneSecretField;
  if (!field?.compare || typeof password !== 'string' || password.length > 1_000 || !(await field.compare(password, user.password))) throw new Error('Current password is required.');
}

export function createHotelMfaResolvers(codec = { encrypt: encryptSensitiveText, decrypt: decryptSensitiveText }) {
  async function hotelMfaStatus(_root: unknown, _args: unknown, context: any) {
    if (isSignedIn({ session: context.session })) {
      const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId } });
      return JSON.stringify({ authenticated: true, enabled: Boolean(user?.mfaEnabled), recoveryCodesRemaining: Array.isArray(user?.mfaRecoveryHashes) ? user.mfaRecoveryHashes.length : 0 });
    }
    return JSON.stringify({ authenticated: false, challengeRequired: Boolean(readPending && await readPending(context)) });
  }
  async function verifyHotelMfa(_root: unknown, { code, recovery = false }: { code: string; recovery?: boolean }, context: any) {
    const challenge = readPending && await readPending(context); if (!challenge) throw new Error('Sign in again to start a valid MFA challenge.');
    await mfaLimit(context, challenge.itemId);
    const user = await runSerializableTransaction(context, async (tx: any) => {
      const p = tx.prisma; await mfaLock(p, challenge.itemId);
      const user = await p.user.findUnique({ where: { id: challenge.itemId } });
      if (!user?.isActive || !user.mfaEnabled || Number(user.authVersion) !== Number(challenge.data.authVersion) || challenge.mfaExpiresAt <= Date.now()) throw new Error('MFA challenge is no longer valid.');
      if (await p.hotelAuditEvent.findUnique({ where: { eventKey: `mfa-challenge:${challenge.mfaNonce}` } })) throw new Error('MFA challenge was already used. Sign in again.');
      const data = recovery ? { mfaRecoveryHashes: consumeHotelRecoveryCode(user.id, user.mfaRecoveryHashes, code) } : { mfaLastCounter: verifyHotelTotp(codec.decrypt(user.mfaSecret), code, user.mfaLastCounter) };
      await p.user.update({ where: { id: user.id }, data });
      await mfaAudit(p, user.id, recovery ? 'recovery_verified' : 'totp_verified', `mfa-challenge:${challenge.mfaNonce}`); return user;
    });
    const sessionToken = await context.sessionStrategy.start({ context, data: attestStart(user) });
    return JSON.stringify({ sessionToken });
  }
  async function manageHotelMfa(_root: unknown, { action, password, code = '', recovery = false }: { action: string; password: string; code?: string; recovery?: boolean }, context: any) {
    if (!isSignedIn({ session: context.session })) throw new Error('Full authentication is required to manage MFA.');
    const id = context.session.itemId; await mfaLimit(context, id);
    return runSerializableTransaction(context, async (tx: any) => {
      const p = tx.prisma; await mfaLock(p, id); const user = await p.user.findUnique({ where: { id } });
      if (!user?.isActive || Number(user.authVersion) !== Number(context.session.data.authVersion)) throw new Error('Account session changed. Sign in again.');
      await currentPassword(context, user, password);
      if (action === 'enroll') {
        if (user.mfaEnabled) throw new Error('MFA is already enabled; use the governed disable action before changing authenticators.');
        const secret = encodeMfaSecret(randomBytes(20));
        await p.user.update({ where: { id }, data: { mfaPendingSecret: codec.encrypt(secret), mfaPendingExpiresAt: new Date(Date.now() + 10 * 60_000) } });
        await mfaAudit(p, id, 'enrollment_started');
        return JSON.stringify({ secret, provisioningUri: `otpauth://totp/${encodeURIComponent(`Hotel:${user.email}`)}?secret=${secret}&issuer=Hotel&algorithm=SHA1&digits=6&period=30`, message: 'Store this secret in an authenticator and confirm a code within ten minutes.' });
      }
      let factorData: any = {};
      if (action === 'confirm') {
        if (user.mfaEnabled || !user.mfaPendingSecret || !user.mfaPendingExpiresAt || new Date(user.mfaPendingExpiresAt).getTime() <= Date.now()) throw new Error('Enrollment expired. Start enrollment again.');
        factorData = { mfaLastCounter: verifyHotelTotp(codec.decrypt(user.mfaPendingSecret), code, -1), mfaSecret: user.mfaPendingSecret, mfaEnabled: true };
      } else {
        if (!user.mfaEnabled || !['disable', 'rotate_recovery'].includes(action)) throw new Error('Choose a valid action for an enabled authenticator.');
        factorData = recovery ? { mfaRecoveryHashes: consumeHotelRecoveryCode(id, user.mfaRecoveryHashes, code) } : { mfaLastCounter: verifyHotelTotp(codec.decrypt(user.mfaSecret), code, user.mfaLastCounter) };
      }
      const codes = action === 'disable' ? [] : Array.from({ length: 10 }, () => randomBytes(16).toString('hex').toUpperCase());
      await p.user.update({ where: { id }, data: {
        ...factorData, authVersion: Number(user.authVersion) + 1, mfaPendingSecret: '', mfaPendingExpiresAt: null,
        mfaRecoveryHashes: codes.map(code => hashHotelRecoveryCode(id, code)),
        ...(action === 'disable' ? { mfaEnabled: false, mfaSecret: '', mfaLastCounter: -1 } : {}),
      } });
      await mfaAudit(p, id, action === 'confirm' ? 'enabled' : action);
      return JSON.stringify({ recoveryCodes: codes, signedOut: true, message: 'Credential settings changed. Save recovery codes privately, then sign in again. Authenticator codes are single-use; wait for the next code if you just confirmed enrollment.' });
    });
  }
  return { Query: { hotelMfaStatus }, Mutation: { verifyHotelMfa, manageHotelMfa } };
}
export const hotelMfaResolvers = createHotelMfaResolvers();
export const hotelMfaTypeDefs = String.raw`
  extend type Query { hotelMfaStatus: String! }
  extend type Mutation { verifyHotelMfa(code:String!, recovery:Boolean):String!, manageHotelMfa(action:String!, password:String!, code:String, recovery:Boolean):String! }
`;
