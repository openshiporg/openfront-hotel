import { enforceAbuseLimit } from '../lib/abuseControl';
import { guestAccessTokenMatches, listGuestBookingAccess } from '../lib/guestBookingAccess';
import { hotelMailInfrastructureConfigured } from '../lib/mail';
import { STOREFRONT_BOOKING_QUERY } from '../lib/storefrontBooking';

/**
 * Storefront guest accounts, following Openfront E-commerce and Restaurant: a guest is a
 * User with no staff role, so every role permission (including dashboard access) is false.
 * Stays attach to an account only with proof: booked while signed in, or already verified
 * on this device with the booking's confirmation number and the account's email.
 */
export const guestAccountTypeDefs = String.raw`
  type GuestAccount {
    id: ID!
    name: String!
    email: String!
    phone: String
  }
  type GuestAccountStatus {
    account: GuestAccount
    passwordResetAvailable: Boolean!
  }
  type GuestAccountResult {
    account: GuestAccount
    error: String
  }
  extend type Query {
    guestAccountStatus: GuestAccountStatus!
    guestAccountBookings(take: Int, skip: Int): [GuestBooking!]!
    guestAccountBookingsCount: Int!
  }
  extend type Mutation {
    registerGuestAccount(name: String!, email: String!, password: String!, phone: String): GuestAccountResult!
    claimGuestAccountStays: Int!
    updateGuestAccount(name: String!, phone: String): GuestAccountResult!
    changeGuestAccountPassword(currentPassword: String!, newPassword: String!): GuestAccountResult!
  }
`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUEST_BOOKINGS_PAGE_SIZE = 50;
const PHONE = /^[+\d\s().-]*$/;

/** The signed-in guest account, or null for anonymous visitors and staff. */
export function guestAccountId(context: any): string | null {
  const session = context.session;
  return session?.itemId && session.listKey === 'User' && session.data?.isActive === true && !session.data?.role ? String(session.itemId) : null;
}

function clean(value: unknown, max: number) {
  const text = String(value ?? '').trim();
  return text.length > max || /[\u0000-\u001f\u007f]/.test(text) ? null : text;
}

function projectAccount(user: any) {
  return user ? { id: user.id, name: user.name, email: user.email, phone: user.phone || null } : null;
}

async function limited(context: any, scope: string, identity: string, limit: number, windowMs: number) {
  try {
    await enforceAbuseLimit(context, { scope, identity, limit, windowMs, includeNetwork: false });
    return false;
  } catch {
    return true;
  }
}

