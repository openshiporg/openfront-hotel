import { relationship, text } from '@keystone-6/core/fields';
import { list } from '@keystone-6/core';
import { permissions } from '../access';
import { permissionFields } from './fields';
import { trackingFields } from './trackingFields';

export const Role = list({
  access: {
    operation: {
      query: permissions.canManageRoles,
      create: permissions.canManageRoles,
      update: permissions.canManageRoles,
      delete: permissions.canManageRoles,
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
