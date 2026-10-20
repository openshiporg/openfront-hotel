import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import {
  password,
  text,
  relationship,
  checkbox,
  integer,
  select,
  timestamp,
  json,
} from '@keystone-6/core/fields';
import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';
import { enforceAbuseLimit } from '../lib/abuseControl';

// Dashboard sign-up is open only when the deployment sets PUBLIC_SIGNUPS_ALLOWED=true,
// the same switch that shows the sign-up page. Accounts created this way have no
// role, so they cannot reach the dashboard until an administrator assigns one.
const PUBLIC_SIGNUP_FIELDS = new Set(['name', 'email', 'password']);
const publicSignUpsAllowed = () => process.env.PUBLIC_SIGNUPS_ALLOWED === 'true';

const canCreateUser = (args: any) =>
  permissions.canManagePeople(args) || (!args.session && publicSignUpsAllowed());

const canManageUsers = ({ session }: any) => {
  if (!isSignedIn({ session })) {
    return false;
  }
  if (permissions.canManagePeople({ session })) {
    return true;
  }
  return { id: { equals: session?.itemId } };
};

export const User = list({
  access: {
    operation: {
      create: canCreateUser,
      query: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManagePeople,
    },
    filter: {
      query: canManageUsers,
      update: canManageUsers,
    },
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
  },
  fields: {
    name: text({
      validation: { isRequired: true },
    }),
    email: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    password: password({
      validation: {
        length: { min: 10, max: 1000 },
        isRequired: true,
        rejectCommon: true,
      },
    }),
    role: relationship({
      ref: 'Role.assignedTo',
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople,
      },
      ui: {
        itemView: {
          fieldMode: (args) =>
            permissions.canManagePeople(args) ? 'edit' : 'read',
        },
      },
    }),
    phone: text(),
    isActive: checkbox({
      defaultValue: true,
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople,
      },
    }),
    authVersion: integer({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    disabledAt: timestamp({
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    mfaEnabled: checkbox({ defaultValue: false, access: { read: () => false, create: () => false, update: () => false } }),
    mfaSecret: text({ access: { read: () => false, create: () => false, update: () => false } }),
    mfaPendingSecret: text({ access: { read: () => false, create: () => false, update: () => false } }),
    mfaPendingExpiresAt: timestamp({ access: { read: () => false, create: () => false, update: () => false } }),
    mfaLastCounter: integer({ defaultValue: -1, access: { read: () => false, create: () => false, update: () => false } }),
    mfaRecoveryHashes: json({ defaultValue: [], access: { read: () => false, create: () => false, update: () => false } }),
    onboardingStatus: select({
      options: [
        { label: 'Not Started', value: 'not_started' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dismissed', value: 'dismissed' },
      ],
      defaultValue: 'not_started',
      ui: {
        description: 'Hotel onboarding progress',
      },
    }),
    // Hotel-specific relationships
    bookings: relationship({
      ref: 'Booking.guest',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    ...trackingFields,
  },
  hooks: {
    resolveInput: async ({ operation, inputData, resolvedData, context }) => {
      // Trusted server paths (initial admin, storefront guest registration) run with sudo.
      const sudo = context.graphql.schema === context.sudo().graphql.schema;
      if (operation !== 'create' || sudo || permissions.canManagePeople({ session: context.session })) return resolvedData;
      const extra = Object.keys(inputData ?? {}).filter((key) => !PUBLIC_SIGNUP_FIELDS.has(key));
      if (extra.length) throw new Error('Only name, email and password can be set when signing up.');
      const email = String(resolvedData.email || '').trim().toLowerCase();
      await enforceAbuseLimit(context, { scope: 'dashboard-signup', identity: email, limit: 5, windowMs: 60 * 60_000 });
      return { ...resolvedData, email };
    },
    beforeOperation: async ({ operation, item, resolvedData }) => {
      if (operation !== 'update' || !item) return;
      const roleChange = resolvedData.role !== undefined;
      const activeChange = resolvedData.isActive !== undefined && resolvedData.isActive !== item.isActive;
      const passwordChange = resolvedData.password !== undefined;
      if (!roleChange && !activeChange && !passwordChange) return;
      resolvedData.authVersion = Number(item.authVersion || 1) + 1;
      if (activeChange) resolvedData.disabledAt = resolvedData.isActive === false ? new Date() : null;
    },
  },
});