export function createGuestAccountResolvers(mapGuestBooking: (booking: any) => any) {
  return {
    Query: {
      guestAccountStatus: async (_root: unknown, _args: unknown, context: any) => {
        const id = guestAccountId(context);
        const [user, settings] = await Promise.all([
          id ? context.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true } }) : null,
          context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { contactEmail: true } }),
        ]);
        return {
          account: projectAccount(user),
          // Reset links are emailed; without mail delivery the storefront says so instead of claiming a send.
          passwordResetAvailable: hotelMailInfrastructureConfigured() && Boolean(settings?.contactEmail),
        };
      },
      guestAccountBookings: async (_root: unknown, args: { take?: number | null; skip?: number | null }, context: any) => {
        const id = guestAccountId(context);
        if (!id) return [];
        // Pages are bounded and ordered by a unique tie-breaker so every stay appears exactly once.
        const take = Math.min(Math.max(Math.trunc(Number(args.take ?? GUEST_BOOKINGS_PAGE_SIZE)) || GUEST_BOOKINGS_PAGE_SIZE, 1), 100);
        const skip = Math.min(Math.max(Math.trunc(Number(args.skip ?? 0)) || 0, 0), 100_000);
        const bookings = await context.sudo().query.Booking.findMany({
          where: { guest: { id: { equals: id } } },
          orderBy: [{ checkInDate: 'desc' }, { id: 'desc' }],
          take,
          skip,
          query: STOREFRONT_BOOKING_QUERY,
        });
        return bookings.map(mapGuestBooking);
      },
      guestAccountBookingsCount: async (_root: unknown, _args: unknown, context: any) => {
        const id = guestAccountId(context);
        return id ? context.prisma.booking.count({ where: { guestId: id } }) : 0;
      },
    },
    Mutation: {
      registerGuestAccount: async (_root: unknown, args: { name: string; email: string; password: string; phone?: string | null }, context: any) => {
        const name = clean(args.name, 120);
        const email = clean(args.email, 254)?.toLowerCase() || '';
        const phone = clean(args.phone, 40);
        const password = String(args.password || '');
        if (!name) return { account: null, error: 'Enter your name.' };
        if (!EMAIL.test(email)) return { account: null, error: 'Enter a valid email address.' };
        if (phone === null || !PHONE.test(phone)) return { account: null, error: 'Enter a valid phone number, or leave it blank.' };
        if (password.length < 10 || password.length > 1000) return { account: null, error: 'Choose a password of at least 10 characters.' };
        if (await limited(context, 'guest-account-register', email, 5, 60 * 60_000)) return { account: null, error: 'Too many attempts. Please wait and try again.' };
        const existing = await context.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
        if (existing) return { account: null, error: 'An account already exists for this email. Sign in, or reset your password.' };
        try {
          // No role: a guest account can never reach the dashboard or any staff operation.
          const user = await context.sudo().db.User.createOne({ data: { name, email, password, phone } });
          return { account: projectAccount(user), error: null };
        } catch (error: any) {
          const message = String(error?.message || '');
          if (/password/i.test(message)) return { account: null, error: 'Choose a less common password of at least 10 characters.' };
          if (/unique/i.test(message)) return { account: null, error: 'An account already exists for this email. Sign in, or reset your password.' };
          return { account: null, error: 'Your account could not be created. Please try again.' };
        }
      },
      claimGuestAccountStays: async (_root: unknown, _args: unknown, context: any) => {
        const id = guestAccountId(context);
        if (!id) return 0;
        const user = await context.prisma.user.findUnique({ where: { id }, select: { email: true } });
        const email = String(user?.email || '').trim().toLowerCase();
        if (!email) return 0;
        let claimed = 0;
        for (const entry of listGuestBookingAccess(context)) {
          const booking = await context.prisma.booking.findUnique({ where: { id: entry.bookingId }, select: { id: true, guestEmail: true, guestAccessTokenHash: true, guestId: true } });
          if (!booking || booking.guestId || String(booking.guestEmail || '').trim().toLowerCase() !== email) continue;
          if (!guestAccessTokenMatches(booking.guestAccessTokenHash, entry.token)) continue;
          const result = await context.prisma.booking.updateMany({ where: { id: booking.id, guestId: null }, data: { guestId: id } });
          claimed += result.count;
        }
        return claimed;
      },
      updateGuestAccount: async (_root: unknown, args: { name: string; phone?: string | null }, context: any) => {
        const id = guestAccountId(context);
        if (!id) return { account: null, error: 'Sign in to update your details.' };
        const name = clean(args.name, 120);
        const phone = clean(args.phone, 40);
        if (!name) return { account: null, error: 'Enter your name.' };
        if (phone === null || !PHONE.test(phone)) return { account: null, error: 'Enter a valid phone number, or leave it blank.' };
        const user = await context.sudo().db.User.updateOne({ where: { id }, data: { name, phone } });
        return { account: projectAccount(user), error: null };
      },
      changeGuestAccountPassword: async (_root: unknown, args: { currentPassword: string; newPassword: string }, context: any) => {
        const id = guestAccountId(context);
        if (!id) return { account: null, error: 'Sign in to change your password.' };
        if (await limited(context, 'guest-account-password', id, 8, 15 * 60_000)) return { account: null, error: 'Too many attempts. Please wait and try again.' };
        const next = String(args.newPassword || '');
        if (next.length < 10 || next.length > 1000) return { account: null, error: 'Choose a new password of at least 10 characters.' };
        const user = await context.prisma.user.findUnique({ where: { id } });
        const field = context.graphql.schema.getType('User')?.getFields()?.password?.extensions?.keystoneSecretField;
        const current = String(args.currentPassword || '');
        if (!user || !field?.compare || current.length > 1000 || !(await field.compare(current, user.password))) return { account: null, error: 'Your current password is incorrect.' };
        try {
          // Changing the password ends existing sessions; the storefront asks the guest to sign in again.
          const updated = await context.sudo().db.User.updateOne({ where: { id }, data: { password: next } });
          return { account: projectAccount(updated), error: null };
        } catch {
          return { account: null, error: 'Choose a less common password of at least 10 characters.' };
        }
      },
    },
  };
}
