import { list } from '@keystone-6/core';
import {
  password,
  text,
  relationship,
  checkbox,
  select,
} from '@keystone-6/core/fields';
import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';

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
      create: () => true,
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
    isActive: checkbox({ defaultValue: true }),
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
    }),
    ...trackingFields,
  },
});
