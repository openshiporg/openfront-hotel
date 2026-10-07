import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { checkbox, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { encryptSensitiveText } from '../lib/sensitiveData';

const canManagePaymentIntegrations = ({ session }: any) =>
  permissions.canManagePayments({ session }) && permissions.canManageIntegrations({ session });

export const PaymentProvider = list({
  access: {
    operation: {
      query: canManagePaymentIntegrations,
      create: denyAll,
      update: canManagePaymentIntegrations,
      delete: denyAll,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'code', 'isInstalled', 'createdAt'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
    }),
    code: text({
      access: { update: denyAll },
      ui: { itemView: { fieldMode: 'read' } },
      isIndexed: 'unique',
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation:
            'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores',
        },
      },
    }),
    isInstalled: checkbox({
      access: { update: denyAll },
      defaultValue: true,
      ui: { itemView: { fieldMode: 'read' } },
    }),
    credentials: json({
      defaultValue: {},
      access: {
        read: denyAll,
        create: denyAll,
        update: denyAll,
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          const credentials = resolvedData.credentials;
          if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return credentials;
          return Object.fromEntries(Object.entries(credentials).map(([key, value]) => [
            key,
            key === 'sandbox' ? Boolean(value) : encryptSensitiveText(value),
          ]));
        },
      },
      ui: {
        itemView: { fieldMode: 'hidden' },
        createView: { fieldMode: 'hidden' },
        listView: { fieldMode: 'hidden' },
      },
    }),
    metadata: json({
      access: { update: denyAll },
      defaultValue: {},
      ui: { itemView: { fieldMode: 'read' } },
    }),
    createPaymentFunction: text({ access: { create: denyAll, update: denyAll }, validation: { isRequired: true }, ui: { itemView: { fieldMode: 'read' } } }),
    capturePaymentFunction: text({ access: { create: denyAll, update: denyAll }, validation: { isRequired: true }, ui: { itemView: { fieldMode: 'read' } } }),
    refundPaymentFunction: text({ access: { create: denyAll, update: denyAll }, validation: { isRequired: true }, ui: { itemView: { fieldMode: 'read' } } }),
    getPaymentStatusFunction: text({ access: { create: denyAll, update: denyAll }, validation: { isRequired: true }, ui: { itemView: { fieldMode: 'read' } } }),
    generatePaymentLinkFunction: text({ access: { create: denyAll, update: denyAll }, validation: { isRequired: true }, ui: { itemView: { fieldMode: 'read' } } }),
    handleWebhookFunction: text({ access: { create: denyAll, update: denyAll }, validation: { isRequired: true }, ui: { itemView: { fieldMode: 'read' } } }),
    bookingPaymentSessions: relationship({
      ref: 'BookingPaymentSession.paymentProvider',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    bookingPayments: relationship({
      ref: 'BookingPayment.paymentProvider',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    refundIntents: relationship({
      ref: 'RefundIntent.paymentProvider',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    ...trackingFields,
  },
});
