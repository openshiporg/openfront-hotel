import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { statelessSessions } from "@keystone-6/core/session";
import type { SessionStrategy } from '@keystone-6/core/types';
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { permissions } from "./access";
import { startChannelSyncJobs } from "./jobs/channelSyncJobs";
import { startHotelOutboxJobs } from './jobs/hotelOutboxJobs';
import { startHotelRefundJobs } from './jobs/hotelRefundJobs';
import { startHotelHoldJobs } from './jobs/hotelHoldJobs';
import { validateProductionConfig } from './lib/productionConfig';

const isProduction = process.env.NODE_ENV === 'production';
const capabilities = validateProductionConfig();
const databaseURL = process.env.DATABASE_URL || (isProduction ? '' : 'postgresql://postgres:postgres@127.0.0.1:5432/runtime_hotel');
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? '' : 'local-development-session-secret-change-me');
if (!databaseURL) throw new Error('DATABASE_URL is required outside local development.');
if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const sessionConfig = {
  maxAge: SESSION_MAX_AGE_SECONDS,
  secret: sessionSecret,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
};

const permissionKeys = [
  'canAccessDashboard', 'canManageRooms', 'canManageBookings', 'canManageHousekeeping',
  'canManageGuests', 'canManagePayments', 'canSeeOtherPeople', 'canEditOtherPeople',
  'canManagePeople', 'canManageRoles', 'canManageOnboarding', 'canManageAudit',
  'canManageIntegrations',
] as const;

function revocableStatelessSessions(): SessionStrategy<any> {
  const base = statelessSessions<any>(sessionConfig);
  const loadCurrent = async (context: any, session: any, allowInitialIdentity = false) => {
    if (!session?.itemId || session.listKey !== 'User') return undefined;
    const user = await context.prisma.user.findUnique({
      where: { id: session.itemId },
      include: { role: true },
    });
    if (!user?.isActive || !user.role) return undefined;
    if (!allowInitialIdentity && Number(user.authVersion || 0) !== Number(session.data?.authVersion || 0)) return undefined;
    const embeddedRole = session.data?.role || {};
    if (!allowInitialIdentity && permissionKeys.some(key => Boolean(user.role[key]) !== Boolean(embeddedRole[key]))) return undefined;
    return {
      ...session,
      data: {
        ...session.data,
        name: user.name,
        email: user.email,
        isActive: true,
        authVersion: user.authVersion,
        role: Object.fromEntries(['id', 'name', ...permissionKeys].map(key => [key, user.role[key]])),
      },
    };
  };
  return {
    get: async ({ context }) => {
      const session = await base.get({ context });
      return loadCurrent(context, session);
    },
    start: async ({ context, data }) => {
      const current = await loadCurrent(context, data, true);
      if (!current) throw new Error('Authentication is not permitted for this account.');
      return base.start({ context, data: current });
    },
    end: args => base.end(args),
  };
}

const bucketName = process.env.S3_BUCKET_NAME || 'local-disabled';
const region = process.env.S3_REGION || 'local-disabled';
const accessKeyId = process.env.S3_ACCESS_KEY_ID || 'local-disabled';
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || 'local-disabled';
const endpoint = process.env.S3_ENDPOINT || 'https://storage-disabled.invalid';

const { withAuth } = createAuth({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Admin",
          canAccessDashboard: true,
          canManageRooms: true,
          canManageBookings: true,
          canManageHousekeeping: true,
          canManageGuests: true,
          canManagePayments: true,
          canSeeOtherPeople: true,
          canEditOtherPeople: true,
          canManagePeople: true,
          canManageRoles: true,
          canManageOnboarding: true,
          canManageAudit: true,
          canManageIntegrations: true,
        },
      },
    },
  },
  passwordResetLink: {
    async sendToken(args) {
      const settings = await args.context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { contactEmail: true } });
      if (!settings?.contactEmail || !capabilities.mailInfrastructureConfigured) {
        throw new Error('Password reset email is currently unconfigured.');
      }
      await sendPasswordResetEmail(args.token, args.identity);
    },
  },
  sessionData: `
    name
    email
    isActive
    authVersion
    role {
      id
      name
      canAccessDashboard
      canManageRooms
      canManageBookings
      canManageHousekeeping
      canManageGuests
      canManagePayments
      canSeeOtherPeople
      canEditOtherPeople
      canManagePeople
      canManageRoles
      canManageOnboarding
      canManageAudit
      canManageIntegrations
    }
  `,
});

const baseConfig = config({
  db: {
    provider: "postgresql",
    url: databaseURL,
  },
  lists: models,
  storage: {
    my_images: capabilities.storageInfrastructureConfigured ? {
      kind: 's3' as const,
      type: 'image' as const,
      bucketName,
      region,
      accessKeyId,
      secretAccessKey,
      endpoint,
      signed: { expiry: 5000 },
      forcePathStyle: true,
    } : {
      kind: 'local' as const,
      type: 'image' as const,
      storagePath: '.runtime/disabled-uploads',
      serverRoute: { path: '/disabled-uploads' },
      generateUrl: () => { throw new Error('Image uploads are currently unavailable.'); },
    },
  },
  ui: {
    isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session }),
  },
  session: revocableStatelessSessions(),
  graphql: {
    extendGraphqlSchema,
  },
});

const configWithAuth = withAuth(baseConfig);

// Keystone configuration is evaluated while generating schemas and again while
// Next compiles route handlers. Workers must start only in a running server;
// build-time execution would connect to production data and make image builds
// depend on database availability.
const isRuntimeServer = process.env.NEXT_PHASE !== 'phase-production-build'
  && process.argv.some(argument => argument === 'dev' || argument === 'start');
if (isRuntimeServer) {
  startChannelSyncJobs(configWithAuth);
  startHotelOutboxJobs(configWithAuth);
  startHotelRefundJobs(configWithAuth);
  startHotelHoldJobs(configWithAuth);
}

export default configWithAuth;
