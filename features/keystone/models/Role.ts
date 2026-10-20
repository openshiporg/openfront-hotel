import { relationship, text } from '@keystone-6/core/fields';
import { list } from '@keystone-6/core';
import { isSignedIn, permissions } from '../access';
import { permissionFields } from './fields';
import { trackingFields } from './trackingFields';

// Signed-in staff can read their own role's permission flags; the canonical dashboard
// admission query needs them. Other roles and role membership stay with role managers.
const canReadRoles = ({ session }: any) => {
  if (!isSignedIn({ session })) return false;
  if (permissions.canManageRoles({ session })) return true;
  return { assignedTo: { some: { id: { equals: session.itemId } } } };
};

export const Role = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageRoles,
      update: permissions.canManageRoles,
      delete: permissions.canManageRoles,
    },
    filter: {
      query: canReadRoles,
    },
  },
  ui: {
    hideCreate: args => !permissions.canManageRoles(args),
    hideDelete: args => !permissions.canManageRoles(args),
    isHidden: args => !permissions.canManageRoles(args),
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    ...permissionFields,
    assignedTo: relationship({
      ref: 'User.role',
      many: true,
      access: { read: permissions.canManageRoles },
    }),
    ...trackingFields
  },
  hooks: {
    afterOperation: async ({ operation, item, context }) => {
      if (operation !== 'update' || !item?.id) return;
      // Direct Prisma is intentional here: invalidation must update every
      // bearer of this role even though ordinary User updates are restricted.
      await context.prisma.user.updateMany({
        where: { roleId: item.id },
        data: { authVersion: { increment: 1 } },
      });
    },
  },
});
