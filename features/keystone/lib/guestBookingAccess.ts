import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const GUEST_ACCESS_COOKIE = 'hotel-guest-access';
const GUEST_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_GUEST_ACCESS_ENTRIES = 20;

export const BOOKING_ACCESS_DENIED_MESSAGE = 'Reservation access could not be verified.';

type GuestAccessEntry = {
  bookingId: string;
  token: string;
};

function getGuestAccessSecret() {
  const secret = process.env.GUEST_ACCESS_SECRET || process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'hotel-guest-access-development-secret');
  if (secret.length < 32) throw new Error('Guest access signing is not configured.');
  return secret;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function encodePayload(entries: GuestAccessEntry[]) {
  return Buffer.from(JSON.stringify(entries), 'utf8').toString('base64url');
}

function signPayload(payload: string) {
  return createHmac('sha256', getGuestAccessSecret()).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(cookieHeader?: string | null) {
  if (!cookieHeader) return new Map<string, string>();

  return new Map(
    cookieHeader.split(';').map((part) => {
      const [rawName, ...rawValue] = part.trim().split('=');
      return [rawName, decodeURIComponent(rawValue.join('='))];
    })
  );
}

function getCookieHeader(context: any) {
  return context.req?.headers?.cookie || context.req?.headers?.get?.('cookie') || '';
}

function getRequestHeader(context: any, name: string) {
  return context.req?.headers?.[name] || context.req?.headers?.get?.(name) || '';
}

function parseGuestAccessEntries(context: any): GuestAccessEntry[] {
  const value = parseCookies(getCookieHeader(context)).get(GUEST_ACCESS_COOKIE);
  if (!value) return [];

  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) return [];

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded)) return [];

    return decoded
      .filter(
        (entry): entry is GuestAccessEntry =>
          typeof entry?.bookingId === 'string' &&
          typeof entry?.token === 'string' &&
          entry.bookingId.length > 0 &&
          entry.token.length >= 32
      )
      .slice(-MAX_GUEST_ACCESS_ENTRIES);
  } catch {
    return [];
  }
}

function appendSetCookieHeader(context: any, cookie: string) {
  if (!context.res?.setHeader) return;

  const existing = context.res.getHeader?.('Set-Cookie');
  const existingValues = Array.isArray(existing)
    ? existing
    : existing
      ? [String(existing)]
      : [];

  context.res.setHeader('Set-Cookie', [...existingValues, cookie]);
}

function shouldUseSecureCookie(context: any) {
  const forwardedProtocol = String(getRequestHeader(context, 'x-forwarded-proto')).toLowerCase();
  const host = String(getRequestHeader(context, 'host')).toLowerCase();
  return (
    forwardedProtocol === 'https' ||
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.PORTLESS_URL && !host.startsWith('127.0.0.1') && !host.startsWith('localhost'))
  );
}

export function createGuestAccessToken() {
  return randomBytes(32).toString('base64url');
}

export function hashGuestAccessToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function guestAccessTokenMatches(tokenHash: string | null | undefined, token: string) {
  if (!tokenHash || !token || token.length < 32) return false;
  return safeEqual(tokenHash, hashGuestAccessToken(token));
}

export function setGuestBookingAccess(context: any, bookingId: string, token: string) {
  const entries = parseGuestAccessEntries(context).filter((entry) => entry.bookingId !== bookingId);
  entries.push({ bookingId, token });

  const payload = encodePayload(entries.slice(-MAX_GUEST_ACCESS_ENTRIES));
  const value = `${payload}.${signPayload(payload)}`;
  const secure = shouldUseSecureCookie(context) ? '; Secure' : '';

  appendSetCookieHeader(
    context,
    `${GUEST_ACCESS_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_ACCESS_MAX_AGE_SECONDS}${secure}`
  );
}

export function getGuestBookingToken(context: any, bookingId: string) {
  return parseGuestAccessEntries(context).find((entry) => entry.bookingId === bookingId)?.token || null;
}

export function canManageBookingRecords(context: any) {
  return Boolean(
    context.session?.data?.role?.canManageBookings ||
    context.session?.data?.role?.canManagePayments
  );
}

export async function assertGuestBookingAccess(context: any, bookingId: string) {
  const sudoContext = context.sudo();
  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      guestEmail
      guestAccessTokenHash
    `,
  });

  if (!booking) throw new Error(BOOKING_ACCESS_DENIED_MESSAGE);
  if (canManageBookingRecords(context)) return booking;

  const token = getGuestBookingToken(context, bookingId);
  if (!token || !guestAccessTokenMatches(booking.guestAccessTokenHash, token)) {
    throw new Error(BOOKING_ACCESS_DENIED_MESSAGE);
  }

  return booking;
}

export async function issueGuestBookingAccess(context: any, bookingId: string) {
  const token = createGuestAccessToken();
  await context.sudo().query.Booking.updateOne({
    where: { id: bookingId },
    data: {
      guestAccessTokenHash: hashGuestAccessToken(token),
      guestAccessTokenIssuedAt: new Date().toISOString(),
    },
  });
  setGuestBookingAccess(context, bookingId, token);
  return token;
}

export async function verifyBookingEmailOwnership(
  context: any,
  booking: { id: string; guestEmail?: string | null },
  email: string
) {
  if (!email || normalizeEmail(booking.guestEmail || '') !== normalizeEmail(email)) {
    throw new Error(BOOKING_ACCESS_DENIED_MESSAGE);
  }

  await issueGuestBookingAccess(context, booking.id);
}

export async function ensureBookingHasGuestAccess(context: any, bookingId: string) {
  const booking = await context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: 'id guestAccessTokenHash',
  });

  if (!booking) throw new Error('Booking not found.');
  if (booking.guestAccessTokenHash) return false;

  const token = createGuestAccessToken();
  await context.sudo().query.Booking.updateOne({
    where: { id: bookingId },
    data: {
      guestAccessTokenHash: hashGuestAccessToken(token),
      guestAccessTokenIssuedAt: new Date().toISOString(),
    },
  });
  return true;
}

export function getGuestAccessBookingIds(context: any) {
  return parseGuestAccessEntries(context).map((entry) => entry.bookingId);
}
