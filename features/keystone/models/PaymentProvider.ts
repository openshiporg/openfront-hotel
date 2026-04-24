import { list } from '@keystone-6/core';
import { checkbox, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const PaymentProvider = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments,
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
    ...trackingFields,
  },
});
