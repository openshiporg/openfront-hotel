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
      create: canManagePaymentIntegrations,
      update: canManagePaymentIntegrations,
      delete: canManagePaymentIntegrations,
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
      defaultValue: true,
    }),
    credentials: json({
      defaultValue: {},
      access: {
        read: denyAll,
        create: canManagePaymentIntegrations,
        update: canManagePaymentIntegrations,
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
      defaultValue: {},
    }),
    createPaymentFunction: text({ validation: { isRequired: true } }),
    capturePaymentFunction: text({ validation: { isRequired: true } }),
    refundPaymentFunction: text({ validation: { isRequired: true } }),
    getPaymentStatusFunction: text({ validation: { isRequired: true } }),
    generatePaymentLinkFunction: text({ validation: { isRequired: true } }),
    handleWebhookFunction: text({ validation: { isRequired: true } }),
    bookingPaymentSessions: relationship({
      ref: 'BookingPaymentSession.paymentProvider',
      many: true,
    }),
    bookingPayments: relationship({
      ref: 'BookingPayment.paymentProvider',
      many: true,
    }),
    refundIntents: relationship({
      ref: 'RefundIntent.paymentProvider',
      many: true,
    }),
    ...trackingFields,
  },
});
