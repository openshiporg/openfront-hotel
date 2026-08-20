"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key3 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key3) && key3 !== except)
        __defProp(to, key3, { get: () => from[key3], enumerable: !(desc = __getOwnPropDesc(from, key3)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  completePaymentFunction: () => completePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
function normalizeAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Invalid payment amount");
  }
  return amount;
}
function settlementFromResource(resource) {
  const amount = resource?.amount_received ?? resource?.amount_total ?? resource?.amount;
  return {
    isSettled: resource?.status === "succeeded" || resource?.payment_status === "paid",
    amount: Number.isSafeInteger(amount) ? amount : null,
    currencyCode: String(resource?.currency || "").toUpperCase(),
    providerPaymentId: String(resource?.payment_intent || resource?.id || ""),
    bookingId: String(resource?.metadata?.bookingId || ""),
    idempotencyKey: String(resource?.metadata?.idempotencyKey || "")
  };
}
async function createPaymentFunction({
  amount,
  currency,
  metadata = {},
  idempotencyKey,
  providerCredentials
}) {
  const paymentIntent = await getStripeClient(providerCredentials).paymentIntents.create(
    {
      amount: normalizeAmount(amount),
      currency: (currency || "usd").toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata
    },
    { idempotencyKey }
  );
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    data: paymentIntent
  };
}
async function completePaymentFunction({ paymentId, providerCredentials }) {
  const paymentIntent = await getStripeClient(providerCredentials).paymentIntents.retrieve(paymentId);
  const settlement = settlementFromResource(paymentIntent);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    currencyCode: paymentIntent.currency,
    providerPaymentId: paymentIntent.id,
    metadata: paymentIntent.metadata,
    settlement,
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, metadata = {}, idempotencyKey, providerCredentials }) {
  if (!idempotencyKey) throw new Error("Stripe refund idempotency key is required");
  const refund = await getStripeClient(providerCredentials).refunds.create({
    payment_intent: paymentId,
    amount: amount ? normalizeAmount(Math.abs(amount)) : void 0,
    metadata
  }, { idempotencyKey });
  return { status: refund.status, amount: refund.amount, data: refund };
}
async function getPaymentStatusFunction({ paymentId, providerCredentials }) {
  return completePaymentFunction({ paymentId, providerCredentials });
}
async function generatePaymentLinkFunction({ paymentId }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}
async function handleWebhookFunction({ rawBody, headers, providerCredentials }) {
  const webhookSecret = providerCredentials?.webhookSecret;
  if (!webhookSecret) throw new Error("Stripe webhook secret is not configured");
  if (typeof rawBody !== "string" || !rawBody) {
    throw new Error("Stripe webhook raw body is required");
  }
  const signature2 = headers?.["stripe-signature"];
  if (!signature2) throw new Error("Stripe webhook signature is required");
  const event = getStripeClient(providerCredentials).webhooks.constructEvent(
    rawBody,
    signature2,
    webhookSecret
  );
  const resource = event.data.object;
  return {
    isValid: true,
    event,
    eventId: event.id,
    type: event.type,
    resource,
    settlement: settlementFromResource(resource)
  };
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    getStripeClient = (credentials) => {
      if (!credentials.secretKey) throw new Error("Stripe secret key is not configured.");
      return new import_stripe.default(credentials.secretKey, { apiVersion: "2025-11-17.clover" });
    };
  }
});

// features/integrations/payment/paypal.ts
var paypal_exports = {};
__export(paypal_exports, {
  completePaymentFunction: () => completePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
async function getPayPalAccessToken(credentials) {
  const { clientId, clientSecret } = credentials;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured.");
  const response = await fetch(`${getPayPalBaseUrl(credentials)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en_US",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) throw new Error("Failed to get PayPal access token");
  const body = await response.json();
  if (!body.access_token) throw new Error("Failed to get PayPal access token");
  return body.access_token;
}
function settlementFromCapture(capture) {
  const amount = capture?.amount;
  return {
    isSettled: capture?.status === "COMPLETED",
    amount: amount?.value ? parsePayPalAmount(amount.value, amount.currency_code) : null,
    currencyCode: String(amount?.currency_code || "").toUpperCase(),
    providerPaymentId: String(capture?.id || ""),
    bookingId: String(capture?.custom_id || capture?.invoice_id || ""),
    idempotencyKey: ""
  };
}
async function handleWebhookFunction2({ rawBody, headers, providerCredentials }) {
  const webhookId = providerCredentials?.webhookId;
  if (!webhookId) throw new Error("PayPal webhook ID is not configured");
  if (typeof rawBody !== "string" || !rawBody) {
    throw new Error("PayPal webhook raw body is required");
  }
  const event = JSON.parse(rawBody);
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await fetch(
    `${getPayPalBaseUrl(providerCredentials)}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        auth_algo: headers?.["paypal-auth-algo"],
        cert_url: headers?.["paypal-cert-url"],
        transmission_id: headers?.["paypal-transmission-id"],
        transmission_sig: headers?.["paypal-transmission-sig"],
        transmission_time: headers?.["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: event
      })
    }
  );
  if (!response.ok) throw new Error("PayPal webhook signature verification failed");
  const verification = await response.json();
  if (verification.verification_status !== "SUCCESS") {
    throw new Error("Invalid webhook signature");
  }
  return {
    isValid: true,
    event,
    eventId: event.id,
    type: event.event_type,
    resource: event.resource,
    settlement: settlementFromCapture(event.resource)
  };
}
async function createPaymentFunction2({
  amount,
  currency,
  metadata = {},
  idempotencyKey,
  providerCredentials
}) {
  if (!metadata.returnUrl || !metadata.cancelUrl) {
    throw new Error("Verified PayPal return and cancellation URLs are required.");
  }
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await fetch(`${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "PayPal-Request-Id": idempotencyKey
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: (currency || "USD").toUpperCase(),
          value: formatPayPalAmount(amount, currency || "USD")
        },
        custom_id: metadata.bookingId,
        invoice_id: metadata.idempotencyKey
      }],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        return_url: metadata.returnUrl,
        cancel_url: metadata.cancelUrl,
        user_action: "PAY_NOW"
      }
    })
  });
  const order = await response.json();
  if (!response.ok || order.error) {
    throw new Error(`PayPal order creation failed: ${order.error?.message || response.status}`);
  }
  return {
    orderId: order.id,
    status: order.status,
    approveLink: order.links?.find((link) => link.rel === "approve")?.href || null,
    data: order
  };
}
async function completePaymentFunction2({ paymentId, providerCredentials }) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await fetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(paymentId)}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": `capture:${paymentId}`
      }
    }
  );
  const order = await response.json();
  if (!response.ok || order.error) {
    throw new Error(`PayPal capture failed: ${order.error?.message || response.status}`);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const settlement = settlementFromCapture(capture);
  settlement.bookingId ||= String(order.purchase_units?.[0]?.custom_id || "");
  return {
    status: capture?.status || order.status,
    amount: settlement.amount,
    currencyCode: settlement.currencyCode,
    providerPaymentId: capture?.id || order.id,
    metadata: { bookingId: settlement.bookingId },
    settlement,
    data: order
  };
}
async function refundPaymentFunction2({ paymentId, amount, currency = "USD", idempotencyKey, providerCredentials }) {
  if (!idempotencyKey) throw new Error("PayPal refund idempotency key is required");
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await fetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": idempotencyKey
      },
      body: JSON.stringify({
        amount: amount ? {
          value: formatPayPalAmount(Math.abs(amount), currency),
          currency_code: currency.toUpperCase()
        } : void 0
      })
    }
  );
  const refund = await response.json();
  if (!response.ok || refund.error) {
    throw new Error(`PayPal refund failed: ${refund.error?.message || response.status}`);
  }
  return {
    status: refund.status,
    amount: refund.amount ? parsePayPalAmount(refund.amount.value, refund.amount.currency_code) : void 0,
    data: refund
  };
}
async function getPaymentStatusFunction2({ paymentId, providerCredentials }) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await fetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const order = await response.json();
  if (!response.ok || order.error) {
    throw new Error(`PayPal status check failed: ${order.error?.message || response.status}`);
  }
  return { status: order.status, data: order };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return `https://www.paypal.com/activity/payment/${paymentId}`;
}
var NO_DIVISION_CURRENCIES, getPayPalBaseUrl, formatPayPalAmount, parsePayPalAmount;
var init_paypal = __esm({
  "features/integrations/payment/paypal.ts"() {
    "use strict";
    NO_DIVISION_CURRENCIES = [
      "JPY",
      "KRW",
      "VND",
      "CLP",
      "PYG",
      "XAF",
      "XOF",
      "BIF",
      "DJF",
      "GNF",
      "KMF",
      "MGA",
      "RWF",
      "XPF",
      "HTG",
      "VUV",
      "XAG",
      "XDR",
      "XAU"
    ];
    getPayPalBaseUrl = (credentials) => credentials.sandbox === false ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    formatPayPalAmount = (amount, currency) => NO_DIVISION_CURRENCIES.includes(currency.toUpperCase()) ? Math.round(amount).toString() : (Math.round(amount) / 100).toFixed(2);
    parsePayPalAmount = (value, currency) => NO_DIVISION_CURRENCIES.includes(currency.toUpperCase()) ? parseInt(value, 10) : Math.round(parseFloat(value) * 100);
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core42 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session?.itemId && session.data?.isActive === true);
}
var permissions = {
  canAccessDashboard: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canAccessDashboard ?? false),
  canManageRooms: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageRooms ?? false),
  canManageBookings: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageBookings ?? false),
  canManageHousekeeping: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageHousekeeping ?? false),
  canManageGuests: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageGuests ?? false),
  canManagePayments: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManagePayments ?? false),
  canManagePeople: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManagePeople ?? false),
  canManageRoles: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageRoles ?? false),
  canManageOnboarding: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageOnboarding ?? false),
  canManageAudit: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageAudit ?? false),
  canManageIntegrations: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageIntegrations ?? false)
};

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/models/User.ts
var canManageUsers = ({ session }) => {
  if (!isSignedIn({ session })) {
    return false;
  }
  if (permissions.canManagePeople({ session })) {
    return true;
  }
  return { id: { equals: session?.itemId } };
};
var User = (0, import_core.list)({
  access: {
    operation: {
      create: permissions.canManagePeople,
      query: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: canManageUsers,
      update: canManageUsers
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args)
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: { isRequired: true }
    }),
    email: (0, import_fields2.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    password: (0, import_fields2.password)({
      validation: {
        length: { min: 10, max: 1e3 },
        isRequired: true,
        rejectCommon: true
      }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    phone: (0, import_fields2.text)(),
    isActive: (0, import_fields2.checkbox)({
      defaultValue: true,
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      }
    }),
    authVersion: (0, import_fields2.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    disabledAt: (0, import_fields2.timestamp)({
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    onboardingStatus: (0, import_fields2.select)({
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" }
      ],
      defaultValue: "not_started",
      ui: {
        description: "Hotel onboarding progress"
      }
    }),
    // Hotel-specific relationships
    bookings: (0, import_fields2.relationship)({
      ref: "Booking.guest",
      many: true
    }),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, item, resolvedData }) => {
      if (operation !== "update" || !item) return;
      const roleChange = resolvedData.role !== void 0;
      const activeChange = resolvedData.isActive !== void 0 && resolvedData.isActive !== item.isActive;
      const passwordChange = resolvedData.password !== void 0;
      if (!roleChange && !activeChange && !passwordChange) return;
      resolvedData.authVersion = Number(item.authVersion || 1) + 1;
      if (activeChange) resolvedData.disabledAt = resolvedData.isActive === false ? /* @__PURE__ */ new Date() : null;
    }
  }
});

// features/keystone/models/Role.ts
var import_fields4 = require("@keystone-6/core/fields");
var import_core2 = require("@keystone-6/core");

// features/keystone/models/fields.ts
var import_fields3 = require("@keystone-6/core/fields");
var permissionFields = {
  canAccessDashboard: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can access the dashboard"
  }),
  canManageRooms: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can manage rooms and room types"
  }),
  canManageBookings: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can create and manage bookings"
  }),
  canManageHousekeeping: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can manage housekeeping tasks"
  }),
  canManageGuests: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can manage guest information"
  }),
  canManagePayments: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can process payments and refunds"
  }),
  canSeeOtherPeople: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can see other users"
  }),
  canEditOtherPeople: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can edit other users"
  }),
  canManagePeople: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can create and delete users"
  }),
  canManageRoles: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can CRUD roles"
  }),
  canManageOnboarding: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can access onboarding and hotel setup"
  }),
  canManageAudit: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can review immutable audit and delivery evidence"
  }),
  canManageIntegrations: (0, import_fields3.checkbox)({
    defaultValue: false,
    label: "User can manage integrations, outbox replay, and channel delivery"
  })
};
var permissionsList = Object.keys(permissionFields);

// features/keystone/models/Role.ts
var Role = (0, import_core2.list)({
  access: {
    operation: {
      query: permissions.canManageRoles,
      create: permissions.canManageRoles,
      update: permissions.canManageRoles,
      delete: permissions.canManageRoles
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    isHidden: (args) => !permissions.canManageRoles(args)
  },
  fields: {
    name: (0, import_fields4.text)({ validation: { isRequired: true } }),
    ...permissionFields,
    assignedTo: (0, import_fields4.relationship)({
      ref: "User.role",
      many: true
    }),
    ...trackingFields
  },
  hooks: {
    afterOperation: async ({ operation, item, context }) => {
      if (operation !== "update" || !item?.id) return;
      await context.prisma.user.updateMany({
        where: { roleId: item.id },
        data: { authVersion: { increment: 1 } }
      });
    }
  }
});

// features/keystone/models/RoomType.ts
var import_core3 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var RoomType = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
      delete: permissions.canManageRooms
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "baseRate", "maxOccupancy", "bedConfiguration"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Basic information
    name: (0, import_fields6.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Room Type Name",
      ui: {
        description: "e.g., King Suite, Double Queen, Standard Single"
      }
    }),
    description: (0, import_fields_document.document)({
      formatting: true,
      links: true,
      dividers: true,
      layouts: [
        [1, 1],
        [1, 1, 1]
      ],
      label: "Description",
      ui: {
        description: "Detailed description of the room type"
      }
    }),
    shortDescription: (0, import_fields6.text)({
      label: "Short storefront description",
      ui: {
        displayMode: "textarea",
        description: "Concise editorial copy for room cards and booking summaries."
      }
    }),
    eyebrow: (0, import_fields6.text)({
      label: "Storefront eyebrow",
      ui: {
        description: "Small editorial label such as Heritage Suite or Courtyard Calm."
      }
    }),
    viewDescription: (0, import_fields6.text)({
      label: "View / setting description",
      ui: {
        description: "Short context such as courtyard-facing, skyline view, or garden terrace."
      }
    }),
    thumbnail: (0, import_fields6.text)({
      ui: {
        description: "Optional storefront thumbnail override. If blank, the storefront uses the first room image."
      }
    }),
    // Pricing
    baseRateMinor: (0, import_fields6.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Base Rate (minor units)" }),
    currencyCode: (0, import_fields6.text)({ validation: { isRequired: true }, defaultValue: "USD" }),
    baseRate: (0, import_fields6.float)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Legacy Base Rate",
      ui: { itemView: { fieldMode: "read" }, description: "Derived compatibility value; minor units are authoritative." }
    }),
    // Capacity
    maxOccupancy: (0, import_fields6.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 2,
      label: "Max Occupancy",
      ui: {
        description: "Maximum number of guests"
      }
    }),
    // Bed configuration
    bedConfiguration: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "King", value: "king" },
        { label: "Queen", value: "queen" },
        { label: "Double Queen", value: "double_queen" },
        { label: "Twin", value: "twin" },
        { label: "Double Twin", value: "double_twin" },
        { label: "King + Sofa", value: "king_sofa" },
        { label: "Queen + Sofa", value: "queen_sofa" },
        { label: "Suite", value: "suite" }
      ],
      label: "Bed Configuration",
      ui: {
        description: "Type of bed(s) in the room"
      }
    }),
    // Amenities
    amenities: (0, import_fields6.multiselect)({
      type: "string",
      options: [
        { label: "WiFi", value: "wifi" },
        { label: "TV", value: "tv" },
        { label: "Minibar", value: "minibar" },
        { label: "Balcony", value: "balcony" },
        { label: "Coffee Maker", value: "coffee_maker" },
        { label: "Safe", value: "safe" },
        { label: "Bathtub", value: "bathtub" },
        { label: "Shower", value: "shower" },
        { label: "Air Conditioning", value: "ac" },
        { label: "Heating", value: "heating" },
        { label: "Desk", value: "desk" },
        { label: "Iron", value: "iron" },
        { label: "Hair Dryer", value: "hair_dryer" },
        { label: "Room Service", value: "room_service" },
        { label: "Ocean View", value: "ocean_view" },
        { label: "City View", value: "city_view" },
        { label: "Garden View", value: "garden_view" },
        { label: "Kitchenette", value: "kitchenette" },
        { label: "Jacuzzi", value: "jacuzzi" },
        { label: "Fireplace", value: "fireplace" },
        { label: "Rain shower", value: "rain_shower" },
        { label: "Premium linens", value: "premium_linens" },
        { label: "Blackout drapes", value: "blackout_drapes" },
        { label: "Sitting area", value: "sitting_area" },
        { label: "Breakfast available", value: "breakfast_available" },
        { label: "Accessible", value: "accessible" },
        { label: "Courtyard view", value: "courtyard_view" },
        { label: "Heritage details", value: "heritage_details" }
      ],
      label: "Amenities",
      ui: {
        description: "Available room amenities"
      }
    }),
    // Size
    squareFeet: (0, import_fields6.integer)({
      validation: { min: 0 },
      label: "Square Feet",
      ui: {
        description: "Room size in square feet"
      }
    }),
    // Relationships
    roomImages: (0, import_fields6.relationship)({
      ref: "RoomImage.roomType",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["image", "imagePath", "altText", "caption", "order", "isPrimary"],
        inlineCreate: { fields: ["image", "imagePath", "altText", "caption", "order", "isPrimary"] },
        inlineEdit: { fields: ["image", "imagePath", "altText", "caption", "order", "isPrimary"] },
        inlineConnect: true,
        removeMode: "disconnect",
        linkToItem: false
      },
      label: "Storefront images"
    }),
    rooms: (0, import_fields6.relationship)({
      ref: "Room.roomType",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Rooms"
    }),
    roomAssignments: (0, import_fields6.relationship)({
      ref: "RoomAssignment.roomType",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Room Assignments"
    }),
    ratePlans: (0, import_fields6.relationship)({
      ref: "RatePlan.roomType",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Rate Plans"
    }),
    ...trackingFields
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      ...typeof resolvedData.name === "string" ? { name: resolvedData.name.trim() } : {},
      ...Number.isSafeInteger(resolvedData.baseRateMinor) ? { baseRate: resolvedData.baseRateMinor / 100 } : {}
    }),
    beforeOperation: async ({ operation, item, context }) => {
      if (operation !== "delete" || !item?.id) return;
      const roomTypeId = String(item.id);
      const [rooms, assignments, rates, inventory, channelReservations] = await Promise.all([
        context.prisma.room.count({ where: { roomTypeId } }),
        context.prisma.roomAssignment.count({ where: { roomTypeId } }),
        context.prisma.ratePlan.count({ where: { roomTypeId } }),
        context.prisma.roomInventory.count({ where: { roomTypeId } }),
        context.prisma.channelReservation.count({ where: { roomTypeId } })
      ]);
      if (rooms || assignments || rates || inventory || channelReservations) {
        throw new Error("Room type has operational history and cannot be deleted.");
      }
    }
  }
});

// features/keystone/models/RoomImage.ts
var import_core4 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/models/requiredRelationship.ts
function restrictRelation(model, relationName) {
  return model.replace(
    `@relation("${relationName}", fields:`,
    `@relation("${relationName}", onDelete: Restrict, fields:`
  );
}
var requiredRelationshipDb = {
  extendPrismaSchema(field) {
    return field.replaceAll("?", "");
  }
};

// features/keystone/models/RoomImage.ts
var storageInfrastructureConfigured = () => Boolean(
  process.env.S3_BUCKET_NAME && process.env.S3_REGION && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT
);
var canUseImageStorage = async (args) => {
  if (!permissions.canManageRooms(args) || !storageInfrastructureConfigured()) return false;
  const settings = await args.context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { id: true } });
  return Boolean(settings);
};
var RoomImage = (0, import_core4.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: canUseImageStorage,
      update: canUseImageStorage,
      delete: canUseImageStorage
    }
  },
  ui: {
    listView: {
      initialColumns: ["image", "imagePath", "altText", "roomType", "order", "isPrimary"]
    }
  },
  fields: {
    image: (0, import_fields7.image)({ storage: "my_images" }),
    imagePath: (0, import_fields7.text)({
      ui: {
        description: "Public path or remote URL used for seeded/storefront imagery when no uploaded image is present."
      }
    }),
    altText: (0, import_fields7.text)(),
    caption: (0, import_fields7.text)(),
    order: (0, import_fields7.integer)({ defaultValue: 0 }),
    isPrimary: (0, import_fields7.checkbox)({ defaultValue: false }),
    roomType: (0, import_fields7.relationship)({ ref: "RoomType.roomImages", db: requiredRelationshipDb }),
    metadata: (0, import_fields7.json)(),
    ...trackingFields
  }
});

// features/keystone/models/Room.ts
var import_core5 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var Room = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
      delete: permissions.canManageRooms
    }
  },
  ui: {
    listView: {
      initialColumns: ["roomNumber", "roomType", "floor", "status"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Basic information
    roomNumber: (0, import_fields8.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Room Number",
      ui: {
        description: "Unique room identifier (e.g., 101, 202A)"
      }
    }),
    // Room type relationship
    roomType: (0, import_fields8.relationship)({
      ref: "RoomType.rooms",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Location
    floor: (0, import_fields8.integer)({
      validation: { min: 0 },
      label: "Floor",
      ui: {
        description: "Floor number where the room is located"
      }
    }),
    // Status
    status: (0, import_fields8.select)({
      type: "string",
      access: { create: () => false, update: () => false },
      options: [
        { label: "Vacant", value: "vacant" },
        { label: "Occupied", value: "occupied" },
        { label: "Cleaning", value: "cleaning" },
        { label: "Maintenance", value: "maintenance" },
        { label: "Out of Order", value: "out_of_order" }
      ],
      defaultValue: "vacant",
      label: "Status",
      ui: {
        description: "Current room status"
      }
    }),
    // Housekeeping
    lastCleaned: (0, import_fields8.timestamp)({
      label: "Last Cleaned",
      ui: {
        description: "When the room was last cleaned"
      }
    }),
    // Notes
    notes: (0, import_fields8.text)({
      ui: {
        displayMode: "textarea",
        description: "Maintenance issues, special notes, etc."
      },
      label: "Notes"
    }),
    // Relationships
    housekeepingTasks: (0, import_fields8.relationship)({
      ref: "HousekeepingTask.room",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["taskType", "status", "assignedTo"],
        inlineCreate: { fields: ["taskType", "priority", "notes"] }
      },
      label: "Housekeeping Tasks"
    }),
    roomAssignments: (0, import_fields8.relationship)({
      ref: "RoomAssignment.room",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Room Assignments"
    }),
    ...trackingFields
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      ...typeof resolvedData.roomNumber === "string" ? { roomNumber: resolvedData.roomNumber.trim().toUpperCase() } : {}
    }),
    beforeOperation: async ({ operation, item, context }) => {
      if (operation !== "delete" || !item?.id) return;
      const [assignments, housekeeping, maintenance] = await Promise.all([
        context.prisma.roomAssignment.count({ where: { roomId: String(item.id) } }),
        context.prisma.housekeepingTask.count({ where: { roomId: String(item.id) } }),
        context.prisma.maintenanceRequest.count({ where: { roomId: String(item.id) } })
      ]);
      if (assignments || housekeeping || maintenance) {
        throw new Error("Room history exists; retire operational availability instead of deleting the room.");
      }
    }
  }
});

// features/keystone/models/RoomInventory.ts
var import_core6 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var RoomInventory = (0, import_core6.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["date", "roomType", "totalRooms", "bookedRooms", "availableRooms"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    inventoryKey: (0, import_fields9.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      db: { extendPrismaSchema: (field) => field.replace(' @default("")', "") },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "read" }, createView: { fieldMode: "hidden" } }
    }),
    // Date for this inventory record
    date: (0, import_fields9.timestamp)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Date",
      ui: {
        description: "Date for this inventory snapshot"
      }
    }),
    // Room type relationship
    roomType: (0, import_fields9.relationship)({
      ref: "RoomType",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Inventory counts
    totalRooms: (0, import_fields9.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Total Rooms",
      ui: {
        description: "Total number of rooms of this type"
      }
    }),
    bookedRooms: (0, import_fields9.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Booked Rooms",
      ui: {
        description: "Number of rooms currently booked"
      }
    }),
    blockedRooms: (0, import_fields9.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Blocked Rooms",
      ui: {
        description: "Number of rooms blocked (out of order, reserved, etc)"
      }
    }),
    // Virtual field for available rooms
    availableRooms: (0, import_fields9.virtual)({
      field: import_core6.graphql.field({
        type: import_core6.graphql.Int,
        resolve(item) {
          const total = item.totalRooms || 0;
          const booked = item.bookedRooms || 0;
          const blocked = item.blockedRooms || 0;
          return Math.max(0, total - booked - blocked);
        }
      }),
      ui: {
        description: "Calculated available rooms (total - booked - blocked)"
      }
    }),
    // Virtual field for availability status
    isAvailable: (0, import_fields9.virtual)({
      field: import_core6.graphql.field({
        type: import_core6.graphql.Boolean,
        resolve(item) {
          const total = item.totalRooms || 0;
          const booked = item.bookedRooms || 0;
          const blocked = item.blockedRooms || 0;
          const available = total - booked - blocked;
          return available > 0;
        }
      }),
      ui: {
        description: "Whether any rooms are available"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/HousekeepingTask.ts
var import_core7 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var HousekeepingTask = (0, import_core7.list)({
  access: {
    operation: {
      query: permissions.canManageHousekeeping,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["room", "taskType", "status", "priority", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Room relationship
    room: (0, import_fields10.relationship)({
      ref: "Room.housekeepingTasks",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "roomNumber"
      },
      label: "Room"
    }),
    // Task type
    taskType: (0, import_fields10.select)({
      type: "string",
      options: [
        { label: "Checkout Clean", value: "checkout_clean" },
        { label: "Stayover Clean", value: "stayover_clean" },
        { label: "Deep Clean", value: "deep_clean" },
        { label: "Maintenance", value: "maintenance" },
        { label: "Inspection", value: "inspection" },
        { label: "Turn Down", value: "turn_down" }
      ],
      validation: { isRequired: true },
      label: "Task Type",
      ui: {
        description: "Type of housekeeping task"
      }
    }),
    // Assignment
    assignedTo: (0, import_fields10.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Assigned To",
      hooks: {
        resolveInput({ operation, resolvedData, context }) {
          if (operation === "create" && !resolvedData.assignedTo && context.session?.itemId) {
            return { connect: { id: context.session.itemId } };
          }
          return resolvedData.assignedTo;
        }
      }
    }),
    // Priority
    priority: (0, import_fields10.integer)({
      defaultValue: 2,
      validation: { min: 1, max: 5 },
      label: "Priority",
      ui: {
        description: "Task priority (1 = highest, 5 = lowest)"
      }
    }),
    // Status
    status: (0, import_fields10.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Inspection Needed", value: "inspection_needed" },
        { label: "On Hold", value: "on_hold" }
      ],
      defaultValue: "pending",
      label: "Status",
      ui: {
        description: "Current task status"
      }
    }),
    // Timestamps
    startedAt: (0, import_fields10.timestamp)({
      label: "Started At",
      ui: {
        description: "When the task was started"
      }
    }),
    completedAt: (0, import_fields10.timestamp)({
      label: "Completed At",
      ui: {
        description: "When the task was completed"
      }
    }),
    // Notes
    notes: (0, import_fields10.text)({
      ui: {
        displayMode: "textarea",
        description: "Issues found, special instructions, etc."
      },
      label: "Notes"
    }),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === "update" && resolvedData.status) {
        if (resolvedData.status === "in_progress" && !item?.startedAt) {
          resolvedData.startedAt = (/* @__PURE__ */ new Date()).toISOString();
        }
        if (resolvedData.status === "completed" && !item?.completedAt) {
          resolvedData.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        }
      }
    }
  }
});

// features/keystone/models/RoomAssignment.ts
var import_core8 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var RoomAssignment = (0, import_core8.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["booking", "room", "roomType", "guestName", "ratePerNight"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Booking relationship
    booking: (0, import_fields11.relationship)({
      ref: "Booking.roomAssignments",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber"
      },
      label: "Booking"
    }),
    // Room relationship
    room: (0, import_fields11.relationship)({
      ref: "Room.roomAssignments",
      ui: {
        displayMode: "select",
        labelField: "roomNumber"
      },
      label: "Room"
    }),
    // Room type relationship
    roomType: (0, import_fields11.relationship)({
      ref: "RoomType.roomAssignments",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Rate
    ratePerNightMinor: (0, import_fields11.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Rate Per Night (minor units)" }),
    ratePerNight: (0, import_fields11.float)({
      validation: { min: 0 },
      label: "Rate Per Night",
      ui: {
        description: "Nightly rate for this room assignment"
      }
    }),
    // Guest information
    guestName: (0, import_fields11.text)({
      label: "Guest Name",
      ui: {
        description: "Name of guest assigned to this room"
      }
    }),
    // Special requests
    specialRequests: (0, import_fields11.text)({
      ui: {
        displayMode: "textarea",
        description: "Special requests or notes for this room"
      },
      label: "Special Requests"
    }),
    ...trackingFields
  }
});

// features/keystone/models/Booking.ts
var import_core9 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
var import_core10 = require("@keystone-6/core");

// features/keystone/lib/guestBookingAccess.ts
var import_node_crypto = require("node:crypto");
var GUEST_ACCESS_COOKIE = "hotel-guest-access";
var GUEST_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
var MAX_GUEST_ACCESS_ENTRIES = 20;
var BOOKING_ACCESS_DENIED_MESSAGE = "Reservation access could not be verified.";
function getGuestAccessSecret() {
  const secret = process.env.GUEST_ACCESS_SECRET || process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "hotel-guest-access-development-secret");
  if (secret.length < 32) throw new Error("Guest access signing is not configured.");
  return secret;
}
function normalizeEmail(email2) {
  return email2.trim().toLowerCase();
}
function encodePayload(entries) {
  return Buffer.from(JSON.stringify(entries), "utf8").toString("base64url");
}
function signPayload(payload) {
  return (0, import_node_crypto.createHmac)("sha256", getGuestAccessSecret()).update(payload).digest("base64url");
}
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && (0, import_node_crypto.timingSafeEqual)(leftBuffer, rightBuffer);
}
function parseCookies(cookieHeader) {
  if (!cookieHeader) return /* @__PURE__ */ new Map();
  return new Map(
    cookieHeader.split(";").map((part) => {
      const [rawName, ...rawValue] = part.trim().split("=");
      return [rawName, decodeURIComponent(rawValue.join("="))];
    })
  );
}
function getCookieHeader(context) {
  return context.req?.headers?.cookie || context.req?.headers?.get?.("cookie") || "";
}
function getRequestHeader(context, name) {
  return context.req?.headers?.[name] || context.req?.headers?.get?.(name) || "";
}
function parseGuestAccessEntries(context) {
  const value = parseCookies(getCookieHeader(context)).get(GUEST_ACCESS_COOKIE);
  if (!value) return [];
  const [payload, signature2] = value.split(".");
  if (!payload || !signature2 || !safeEqual(signPayload(payload), signature2)) return [];
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded)) return [];
    return decoded.filter(
      (entry) => typeof entry?.bookingId === "string" && typeof entry?.token === "string" && entry.bookingId.length > 0 && entry.token.length >= 32
    ).slice(-MAX_GUEST_ACCESS_ENTRIES);
  } catch {
    return [];
  }
}
function appendSetCookieHeader(context, cookie) {
  if (!context.res?.setHeader) return;
  const existing = context.res.getHeader?.("Set-Cookie");
  const existingValues = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  context.res.setHeader("Set-Cookie", [...existingValues, cookie]);
}
function shouldUseSecureCookie(context) {
  const forwardedProtocol = String(getRequestHeader(context, "x-forwarded-proto")).toLowerCase();
  const host = String(getRequestHeader(context, "host")).toLowerCase();
  return forwardedProtocol === "https" || process.env.NODE_ENV === "production" || Boolean(process.env.PORTLESS_URL && !host.startsWith("127.0.0.1") && !host.startsWith("localhost"));
}
function createGuestAccessToken() {
  return (0, import_node_crypto.randomBytes)(32).toString("base64url");
}
function hashGuestAccessToken(token) {
  return (0, import_node_crypto.createHash)("sha256").update(token).digest("hex");
}
function guestAccessTokenMatches(tokenHash, token) {
  if (!tokenHash || !token || token.length < 32) return false;
  return safeEqual(tokenHash, hashGuestAccessToken(token));
}
function setGuestBookingAccess(context, bookingId, token) {
  const entries = parseGuestAccessEntries(context).filter((entry) => entry.bookingId !== bookingId);
  entries.push({ bookingId, token });
  const payload = encodePayload(entries.slice(-MAX_GUEST_ACCESS_ENTRIES));
  const value = `${payload}.${signPayload(payload)}`;
  const secure = shouldUseSecureCookie(context) ? "; Secure" : "";
  appendSetCookieHeader(
    context,
    `${GUEST_ACCESS_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_ACCESS_MAX_AGE_SECONDS}${secure}`
  );
}
function getGuestBookingToken(context, bookingId) {
  return parseGuestAccessEntries(context).find((entry) => entry.bookingId === bookingId)?.token || null;
}
function canManageBookingRecords(context) {
  return Boolean(
    context.session?.data?.role?.canManageBookings || context.session?.data?.role?.canManagePayments
  );
}
async function assertGuestBookingAccess(context, bookingId) {
  const sudoContext = context.sudo();
  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      guestEmail
      guestAccessTokenHash
    `
  });
  if (!booking) throw new Error(BOOKING_ACCESS_DENIED_MESSAGE);
  if (canManageBookingRecords(context)) return booking;
  const token = getGuestBookingToken(context, bookingId);
  if (!token || !guestAccessTokenMatches(booking.guestAccessTokenHash, token)) {
    throw new Error(BOOKING_ACCESS_DENIED_MESSAGE);
  }
  return booking;
}
async function issueGuestBookingAccess(context, bookingId) {
  const token = createGuestAccessToken();
  await context.sudo().query.Booking.updateOne({
    where: { id: bookingId },
    data: {
      guestAccessTokenHash: hashGuestAccessToken(token),
      guestAccessTokenIssuedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  setGuestBookingAccess(context, bookingId, token);
  return token;
}
async function verifyBookingEmailOwnership(context, booking, email2) {
  if (!email2 || normalizeEmail(booking.guestEmail || "") !== normalizeEmail(email2)) {
    throw new Error(BOOKING_ACCESS_DENIED_MESSAGE);
  }
  await issueGuestBookingAccess(context, booking.id);
}
async function ensureBookingHasGuestAccess(context, bookingId) {
  const booking = await context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: "id guestAccessTokenHash"
  });
  if (!booking) throw new Error("Booking not found.");
  if (booking.guestAccessTokenHash) return false;
  const token = createGuestAccessToken();
  await context.sudo().query.Booking.updateOne({
    where: { id: bookingId },
    data: {
      guestAccessTokenHash: hashGuestAccessToken(token),
      guestAccessTokenIssuedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  return true;
}
function getGuestAccessBookingIds(context) {
  return parseGuestAccessEntries(context).map((entry) => entry.bookingId);
}

// features/keystone/models/Booking.ts
function generateConfirmationNumber() {
  const timestamp33 = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${timestamp33}-${random}`;
}
var Booking = (0, import_core9.list)({
  db: {
    extendPrismaSchema: (model) => [
      "Booking_billingFolio",
      "Booking_groupBlock",
      "Booking_groupBlockAllocation"
    ].reduce((schema, relationName) => restrictRelation(schema, relationName), model).replace(
      "\n}",
      [
        '\n  @@index([status, checkInDate, checkOutDate], map: "Booking_status_stay_idx")',
        '  @@index([checkOutDate, status], map: "Booking_departure_status_idx")',
        '  @@index([holdExpiresAt, status], map: "Booking_hold_expiry_idx")',
        "}"
      ].join("\n")
    )
  },
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["confirmationNumber", "guestName", "checkInDate", "checkOutDate", "status", "totalAmount"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Confirmation number (auto-generated)
    confirmationNumber: (0, import_fields12.text)({
      isIndexed: "unique",
      label: "Confirmation Number",
      ui: {
        description: "Auto-generated booking confirmation number",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      hooks: {
        resolveInput({ operation, resolvedData }) {
          if (operation === "create") {
            return generateConfirmationNumber();
          }
          return resolvedData.confirmationNumber;
        }
      }
    }),
    // Guest information
    guestName: (0, import_fields12.text)({
      validation: { isRequired: true },
      label: "Guest Name",
      ui: {
        description: "Primary guest name"
      }
    }),
    guestEmail: (0, import_fields12.text)({
      label: "Guest Email",
      ui: {
        description: "Contact email for the booking"
      }
    }),
    guestPhone: (0, import_fields12.text)({
      label: "Guest Phone",
      ui: {
        description: "Contact phone number"
      }
    }),
    // Dates
    checkInDate: (0, import_fields12.timestamp)({
      validation: { isRequired: true },
      label: "Check-In Date",
      ui: {
        description: "Expected check-in date and time"
      }
    }),
    checkOutDate: (0, import_fields12.timestamp)({
      validation: { isRequired: true },
      label: "Check-Out Date",
      ui: {
        description: "Expected check-out date and time"
      }
    }),
    // Computed number of nights
    numberOfNights: (0, import_fields12.virtual)({
      field: import_core10.graphql.field({
        type: import_core10.graphql.Int,
        resolve(item) {
          if (item.checkInDate && item.checkOutDate) {
            const checkIn = new Date(item.checkInDate);
            const checkOut = new Date(item.checkOutDate);
            const diffTime = checkOut.getTime() - checkIn.getTime();
            const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
            return diffDays > 0 ? diffDays : 0;
          }
          return 0;
        }
      }),
      ui: {
        description: "Calculated number of nights"
      }
    }),
    // Guest count
    numberOfGuests: (0, import_fields12.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Number of Guests",
      ui: {
        description: "Total number of guests"
      }
    }),
    numberOfAdults: (0, import_fields12.integer)({
      validation: { min: 1 },
      defaultValue: 1,
      label: "Number of Adults"
    }),
    numberOfChildren: (0, import_fields12.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Number of Children"
    }),
    // Integer minor units are authoritative. Float fields remain read-compatible
    // only for the expand/contract migration window.
    roomRateMinor: (0, import_fields12.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Room Rate (minor units)" }),
    taxAmountMinor: (0, import_fields12.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Tax (minor units)" }),
    feesAmountMinor: (0, import_fields12.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Fees (minor units)" }),
    totalAmountMinor: (0, import_fields12.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Total (minor units)" }),
    depositAmountMinor: (0, import_fields12.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Deposit (minor units)" }),
    balanceDueMinor: (0, import_fields12.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Balance due (minor units)" }),
    currencyCode: (0, import_fields12.text)({ validation: { isRequired: true }, defaultValue: "USD" }),
    roomRate: (0, import_fields12.float)({ validation: { min: 0 }, label: "Legacy Room Rate" }),
    taxAmount: (0, import_fields12.float)({ validation: { min: 0 }, defaultValue: 0, label: "Legacy Tax Amount" }),
    feesAmount: (0, import_fields12.float)({ validation: { min: 0 }, defaultValue: 0, label: "Legacy Fees Amount" }),
    totalAmount: (0, import_fields12.float)({ validation: { min: 0 }, label: "Legacy Total Amount" }),
    depositAmount: (0, import_fields12.float)({ validation: { min: 0 }, defaultValue: 0, label: "Legacy Deposit Amount" }),
    balanceDue: (0, import_fields12.float)({ validation: { min: 0 }, label: "Legacy Balance Due" }),
    ratePlan: (0, import_fields12.relationship)({ ref: "RatePlan.bookings", ui: { displayMode: "select", labelField: "name" } }),
    pricingVersion: (0, import_fields12.text)({ defaultValue: "legacy-v1" }),
    pricingRevision: (0, import_fields12.integer)({ validation: { isRequired: true, min: 1 }, defaultValue: 1 }),
    pricingSnapshot: (0, import_fields12.json)({ defaultValue: {} }),
    // Status
    status: (0, import_fields12.select)({
      type: "string",
      access: {
        update: () => false
      },
      options: [
        { label: "Pending", value: "pending" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Checked In", value: "checked_in" },
        { label: "Checked Out", value: "checked_out" },
        { label: "Cancellation Pending", value: "cancellation_pending" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No Show", value: "no_show" }
      ],
      defaultValue: "pending",
      label: "Status",
      ui: {
        description: "Current booking status"
      }
    }),
    // Payment status
    paymentStatus: (0, import_fields12.select)({
      type: "string",
      access: {
        update: () => false
      },
      options: [
        { label: "Unpaid", value: "unpaid" },
        { label: "Partial", value: "partial" },
        { label: "Paid", value: "paid" },
        { label: "Refunded", value: "refunded" }
      ],
      defaultValue: "unpaid",
      label: "Payment Status"
    }),
    // Booking source
    source: (0, import_fields12.select)({
      type: "string",
      options: [
        { label: "Direct", value: "direct" },
        { label: "Website", value: "website" },
        { label: "Phone", value: "phone" },
        { label: "Walk In", value: "walk_in" },
        { label: "OTA", value: "ota" },
        { label: "Corporate", value: "corporate" },
        { label: "Group", value: "group" }
      ],
      defaultValue: "direct",
      label: "Booking Source"
    }),
    // Special requests
    specialRequests: (0, import_fields12.text)({
      ui: {
        displayMode: "textarea",
        description: "Guest special requests and notes"
      },
      label: "Special Requests"
    }),
    // Internal notes
    internalNotes: (0, import_fields12.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal staff notes"
      },
      label: "Internal Notes"
    }),
    guestAccessTokenHash: (0, import_fields12.text)({
      isIndexed: true,
      access: {
        read: permissions.canManageBookings,
        create: permissions.canManageBookings,
        update: permissions.canManageBookings
      },
      ui: {
        itemView: { fieldMode: "hidden" },
        createView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    guestAccessTokenIssuedAt: (0, import_fields12.timestamp)({
      access: {
        read: permissions.canManageBookings,
        create: permissions.canManageBookings,
        update: permissions.canManageBookings
      },
      ui: {
        itemView: { fieldMode: "hidden" },
        createView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    // Relationships
    roomAssignments: (0, import_fields12.relationship)({
      ref: "RoomAssignment.booking",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["room", "roomType", "guestName", "ratePerNight"],
        inlineCreate: { fields: ["room", "roomType", "guestName", "ratePerNight", "specialRequests"] },
        inlineEdit: { fields: ["room", "roomType", "guestName", "ratePerNight", "specialRequests"] }
      },
      label: "Room Assignments"
    }),
    // Guest profile relationship
    guestProfile: (0, import_fields12.relationship)({
      ref: "Guest.bookings",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      label: "Guest Profile"
    }),
    // Legacy guest relationship (for backwards compatibility with User)
    guest: (0, import_fields12.relationship)({
      ref: "User.bookings",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "User Account"
    }),
    folio: (0, import_fields12.relationship)({
      ref: "Folio.booking",
      ui: {
        displayMode: "select",
        labelField: "folioNumber",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      label: "Primary Folio"
    }),
    billingFolio: (0, import_fields12.relationship)({
      ref: "Folio.billedBookings",
      ui: { displayMode: "select", labelField: "folioNumber" },
      label: "Billing Folio"
    }),
    groupBlock: (0, import_fields12.relationship)({
      ref: "GroupBlock.bookings",
      ui: { displayMode: "select", labelField: "name" },
      label: "Group Block"
    }),
    groupBlockAllocation: (0, import_fields12.relationship)({
      ref: "GroupBlockAllocation.bookings",
      ui: { displayMode: "select", labelField: "allocationKey" },
      label: "Group Allocation"
    }),
    lineItems: (0, import_fields12.relationship)({
      ref: "ReservationLineItem.reservation",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["type", "description", "totalPrice", "date"],
        inlineCreate: { fields: [] },
        inlineEdit: { fields: [] }
      },
      label: "Reservation Snapshot Lines"
    }),
    // Payments relationship
    payments: (0, import_fields12.relationship)({
      ref: "BookingPayment.booking",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["paymentReference", "amount", "paymentType", "status"],
        inlineCreate: { fields: ["paymentType", "amount", "paymentMethod", "description"] },
        inlineEdit: { fields: ["paymentType", "amount", "paymentMethod", "status", "description"] }
      },
      label: "Payments"
    }),
    paymentSessions: (0, import_fields12.relationship)({
      ref: "BookingPaymentSession.booking",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Payment Sessions"
    }),
    paymentEvents: (0, import_fields12.relationship)({
      ref: "PaymentEvent.booking",
      many: true,
      ui: { displayMode: "count" }
    }),
    refundIntents: (0, import_fields12.relationship)({
      ref: "RefundIntent.booking",
      many: true,
      ui: { displayMode: "count" }
    }),
    modificationRequests: (0, import_fields12.relationship)({
      ref: "BookingModificationRequest.booking",
      many: true,
      ui: { displayMode: "count" }
    }),
    // Timestamps
    holdExpiresAt: (0, import_fields12.timestamp)({ ui: { itemView: { fieldMode: "read" } } }),
    confirmedAt: (0, import_fields12.timestamp)({
      label: "Confirmed At",
      ui: {
        description: "When the booking was confirmed"
      }
    }),
    checkedInAt: (0, import_fields12.timestamp)({
      label: "Checked In At",
      ui: {
        description: "Actual check-in time"
      }
    }),
    checkedOutAt: (0, import_fields12.timestamp)({
      label: "Checked Out At",
      ui: {
        description: "Actual check-out time"
      }
    }),
    cancelledAt: (0, import_fields12.timestamp)({
      label: "Cancelled At",
      ui: {
        description: "When the booking was cancelled"
      }
    }),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === "update" && resolvedData.status) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (resolvedData.status === "confirmed" && !item?.confirmedAt) {
          resolvedData.confirmedAt = now;
        }
        if (resolvedData.status === "checked_in" && !item?.checkedInAt) {
          resolvedData.checkedInAt = now;
        }
        if (resolvedData.status === "checked_out" && !item?.checkedOutAt) {
          resolvedData.checkedOutAt = now;
        }
        if (resolvedData.status === "cancelled" && !item?.cancelledAt) {
          resolvedData.cancelledAt = now;
        }
      }
    },
    afterOperation: async ({ operation, item, context }) => {
      if (operation === "create" && item?.id) {
        await ensureBookingHasGuestAccess(context, String(item.id));
      }
    }
  }
});

// features/keystone/models/BookingPayment.ts
var import_core11 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
function generatePaymentReference() {
  const timestamp33 = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PAY-${timestamp33}-${random}`;
}
var BookingPayment = (0, import_core11.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["paymentReference", "booking", "amount", "paymentType", "status", "createdAt"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Payment reference (auto-generated)
    paymentReference: (0, import_fields13.text)({
      isIndexed: "unique",
      label: "Payment Reference",
      ui: {
        description: "Auto-generated payment reference number",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      hooks: {
        resolveInput({ operation, resolvedData }) {
          if (operation === "create") {
            return generatePaymentReference();
          }
          return resolvedData.paymentReference;
        }
      }
    }),
    // Payment type
    paymentType: (0, import_fields13.select)({
      type: "string",
      options: [
        { label: "Deposit", value: "deposit" },
        { label: "Balance", value: "balance" },
        { label: "Full Payment", value: "full_payment" },
        { label: "Additional Charge", value: "additional_charge" },
        { label: "Refund", value: "refund" },
        { label: "Incidental", value: "incidental" }
      ],
      defaultValue: "full_payment",
      validation: { isRequired: true },
      label: "Payment Type",
      ui: {
        description: "Type of payment transaction"
      }
    }),
    // Signed integer minor units are authoritative; amount is legacy display compatibility.
    amountMinor: (0, import_fields13.integer)({ validation: { isRequired: true }, defaultValue: 0, label: "Amount (minor units)" }),
    amount: (0, import_fields13.float)({
      validation: { isRequired: true },
      label: "Amount",
      ui: {
        description: "Payment amount (negative for refunds)"
      }
    }),
    // Currency
    currency: (0, import_fields13.text)({
      defaultValue: "USD",
      validation: { isRequired: true },
      label: "Currency",
      ui: {
        description: "Currency code (e.g., USD, EUR)"
      }
    }),
    // Payment method
    paymentMethod: (0, import_fields13.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit_card" },
        { label: "Debit Card", value: "debit_card" },
        { label: "Cash", value: "cash" },
        { label: "Bank Transfer", value: "bank_transfer" },
        { label: "Check", value: "check" },
        { label: "PayPal", value: "paypal" },
        { label: "Apple Pay", value: "apple_pay" },
        { label: "Google Pay", value: "google_pay" },
        { label: "Other", value: "other" }
      ],
      defaultValue: "credit_card",
      validation: { isRequired: true },
      label: "Payment Method"
    }),
    // Status
    status: (0, import_fields13.select)({
      type: "string",
      access: { update: () => false },
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" }
      ],
      defaultValue: "pending",
      label: "Status",
      ui: {
        description: "Current payment status"
      }
    }),
    // Provider-specific identifiers
    providerPaymentId: (0, import_fields13.text)({
      label: "Provider Payment ID",
      ui: {
        description: "Primary payment identifier returned by the payment provider",
        createView: { fieldMode: "hidden" }
      }
    }),
    providerCaptureId: (0, import_fields13.text)({
      label: "Provider Capture ID",
      ui: {
        description: "Capture identifier returned by the payment provider",
        createView: { fieldMode: "hidden" }
      }
    }),
    providerRefundId: (0, import_fields13.text)({
      label: "Provider Refund ID",
      ui: {
        description: "Refund identifier returned by the payment provider",
        createView: { fieldMode: "hidden" }
      }
    }),
    providerData: (0, import_fields13.json)({
      label: "Provider Data",
      defaultValue: {},
      ui: {
        description: "Raw provider payload for reconciliation and debugging",
        createView: { fieldMode: "hidden" }
      }
    }),
    stripePaymentIntentId: (0, import_fields13.text)({
      label: "Stripe Payment Intent ID",
      ui: {
        description: "Legacy Stripe payment intent ID for backwards compatibility",
        createView: { fieldMode: "hidden" }
      }
    }),
    stripeChargeId: (0, import_fields13.text)({
      label: "Stripe Charge ID",
      ui: {
        description: "Legacy Stripe charge ID",
        createView: { fieldMode: "hidden" }
      }
    }),
    stripeRefundId: (0, import_fields13.text)({
      label: "Stripe Refund ID",
      ui: {
        description: "Legacy Stripe refund ID for refund transactions",
        createView: { fieldMode: "hidden" }
      }
    }),
    // Card details (masked)
    cardBrand: (0, import_fields13.text)({
      label: "Card Brand",
      ui: {
        description: "Card brand (Visa, Mastercard, etc.)",
        itemView: { fieldMode: "read" }
      }
    }),
    cardLast4: (0, import_fields13.text)({
      label: "Card Last 4",
      ui: {
        description: "Last 4 digits of card number",
        itemView: { fieldMode: "read" }
      }
    }),
    cardExpMonth: (0, import_fields13.text)({
      label: "Card Exp Month",
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    cardExpYear: (0, import_fields13.text)({
      label: "Card Exp Year",
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    // Receipt/invoice info
    receiptEmail: (0, import_fields13.text)({
      label: "Receipt Email",
      ui: {
        description: "Email address for receipt"
      }
    }),
    receiptUrl: (0, import_fields13.text)({
      label: "Receipt URL",
      ui: {
        description: "URL to Stripe receipt",
        itemView: { fieldMode: "read" }
      }
    }),
    // Description/notes
    description: (0, import_fields13.text)({
      ui: {
        displayMode: "textarea",
        description: "Payment description or notes"
      },
      label: "Description"
    }),
    // Internal notes
    internalNotes: (0, import_fields13.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal staff notes"
      },
      label: "Internal Notes"
    }),
    // Failure reason
    failureReason: (0, import_fields13.text)({
      label: "Failure Reason",
      ui: {
        description: "Reason for payment failure",
        itemView: { fieldMode: "read" }
      }
    }),
    // Relationships
    booking: (0, import_fields13.relationship)({
      ref: "Booking.payments",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber"
      },
      label: "Booking"
    }),
    paymentProvider: (0, import_fields13.relationship)({
      ref: "PaymentProvider.bookingPayments",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Payment Provider"
    }),
    paymentSession: (0, import_fields13.relationship)({
      ref: "BookingPaymentSession.payment",
      ui: {
        displayMode: "select",
        labelField: "id"
      },
      label: "Payment Session",
      db: {
        foreignKey: true
      }
    }),
    events: (0, import_fields13.relationship)({
      ref: "PaymentEvent.payment",
      many: true,
      ui: { displayMode: "count" }
    }),
    refundIntents: (0, import_fields13.relationship)({
      ref: "RefundIntent.sourcePayment",
      many: true,
      ui: { displayMode: "count" }
    }),
    // Processed by (staff member)
    processedBy: (0, import_fields13.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Processed By"
    }),
    // Timestamps
    processedAt: (0, import_fields13.timestamp)({
      label: "Processed At",
      ui: {
        description: "When the payment was processed",
        itemView: { fieldMode: "read" }
      }
    }),
    refundedAt: (0, import_fields13.timestamp)({
      label: "Refunded At",
      ui: {
        description: "When the payment was refunded",
        itemView: { fieldMode: "read" }
      }
    }),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if ((operation === "update" || operation === "delete") && ["completed", "refunded"].includes(String(item?.status || ""))) {
        throw new Error("Settled payment records are immutable. Post an append-only adjustment instead.");
      }
      if (operation === "update" && resolvedData.status) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (resolvedData.status === "completed" && !item?.processedAt) {
          resolvedData.processedAt = now;
        }
        if (resolvedData.status === "refunded" && !item?.refundedAt) {
          resolvedData.refundedAt = now;
        }
      }
    }
  }
});

// features/keystone/models/BookingPaymentSession.ts
var import_core12 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var BookingPaymentSession = (0, import_core12.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["booking", "paymentProvider", "amount", "isSelected", "isInitiated", "createdAt"]
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    isSelected: (0, import_fields14.checkbox)({
      defaultValue: false
    }),
    isInitiated: (0, import_fields14.checkbox)({
      defaultValue: false
    }),
    amount: (0, import_fields14.integer)({
      validation: { isRequired: true },
      label: "Amount (cents)"
    }),
    formattedAmount: (0, import_fields14.virtual)({
      field: import_core12.graphql.field({
        type: import_core12.graphql.String,
        resolve(item) {
          const amount = Number(item.amount || 0) / 100;
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
          }).format(amount);
        }
      })
    }),
    data: (0, import_fields14.json)({
      defaultValue: {}
    }),
    idempotencyKey: (0, import_fields14.text)({
      isIndexed: "unique"
    }),
    booking: (0, import_fields14.relationship)({
      ref: "Booking.paymentSessions",
      db: requiredRelationshipDb
    }),
    paymentProvider: (0, import_fields14.relationship)({
      ref: "PaymentProvider.bookingPaymentSessions",
      db: requiredRelationshipDb
    }),
    payment: (0, import_fields14.relationship)({
      ref: "BookingPayment.paymentSession",
      ui: {
        itemView: { fieldMode: "read" },
        createView: { fieldMode: "hidden" }
      }
    }),
    paymentAuthorizedAt: (0, import_fields14.timestamp)(),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, item, context }) => {
      if (operation !== "update" && operation !== "delete" || !item?.id) return;
      const settledPayment = await context.prisma.bookingPayment.findUnique({
        where: { paymentSessionId: String(item.id) },
        select: { id: true }
      });
      if (settledPayment) {
        throw new Error("Settled payment sessions are immutable.");
      }
    }
  }
});

// features/keystone/models/PaymentProvider.ts
var import_core13 = require("@keystone-6/core");
var import_access12 = require("@keystone-6/core/access");
var import_fields15 = require("@keystone-6/core/fields");

// features/keystone/lib/sensitiveData.ts
var import_node_crypto2 = require("node:crypto");
function key() {
  const secret = process.env.HOTEL_DATA_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : "local-hotel-data-encryption-key-change-me");
  if (secret.length < 32) throw new Error("Hotel data encryption is not configured.");
  return (0, import_node_crypto2.createHash)("sha256").update(secret).digest();
}
function encryptSensitiveText(value) {
  const text41 = String(value || "").trim();
  if (!text41 || text41.startsWith("enc:v1:")) return text41;
  const iv = (0, import_node_crypto2.randomBytes)(12);
  const cipher = (0, import_node_crypto2.createCipheriv)("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(text41, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
function decryptSensitiveText(value) {
  const text41 = String(value || "");
  if (!text41.startsWith("enc:v1:")) return text41;
  const [, , iv, tag, encrypted] = text41.split(":");
  const decipher = (0, import_node_crypto2.createDecipheriv)("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

// features/keystone/models/PaymentProvider.ts
var canManagePaymentIntegrations = ({ session }) => permissions.canManagePayments({ session }) && permissions.canManageIntegrations({ session });
var PaymentProvider = (0, import_core13.list)({
  access: {
    operation: {
      query: canManagePaymentIntegrations,
      create: canManagePaymentIntegrations,
      update: canManagePaymentIntegrations,
      delete: canManagePaymentIntegrations
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled", "createdAt"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    name: (0, import_fields15.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields15.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores'
        }
      }
    }),
    isInstalled: (0, import_fields15.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields15.json)({
      defaultValue: {},
      access: {
        read: import_access12.denyAll,
        create: canManagePaymentIntegrations,
        update: canManagePaymentIntegrations
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          const credentials = resolvedData.credentials;
          if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return credentials;
          return Object.fromEntries(Object.entries(credentials).map(([key3, value]) => [
            key3,
            key3 === "sandbox" ? Boolean(value) : encryptSensitiveText(value)
          ]));
        }
      },
      ui: {
        itemView: { fieldMode: "hidden" },
        createView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    metadata: (0, import_fields15.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields15.text)({ validation: { isRequired: true } }),
    capturePaymentFunction: (0, import_fields15.text)({ validation: { isRequired: true } }),
    refundPaymentFunction: (0, import_fields15.text)({ validation: { isRequired: true } }),
    getPaymentStatusFunction: (0, import_fields15.text)({ validation: { isRequired: true } }),
    generatePaymentLinkFunction: (0, import_fields15.text)({ validation: { isRequired: true } }),
    handleWebhookFunction: (0, import_fields15.text)({ validation: { isRequired: true } }),
    bookingPaymentSessions: (0, import_fields15.relationship)({
      ref: "BookingPaymentSession.paymentProvider",
      many: true
    }),
    bookingPayments: (0, import_fields15.relationship)({
      ref: "BookingPayment.paymentProvider",
      many: true
    }),
    refundIntents: (0, import_fields15.relationship)({
      ref: "RefundIntent.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/ReservationLineItem.ts
var import_core14 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var ReservationLineItem = (0, import_core14.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["reservation", "type", "description", "quantity", "totalPrice", "date"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Reservation relationship
    reservation: (0, import_fields16.relationship)({
      ref: "Booking.lineItems",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber"
      },
      label: "Reservation"
    }),
    snapshotStatus: (0, import_fields16.select)({
      type: "string",
      validation: { isRequired: true },
      defaultValue: "active",
      options: [{ label: "Active", value: "active" }, { label: "Superseded", value: "superseded" }],
      ui: { itemView: { fieldMode: "read" } }
    }),
    supersededAt: (0, import_fields16.timestamp)({ ui: { itemView: { fieldMode: "read" } } }),
    snapshotKey: (0, import_fields16.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: {
        description: "Stable idempotency key for this immutable reservation snapshot line",
        itemView: { fieldMode: "read" }
      }
    }),
    currencyCode: (0, import_fields16.text)({
      defaultValue: "USD",
      validation: { isRequired: true }
    }),
    nightIndex: (0, import_fields16.integer)({ validation: { min: 1 } }),
    roomTypeIdSnapshot: (0, import_fields16.text)(),
    roomTypeNameSnapshot: (0, import_fields16.text)(),
    ratePlanIdSnapshot: (0, import_fields16.text)(),
    ratePlanNameSnapshot: (0, import_fields16.text)(),
    ratePlanDescriptionSnapshot: (0, import_fields16.text)({ ui: { displayMode: "textarea" } }),
    cancellationPolicySnapshot: (0, import_fields16.text)(),
    mealPlanSnapshot: (0, import_fields16.text)(),
    imagePathSnapshot: (0, import_fields16.text)(),
    imageAltTextSnapshot: (0, import_fields16.text)(),
    taxRateBasisPoints: (0, import_fields16.integer)({ validation: { min: 0 } }),
    pricingSourceSnapshot: (0, import_fields16.text)(),
    // Type of charge
    type: (0, import_fields16.select)({
      type: "string",
      options: [
        { label: "Room", value: "room" },
        { label: "Food & Beverage", value: "food_beverage" },
        { label: "Spa", value: "spa" },
        { label: "Parking", value: "parking" },
        { label: "Minibar", value: "minibar" },
        { label: "Laundry", value: "laundry" },
        { label: "Phone", value: "phone" },
        { label: "Internet", value: "internet" },
        { label: "Service Fee", value: "service_fee" },
        { label: "Tax", value: "tax" },
        { label: "Other", value: "other" }
      ],
      validation: { isRequired: true },
      label: "Type",
      ui: {
        description: "Type of charge or service"
      }
    }),
    // Description
    description: (0, import_fields16.text)({
      validation: { isRequired: true },
      ui: {
        displayMode: "textarea",
        description: "Description of the charge or service"
      },
      label: "Description"
    }),
    // Quantity
    quantity: (0, import_fields16.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of units"
      }
    }),
    // Unit price (in cents)
    unitPrice: (0, import_fields16.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Unit Price (cents)",
      ui: {
        description: "Price per unit in cents"
      }
    }),
    // Total price (in cents)
    totalPrice: (0, import_fields16.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Total Price (cents)",
      ui: {
        description: "Total price (quantity \xD7 unit price) in cents"
      }
    }),
    // Date of charge
    date: (0, import_fields16.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Date",
      ui: {
        description: "When this charge was incurred"
      }
    }),
    // Posted by (staff member who added the charge)
    postedBy: (0, import_fields16.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member who posted this charge"
      },
      label: "Posted By"
    }),
    // Notes
    notes: (0, import_fields16.text)({
      ui: {
        displayMode: "textarea",
        description: "Additional notes about this charge"
      },
      label: "Notes"
    }),
    ...trackingFields
  },
  hooks: {
    resolveInput: async ({ resolvedData, item, operation }) => {
      if (resolvedData.quantity !== void 0 || resolvedData.unitPrice !== void 0) {
        const quantity = resolvedData.quantity ?? item?.quantity ?? 1;
        const unitPrice = resolvedData.unitPrice ?? item?.unitPrice ?? 0;
        resolvedData.totalPrice = quantity * unitPrice;
      }
      return resolvedData;
    }
  }
});

// features/keystone/models/Guest.ts
var import_core15 = require("@keystone-6/core");
var import_access15 = require("@keystone-6/core/access");
var import_fields17 = require("@keystone-6/core/fields");
var Guest = (0, import_core15.list)({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: permissions.canManageGuests,
      update: permissions.canManageGuests,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["firstName", "lastName", "email", "phone", "loyaltyNumber"]
    },
    itemView: {
      defaultFieldMode: "edit"
    },
    labelField: "email"
  },
  fields: {
    // Basic info
    firstName: (0, import_fields17.text)({
      validation: { isRequired: true },
      label: "First Name"
    }),
    lastName: (0, import_fields17.text)({
      validation: { isRequired: true },
      label: "Last Name"
    }),
    email: (0, import_fields17.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      label: "Email",
      ui: {
        description: "Primary contact email"
      }
    }),
    phone: (0, import_fields17.text)({
      label: "Phone Number",
      ui: {
        description: "Primary contact phone number"
      }
    }),
    // Guest preferences
    preferences: (0, import_fields17.json)({
      label: "Guest Preferences",
      ui: {
        description: "JSON object storing guest preferences (pillow type, floor preference, etc.)",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {
        pillowType: "standard",
        floorPreference: "any",
        smokingPreference: "non-smoking",
        bedType: "any",
        earlyCheckIn: false,
        lateCheckOut: false,
        specialDiet: "",
        accessibility: []
      }
    }),
    // Loyalty program
    loyaltyNumber: (0, import_fields17.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      label: "Loyalty Number",
      ui: {
        description: "Guest loyalty program number"
      }
    }),
    loyaltyTier: (0, import_fields17.select)({
      type: "string",
      options: [
        { label: "Bronze", value: "bronze" },
        { label: "Silver", value: "silver" },
        { label: "Gold", value: "gold" },
        { label: "Platinum", value: "platinum" },
        { label: "Diamond", value: "diamond" }
      ],
      defaultValue: "bronze",
      label: "Loyalty Tier",
      ui: {
        description: "Current loyalty program tier"
      }
    }),
    loyaltyPoints: (0, import_fields17.text)({
      label: "Loyalty Points",
      ui: {
        description: "Current accumulated loyalty points"
      }
    }),
    // Communication preferences
    communicationPreferences: (0, import_fields17.json)({
      label: "Communication Preferences",
      ui: {
        description: "How the guest prefers to be contacted",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {
        emailMarketing: true,
        smsNotifications: false,
        phoneNotifications: false,
        preferredLanguage: "en",
        newsletterSubscribed: false
      }
    }),
    // Identity verification
    idType: (0, import_fields17.select)({
      type: "string",
      options: [
        { label: "Passport", value: "passport" },
        { label: "Driver's License", value: "drivers_license" },
        { label: "National ID", value: "national_id" },
        { label: "Other", value: "other" }
      ],
      label: "ID Type",
      ui: {
        description: "Type of identification on file"
      }
    }),
    idNumber: (0, import_fields17.text)({
      label: "ID Number",
      access: { read: import_access15.denyAll, create: permissions.canManageGuests, update: permissions.canManageGuests },
      hooks: { resolveInput: ({ resolvedData }) => encryptSensitiveText(resolvedData) },
      ui: {
        description: "Encrypted identification document number; never returned by generic GraphQL."
      }
    }),
    nationality: (0, import_fields17.text)({
      label: "Nationality",
      ui: {
        description: "Guest nationality/country"
      }
    }),
    // Address
    address1: (0, import_fields17.text)({
      label: "Address Line 1"
    }),
    address2: (0, import_fields17.text)({
      label: "Address Line 2"
    }),
    city: (0, import_fields17.text)({
      label: "City"
    }),
    state: (0, import_fields17.text)({
      label: "State/Province"
    }),
    postalCode: (0, import_fields17.text)({
      label: "Postal Code"
    }),
    country: (0, import_fields17.text)({
      label: "Country"
    }),
    // Company info (for business travelers)
    company: (0, import_fields17.text)({
      label: "Company",
      ui: {
        description: "Company name for business travelers"
      }
    }),
    // Notes and flags
    specialNotes: (0, import_fields17.text)({
      ui: {
        displayMode: "textarea",
        description: "Special notes about this guest"
      },
      label: "Special Notes"
    }),
    isVip: (0, import_fields17.checkbox)({
      defaultValue: false,
      label: "VIP Guest",
      ui: {
        description: "Mark as VIP for special treatment"
      }
    }),
    isBlacklisted: (0, import_fields17.checkbox)({
      defaultValue: false,
      label: "Blacklisted",
      ui: {
        description: "Guest is not allowed to book"
      }
    }),
    // Relationships
    bookings: (0, import_fields17.relationship)({
      ref: "Booking.guestProfile",
      many: true,
      ui: {
        displayMode: "count",
        description: "All bookings made by this guest"
      },
      label: "Bookings"
    }),
    // Linked user account (optional - for guests who create accounts)
    userAccount: (0, import_fields17.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "email",
        description: "Linked user account if guest has registered"
      },
      label: "User Account"
    }),
    // Tracking
    lastStayAt: (0, import_fields17.timestamp)({
      access: { create: () => false, update: () => false },
      label: "Last Stay",
      ui: {
        description: "Legacy checkout cache; platform guest views derive completed stays from bookings.",
        itemView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    totalStays: (0, import_fields17.text)({
      access: { create: () => false, update: () => false },
      label: "Total Stays",
      ui: {
        description: "Legacy checkout cache; platform guest views derive completed stays from bookings.",
        itemView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    totalSpent: (0, import_fields17.text)({
      access: { create: () => false, update: () => false },
      label: "Completed Stay Gross",
      ui: {
        description: "Legacy checkout cache; operational reports derive immutable revenue and payment facts.",
        itemView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    ...trackingFields
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      ...typeof resolvedData.email === "string" ? { email: resolvedData.email.trim().toLowerCase() } : {},
      ...typeof resolvedData.firstName === "string" ? { firstName: resolvedData.firstName.trim() } : {},
      ...typeof resolvedData.lastName === "string" ? { lastName: resolvedData.lastName.trim() } : {},
      ...typeof resolvedData.phone === "string" ? { phone: resolvedData.phone.trim() } : {}
    }),
    afterOperation: async ({ operation, item, originalItem, context }) => {
      if (operation !== "update" || !item?.id) return;
      const identityChanged = item.firstName !== originalItem?.firstName || item.lastName !== originalItem?.lastName || item.email !== originalItem?.email || item.phone !== originalItem?.phone;
      if (!identityChanged) return;
      await context.prisma.booking.updateMany({
        where: {
          guestProfileId: String(item.id),
          status: { in: ["pending", "confirmed", "checked_in"] }
        },
        data: {
          guestName: [item.firstName, item.lastName].filter(Boolean).join(" "),
          guestEmail: String(item.email || ""),
          guestPhone: String(item.phone || "")
        }
      });
    }
  }
});

// features/keystone/models/GuestDocument.ts
var import_core16 = require("@keystone-6/core");
var import_access17 = require("@keystone-6/core/access");
var import_fields18 = require("@keystone-6/core/fields");
var GuestDocument = (0, import_core16.list)({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["guest", "documentType", "documentNumber", "issuingCountry", "expiryDate", "verified"]
    },
    itemView: {
      defaultFieldMode: "read"
    },
    labelField: "documentNumber"
  },
  fields: {
    // Guest relationship
    guest: (0, import_fields18.relationship)({
      ref: "Guest",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      label: "Guest"
    }),
    // Document type
    documentType: (0, import_fields18.select)({
      type: "string",
      options: [
        { label: "Passport", value: "passport" },
        { label: "ID Card", value: "id_card" },
        { label: "Driver's License", value: "drivers_license" },
        { label: "Other", value: "other" }
      ],
      validation: { isRequired: true },
      label: "Document Type",
      ui: {
        description: "Type of identification document"
      }
    }),
    // Document details
    documentNumber: (0, import_fields18.text)({
      access: { read: import_access17.denyAll },
      validation: { isRequired: true },
      label: "Document Number",
      ui: {
        description: "ID/Passport number"
      }
    }),
    issuingCountry: (0, import_fields18.text)({
      label: "Issuing Country",
      ui: {
        description: "Country that issued the document"
      }
    }),
    expiryDate: (0, import_fields18.timestamp)({
      label: "Expiry Date",
      ui: {
        description: "When the document expires"
      }
    }),
    // Document images (S3 URLs)
    frontImage: (0, import_fields18.text)({
      access: { read: import_access17.denyAll },
      label: "Front Image URL",
      ui: {
        description: "S3 URL to front image of document"
      }
    }),
    backImage: (0, import_fields18.text)({
      access: { read: import_access17.denyAll },
      label: "Back Image URL",
      ui: {
        description: "S3 URL to back image of document"
      }
    }),
    // Verification
    verified: (0, import_fields18.checkbox)({
      defaultValue: false,
      label: "Verified",
      ui: {
        description: "Whether document has been verified"
      }
    }),
    verifiedAt: (0, import_fields18.timestamp)({
      label: "Verified At",
      ui: {
        description: "When the document was verified",
        itemView: { fieldMode: "read" }
      }
    }),
    verifiedBy: (0, import_fields18.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member who verified the document"
      },
      label: "Verified By"
    }),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === "update" && resolvedData.verified === true && !item?.verifiedAt) {
        resolvedData.verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
  }
});

// features/keystone/models/LoyaltyTransaction.ts
var import_core17 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var LoyaltyTransaction = (0, import_core17.list)({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["guest", "points", "type", "description", "createdAt"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Guest relationship
    guest: (0, import_fields19.relationship)({
      ref: "Guest",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      label: "Guest"
    }),
    // Booking relationship (optional - for earned points from stays)
    booking: (0, import_fields19.relationship)({
      ref: "Booking",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber",
        description: "Associated booking (if applicable)"
      },
      label: "Booking"
    }),
    // Points (can be positive or negative)
    points: (0, import_fields19.integer)({
      validation: { isRequired: true },
      label: "Points",
      ui: {
        description: "Points earned (positive) or redeemed/expired (negative)"
      }
    }),
    // Transaction type
    type: (0, import_fields19.select)({
      type: "string",
      options: [
        { label: "Earned", value: "earned" },
        { label: "Redeemed", value: "redeemed" },
        { label: "Adjusted", value: "adjusted" },
        { label: "Bonus", value: "bonus" },
        { label: "Expired", value: "expired" }
      ],
      validation: { isRequired: true },
      label: "Transaction Type",
      ui: {
        description: "Type of loyalty transaction"
      }
    }),
    // Description
    description: (0, import_fields19.text)({
      validation: { isRequired: true },
      ui: {
        displayMode: "textarea",
        description: "Description of why points were earned/redeemed"
      },
      label: "Description"
    }),
    // Created by (staff member who created transaction)
    createdBy: (0, import_fields19.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member who created this transaction"
      },
      label: "Created By"
    }),
    ...trackingFields
  }
});

// features/keystone/models/RatePlan.ts
var import_core18 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var RatePlan = (0, import_core18.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
      delete: permissions.canManageRooms
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "roomType", "baseRate", "status", "minimumStay"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Basic information
    name: (0, import_fields20.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Rate Plan Name",
      ui: {
        description: "e.g., Standard Rate, Weekend Special, Corporate Rate"
      }
    }),
    description: (0, import_fields20.text)({
      ui: {
        displayMode: "textarea",
        description: "Description of this rate plan"
      },
      label: "Description"
    }),
    // Room type relationship
    roomType: (0, import_fields20.relationship)({
      ref: "RoomType.ratePlans",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Integer minor units are authoritative; baseRate is legacy display compatibility.
    baseRateMinor: (0, import_fields20.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: "Base Rate (minor units)" }),
    currencyCode: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "USD" }),
    baseRate: (0, import_fields20.float)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Legacy Base Rate",
      ui: { itemView: { fieldMode: "read" }, description: "Derived compatibility value; minor units are authoritative." }
    }),
    bookings: (0, import_fields20.relationship)({ ref: "Booking.ratePlan", many: true, ui: { displayMode: "count" } }),
    // Seasonal adjustments stored as JSON
    seasonalAdjustments: (0, import_fields20.json)({
      label: "Seasonal Adjustments",
      ui: {
        description: 'JSON object with seasonal rate adjustments (e.g., { "summer": 1.2, "winter": 0.9 })',
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {
        peak: 1.25,
        high: 1.15,
        regular: 1,
        low: 0.85
      }
    }),
    // Stay requirements
    minimumStay: (0, import_fields20.integer)({
      validation: { min: 1 },
      defaultValue: 1,
      label: "Minimum Stay",
      ui: {
        description: "Minimum number of nights required"
      }
    }),
    maximumStay: (0, import_fields20.integer)({
      validation: { min: 1 },
      label: "Maximum Stay",
      ui: {
        description: "Maximum number of nights allowed (leave empty for no limit)"
      }
    }),
    // Booking window
    advanceBookingMin: (0, import_fields20.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Advance Booking Minimum (days)",
      ui: {
        description: "Minimum days in advance required to book"
      }
    }),
    advanceBookingMax: (0, import_fields20.integer)({
      validation: { min: 0 },
      label: "Advance Booking Maximum (days)",
      ui: {
        description: "Maximum days in advance allowed to book"
      }
    }),
    // Cancellation policy
    cancellationPolicy: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Flexible", value: "flexible" },
        { label: "Moderate", value: "moderate" },
        { label: "Strict", value: "strict" },
        { label: "Non-refundable", value: "non_refundable" }
      ],
      defaultValue: "moderate",
      label: "Cancellation Policy",
      ui: {
        description: "Cancellation policy for this rate"
      }
    }),
    // Meal plan
    mealPlan: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Room Only", value: "room_only" },
        { label: "Breakfast Included", value: "breakfast" },
        { label: "Half Board", value: "half_board" },
        { label: "Full Board", value: "full_board" },
        { label: "All Inclusive", value: "all_inclusive" }
      ],
      defaultValue: "room_only",
      label: "Meal Plan",
      ui: {
        description: "Included meal plan"
      }
    }),
    // Validity period
    validFrom: (0, import_fields20.timestamp)({
      label: "Valid From",
      ui: {
        description: "Start date for this rate plan"
      }
    }),
    validTo: (0, import_fields20.timestamp)({
      label: "Valid To",
      ui: {
        description: "End date for this rate plan"
      }
    }),
    // Day restrictions
    applicableDays: (0, import_fields20.json)({
      label: "Applicable Days",
      ui: {
        description: "Days of week when this rate applies",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: true
      }
    }),
    // Status
    status: (0, import_fields20.select)({
      type: "string",
      access: { update: () => false },
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
        { label: "Draft", value: "draft" }
      ],
      defaultValue: "draft",
      label: "Status",
      ui: {
        description: "Rate plan status"
      }
    }),
    // Flags
    isPublic: (0, import_fields20.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Public Rate",
      ui: {
        description: "Available to all guests"
      }
    }),
    isPromotional: (0, import_fields20.checkbox)({
      defaultValue: false,
      label: "Promotional Rate",
      ui: {
        description: "Mark as promotional/special offer"
      }
    }),
    // Promo code
    promoCode: (0, import_fields20.text)({
      label: "Promo Code",
      ui: {
        description: "Required promo code to access this rate (if applicable)"
      }
    }),
    // Priority for rate selection
    priority: (0, import_fields20.integer)({
      defaultValue: 0,
      label: "Priority",
      ui: {
        description: "Higher priority rates are shown first (0 = default)"
      }
    }),
    ...trackingFields
  },
  hooks: {
    resolveInput: ({ resolvedData }) => ({
      ...resolvedData,
      ...Number.isSafeInteger(resolvedData.baseRateMinor) ? { baseRate: resolvedData.baseRateMinor / 100 } : {}
    }),
    validateInput: ({ resolvedData, item, addValidationError }) => {
      const promotional = resolvedData.isPromotional ?? item?.isPromotional ?? false;
      const promoCode = String(resolvedData.promoCode ?? item?.promoCode ?? "").trim();
      const currencyCode = String(resolvedData.currencyCode ?? item?.currencyCode ?? "USD").trim().toUpperCase();
      const minimumStay = Number(resolvedData.minimumStay ?? item?.minimumStay ?? 1);
      const maximumStay = resolvedData.maximumStay ?? item?.maximumStay;
      if (currencyCode !== "USD") {
        addValidationError("The bounded initial release supports USD rate plans only.");
      }
      if (promotional && !promoCode) {
        addValidationError("Promotional rate plans require a promo code. Public packages without a code should not be marked promotional.");
      }
      if (maximumStay !== null && maximumStay !== void 0 && Number(maximumStay) < minimumStay) {
        addValidationError("Maximum stay cannot be shorter than minimum stay.");
      }
      const validFrom = resolvedData.validFrom ?? item?.validFrom;
      const validTo = resolvedData.validTo ?? item?.validTo;
      if (validFrom && validTo && new Date(validTo) < new Date(validFrom)) {
        addValidationError("Rate-plan validity end cannot precede its start.");
      }
    }
  }
});

// features/keystone/models/SeasonalRate.ts
var import_core19 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var SeasonalRate = (0, import_core19.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
      delete: permissions.canManageRooms
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "startDate", "endDate", "roomType", "priceMultiplier", "priority", "isActive"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Name for this seasonal rate period
    name: (0, import_fields21.text)({
      validation: { isRequired: true },
      label: "Name",
      ui: {
        description: "e.g., Christmas Week, New Years, Summer Festival"
      }
    }),
    // Date range
    startDate: (0, import_fields21.timestamp)({
      validation: { isRequired: true },
      label: "Start Date",
      ui: {
        description: "First date this rate applies"
      }
    }),
    endDate: (0, import_fields21.timestamp)({
      validation: { isRequired: true },
      label: "End Date",
      ui: {
        description: "Last date this rate applies"
      }
    }),
    // Optional room type filter (null = applies to all room types)
    roomType: (0, import_fields21.relationship)({
      ref: "RoomType",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Leave empty to apply to all room types"
      },
      label: "Room Type"
    }),
    // Price adjustment options (use one or the other)
    priceAdjustment: (0, import_fields21.integer)({
      label: "Price Adjustment (cents)",
      ui: {
        description: "Fixed amount to add/subtract from base price (can be positive or negative)"
      }
    }),
    priceMultiplier: (0, import_fields21.float)({
      validation: { min: 0 },
      label: "Price Multiplier",
      ui: {
        description: "Multiply base price by this factor (e.g., 1.25 for 25% increase, 0.85 for 15% discount)"
      }
    }),
    // Minimum stay requirement for this period
    minimumStay: (0, import_fields21.integer)({
      validation: { min: 1 },
      defaultValue: 1,
      label: "Minimum Stay",
      ui: {
        description: "Minimum number of nights required during this period"
      }
    }),
    // Priority for handling overlapping seasonal rates
    priority: (0, import_fields21.integer)({
      validation: { isRequired: true },
      defaultValue: 0,
      label: "Priority",
      ui: {
        description: "Higher priority wins when multiple seasonal rates overlap (0 = default)"
      }
    }),
    // Active status
    isActive: (0, import_fields21.checkbox)({
      defaultValue: true,
      label: "Active",
      ui: {
        description: "Whether this seasonal rate is currently active"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MaintenanceRequest.ts
var import_core20 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var MaintenanceRequest = (0, import_core20.list)({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["room", "title", "category", "priority", "status", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Room relationship
    room: (0, import_fields22.relationship)({
      ref: "Room",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "roomNumber"
      },
      label: "Room"
    }),
    // Issue details
    title: (0, import_fields22.text)({
      validation: { isRequired: true },
      label: "Title",
      ui: {
        description: "Brief description of the issue"
      }
    }),
    description: (0, import_fields22.text)({
      ui: {
        displayMode: "textarea",
        description: "Detailed description of the maintenance issue"
      },
      label: "Description"
    }),
    // Category
    category: (0, import_fields22.select)({
      type: "string",
      options: [
        { label: "Plumbing", value: "plumbing" },
        { label: "Electrical", value: "electrical" },
        { label: "HVAC", value: "hvac" },
        { label: "Furniture", value: "furniture" },
        { label: "Appliance", value: "appliance" },
        { label: "Structural", value: "structural" },
        { label: "Cleaning", value: "cleaning" },
        { label: "Other", value: "other" }
      ],
      validation: { isRequired: true },
      label: "Category",
      ui: {
        description: "Type of maintenance issue"
      }
    }),
    // Priority
    priority: (0, import_fields22.select)({
      type: "string",
      options: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
        { label: "Emergency", value: "emergency" }
      ],
      defaultValue: "medium",
      validation: { isRequired: true },
      label: "Priority",
      ui: {
        description: "Urgency of the maintenance request"
      }
    }),
    // Status
    status: (0, import_fields22.select)({
      type: "string",
      options: [
        { label: "Reported", value: "reported" },
        { label: "Assigned", value: "assigned" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Verified", value: "verified" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "reported",
      label: "Status",
      ui: {
        description: "Current status of the maintenance request"
      }
    }),
    // People involved
    reportedBy: (0, import_fields22.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member or guest who reported the issue"
      },
      label: "Reported By"
    }),
    assignedTo: (0, import_fields22.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Maintenance staff member assigned to fix the issue"
      },
      label: "Assigned To"
    }),
    // Images
    images: (0, import_fields22.json)({
      label: "Images",
      ui: {
        description: "Array of S3 image URLs showing the issue",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: []
    }),
    // Scheduling
    scheduledFor: (0, import_fields22.timestamp)({
      label: "Scheduled For",
      ui: {
        description: "When the maintenance is scheduled"
      }
    }),
    completedAt: (0, import_fields22.timestamp)({
      label: "Completed At",
      ui: {
        description: "When the maintenance was completed",
        itemView: { fieldMode: "read" }
      }
    }),
    // Cost tracking
    cost: (0, import_fields22.integer)({
      validation: { min: 0 },
      label: "Cost",
      ui: {
        description: "Cost of maintenance in cents"
      }
    }),
    // Notes
    notes: (0, import_fields22.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about the maintenance request"
      },
      label: "Notes"
    }),
    ...trackingFields
  },
  hooks: {
    beforeOperation: async ({ operation, resolvedData, item }) => {
      if (operation === "update" && resolvedData.status === "completed" && !item?.completedAt) {
        resolvedData.completedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
  }
});

// features/keystone/models/Channel.ts
var import_core21 = require("@keystone-6/core");
var import_access23 = require("@keystone-6/core/access");
var import_fields23 = require("@keystone-6/core/fields");
var canReadChannels = ({ session }) => permissions.canManageBookings({ session }) || permissions.canManageIntegrations({ session });
var canManageChannels = ({ session }) => permissions.canManageBookings({ session }) && permissions.canManageIntegrations({ session });
var Channel = (0, import_core21.list)({
  access: {
    operation: {
      query: canReadChannels,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["name", "channelType", "isActive", "syncStatus", "lastSyncAt"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Channel name
    name: (0, import_fields23.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Channel Name",
      ui: {
        description: "e.g., Booking.com, Expedia, Airbnb"
      }
    }),
    // Channel type
    channelType: (0, import_fields23.select)({
      type: "string",
      options: [
        { label: "OTA (Online Travel Agency)", value: "ota" },
        { label: "GDS (Global Distribution System)", value: "gds" },
        { label: "Direct", value: "direct" },
        { label: "Metasearch", value: "metasearch" }
      ],
      validation: { isRequired: true },
      label: "Channel Type",
      ui: {
        description: "Type of distribution channel"
      }
    }),
    // Active status
    isActive: (0, import_fields23.checkbox)({
      defaultValue: false,
      label: "Active",
      ui: {
        description: "Whether this channel is currently active"
      }
    }),
    // Experimental P2 bridge configuration. API reads are denied; this release
    // does not claim application-layer encryption for this JSON field.
    credentials: (0, import_fields23.json)({
      access: {
        read: import_access23.denyAll,
        create: canManageChannels,
        update: canManageChannels
      },
      label: "Credentials",
      ui: {
        description: "Experimental bridge configuration; raw API reads are denied. Protect the database and secret-manager source.",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "hidden" }
      },
      defaultValue: {}
    }),
    // Commission percentage
    commission: (0, import_fields23.float)({
      validation: { min: 0, max: 100 },
      defaultValue: 0,
      label: "Commission (%)",
      ui: {
        description: "Commission percentage charged by this channel"
      }
    }),
    // Sync settings
    syncInventory: (0, import_fields23.checkbox)({
      defaultValue: false,
      label: "Sync Inventory",
      ui: {
        description: "Automatically sync room inventory to this channel"
      }
    }),
    syncRates: (0, import_fields23.checkbox)({
      access: { create: () => false, update: () => false },
      defaultValue: false,
      label: "Rate sync (P2)",
      ui: {
        description: "Reserved for a future certified adapter; the bounded custom bridge does not push rates.",
        itemView: { fieldMode: "read" },
        createView: { fieldMode: "hidden" }
      }
    }),
    // Sync status tracking
    lastSyncAt: (0, import_fields23.timestamp)({
      label: "Last Sync At",
      ui: {
        description: "When data was last synced with this channel",
        itemView: { fieldMode: "read" }
      }
    }),
    syncStatus: (0, import_fields23.select)({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Error", value: "error" },
        { label: "Paused", value: "paused" }
      ],
      defaultValue: "paused",
      label: "Sync Status",
      ui: {
        description: "Current synchronization status"
      }
    }),
    // Sync errors
    syncErrors: (0, import_fields23.json)({
      label: "Sync Errors",
      ui: {
        description: "Array of recent sync errors",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      defaultValue: []
    }),
    // Room type mapping rules (map our room types to channel room types)
    mappingRules: (0, import_fields23.json)({
      label: "Mapping Rules",
      ui: {
        description: "JSON mapping of room types to channel-specific types",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {}
    }),
    // Relationships
    channelReservations: (0, import_fields23.relationship)({
      ref: "ChannelReservation.channel",
      many: true,
      ui: {
        displayMode: "count",
        description: "Reservations received from this channel"
      },
      label: "Channel Reservations"
    }),
    ...trackingFields
  },
  hooks: {
    validateInput: ({ resolvedData, item, addValidationError }) => {
      const active = resolvedData.isActive ?? item?.isActive ?? false;
      const credentials = resolvedData.credentials ?? item?.credentials ?? {};
      if (active && String(credentials.mode || "").toLowerCase() !== "live") {
        addValidationError("A channel can be activated only with an explicitly certified live custom-bridge configuration.");
      }
      if (resolvedData.syncRates === true) {
        addValidationError("Rate sync is P2 and is not available through the bounded custom bridge.");
      }
    }
  }
});

// features/keystone/models/ChannelReservation.ts
var import_core22 = require("@keystone-6/core");
var import_fields24 = require("@keystone-6/core/fields");
var ChannelReservation = (0, import_core22.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["externalId", "channel", "guestName", "checkInDate", "checkOutDate", "channelStatus"]
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    // Channel relationship
    channel: (0, import_fields24.relationship)({
      ref: "Channel.channelReservations",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Channel"
    }),
    channelKey: (0, import_fields24.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      db: { extendPrismaSchema: (field) => field.replace(' @default("")', "") },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "read" }, createView: { fieldMode: "hidden" } }
    }),
    // External booking ID from the channel
    externalId: (0, import_fields24.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "External Booking ID",
      ui: {
        description: "Booking ID from the OTA/channel"
      }
    }),
    // Link to our internal Reservation
    reservation: (0, import_fields24.relationship)({
      ref: "Booking",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber",
        description: "Linked internal booking/reservation"
      },
      label: "Internal Reservation"
    }),
    // Room type (as provided by channel)
    roomType: (0, import_fields24.relationship)({
      ref: "RoomType",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Dates
    checkInDate: (0, import_fields24.timestamp)({
      validation: { isRequired: true },
      label: "Check-In Date",
      ui: {
        description: "Check-in date from channel"
      }
    }),
    checkOutDate: (0, import_fields24.timestamp)({
      validation: { isRequired: true },
      label: "Check-Out Date",
      ui: {
        description: "Check-out date from channel"
      }
    }),
    // Guest information (as provided by channel)
    guestName: (0, import_fields24.text)({
      validation: { isRequired: true },
      label: "Guest Name",
      ui: {
        description: "Guest name from channel"
      }
    }),
    guestEmail: (0, import_fields24.text)({
      label: "Guest Email",
      ui: {
        description: "Guest email from channel"
      }
    }),
    // Financial details
    totalAmount: (0, import_fields24.integer)({
      validation: { min: 0 },
      label: "Total Amount (cents)",
      ui: {
        description: "Total booking amount in cents"
      }
    }),
    commission: (0, import_fields24.integer)({
      validation: { min: 0 },
      label: "Commission (cents)",
      ui: {
        description: "Commission amount paid to channel in cents"
      }
    }),
    // Channel status (text from OTA)
    channelStatus: (0, import_fields24.text)({
      label: "Channel Status",
      ui: {
        description: "Booking status as reported by the channel"
      }
    }),
    // Raw data payload from channel
    rawData: (0, import_fields24.json)({
      label: "Raw Data",
      ui: {
        description: "Full booking payload from channel API",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      defaultValue: {}
    }),
    // Sync tracking
    lastSyncedAt: (0, import_fields24.timestamp)({
      label: "Last Synced At",
      ui: {
        description: "When this reservation was last synced with channel",
        itemView: { fieldMode: "read" }
      }
    }),
    syncErrors: (0, import_fields24.json)({
      label: "Sync Errors",
      ui: {
        description: "Any errors during sync",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      defaultValue: []
    }),
    ...trackingFields
  }
});

// features/keystone/models/ChannelSyncEvent.ts
var import_core23 = require("@keystone-6/core");
var import_fields25 = require("@keystone-6/core/fields");
var ChannelSyncEvent = (0, import_core23.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["channel", "action", "status", "occurredAt", "createdBy"],
      initialSort: { field: "occurredAt", direction: "DESC" }
    },
    itemView: {
      defaultFieldMode: "read"
    }
  },
  fields: {
    channel: (0, import_fields25.relationship)({
      ref: "Channel",
      db: requiredRelationshipDb,
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Channel"
    }),
    action: (0, import_fields25.select)({
      type: "string",
      options: [
        { label: "Inventory Push", value: "inventory_push" },
        { label: "Reservation Pull", value: "reservation_pull" },
        { label: "Webhook Event", value: "webhook_event" },
        { label: "Retry Attempt", value: "retry_attempt" }
      ],
      defaultValue: "webhook_event",
      label: "Action"
    }),
    status: (0, import_fields25.select)({
      type: "string",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
        { label: "Processing", value: "processing" }
      ],
      defaultValue: "success",
      label: "Status"
    }),
    replayKey: (0, import_fields25.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      ui: { itemView: { fieldMode: "read" } }
    }),
    message: (0, import_fields25.text)({
      label: "Message",
      ui: {
        displayMode: "textarea"
      }
    }),
    payload: (0, import_fields25.json)({
      label: "Payload",
      ui: {
        description: "Payload captured during sync for troubleshooting",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      defaultValue: {}
    }),
    errorMessage: (0, import_fields25.text)({
      label: "Error Message",
      ui: {
        displayMode: "textarea"
      }
    }),
    attempts: (0, import_fields25.integer)({
      defaultValue: 0,
      validation: { min: 0 },
      label: "Attempts"
    }),
    nextAttemptAt: (0, import_fields25.timestamp)({
      label: "Next Attempt At",
      ui: {
        description: "When the next retry should occur"
      }
    }),
    occurredAt: (0, import_fields25.timestamp)({
      defaultValue: { kind: "now" },
      label: "Occurred At"
    }),
    createdBy: (0, import_fields25.relationship)({
      ref: "User",
      many: false,
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      hooks: {
        resolveInput({ operation, resolvedData, context }) {
          if ((operation === "create" || operation === "update") && !resolvedData.createdBy && context.session?.itemId) {
            return { connect: { id: context.session.itemId } };
          }
          return resolvedData.createdBy;
        }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/DailyMetrics.ts
var import_core24 = require("@keystone-6/core");
var import_fields26 = require("@keystone-6/core/fields");
var DailyMetrics = (0, import_core24.list)({
  graphql: {
    plural: "DailyMetricsRecords"
  },
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    isHidden: true,
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["date", "occupancyRate", "totalRevenue", "averageDailyRate", "revenuePerAvailableRoom"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Date for these metrics
    date: (0, import_fields26.timestamp)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Date",
      ui: {
        description: "Date for this metrics snapshot"
      }
    }),
    // Room inventory metrics
    totalRooms: (0, import_fields26.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Total Rooms",
      ui: {
        description: "Total number of available rooms"
      }
    }),
    occupiedRooms: (0, import_fields26.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Occupied Rooms",
      ui: {
        description: "Number of rooms occupied"
      }
    }),
    // Occupancy rate (percentage)
    occupancyRate: (0, import_fields26.float)({
      validation: { min: 0, max: 100 },
      defaultValue: 0,
      label: "Occupancy Rate (%)",
      ui: {
        description: "Percentage of rooms occupied"
      }
    }),
    // ADR - Average Daily Rate (in cents)
    averageDailyRate: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "ADR (cents)",
      ui: {
        description: "Average Daily Rate in cents"
      }
    }),
    // RevPAR - Revenue Per Available Room (in cents)
    revenuePerAvailableRoom: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "RevPAR (cents)",
      ui: {
        description: "Revenue Per Available Room in cents"
      }
    }),
    // Total revenue (in cents)
    totalRevenue: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Total Revenue (cents)",
      ui: {
        description: "Total revenue for the day in cents"
      }
    }),
    // Revenue by channel
    channelRevenue: (0, import_fields26.json)({
      label: "Channel Revenue",
      ui: {
        description: 'Revenue breakdown by channel (e.g., { "booking_com": 50000, "direct": 30000 })',
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {}
    }),
    // Booking activity metrics
    newReservations: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "New Reservations",
      ui: {
        description: "Number of new reservations created"
      }
    }),
    cancellations: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Cancellations",
      ui: {
        description: "Number of reservations cancelled"
      }
    }),
    checkIns: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Check-Ins",
      ui: {
        description: "Number of guest check-ins"
      }
    }),
    checkOuts: (0, import_fields26.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Check-Outs",
      ui: {
        description: "Number of guest check-outs"
      }
    }),
    // Virtual field for formatted ADR
    formattedADR: (0, import_fields26.virtual)({
      field: import_core24.graphql.field({
        type: import_core24.graphql.String,
        resolve(item) {
          const adr = item.averageDailyRate || 0;
          return `$${(adr / 100).toFixed(2)}`;
        }
      }),
      ui: {
        description: "Formatted Average Daily Rate"
      }
    }),
    // Virtual field for formatted RevPAR
    formattedRevPAR: (0, import_fields26.virtual)({
      field: import_core24.graphql.field({
        type: import_core24.graphql.String,
        resolve(item) {
          const revpar = item.revenuePerAvailableRoom || 0;
          return `$${(revpar / 100).toFixed(2)}`;
        }
      }),
      ui: {
        description: "Formatted Revenue Per Available Room"
      }
    }),
    // Virtual field for formatted total revenue
    formattedRevenue: (0, import_fields26.virtual)({
      field: import_core24.graphql.field({
        type: import_core24.graphql.String,
        resolve(item) {
          const revenue = item.totalRevenue || 0;
          return `$${(revenue / 100).toFixed(2)}`;
        }
      }),
      ui: {
        description: "Formatted Total Revenue"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/HotelSettings.ts
var import_core25 = require("@keystone-6/core");
var import_fields27 = require("@keystone-6/core/fields");
var HotelSettings = (0, import_core25.list)({
  isSingleton: true,
  graphql: {
    plural: "hotelSettingsItems"
  },
  access: {
    operation: {
      query: permissions.canManageOnboarding,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["propertyName", "contactEmail", "contactPhone", "updatedAt"]
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    propertyName: (0, import_fields27.text)({ validation: { isRequired: true } }),
    tagline: (0, import_fields27.text)(),
    contactEmail: (0, import_fields27.text)(),
    contactPhone: (0, import_fields27.text)(),
    addressLine1: (0, import_fields27.text)(),
    addressLine2: (0, import_fields27.text)(),
    frontDeskCopy: (0, import_fields27.text)(),
    checkInTime: (0, import_fields27.text)(),
    checkOutTime: (0, import_fields27.text)(),
    currencyCode: (0, import_fields27.text)({ validation: { isRequired: true }, defaultValue: "USD" }),
    taxRateBasisPoints: (0, import_fields27.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 1e3 }),
    serviceFeeMinor: (0, import_fields27.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    pricingVersion: (0, import_fields27.text)({ validation: { isRequired: true }, defaultValue: "hotel-pricing-v2" }),
    storefrontAccentPreset: (0, import_fields27.text)({ validation: { isRequired: true }, defaultValue: "brass" }),
    heroImagePath: (0, import_fields27.text)(),
    heroImageAltText: (0, import_fields27.text)(),
    heroImageCaption: (0, import_fields27.text)(),
    amenityImagePath: (0, import_fields27.text)(),
    amenityImageAltText: (0, import_fields27.text)(),
    amenityImageCaption: (0, import_fields27.text)(),
    locationImagePath: (0, import_fields27.text)(),
    locationImageAltText: (0, import_fields27.text)(),
    locationImageCaption: (0, import_fields27.text)(),
    ...trackingFields
  }
});

// features/keystone/models/PaymentEvent.ts
var import_core26 = require("@keystone-6/core");
var import_access29 = require("@keystone-6/core/access");
var import_fields28 = require("@keystone-6/core/fields");
var PaymentEvent = (0, import_core26.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access29.denyAll,
      update: import_access29.denyAll,
      delete: import_access29.denyAll
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["providerCode", "eventType", "status", "processedAt"]
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    replayKey: (0, import_fields28.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    providerCode: (0, import_fields28.text)({ validation: { isRequired: true } }),
    providerEventId: (0, import_fields28.text)({ validation: { isRequired: true } }),
    eventType: (0, import_fields28.text)({ validation: { isRequired: true } }),
    status: (0, import_fields28.select)({
      type: "string",
      options: [
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" }
      ],
      validation: { isRequired: true }
    }),
    payloadHash: (0, import_fields28.text)({ validation: { isRequired: true } }),
    processedAt: (0, import_fields28.timestamp)({ defaultValue: { kind: "now" } }),
    evidence: (0, import_fields28.json)({ defaultValue: {} }),
    booking: (0, import_fields28.relationship)({ ref: "Booking.paymentEvents" }),
    payment: (0, import_fields28.relationship)({ ref: "BookingPayment.events" }),
    ...trackingFields
  }
});

// features/keystone/models/Folio.ts
var import_core27 = require("@keystone-6/core");
var import_fields29 = require("@keystone-6/core/fields");
var Folio = (0, import_core27.list)({
  db: {
    extendPrismaSchema: (model) => restrictRelation(
      restrictRelation(model, "Folio_booking"),
      "Folio_groupBlock"
    )
  },
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["folioNumber", "booking", "status", "currencyCode", "openedAt"]
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    folioNumber: (0, import_fields29.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: { itemView: { fieldMode: "read" } }
    }),
    booking: (0, import_fields29.relationship)({
      ref: "Booking.folio",
      db: { foreignKey: true },
      ui: { displayMode: "select", labelField: "confirmationNumber" }
    }),
    groupBlock: (0, import_fields29.relationship)({
      ref: "GroupBlock.masterFolio",
      db: { foreignKey: true },
      ui: { displayMode: "select", labelField: "name" }
    }),
    billedBookings: (0, import_fields29.relationship)({
      ref: "Booking.billingFolio",
      many: true,
      ui: { displayMode: "count" }
    }),
    status: (0, import_fields29.select)({
      type: "string",
      validation: { isRequired: true },
      defaultValue: "open",
      options: [
        { label: "Open", value: "open" },
        { label: "Closed", value: "closed" },
        { label: "Voided", value: "voided" }
      ]
    }),
    currencyCode: (0, import_fields29.text)({
      validation: { isRequired: true },
      defaultValue: "USD"
    }),
    entries: (0, import_fields29.relationship)({
      ref: "FolioEntry.folio",
      many: true,
      ui: { displayMode: "cards", cardFields: ["entryType", "direction", "amountMinor", "description", "postedAt"] }
    }),
    openedAt: (0, import_fields29.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    closedAt: (0, import_fields29.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/FolioEntry.ts
var import_core28 = require("@keystone-6/core");
var import_fields30 = require("@keystone-6/core/fields");
var FolioEntry = (0, import_core28.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["folio", "entryType", "direction", "amountMinor", "currencyCode", "serviceDate", "postedAt"]
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    folio: (0, import_fields30.relationship)({
      ref: "Folio.entries",
      db: { foreignKey: true, ...requiredRelationshipDb }
    }),
    postingKey: (0, import_fields30.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: { itemView: { fieldMode: "read" } }
    }),
    entryType: (0, import_fields30.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Room charge", value: "room_charge" },
        { label: "Tax", value: "tax" },
        { label: "Fee", value: "fee" },
        { label: "Add-on", value: "addon" },
        { label: "Payment", value: "payment" },
        { label: "Refund", value: "refund" },
        { label: "Adjustment", value: "adjustment" },
        { label: "Transfer", value: "transfer" },
        { label: "Reversal", value: "reversal" }
      ]
    }),
    direction: (0, import_fields30.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Debit", value: "debit" },
        { label: "Credit", value: "credit" }
      ]
    }),
    amountMinor: (0, import_fields30.integer)({
      validation: { isRequired: true, min: 1 },
      ui: { description: "Positive amount in the currency minor unit." }
    }),
    currencyCode: (0, import_fields30.text)({ validation: { isRequired: true } }),
    description: (0, import_fields30.text)({ validation: { isRequired: true } }),
    serviceDate: (0, import_fields30.timestamp)({ validation: { isRequired: true } }),
    postedAt: (0, import_fields30.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    sourceType: (0, import_fields30.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Reservation snapshot", value: "reservation_snapshot" },
        { label: "Payment", value: "payment" },
        { label: "Refund", value: "refund" },
        { label: "Operator", value: "operator" },
        { label: "Night audit", value: "night_audit" },
        { label: "System", value: "system" }
      ]
    }),
    sourceId: (0, import_fields30.text)(),
    taxCategorySnapshot: (0, import_fields30.text)(),
    metadataSnapshot: (0, import_fields30.json)({ defaultValue: {} }),
    postedBy: (0, import_fields30.relationship)({
      ref: "User",
      ui: { displayMode: "select", labelField: "name" }
    }),
    reverses: (0, import_fields30.relationship)({
      ref: "FolioEntry.reversedBy",
      db: { foreignKey: true },
      ui: { displayMode: "select", labelField: "postingKey" }
    }),
    reversedBy: (0, import_fields30.relationship)({
      ref: "FolioEntry.reverses",
      ui: { displayMode: "select", labelField: "postingKey" }
    }),
    ...trackingFields
  }
});

// features/keystone/models/HotelAuditEvent.ts
var import_core29 = require("@keystone-6/core");
var import_fields31 = require("@keystone-6/core/fields");
var HotelAuditEvent = (0, import_core29.list)({
  db: {
    extendPrismaSchema: (model) => model.replace(
      "\n}",
      '\n  @@index([aggregateType, aggregateId, occurredAt], map: "HotelAuditEvent_aggregate_idx")\n}'
    )
  },
  access: {
    operation: {
      query: permissions.canManageAudit,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["occurredAt", "aggregateType", "aggregateId", "action", "actor"],
      initialSort: { field: "occurredAt", direction: "DESC" }
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    eventKey: (0, import_fields31.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    requestHash: (0, import_fields31.text)({ validation: { isRequired: true } }),
    propertyKey: (0, import_fields31.text)({ validation: { isRequired: true } }),
    aggregateType: (0, import_fields31.text)({ validation: { isRequired: true } }),
    aggregateId: (0, import_fields31.text)({ validation: { isRequired: true } }),
    action: (0, import_fields31.text)({ validation: { isRequired: true } }),
    actor: (0, import_fields31.relationship)({ ref: "User", ui: { displayMode: "select", labelField: "email" } }),
    beforeSnapshot: (0, import_fields31.json)(),
    afterSnapshot: (0, import_fields31.json)(),
    metadataSnapshot: (0, import_fields31.json)({ defaultValue: {} }),
    occurredAt: (0, import_fields31.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    ...trackingFields
  }
});

// features/keystone/models/HotelOutboxEvent.ts
var import_core30 = require("@keystone-6/core");
var import_fields32 = require("@keystone-6/core/fields");
var HotelOutboxEvent = (0, import_core30.list)({
  db: {
    extendPrismaSchema: (model) => model.replace(
      "\n}",
      [
        '\n  @@index([status, availableAt], map: "HotelOutboxEvent_dispatch_idx")',
        '  @@index([aggregateType, aggregateId], map: "HotelOutboxEvent_aggregate_idx")',
        '  @@index([propertyKey, status, availableAt], map: "HotelOutboxEvent_tenant_dispatch_idx")',
        '  @@index([propertyKey, status, leaseExpiresAt], map: "HotelOutboxEvent_lease_idx")',
        "}"
      ].join("\n")
    )
  },
  access: {
    operation: {
      query: permissions.canManageAudit,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ["createdAt", "topic", "aggregateId", "status", "attempts", "availableAt"],
      initialSort: { field: "createdAt", direction: "DESC" }
    },
    itemView: { defaultFieldMode: "read" }
  },
  fields: {
    eventKey: (0, import_fields32.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    requestHash: (0, import_fields32.text)({ validation: { isRequired: true } }),
    propertyKey: (0, import_fields32.text)({ validation: { isRequired: true } }),
    topic: (0, import_fields32.text)({ validation: { isRequired: true } }),
    aggregateType: (0, import_fields32.text)({ validation: { isRequired: true } }),
    aggregateId: (0, import_fields32.text)({ validation: { isRequired: true } }),
    payloadSnapshot: (0, import_fields32.json)({ defaultValue: {} }),
    status: (0, import_fields32.select)({
      type: "string",
      validation: { isRequired: true },
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Delivered", value: "delivered" },
        { label: "Failed", value: "failed" },
        { label: "Dead letter", value: "dead_letter" }
      ]
    }),
    attempts: (0, import_fields32.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    availableAt: (0, import_fields32.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    deliveredAt: (0, import_fields32.timestamp)(),
    lastError: (0, import_fields32.text)(),
    leaseToken: (0, import_fields32.text)({ ui: { itemView: { fieldMode: "read" } } }),
    leaseExpiresAt: (0, import_fields32.timestamp)({ ui: { itemView: { fieldMode: "read" } } }),
    lastAttemptAt: (0, import_fields32.timestamp)({ ui: { itemView: { fieldMode: "read" } } }),
    deadLetteredAt: (0, import_fields32.timestamp)({ ui: { itemView: { fieldMode: "read" } } }),
    replayedFromEventKey: (0, import_fields32.text)({ ui: { itemView: { fieldMode: "read" } } }),
    dispatchResultSnapshot: (0, import_fields32.json)({ defaultValue: {} }),
    maxAttempts: (0, import_fields32.integer)({ validation: { isRequired: true, min: 1 }, defaultValue: 5 }),
    attemptsEvidence: (0, import_fields32.relationship)({ ref: "HotelOutboxAttempt.outbox", many: true }),
    ...trackingFields
  }
});

// features/keystone/models/HotelOutboxAttempt.ts
var import_core31 = require("@keystone-6/core");
var import_access35 = require("@keystone-6/core/access");
var import_fields33 = require("@keystone-6/core/fields");
var HotelOutboxAttempt = (0, import_core31.list)({
  db: {
    extendPrismaSchema: (model) => model.replace(
      "\n}",
      [
        '\n  @@unique([outboxId, attemptNumber], map: "HotelOutboxAttempt_outbox_attempt_key")',
        '  @@index([propertyKey, startedAt], map: "HotelOutboxAttempt_tenant_idx")',
        "}"
      ].join("\n")
    )
  },
  access: {
    operation: {
      query: permissions.canManageAudit,
      create: import_access35.denyAll,
      update: import_access35.denyAll,
      delete: import_access35.denyAll
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: "read" },
    listView: { initialColumns: ["startedAt", "outbox", "attemptNumber", "status", "workerId"] }
  },
  fields: {
    outbox: (0, import_fields33.relationship)({ ref: "HotelOutboxEvent.attemptsEvidence", db: requiredRelationshipDb }),
    propertyKey: (0, import_fields33.text)({ validation: { isRequired: true } }),
    attemptNumber: (0, import_fields33.integer)({ validation: { isRequired: true, min: 1 } }),
    workerId: (0, import_fields33.text)({ validation: { isRequired: true } }),
    status: (0, import_fields33.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" }
      ]
    }),
    errorMessage: (0, import_fields33.text)(),
    responseSnapshot: (0, import_fields33.json)({ defaultValue: {} }),
    startedAt: (0, import_fields33.timestamp)({ validation: { isRequired: true } }),
    finishedAt: (0, import_fields33.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/HotelOutboxReceipt.ts
var import_core32 = require("@keystone-6/core");
var import_access37 = require("@keystone-6/core/access");
var import_fields34 = require("@keystone-6/core/fields");
var HotelOutboxReceipt = (0, import_core32.list)({
  db: {
    extendPrismaSchema: (model) => model.replace(
      "\n}",
      [
        '\n  @@index([propertyKey, receivedAt], map: "HotelOutboxReceipt_tenant_idx")',
        '  @@index([topic, receivedAt], map: "HotelOutboxReceipt_topic_idx")',
        "}"
      ].join("\n")
    )
  },
  access: {
    operation: {
      query: permissions.canManageAudit,
      create: import_access37.denyAll,
      update: import_access37.denyAll,
      delete: import_access37.denyAll
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: "read" },
    listView: { initialColumns: ["receivedAt", "eventKey", "topic", "credentialKeyId"] }
  },
  fields: {
    eventKey: (0, import_fields34.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    propertyKey: (0, import_fields34.text)({ validation: { isRequired: true } }),
    topic: (0, import_fields34.text)({ validation: { isRequired: true } }),
    aggregateType: (0, import_fields34.text)({ validation: { isRequired: true } }),
    aggregateId: (0, import_fields34.text)({ validation: { isRequired: true } }),
    credentialKeyId: (0, import_fields34.text)({ validation: { isRequired: true } }),
    bodyHash: (0, import_fields34.text)({ validation: { isRequired: true } }),
    payloadSnapshot: (0, import_fields34.json)({ defaultValue: {} }),
    receivedAt: (0, import_fields34.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/HotelBusinessDate.ts
var import_core33 = require("@keystone-6/core");
var import_access39 = require("@keystone-6/core/access");
var import_fields35 = require("@keystone-6/core/fields");
var HotelBusinessDate = (0, import_core33.list)({
  isSingleton: true,
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access39.denyAll,
      update: import_access39.denyAll,
      delete: import_access39.denyAll
    }
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: "read" } },
  fields: {
    propertyKey: (0, import_fields35.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    currentBusinessDate: (0, import_fields35.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/NightAuditRun.ts
var import_core34 = require("@keystone-6/core");
var import_access41 = require("@keystone-6/core/access");
var import_fields36 = require("@keystone-6/core/fields");
var NightAuditRun = (0, import_core34.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access41.denyAll,
      update: import_access41.denyAll,
      delete: import_access41.denyAll
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: "read" },
    listView: { initialColumns: ["businessDate", "status", "dueBookingCount", "postedEntryCount", "completedAt"] }
  },
  fields: {
    eventKey: (0, import_fields36.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    requestHash: (0, import_fields36.text)({ validation: { isRequired: true } }),
    propertyKey: (0, import_fields36.text)({ validation: { isRequired: true } }),
    businessDate: (0, import_fields36.timestamp)({ isIndexed: "unique", validation: { isRequired: true } }),
    status: (0, import_fields36.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" }
      ]
    }),
    dueBookingCount: (0, import_fields36.integer)({ validation: { isRequired: true, min: 0 } }),
    postedEntryCount: (0, import_fields36.integer)({ validation: { isRequired: true, min: 0 } }),
    existingEntryCount: (0, import_fields36.integer)({ validation: { isRequired: true, min: 0 } }),
    exceptionCount: (0, import_fields36.integer)({ validation: { isRequired: true, min: 0 } }),
    debitMinor: (0, import_fields36.integer)({ validation: { isRequired: true, min: 0 } }),
    startedAt: (0, import_fields36.timestamp)({ validation: { isRequired: true } }),
    completedAt: (0, import_fields36.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/GroupBlock.ts
var import_core35 = require("@keystone-6/core");
var import_access43 = require("@keystone-6/core/access");
var import_fields37 = require("@keystone-6/core/fields");
var GroupBlock = (0, import_core35.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: import_access43.denyAll,
      update: import_access43.denyAll,
      delete: import_access43.denyAll
    }
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: "read" } },
  fields: {
    blockCode: (0, import_fields37.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    name: (0, import_fields37.text)({ validation: { isRequired: true } }),
    status: (0, import_fields37.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Tentative", value: "tentative" },
        { label: "Definite", value: "definite" },
        { label: "Released", value: "released" },
        { label: "Cancelled", value: "cancelled" }
      ]
    }),
    arrivalDate: (0, import_fields37.timestamp)({ validation: { isRequired: true } }),
    departureDate: (0, import_fields37.timestamp)({ validation: { isRequired: true } }),
    releaseDate: (0, import_fields37.timestamp)(),
    contactName: (0, import_fields37.text)({ validation: { isRequired: true } }),
    contactEmail: (0, import_fields37.text)({ validation: { isRequired: true } }),
    billingType: (0, import_fields37.select)({
      type: "string",
      validation: { isRequired: true },
      options: [
        { label: "Guest pays", value: "guest_pays" },
        { label: "Master folio", value: "master_folio" },
        { label: "Split", value: "split" }
      ]
    }),
    allocations: (0, import_fields37.relationship)({ ref: "GroupBlockAllocation.groupBlock", many: true }),
    bookings: (0, import_fields37.relationship)({ ref: "Booking.groupBlock", many: true }),
    masterFolio: (0, import_fields37.relationship)({ ref: "Folio.groupBlock", ui: { displayMode: "select", labelField: "folioNumber" } }),
    ...trackingFields
  }
});

// features/keystone/models/GroupBlockAllocation.ts
var import_core36 = require("@keystone-6/core");
var import_access45 = require("@keystone-6/core/access");
var import_fields38 = require("@keystone-6/core/fields");
var GroupBlockAllocation = (0, import_core36.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: import_access45.denyAll,
      update: import_access45.denyAll,
      delete: import_access45.denyAll
    }
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: "read" } },
  fields: {
    allocationKey: (0, import_fields38.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    groupBlock: (0, import_fields38.relationship)({ ref: "GroupBlock.allocations", db: requiredRelationshipDb }),
    roomType: (0, import_fields38.relationship)({ ref: "RoomType", db: requiredRelationshipDb }),
    roomsHeld: (0, import_fields38.integer)({ validation: { isRequired: true, min: 1 } }),
    roomsPickedUp: (0, import_fields38.integer)({ validation: { isRequired: true, min: 0 } }),
    rateMinor: (0, import_fields38.integer)({ validation: { isRequired: true, min: 0 } }),
    currencyCode: (0, import_fields38.text)({ validation: { isRequired: true } }),
    bookings: (0, import_fields38.relationship)({ ref: "Booking.groupBlockAllocation", many: true }),
    ...trackingFields
  }
});

// features/keystone/models/RefundIntent.ts
var import_core37 = require("@keystone-6/core");
var import_access47 = require("@keystone-6/core/access");
var import_fields39 = require("@keystone-6/core/fields");
var RefundIntent = (0, import_core37.list)({
  db: {
    extendPrismaSchema: (model) => model.replace(
      "\n}",
      [
        '\n  @@index([status, availableAt], map: "RefundIntent_dispatch_idx")',
        '  @@index([bookingId, status], map: "RefundIntent_booking_status_idx")',
        '  @@index([sourcePaymentId, status], map: "RefundIntent_source_status_idx")',
        "}"
      ].join("\n")
    )
  },
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access47.denyAll,
      update: import_access47.denyAll,
      delete: import_access47.denyAll
    }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: "read" },
    listView: { initialColumns: ["createdAt", "booking", "amountMinor", "status", "attempts"] }
  },
  fields: {
    intentKey: (0, import_fields39.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    requestHash: (0, import_fields39.text)({ validation: { isRequired: true } }),
    cancellationEventKey: (0, import_fields39.text)({ validation: { isRequired: true } }),
    propertyKey: (0, import_fields39.text)({ validation: { isRequired: true } }),
    booking: (0, import_fields39.relationship)({ ref: "Booking.refundIntents", db: requiredRelationshipDb }),
    sourcePayment: (0, import_fields39.relationship)({ ref: "BookingPayment.refundIntents", db: requiredRelationshipDb }),
    paymentProvider: (0, import_fields39.relationship)({ ref: "PaymentProvider.refundIntents", db: requiredRelationshipDb }),
    amountMinor: (0, import_fields39.integer)({ validation: { isRequired: true, min: 1 } }),
    currencyCode: (0, import_fields39.text)({ validation: { isRequired: true } }),
    reason: (0, import_fields39.text)({ validation: { isRequired: true } }),
    actorId: (0, import_fields39.text)({ db: { isNullable: true } }),
    status: (0, import_fields39.select)({
      type: "string",
      validation: { isRequired: true },
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Dead letter", value: "dead_letter" }
      ]
    }),
    attempts: (0, import_fields39.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    maxAttempts: (0, import_fields39.integer)({ validation: { isRequired: true, min: 1 }, defaultValue: 8 }),
    availableAt: (0, import_fields39.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    leaseToken: (0, import_fields39.text)(),
    leaseExpiresAt: (0, import_fields39.timestamp)(),
    lastAttemptAt: (0, import_fields39.timestamp)(),
    completedAt: (0, import_fields39.timestamp)(),
    deadLetteredAt: (0, import_fields39.timestamp)(),
    providerRefundId: (0, import_fields39.text)({ isIndexed: "unique", db: { isNullable: true } }),
    providerResultSnapshot: (0, import_fields39.json)({ defaultValue: {} }),
    lastError: (0, import_fields39.text)(),
    ...trackingFields
  }
});

// features/keystone/models/HotelSeedRecord.ts
var import_core38 = require("@keystone-6/core");
var import_access49 = require("@keystone-6/core/access");
var import_fields40 = require("@keystone-6/core/fields");
var HotelSeedRecord = (0, import_core38.list)({
  db: { extendPrismaSchema: (model) => model.replace("\n}", '\n  @@index([section, entityId], map: "HotelSeedRecord_entity_idx")\n}') },
  access: {
    operation: { query: permissions.canManageOnboarding, create: import_access49.denyAll, update: import_access49.denyAll, delete: import_access49.denyAll }
  },
  ui: { hideCreate: true, hideDelete: true, itemView: { defaultFieldMode: "read" } },
  fields: {
    seedKey: (0, import_fields40.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    section: (0, import_fields40.text)({ validation: { isRequired: true } }),
    entityId: (0, import_fields40.text)({ validation: { isRequired: true } }),
    contentHash: (0, import_fields40.text)({ validation: { isRequired: true } }),
    seedVersion: (0, import_fields40.text)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/HotelAbuseBucket.ts
var import_core39 = require("@keystone-6/core");
var import_access51 = require("@keystone-6/core/access");
var import_fields41 = require("@keystone-6/core/fields");
var HotelAbuseBucket = (0, import_core39.list)({
  db: { extendPrismaSchema: (model) => model.replace("\n}", '\n  @@index([expiresAt], map: "HotelAbuseBucket_expiry_idx")\n}') },
  access: { operation: { query: import_access51.denyAll, create: import_access51.denyAll, update: import_access51.denyAll, delete: import_access51.denyAll } },
  ui: { isHidden: true, hideCreate: true, hideDelete: true },
  fields: {
    bucketKey: (0, import_fields41.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    count: (0, import_fields41.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    windowStartedAt: (0, import_fields41.timestamp)({ validation: { isRequired: true } }),
    expiresAt: (0, import_fields41.timestamp)({ validation: { isRequired: true } })
  }
});

// features/keystone/models/HotelWorkerLease.ts
var import_core40 = require("@keystone-6/core");
var import_access52 = require("@keystone-6/core/access");
var import_fields42 = require("@keystone-6/core/fields");
var HotelWorkerLease = (0, import_core40.list)({
  access: { operation: { query: import_access52.denyAll, create: import_access52.denyAll, update: import_access52.denyAll, delete: import_access52.denyAll } },
  ui: { isHidden: true, hideCreate: true, hideDelete: true },
  fields: {
    leaseKey: (0, import_fields42.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    ownerId: (0, import_fields42.text)({ validation: { isRequired: true } }),
    expiresAt: (0, import_fields42.timestamp)({ validation: { isRequired: true } }),
    heartbeatAt: (0, import_fields42.timestamp)({ validation: { isRequired: true } })
  }
});

// features/keystone/models/BookingModificationRequest.ts
var import_core41 = require("@keystone-6/core");
var import_fields43 = require("@keystone-6/core/fields");
var BookingModificationRequest = (0, import_core41.list)({
  db: {
    extendPrismaSchema: (model) => model.replace(
      "\n}",
      '\n  @@index([bookingId, status, createdAt], map: "BookingModificationRequest_booking_status_created_idx")\n}'
    )
  },
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: { isHidden: true, hideCreate: true, hideDelete: true },
  fields: {
    requestKey: (0, import_fields43.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    booking: (0, import_fields43.relationship)({ ref: "Booking.modificationRequests", db: { foreignKey: true, ...requiredRelationshipDb } }),
    requestedCheckInDate: (0, import_fields43.timestamp)(),
    requestedCheckOutDate: (0, import_fields43.timestamp)(),
    guestMessage: (0, import_fields43.text)({ ui: { displayMode: "textarea" } }),
    requestedByEmailHash: (0, import_fields43.text)({ validation: { isRequired: true } }),
    status: (0, import_fields43.select)({
      type: "string",
      validation: { isRequired: true },
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Declined", value: "declined" }
      ]
    }),
    resolutionKey: (0, import_fields43.text)({ isIndexed: "unique", db: { isNullable: true } }),
    resolutionRequestHash: (0, import_fields43.text)(),
    resolvedBy: (0, import_fields43.relationship)({ ref: "User" }),
    resolvedAt: (0, import_fields43.timestamp)(),
    staffNote: (0, import_fields43.text)({ ui: { displayMode: "textarea" } }),
    resultSnapshot: (0, import_fields43.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  User,
  Role,
  RoomType,
  RoomImage,
  Room,
  RoomInventory,
  HousekeepingTask,
  RoomAssignment,
  Booking,
  BookingPayment,
  BookingPaymentSession,
  PaymentProvider,
  ReservationLineItem,
  Guest,
  GuestDocument,
  LoyaltyTransaction,
  RatePlan,
  SeasonalRate,
  MaintenanceRequest,
  Channel,
  ChannelReservation,
  ChannelSyncEvent,
  DailyMetrics,
  HotelSettings,
  PaymentEvent,
  Folio,
  FolioEntry,
  HotelAuditEvent,
  HotelOutboxEvent,
  HotelOutboxAttempt,
  HotelOutboxReceipt,
  HotelBusinessDate,
  NightAuditRun,
  GroupBlock,
  GroupBlockAllocation,
  RefundIntent,
  HotelSeedRecord,
  HotelAbuseBucket,
  HotelWorkerLease,
  BookingModificationRequest
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/lib/integrationConfig.ts
var PLACEHOLDER = /placeholder|changeme|your_|xxx|dummy|example/i;
function complete(value, minimum = 16) {
  const text41 = String(value || "").trim();
  return Boolean(text41 && text41.length >= minimum && !PLACEHOLDER.test(text41));
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function paymentProviderCredentials(provider) {
  const stored = object(provider.credentials);
  return Object.fromEntries(Object.entries(stored).map(([key3, value]) => [key3, decryptSensitiveText(value)]));
}
function paymentIntegrationConfigured(provider) {
  if (!provider?.isInstalled) return false;
  const credentials = paymentProviderCredentials(provider);
  if (provider.code === "pp_stripe_stripe") {
    return complete(credentials.secretKey, 8) && String(credentials.secretKey).startsWith("sk_") && complete(credentials.publishableKey, 8) && String(credentials.publishableKey).startsWith("pk_") && complete(credentials.webhookSecret, 8) && String(credentials.webhookSecret).startsWith("whsec_");
  }
  if (provider.code === "pp_paypal_paypal") {
    return complete(credentials.clientId) && complete(credentials.clientSecret) && complete(credentials.webhookId);
  }
  return false;
}
function getOutboxDispatchConfig(env = process.env) {
  const url = String(env.HOTEL_OUTBOX_DISPATCH_URL || "").trim();
  const secret = String(env.HOTEL_OUTBOX_DISPATCH_SECRET || "").trim();
  const credentialKeyId = String(env.HOTEL_OUTBOX_DISPATCH_CREDENTIAL_KEY_ID || "").trim();
  if (!url && !secret && !credentialKeyId) return { enabled: false };
  if (!url) throw new Error("HOTEL_OUTBOX_DISPATCH_URL is required when HTTP outbox dispatch wiring is present.");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("HOTEL_OUTBOX_DISPATCH_URL must be a valid URL.");
  }
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("HOTEL_OUTBOX_DISPATCH_URL must use HTTPS in production.");
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("HOTEL_OUTBOX_DISPATCH_URL must use HTTP or HTTPS.");
  if (!complete(secret, 32)) throw new Error("HOTEL_OUTBOX_DISPATCH_SECRET must contain at least 32 non-placeholder characters.");
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(credentialKeyId)) throw new Error("HOTEL_OUTBOX_DISPATCH_CREDENTIAL_KEY_ID is required and invalid.");
  return { enabled: true, url, secret, credentialKeyId };
}
function channelIntegrationMode(channel) {
  if (!channel.isActive) return "disabled";
  const credentials = channel.credentials && typeof channel.credentials === "object" ? channel.credentials : {};
  const configured = String(credentials.mode || "").toLowerCase();
  if (configured === "disabled" || configured === "demo" || configured === "live") return configured;
  return "invalid";
}
function requireLiveChannelEndpoint(channel, operation) {
  const mode = channelIntegrationMode(channel);
  if (mode !== "live") throw new Error(`Channel outbound sync is ${mode}; live mode is required.`);
  const credentials = channel.credentials || {};
  const endpoint2 = operation === "inventory" ? credentials.inventoryEndpoint || credentials.syncEndpoint || (credentials.apiBaseUrl ? `${credentials.apiBaseUrl}/inventory/sync` : "") : credentials.reservationEndpoint || credentials.pullReservationsEndpoint || (credentials.apiBaseUrl ? `${credentials.apiBaseUrl}/reservations/pull` : "");
  let parsed;
  try {
    parsed = new URL(String(endpoint2 || ""));
  } catch {
    throw new Error(`Live channel ${operation} endpoint is required and must be valid.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`Live channel ${operation} endpoint must use HTTPS without URL credentials.`);
  const authorization = credentials.accessToken ? `Bearer ${credentials.accessToken}` : credentials.apiKey ? `ApiKey ${credentials.apiKey}` : credentials.clientId && credentials.clientSecret ? `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}` : "";
  if (!complete(authorization, 16)) throw new Error("Live channel credential material is required.");
  return { endpoint: parsed.toString(), headers: { Authorization: authorization } };
}

// features/keystone/lib/paymentSecurity.ts
var ONLINE_PAYMENT_PROVIDER_CODES = [
  "pp_stripe_stripe",
  "pp_paypal_paypal"
];
function isOnlinePaymentProviderCode(providerCode) {
  return ONLINE_PAYMENT_PROVIDER_CODES.includes(providerCode);
}
function assertCustomerPaymentProvider(providerCode) {
  if (providerCode === "pp_manual_manual") {
    throw new Error(
      "Manual/offline payments cannot be used for customer checkout. An operator must record offline settlement."
    );
  }
  if (!isOnlinePaymentProviderCode(providerCode)) {
    throw new Error("Unsupported customer payment provider.");
  }
}
function isPaymentProviderConfigured(provider) {
  return paymentIntegrationConfigured(provider);
}
function assertPaymentIntegrationAvailable(provider) {
  const providerCode = String(provider?.code || "");
  assertCustomerPaymentProvider(providerCode);
  if (!provider?.isInstalled) throw new Error(`Payment provider ${providerCode} is disabled.`);
  if (!isPaymentProviderConfigured(provider)) throw new Error(`Payment provider ${providerCode} is not completely configured.`);
}

// features/keystone/utils/ensureDefaultPaymentProviders.ts
var LEGACY_FUNCTION_FIELDS = {
  createPaymentFunction: "static-registry",
  capturePaymentFunction: "static-registry",
  refundPaymentFunction: "static-registry",
  getPaymentStatusFunction: "static-registry",
  generatePaymentLinkFunction: "static-registry",
  handleWebhookFunction: "static-registry"
};
async function ensureProvider(context, code, data) {
  const existing = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: code } },
    query: "id name code isInstalled metadata",
    take: 1
  });
  if (existing[0]) return existing[0];
  return context.sudo().query.PaymentProvider.createOne({
    data: { ...data, ...LEGACY_FUNCTION_FIELDS, credentials: {} },
    query: "id name code isInstalled metadata"
  });
}
async function ensureDefaultPaymentProviders(context) {
  await ensureProvider(context, "pp_manual_manual", {
    name: "Offline / staff-recorded",
    code: "pp_manual_manual",
    isInstalled: true,
    metadata: { provider: "manual", displayName: "Recorded by hotel staff", operatorOnly: true }
  });
  const providers = [];
  for (const code of ONLINE_PAYMENT_PROVIDER_CODES) {
    const provider = await ensureProvider(context, code, {
      name: code === "pp_stripe_stripe" ? "Stripe" : "PayPal",
      code,
      isInstalled: false,
      metadata: code === "pp_stripe_stripe" ? { provider: "stripe", displayName: "Credit / debit card" } : { provider: "paypal", displayName: "PayPal", sandbox: true }
    });
    providers.push(provider);
  }
  return providers;
}

// features/keystone/lib/bookingCancellation.ts
var import_node_crypto6 = require("node:crypto");
var import_client = require("@prisma/client");

// features/keystone/utils/paymentProviderAdapter.ts
var adapterLoaders = {
  pp_stripe_stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
  pp_paypal_paypal: () => Promise.resolve().then(() => (init_paypal(), paypal_exports))
};
async function getAdapter(provider) {
  const providerCode = String(provider?.code || "");
  assertCustomerPaymentProvider(providerCode);
  assertPaymentIntegrationAvailable(provider);
  return { adapter: await adapterLoaders[providerCode](), credentials: paymentProviderCredentials(provider) };
}
async function executeAdapterFunction({
  provider,
  functionName,
  args
}) {
  const providerCode = String(provider?.code || "");
  const { adapter, credentials } = await getAdapter(provider);
  const fn = adapter[functionName];
  if (typeof fn !== "function") {
    throw new Error(`Payment provider ${providerCode} does not support ${functionName}.`);
  }
  return fn({ ...args, providerCredentials: credentials });
}
async function createPayment({ provider, amount, currency, metadata, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { amount, currency, metadata, idempotencyKey }
  });
}
async function completePayment({ provider, paymentId, amount }) {
  return executeAdapterFunction({
    provider,
    functionName: "completePaymentFunction",
    args: { paymentId, amount }
  });
}
async function refundPayment({ provider, paymentId, amount, currency, metadata, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency, metadata, idempotencyKey }
  });
}

// features/keystone/lib/folioLedger.ts
function normalizeFolioCurrency(value) {
  const currencyCode = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("currencyCode must be a three-letter ISO currency code.");
  }
  return currencyCode;
}
function validateFolioPosting(posting) {
  if (!Number.isSafeInteger(posting.amountMinor) || posting.amountMinor <= 0) {
    throw new Error("Folio postings require a positive safe integer amountMinor.");
  }
  if (!posting.postingKey.trim()) {
    throw new Error("Folio postings require a stable postingKey.");
  }
  if (!posting.description.trim()) {
    throw new Error("Folio postings require a description snapshot.");
  }
  return {
    ...posting,
    postingKey: posting.postingKey.trim(),
    currencyCode: normalizeFolioCurrency(posting.currencyCode),
    description: posting.description.trim()
  };
}
function buildFolioReversalPosting(original, { postingKey, reason }) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("Folio reversals require a reversal reason.");
  }
  if (original.entryType === "reversal") {
    throw new Error("Folio reversal entries cannot themselves be reversed.");
  }
  const posting = validateFolioPosting({
    postingKey,
    entryType: "reversal",
    direction: original.direction === "debit" ? "credit" : "debit",
    amountMinor: original.amountMinor,
    currencyCode: original.currencyCode,
    description: `Reversal: ${original.description} \u2014 ${normalizedReason}`
  });
  return {
    ...posting,
    sourceType: "operator",
    sourceId: original.id,
    reversesId: original.id,
    metadataSnapshot: {
      reason: normalizedReason,
      reversedPostingKey: original.postingKey,
      reversedEntryType: original.entryType
    }
  };
}
function buildSnapshotFolioPosting(snapshot) {
  const entryType = snapshot.type === "room" ? "room_charge" : snapshot.type === "tax" ? "tax" : snapshot.type === "service_fee" ? "fee" : "addon";
  const posting = validateFolioPosting({
    amountMinor: snapshot.totalPrice,
    currencyCode: snapshot.currencyCode,
    direction: "debit",
    entryType,
    postingKey: `folio:snapshot:${snapshot.snapshotKey}`,
    description: snapshot.description
  });
  return {
    ...posting,
    sourceType: "reservation_snapshot",
    sourceId: snapshot.id,
    serviceDate: new Date(snapshot.date),
    postedAt: new Date(snapshot.createdAt || snapshot.date),
    taxCategorySnapshot: entryType === "tax" ? "lodging_tax" : "",
    metadataSnapshot: {
      reservationSnapshotKey: snapshot.snapshotKey,
      reservationLineType: snapshot.type
    }
  };
}
function calculateFolioBalance(entries) {
  let debitMinor = 0;
  let creditMinor = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new Error("Folio balance entries require positive safe integer amounts.");
    }
    if (entry.direction === "debit") debitMinor += entry.amountMinor;
    else if (entry.direction === "credit") creditMinor += entry.amountMinor;
    else throw new Error("Folio balance entries require a debit or credit direction.");
  }
  if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) {
    throw new Error("Folio totals exceed safe integer bounds.");
  }
  return {
    debitMinor,
    creditMinor,
    balanceMinor: debitMinor - creditMinor
  };
}
function assertFolioCanClose(entries) {
  const totals = calculateFolioBalance(entries);
  if (totals.balanceMinor > 0) {
    throw new Error(`Folio has an outstanding debit balance of ${totals.balanceMinor} minor units.`);
  }
  if (totals.balanceMinor < 0) {
    throw new Error(`Folio has an outstanding credit balance of ${Math.abs(totals.balanceMinor)} minor units.`);
  }
  return totals;
}

// features/keystone/lib/reservationSnapshots.ts
var DEFAULT_CURRENCY = "USD";
function toMinorUnits(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) throw new Error("Invalid monetary amount.");
  return Math.round(value * 100);
}
function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid reservation date.");
  return date;
}
function getReservationStayDates(checkInValue, checkOutValue) {
  const checkIn = normalizeDate(checkInValue);
  const checkOut = normalizeDate(checkOutValue);
  checkIn.setUTCHours(0, 0, 0, 0);
  checkOut.setUTCHours(0, 0, 0, 0);
  if (checkOut <= checkIn) throw new Error("Check-out must be after check-in.");
  const dates = [];
  const current = new Date(checkIn.getTime());
  while (current < checkOut) {
    dates.push(new Date(current.getTime()));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}
function allocateMinorUnits(total, count) {
  if (!Number.isInteger(total) || total < 0) throw new Error("Minor-unit total must be a non-negative integer.");
  if (!Number.isInteger(count) || count < 1) throw new Error("Allocation count must be positive.");
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}
function dayKey(date) {
  return date.toISOString().slice(0, 10);
}
function buildReservationSnapshotLines(source) {
  const stayDates = getReservationStayDates(source.checkInDate, source.checkOutDate);
  const roomAmounts = source.nightlyRoomAmounts?.length === stayDates.length ? source.nightlyRoomAmounts : allocateMinorUnits(source.roomTotalCents, stayDates.length);
  if (roomAmounts.reduce((sum, amount) => sum + amount, 0) !== source.roomTotalCents) {
    throw new Error("Nightly pricing evidence does not equal the room subtotal.");
  }
  const taxAmounts = allocateMinorUnits(source.taxTotalCents, stayDates.length);
  const currencyCode = (source.currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
  const ratePlan = source.ratePlan || {};
  const snapshotRoot = source.snapshotKeyPrefix ? `${source.bookingId}:${source.snapshotKeyPrefix}` : source.bookingId;
  const common = {
    reservation: { connect: { id: source.bookingId } },
    quantity: 1,
    currencyCode,
    roomTypeIdSnapshot: source.roomType.id,
    roomTypeNameSnapshot: source.roomType.name,
    ratePlanIdSnapshot: ratePlan.id || "",
    ratePlanNameSnapshot: ratePlan.name || "Room type base rate",
    ratePlanDescriptionSnapshot: ratePlan.description || "",
    cancellationPolicySnapshot: ratePlan.cancellationPolicy || "",
    mealPlanSnapshot: ratePlan.mealPlan || "room_only",
    imagePathSnapshot: source.roomType.imagePath || "",
    imageAltTextSnapshot: source.roomType.imageAltText || "",
    pricingSourceSnapshot: source.pricingSource || "storefront"
  };
  const lines = [];
  stayDates.forEach((date, index) => {
    const key3 = dayKey(date);
    lines.push({
      ...common,
      type: "room",
      description: `${source.roomType.name} \xB7 ${key3}`,
      unitPrice: roomAmounts[index],
      totalPrice: roomAmounts[index],
      date: date.toISOString(),
      snapshotKey: `${snapshotRoot}:room:${key3}`,
      nightIndex: index + 1,
      taxRateBasisPoints: null
    });
    lines.push({
      ...common,
      type: "tax",
      description: `Tax \xB7 ${source.roomType.name} \xB7 ${key3}`,
      unitPrice: taxAmounts[index],
      totalPrice: taxAmounts[index],
      date: date.toISOString(),
      snapshotKey: `${snapshotRoot}:tax:${key3}`,
      nightIndex: index + 1,
      taxRateBasisPoints: source.taxRateBasisPoints ?? null
    });
  });
  lines.push({
    ...common,
    type: "service_fee",
    description: `Fees \xB7 ${source.roomType.name} \xB7 stay`,
    unitPrice: source.feesTotalCents,
    totalPrice: source.feesTotalCents,
    date: stayDates[0].toISOString(),
    snapshotKey: `${snapshotRoot}:fees:stay`,
    nightIndex: null,
    taxRateBasisPoints: null
  });
  return lines;
}
async function getRatePlanSnapshot(context, ratePlanId) {
  if (!ratePlanId) return null;
  return context.sudo().query.RatePlan.findOne({
    where: { id: ratePlanId },
    query: "id name description cancellationPolicy mealPlan"
  });
}
async function ensureReservationSnapshots(context, bookingId) {
  const sudo = context.sudo();
  const booking = await sudo.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      source
      checkInDate
      checkOutDate
      roomRate
      taxAmount
      feesAmount
      roomRateMinor
      taxAmountMinor
      feesAmountMinor
      currencyCode
      pricingVersion
      pricingSnapshot
      ratePlan { id }
      roomAssignments {
        id
        roomType {
          id
          name
          roomImages(orderBy: { order: asc }) {
            id
            image { url }
            imagePath
            altText
            order
            isPrimary
          }
        }
      }
    `
  });
  if (!booking) throw new Error("Booking not found.");
  const assignment = booking.roomAssignments?.find((item) => item.roomType) || booking.roomAssignments?.[0];
  const roomType = assignment?.roomType;
  if (!roomType) throw new Error("Booking must have a room type before snapshots can be created.");
  const primaryImage = roomType.roomImages?.find((image2) => image2.isPrimary) || roomType.roomImages?.[0];
  const ratePlan = await getRatePlanSnapshot(context, booking.ratePlan?.id);
  const roomTotalCents = Number.isSafeInteger(booking.roomRateMinor) ? booking.roomRateMinor : toMinorUnits(booking.roomRate);
  const taxTotalCents = Number.isSafeInteger(booking.taxAmountMinor) ? booking.taxAmountMinor : toMinorUnits(booking.taxAmount);
  const feesTotalCents = Number.isSafeInteger(booking.feesAmountMinor) ? booking.feesAmountMinor : toMinorUnits(booking.feesAmount);
  const pricingSnapshot = booking.pricingSnapshot && typeof booking.pricingSnapshot === "object" ? booking.pricingSnapshot : {};
  const nightlyRoomAmounts = Array.isArray(pricingSnapshot.nightlyRates) ? pricingSnapshot.nightlyRates.map((night) => Number(night.amountMinor)) : null;
  const taxRateBasisPoints = roomTotalCents > 0 ? Math.round(taxTotalCents / roomTotalCents * 1e4) : null;
  const lines = buildReservationSnapshotLines({
    bookingId,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    roomTotalCents,
    taxTotalCents,
    feesTotalCents,
    currencyCode: booking.currencyCode || "USD",
    roomType: {
      id: roomType.id,
      name: roomType.name,
      imagePath: primaryImage?.image?.url || primaryImage?.imagePath || "",
      imageAltText: primaryImage?.altText || ""
    },
    ratePlan,
    taxRateBasisPoints,
    pricingSource: `${booking.source || "direct"}:${booking.pricingVersion || "legacy-v1"}`,
    nightlyRoomAmounts,
    snapshotKeyPrefix: typeof pricingSnapshot.snapshotKeyPrefix === "string" ? pricingSnapshot.snapshotKeyPrefix : null
  });
  const existing = await sudo.query.ReservationLineItem.findMany({
    where: { reservation: { id: { equals: bookingId } }, snapshotStatus: { equals: "active" } },
    query: "id snapshotKey"
  });
  const existingKeys = new Set(existing.map((line) => line.snapshotKey).filter(Boolean));
  const missing = lines.filter((line) => !existingKeys.has(line.snapshotKey));
  for (const line of missing) {
    await sudo.query.ReservationLineItem.createOne({ data: line });
  }
  return {
    bookingId,
    created: missing.length,
    existing: lines.length - missing.length,
    total: lines.length
  };
}

// features/keystone/lib/bookingFolio.ts
function must(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
async function ensureBookingFolio(context, bookingId, options = {}) {
  const prisma = context.prisma;
  await prisma.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    `hotel-folio-booking:${bookingId}`
  );
  const booking = must(await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      lineItems: { orderBy: [{ date: "asc" }, { id: "asc" }] },
      billingFolio: true,
      groupBlock: { include: { masterFolio: true } }
    }
  }));
  if (!booking) throw new Error("Booking not found.");
  const currencyCode = normalizeFolioCurrency(
    booking.lineItems.find((line) => line.currencyCode)?.currencyCode || "USD"
  );
  const routedFolio = booking.billingFolio || (booking.groupBlock?.billingType === "master_folio" ? booking.groupBlock.masterFolio : null);
  if (booking.groupBlock?.billingType === "master_folio" && !routedFolio) {
    throw new Error("Master-folio group reservation is missing its billing folio.");
  }
  const folio = routedFolio || must(await prisma.folio.upsert({
    where: { bookingId },
    create: {
      bookingId,
      folioNumber: `FOL-${booking.confirmationNumber}`,
      currencyCode,
      status: "open",
      openedAt: booking.createdAt
    },
    update: {}
  }));
  if (folio.status !== "open" && options.postSnapshotEntries) {
    throw new Error("Closed or voided folios cannot accept new postings.");
  }
  if (folio.currencyCode !== currencyCode) {
    throw new Error("Reservation snapshot currency does not match the booking folio.");
  }
  const serviceDay = options.serviceDate?.toISOString().slice(0, 10) || null;
  const postings = options.postSnapshotEntries ? booking.lineItems.filter(
    (line) => line.snapshotStatus !== "superseded" && line.totalPrice > 0 && (!serviceDay || new Date(line.date).toISOString().slice(0, 10) === serviceDay)
  ).map(buildSnapshotFolioPosting) : [];
  const created = postings.length ? must(await prisma.folioEntry.createMany({
    data: postings.map((posting) => ({
      folioId: folio.id,
      ...posting
    })),
    skipDuplicates: true
  })).count : 0;
  return {
    bookingId,
    folioId: folio.id,
    folioNumber: folio.folioNumber,
    status: folio.status,
    created,
    existing: postings.length - created,
    total: postings.length
  };
}
async function ensurePaymentFolioPosting(context, paymentId) {
  const prisma = context.prisma;
  const payment = must(await prisma.bookingPayment.findUnique({
    where: { id: paymentId },
    include: { booking: true }
  }));
  if (!payment?.bookingId || !payment.booking) {
    throw new Error("Payment is not attached to a booking.");
  }
  if (!["completed", "refunded"].includes(String(payment.status))) {
    throw new Error("Only settled payments or refunds may be posted to a folio.");
  }
  const ensured = await ensureBookingFolio(context, payment.bookingId, { postSnapshotEntries: false });
  const currencyCode = normalizeFolioCurrency(payment.currency || "USD");
  let folio = must(await prisma.folio.findUnique({ where: { id: ensured.folioId } }));
  const authoritativeMinor = Number.isSafeInteger(payment.amountMinor) ? payment.amountMinor : toMinorUnits(Number(payment.amount));
  const isRefund = authoritativeMinor < 0 || payment.paymentType === "refund";
  if (!folio) throw new Error("Booking folio not found.");
  if (folio.currencyCode !== currencyCode) {
    throw new Error("Payment currency does not match the booking folio.");
  }
  const providerEvidence = payment.providerData && typeof payment.providerData === "object" ? payment.providerData : {};
  const posting = validateFolioPosting({
    postingKey: `folio:payment:${payment.id}`,
    entryType: isRefund ? "refund" : "payment",
    direction: isRefund ? "debit" : "credit",
    amountMinor: Math.abs(authoritativeMinor),
    currencyCode,
    description: payment.description || `${isRefund ? "Refund" : "Payment"} for booking ${payment.booking.confirmationNumber}`
  });
  const existing = must(await prisma.folioEntry.findUnique({
    where: { postingKey: posting.postingKey }
  }));
  if (existing) {
    if (existing.folioId !== folio.id || existing.entryType !== posting.entryType || existing.direction !== posting.direction || existing.amountMinor !== posting.amountMinor || existing.currencyCode !== posting.currencyCode || existing.sourceId !== payment.id) {
      throw new Error("Payment posting identity is already bound to different folio evidence.");
    }
    return existing;
  }
  if (folio.status === "voided") {
    throw new Error("Voided folios cannot accept payment postings.");
  }
  if (folio.status === "closed" && isRefund) {
    folio = must(await prisma.folio.update({
      where: { id: folio.id },
      data: { status: "open", closedAt: null }
    }));
  } else if (folio.status !== "open") {
    throw new Error("Closed folios accept only post-stay refund postings.");
  }
  return must(await prisma.folioEntry.upsert({
    where: { postingKey: posting.postingKey },
    create: {
      folioId: folio.id,
      ...posting,
      serviceDate: payment.processedAt || payment.refundedAt || payment.createdAt,
      postedAt: payment.processedAt || payment.refundedAt || payment.createdAt,
      sourceType: isRefund ? "refund" : "payment",
      sourceId: payment.id,
      metadataSnapshot: {
        paymentReference: payment.paymentReference,
        paymentMethod: payment.paymentMethod,
        providerPaymentId: payment.providerPaymentId || null,
        providerRefundId: payment.providerRefundId || null,
        operatorPostingKey: providerEvidence.operatorPostingKey || null,
        sourcePaymentId: providerEvidence.sourcePaymentId || null,
        recordedBy: providerEvidence.recordedBy || null
      }
    },
    update: {}
  }));
}

// features/keystone/lib/bookingRefund.ts
var import_node_crypto5 = require("node:crypto");

// features/keystone/lib/hotelLifecycle.ts
var import_node_crypto3 = require("node:crypto");
var HOTEL_PROPERTY_KEY = "the-alder-house";
function requirePrismaResult(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key3, item]) => [key3, stableValue(item)])
    );
  }
  return value;
}
function hashLifecycleRequest(request) {
  return (0, import_node_crypto3.createHash)("sha256").update(JSON.stringify(stableValue(request))).digest("hex");
}
function assertLifecycleReplayMatches(existing, identity) {
  if (existing.requestHash !== hashLifecycleRequest(identity.request) || existing.aggregateType !== identity.aggregateType || existing.aggregateId !== identity.aggregateId || existing.action !== identity.action) {
    throw new Error("Lifecycle idempotency key was reused with different evidence.");
  }
}
async function lockHotelLifecycle(prisma, idempotencyKey) {
  await prisma.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    `hotel-lifecycle:${idempotencyKey}`
  );
}
async function findHotelLifecycleReplay(prisma, eventKey, identity) {
  const existing = await prisma.hotelAuditEvent.findUnique({ where: { eventKey } });
  if (!existing) return null;
  assertLifecycleReplayMatches(existing, identity);
  return existing;
}
async function recordHotelLifecycleEvent({
  prisma,
  eventKey,
  actorId,
  identity,
  beforeSnapshot,
  afterSnapshot,
  metadata = {}
}) {
  const requestHash = hashLifecycleRequest(identity.request);
  const occurredAt = /* @__PURE__ */ new Date();
  const audit = requirePrismaResult(await prisma.hotelAuditEvent.create({
    data: {
      eventKey,
      requestHash,
      propertyKey: HOTEL_PROPERTY_KEY,
      aggregateType: identity.aggregateType,
      aggregateId: identity.aggregateId,
      action: identity.action,
      actorId: actorId || null,
      beforeSnapshot: stableValue(beforeSnapshot) ?? null,
      afterSnapshot: stableValue(afterSnapshot) ?? null,
      metadataSnapshot: stableValue(metadata),
      occurredAt
    },
    select: { id: true }
  }));
  requirePrismaResult(await prisma.hotelOutboxEvent.create({
    data: {
      eventKey,
      topic: `hotel.${identity.aggregateType}.${identity.action}`,
      aggregateType: identity.aggregateType,
      aggregateId: identity.aggregateId,
      requestHash,
      propertyKey: HOTEL_PROPERTY_KEY,
      payloadSnapshot: {
        auditEventId: audit.id,
        actorId: actorId || null,
        before: stableValue(beforeSnapshot) ?? null,
        after: stableValue(afterSnapshot) ?? null,
        metadata: stableValue(metadata),
        occurredAt: occurredAt.toISOString()
      },
      status: "pending",
      attempts: 0,
      availableAt: occurredAt
    }
  }));
  return audit;
}

// features/keystone/lib/hotelCommunications.ts
var import_node_crypto4 = require("node:crypto");
var HOTEL_COMMUNICATION_TOPICS = [
  "hotel.communication.booking_confirmation",
  "hotel.communication.booking_updated",
  "hotel.communication.booking_cancelled",
  "hotel.communication.booking_no_show",
  "hotel.communication.booking_refund",
  "hotel.communication.booking_modification_response",
  "hotel.communication.contact_received"
];
function email(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new Error(`${label} must be a valid email address.`);
  }
  return normalized;
}
function bounded(value, label, max) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}
function topicFor(kind) {
  return `hotel.communication.${kind}`;
}
function isHotelCommunicationTopic(value) {
  return HOTEL_COMMUNICATION_TOPICS.includes(value);
}
async function enqueueCommunication(prisma, {
  eventKey,
  aggregateType,
  aggregateId,
  payload
}) {
  const key3 = `hotel-communication:${eventKey}`;
  const requestHash = hashLifecycleRequest(payload);
  const existing = await prisma.hotelOutboxEvent.findUnique({ where: { eventKey: key3 } });
  if (existing) {
    if (existing.requestHash !== requestHash || existing.topic !== topicFor(payload.kind) || existing.aggregateType !== aggregateType || existing.aggregateId !== aggregateId) {
      throw new Error("Communication idempotency key is already bound to different evidence.");
    }
    return { event: existing, replayed: true };
  }
  const event = await prisma.hotelOutboxEvent.create({
    data: {
      eventKey: key3,
      requestHash,
      propertyKey: HOTEL_PROPERTY_KEY,
      topic: topicFor(payload.kind),
      aggregateType,
      aggregateId,
      payloadSnapshot: payload,
      status: "pending",
      attempts: 0,
      availableAt: /* @__PURE__ */ new Date()
    }
  });
  return { event, replayed: false };
}
async function queueBookingCommunication(prisma, {
  bookingId,
  kind,
  eventKey,
  cancellation,
  modification
}) {
  const [booking, settings] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ratePlan: true,
        roomAssignments: { take: 1, include: { roomType: true } },
        lineItems: {
          where: { snapshotStatus: "active" },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          take: 1
        }
      }
    }),
    prisma.hotelSettings.findUnique({ where: { id: 1 } })
  ]);
  if (!booking) throw new Error("Booking communication target was not found.");
  if (!settings) throw new Error("Hotel communication settings are not configured.");
  const policy = booking.lineItems[0]?.cancellationPolicySnapshot || booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy || null;
  const payload = {
    kind,
    to: email(booking.guestEmail, "Guest email"),
    propertyName: bounded(settings.propertyName, "Property name", 200),
    contactEmail: email(settings.contactEmail, "Property contact email"),
    guestName: bounded(booking.guestName, "Guest name", 255),
    confirmationNumber: bounded(booking.confirmationNumber, "Confirmation number", 100),
    bookingId: booking.id,
    checkInDate: booking.checkInDate.toISOString(),
    checkOutDate: booking.checkOutDate.toISOString(),
    numberOfGuests: Number(booking.numberOfGuests || 1),
    roomTypeName: booking.roomAssignments[0]?.roomType?.name || "Reserved room",
    totalAmountMinor: Number(booking.totalAmountMinor || 0),
    currencyCode: String(booking.currencyCode || "USD").toUpperCase(),
    cancellationPolicy: policy,
    cancellationSummary: cancellation?.summary || null,
    refundableMinor: cancellation?.refundableMinor ?? null,
    cancellationFeeMinor: cancellation?.cancellationFeeMinor ?? null,
    modificationDecision: modification?.decision || null,
    staffNote: modification?.staffNote || null
  };
  return enqueueCommunication(prisma, {
    eventKey: `${kind}:${eventKey}`,
    aggregateType: "booking",
    aggregateId: bookingId,
    payload
  });
}
async function queueContactCommunication(prisma, input) {
  const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
  if (!settings) throw new Error("Hotel contact settings are not configured.");
  const reference = String(input.idempotencyKey || (0, import_node_crypto4.randomUUID)()).trim();
  if (!reference || reference.length > 200) throw new Error("Contact message reference is invalid.");
  const payload = {
    kind: "contact_received",
    to: email(settings.contactEmail, "Property contact email"),
    replyTo: email(input.email, "Contact email"),
    propertyName: bounded(settings.propertyName, "Property name", 200),
    contactEmail: email(settings.contactEmail, "Property contact email"),
    guestName: bounded(input.name, "Name", 160),
    contactPhone: input.phone ? bounded(input.phone, "Phone", 80) : null,
    contactSubject: bounded(input.subject, "Subject", 160),
    contactMessage: bounded(input.message, "Message", 4e3)
  };
  const queued = await enqueueCommunication(prisma, {
    eventKey: `contact_received:${reference}`,
    aggregateType: "contact_message",
    aggregateId: reference,
    payload
  });
  return { reference, status: queued.event.status, replayed: queued.replayed };
}
async function bookingCommunicationStatus(prisma, bookingId) {
  const events = await prisma.hotelOutboxEvent.findMany({
    where: {
      aggregateType: "booking",
      aggregateId: bookingId,
      topic: { in: HOTEL_COMMUNICATION_TOPICS.filter((topic) => topic !== "hotel.communication.contact_received") }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    select: { topic: true, status: true, deliveredAt: true, lastError: true }
  });
  const latest = /* @__PURE__ */ new Map();
  for (const event of events) if (!latest.has(event.topic)) latest.set(event.topic, event);
  return {
    confirmation: latest.get("hotel.communication.booking_confirmation") || null,
    update: latest.get("hotel.communication.booking_updated") || null,
    cancellation: latest.get("hotel.communication.booking_cancelled") || null,
    modification: latest.get("hotel.communication.booking_modification_response") || null
  };
}

// features/keystone/lib/serializableTransaction.ts
function isRetryableTransactionError(error) {
  const detail = `${error?.message || ""} ${error?.extensions?.debug?.message || ""} ${error?.extensions?.prisma?.message || ""}`;
  return error?.code === "P2034" || error?.code === "40001" || error?.extensions?.prisma?.code === "P2034" || /could not serialize|write conflict|deadlock|current transaction is aborted/i.test(detail);
}
async function runSerializableTransaction(context, operation, options = {}) {
  const attempts = options.attempts || 8;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await context.transaction(operation, {
        maxWait: options.maxWait || 5e3,
        timeout: options.timeout || 3e4,
        isolationLevel: "Serializable"
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20 + Math.floor(Math.random() * 20)));
    }
  }
  throw new Error("Serializable transaction retry budget was exhausted.");
}

// features/keystone/lib/bookingRefund.ts
var ACTIVE_INTENT_STATUSES = ["pending", "processing", "failed", "dead_letter"];
function paymentMinor(payment) {
  if (Number.isSafeInteger(payment.amountMinor)) return Math.abs(payment.amountMinor);
  const amount = Math.round(Math.abs(Number(payment.amount || 0)) * 100);
  if (!Number.isSafeInteger(amount)) throw new Error("Payment amount cannot be represented in minor units.");
  return amount;
}
async function recomputeBookingPaymentState(prisma, bookingId) {
  const [booking, ledger] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: { billingFolio: { include: { entries: { select: { direction: true, amountMinor: true } } } } } }),
    prisma.bookingPayment.findMany({
      where: { bookingId, status: { in: ["completed", "refunded"] } },
      select: { paymentType: true, amountMinor: true }
    })
  ]);
  if (!booking) throw new Error("Booking not found while reconciling payments.");
  const netPaidMinor = Math.max(0, ledger.reduce((sum, payment) => sum + (payment.paymentType === "refund" ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
  const totalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
  const terminal = ["cancelled", "no_show"].includes(booking.status);
  const folioBalanceMinor = booking.billingFolio ? Math.max(0, calculateFolioBalance(booking.billingFolio.entries).balanceMinor) : null;
  const remainingMinor = terminal && folioBalanceMinor != null ? folioBalanceMinor : Math.max(0, totalMinor - netPaidMinor);
  const paymentStatus = terminal ? remainingMinor > 0 ? netPaidMinor > 0 ? "partial" : "unpaid" : netPaidMinor <= 0 ? "refunded" : "paid" : netPaidMinor <= 0 ? "unpaid" : remainingMinor <= 0 ? "paid" : "partial";
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus,
      balanceDueMinor: remainingMinor,
      balanceDue: remainingMinor / 100
    }
  });
  return { netPaidMinor, remainingMinor, paymentStatus };
}
async function refundablePaymentMinor(prisma, payment) {
  const [refunds, intents] = await Promise.all([
    prisma.bookingPayment.findMany({
      where: { bookingId: payment.bookingId, paymentType: "refund", status: "refunded" },
      select: { amountMinor: true, amount: true, providerData: true }
    }),
    prisma.refundIntent.findMany({
      where: { sourcePaymentId: payment.id, status: { in: ACTIVE_INTENT_STATUSES } },
      select: { amountMinor: true }
    })
  ]);
  const settled = refunds.filter((refund) => refund.providerData?.sourcePaymentId === payment.id).reduce((sum, refund) => sum + paymentMinor(refund), 0);
  const reserved = intents.reduce((sum, intent) => sum + Number(intent.amountMinor || 0), 0);
  return Math.max(0, paymentMinor(payment) - settled - reserved);
}
async function createManualRefundInTransaction({
  tx,
  sourcePayment,
  amountMinor,
  reason,
  eventKey,
  actorId
}) {
  const id = `manual_refund_${(0, import_node_crypto5.createHash)("sha256").update(`${sourcePayment.id}:${eventKey}`).digest("hex").slice(0, 24)}`;
  const existing = await tx.prisma.bookingPayment.findUnique({ where: { id } });
  if (existing) {
    if (existing.bookingId !== sourcePayment.bookingId || existing.amountMinor !== -amountMinor || existing.providerData?.sourcePaymentId !== sourcePayment.id) {
      throw new Error("Manual refund replay evidence does not match.");
    }
    await ensurePaymentFolioPosting(tx, existing.id);
    return existing;
  }
  const now = /* @__PURE__ */ new Date();
  const refund = await tx.prisma.bookingPayment.create({
    data: {
      id,
      paymentReference: `REF-${(0, import_node_crypto5.createHash)("sha256").update(eventKey).digest("hex").slice(0, 14).toUpperCase()}`,
      bookingId: sourcePayment.bookingId,
      paymentProviderId: sourcePayment.paymentProviderId,
      amountMinor: -amountMinor,
      amount: -(amountMinor / 100),
      currency: String(sourcePayment.currency || "USD").toUpperCase(),
      paymentType: "refund",
      paymentMethod: sourcePayment.paymentMethod || "other",
      status: "refunded",
      providerPaymentId: sourcePayment.providerPaymentId,
      providerRefundId: `manual:${eventKey}`,
      providerData: {
        sourcePaymentId: sourcePayment.id,
        operatorRefundKey: eventKey,
        recordedBy: actorId
      },
      description: reason,
      processedAt: now,
      refundedAt: now,
      processedById: actorId
    }
  });
  await ensurePaymentFolioPosting(tx, refund.id);
  return refund;
}
async function requestBookingPaymentRefund({
  context,
  paymentId,
  amountMinor,
  reason,
  idempotencyKey,
  actorId
}) {
  const key3 = String(idempotencyKey || "").trim();
  const normalizedReason = String(reason || "").trim();
  if (!key3 || key3.length > 200) throw new Error("A bounded refund idempotency key is required.");
  if (!normalizedReason || normalizedReason.length > 500) throw new Error("A bounded refund reason is required.");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Refund amount must be a positive integer amount.");
  const eventKey = `booking:refund:${key3}`;
  const identity = {
    request: { paymentId, amountMinor, reason: normalizedReason },
    aggregateType: "booking_payment",
    aggregateId: paymentId,
    action: "refund_requested"
  };
  return runSerializableTransaction(context, async (tx) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-payment-refund:${paymentId}`);
    const payment = await prisma.bookingPayment.findUnique({
      where: { id: paymentId },
      include: { paymentProvider: true, booking: true }
    });
    if (!payment || payment.status !== "completed" || payment.paymentType === "refund") {
      throw new Error("Only a completed capture can be refunded.");
    }
    const availableMinor = await refundablePaymentMinor(prisma, payment);
    if (amountMinor > availableMinor) throw new Error(`Refund exceeds the available amount of ${availableMinor} minor units.`);
    let result;
    if (payment.paymentProvider?.code === "pp_manual_manual") {
      const refund = await createManualRefundInTransaction({
        tx,
        sourcePayment: payment,
        amountMinor,
        reason: normalizedReason,
        eventKey,
        actorId
      });
      await recomputeBookingPaymentState(prisma, payment.bookingId);
      result = { status: "recorded", paymentId: refund.id, intentId: null, amountMinor };
    } else {
      if (!payment.paymentProvider || !isOnlinePaymentProviderCode(payment.paymentProvider.code)) {
        throw new Error("This payment provider does not support the durable refund workflow.");
      }
      const providerPaymentId = payment.providerCaptureId || payment.providerPaymentId || payment.stripePaymentIntentId;
      if (!providerPaymentId) throw new Error("The captured payment is missing its provider identifier.");
      const intentKey = `${eventKey}:${payment.id}`;
      const intent = await prisma.refundIntent.create({
        data: {
          intentKey,
          requestHash: hashLifecycleRequest({ paymentId, amountMinor, reason: normalizedReason }),
          cancellationEventKey: "",
          propertyKey: HOTEL_PROPERTY_KEY,
          bookingId: payment.bookingId,
          sourcePaymentId: payment.id,
          paymentProviderId: payment.paymentProvider.id,
          amountMinor,
          currencyCode: String(payment.currency || "USD").toUpperCase(),
          reason: normalizedReason,
          actorId,
          status: "pending",
          attempts: 0,
          maxAttempts: 8,
          availableAt: /* @__PURE__ */ new Date()
        }
      });
      result = { status: "queued", paymentId: payment.id, intentId: intent.id, amountMinor };
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId,
      identity,
      beforeSnapshot: { availableMinor },
      afterSnapshot: result,
      metadata: { bookingId: payment.bookingId, providerCode: payment.paymentProvider?.code || null }
    });
    if (result.status === "recorded") {
      await queueBookingCommunication(prisma, {
        bookingId: payment.bookingId,
        kind: "booking_refund",
        eventKey,
        cancellation: { summary: normalizedReason, refundableMinor: amountMinor, cancellationFeeMinor: 0 }
      });
    }
    return result;
  });
}

// features/keystone/lib/cancellationPolicy.ts
function safeMinor(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer amount.`);
  }
  return value;
}
function normalizeCancellationPolicy(value) {
  const policy = String(value || "").trim().toLowerCase();
  if (policy === "flexible" || policy === "moderate" || policy === "strict" || policy === "non_refundable") {
    return policy;
  }
  return "non_refundable";
}
function cancellationPolicyDescription(policyValue) {
  const policy = normalizeCancellationPolicy(policyValue);
  if (policy === "flexible") {
    return "Full refund until 48 hours before arrival; after that, the first night is retained.";
  }
  if (policy === "moderate") {
    return "Full refund until 7 days before arrival, 50% refund until 48 hours before arrival, then non-refundable.";
  }
  if (policy === "strict") {
    return "50% refund until 14 days before arrival; after that, the stay is non-refundable.";
  }
  return "This rate is non-refundable after booking.";
}
function calculateCancellationTerms({
  policy: policyValue,
  checkInDate,
  cancelledAt = /* @__PURE__ */ new Date(),
  capturedMinor,
  firstNightMinor,
  bookingTotalMinor = capturedMinor
}) {
  const policy = normalizeCancellationPolicy(policyValue);
  const captured = safeMinor(capturedMinor, "capturedMinor");
  const firstNight = safeMinor(firstNightMinor, "firstNightMinor");
  const bookingTotal = safeMinor(bookingTotalMinor, "bookingTotalMinor");
  const checkIn = new Date(checkInDate);
  const cancellation = new Date(cancelledAt);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(cancellation.getTime())) {
    throw new Error("Cancellation dates are invalid.");
  }
  const hoursBeforeArrival = (checkIn.getTime() - cancellation.getTime()) / 36e5;
  let cancellationFeeMinor = bookingTotal;
  let fullRefundDeadline = null;
  if (policy === "flexible") {
    fullRefundDeadline = new Date(checkIn.getTime() - 48 * 36e5);
    cancellationFeeMinor = hoursBeforeArrival >= 48 ? 0 : Math.min(bookingTotal, firstNight);
  } else if (policy === "moderate") {
    fullRefundDeadline = new Date(checkIn.getTime() - 7 * 24 * 36e5);
    cancellationFeeMinor = hoursBeforeArrival >= 7 * 24 ? 0 : hoursBeforeArrival >= 48 ? Math.ceil(bookingTotal / 2) : bookingTotal;
  } else if (policy === "strict") {
    cancellationFeeMinor = hoursBeforeArrival >= 14 * 24 ? Math.ceil(bookingTotal / 2) : bookingTotal;
  }
  const refundableMinor = Math.max(0, captured - cancellationFeeMinor);
  return {
    policy,
    refundableMinor,
    cancellationFeeMinor,
    capturedMinor: captured,
    summary: cancellationPolicyDescription(policy),
    fullRefundDeadline
  };
}

// features/keystone/lib/cancellationSettlement.ts
function cancellationSettlementStatus(cancellationAudit) {
  const metadata = cancellationAudit?.metadataSnapshot;
  return metadata && typeof metadata === "object" && metadata.source === "no_show" ? "no_show" : "cancelled";
}

// features/keystone/lib/bookingCancellation.ts
var CANCELLABLE_BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed"]);
var ACTIVE_REFUND_INTENT_STATUSES = ["pending", "processing", "failed", "dead_letter"];
var REFUND_MAX_ATTEMPTS = 8;
var TRANSACTION_RETRY_LIMIT = 5;
function requirePrismaResult2(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function retryableTransactionError(error) {
  const code = error?.code || error?.extensions?.prisma?.code;
  return code === "P2002" || code === "P2034";
}
function paymentMinor2(payment) {
  if (Number.isSafeInteger(payment.amountMinor)) return Math.abs(payment.amountMinor);
  const value = Math.round(Math.abs(Number(payment.amount || 0)) * 100);
  if (!Number.isSafeInteger(value)) throw new Error("Payment amount cannot be represented in minor units.");
  return value;
}
function normalizeCancellationInput(input) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("A stable idempotency key is required.");
  const reason = String(input.refundReason || "Cancellation requested").trim();
  if (!reason || reason.length > 500) throw new Error("Cancellation reason is required.");
  return { bookingId: input.bookingId, reason, idempotencyKey };
}
async function applyCancellationFolioTerms(tx, booking, eventKey, cancellationFeeMinor) {
  const ensured = await ensureBookingFolio(tx, booking.id, { postSnapshotEntries: true });
  const activeLineIds = new Set(booking.lineItems.map((line) => line.id));
  const entries = await tx.prisma.folioEntry.findMany({
    where: { folioId: ensured.folioId },
    include: { reversedBy: true },
    orderBy: [{ postedAt: "asc" }, { id: "asc" }]
  });
  const now = /* @__PURE__ */ new Date();
  for (const entry of entries) {
    if (entry.sourceType !== "reservation_snapshot" || !activeLineIds.has(entry.sourceId) || entry.reversedBy) continue;
    const reversal = buildFolioReversalPosting(entry, {
      postingKey: `${eventKey}:reverse:${entry.id}`,
      reason: "Reservation cancelled under snapshotted rate terms"
    });
    await tx.prisma.folioEntry.create({
      data: {
        folioId: ensured.folioId,
        ...reversal,
        serviceDate: now,
        postedAt: now,
        metadataSnapshot: { ...reversal.metadataSnapshot, cancellationEventKey: eventKey }
      }
    });
  }
  if (cancellationFeeMinor > 0) {
    await tx.prisma.folioEntry.upsert({
      where: { postingKey: `${eventKey}:fee` },
      create: {
        folioId: ensured.folioId,
        postingKey: `${eventKey}:fee`,
        entryType: "adjustment",
        direction: "debit",
        amountMinor: cancellationFeeMinor,
        currencyCode: String(booking.currencyCode || "USD").toUpperCase(),
        description: "Cancellation fee due under booked rate terms",
        serviceDate: now,
        postedAt: now,
        sourceType: "system",
        sourceId: booking.id,
        metadataSnapshot: { cancellationEventKey: eventKey }
      },
      update: {}
    });
  }
  return ensured.folioId;
}
async function requestBookingCancellation({
  context,
  bookingId,
  refundReason,
  idempotencyKey,
  actorId,
  source = "guest",
  withinTransaction = false
}) {
  const normalized = normalizeCancellationInput({ bookingId, refundReason, idempotencyKey });
  const eventKey = `booking:cancel:${normalized.idempotencyKey}`;
  const identity = {
    request: { bookingId, refundReason: normalized.reason, source },
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "cancellation_requested"
  };
  const execute = async (tx) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) {
      const current = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!current) throw new Error("Cancellation replay evidence is incomplete.");
      return current;
    }
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ratePlan: true,
        lineItems: {
          where: { snapshotStatus: "active" },
          orderBy: [{ date: "asc" }, { id: "asc" }]
        },
        payments: { include: { paymentProvider: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        refundIntents: true
      }
    });
    if (!booking) throw new Error("Booking not found.");
    if (booking.status === "cancelled" || booking.status === "cancellation_pending") {
      throw new Error(`Booking is already ${booking.status.replaceAll("_", " ")}.`);
    }
    if (!CANCELLABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new Error(`A ${booking.status} booking cannot be cancelled.`);
    }
    if (source === "no_show" && booking.checkInDate > /* @__PURE__ */ new Date()) {
      throw new Error("A reservation cannot be marked no-show before its arrival time.");
    }
    const captures = booking.payments.filter(
      (payment) => payment.status === "completed" && payment.paymentType !== "refund" && paymentMinor2(payment) > 0
    );
    const refunds = booking.payments.filter(
      (payment) => payment.paymentType === "refund" && payment.status === "refunded"
    );
    const availableByPayment = /* @__PURE__ */ new Map();
    let availableCapturedMinor = 0;
    for (const payment of captures) {
      const settledRefundMinor = refunds.filter((refund) => refund.providerData?.sourcePaymentId === payment.id).reduce((sum, refund) => sum + paymentMinor2(refund), 0);
      const reservedRefundMinor = booking.refundIntents.filter((intent) => intent.sourcePaymentId === payment.id && ACTIVE_REFUND_INTENT_STATUSES.includes(intent.status)).reduce((sum, intent) => sum + intent.amountMinor, 0);
      const available = paymentMinor2(payment) - settledRefundMinor - reservedRefundMinor;
      if (available < 0) throw new Error("Recorded refunds exceed the captured payment.");
      availableByPayment.set(payment.id, available);
      availableCapturedMinor += available;
    }
    const firstRoomNight = booking.lineItems.find((line) => line.type === "room");
    const policy = firstRoomNight?.cancellationPolicySnapshot || booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy;
    const stayNights = Math.max(1, Math.round((booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 864e5));
    const bookingTotalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
    const firstNightMinor = Number(firstRoomNight?.totalPrice || 0) || Math.ceil(bookingTotalMinor / stayNights);
    const cancellationTerms = calculateCancellationTerms({
      policy,
      checkInDate: booking.checkInDate,
      cancelledAt: /* @__PURE__ */ new Date(),
      capturedMinor: availableCapturedMinor,
      firstNightMinor,
      bookingTotalMinor
    });
    const folioId = await applyCancellationFolioTerms(tx, booking, eventKey, cancellationTerms.cancellationFeeMinor);
    let remainingRefundMinor = cancellationTerms.refundableMinor;
    const createdIntentIds = [];
    const manualRefundIds = [];
    for (const payment of captures) {
      const available = availableByPayment.get(payment.id) || 0;
      const refundMinor = Math.min(available, remainingRefundMinor);
      if (refundMinor <= 0) continue;
      remainingRefundMinor -= refundMinor;
      if (payment.paymentProvider?.code === "pp_manual_manual") {
        const refund = await createManualRefundInTransaction({
          tx,
          sourcePayment: payment,
          amountMinor: refundMinor,
          reason: normalized.reason,
          eventKey: `${eventKey}:${payment.id}`,
          actorId: actorId || null
        });
        manualRefundIds.push(refund.id);
        continue;
      }
      if (!payment.paymentProvider || !isOnlinePaymentProviderCode(payment.paymentProvider.code)) {
        throw new Error("The captured payment provider does not support a durable refund workflow.");
      }
      const providerPaymentId = payment.providerCaptureId || payment.providerPaymentId || payment.stripePaymentIntentId;
      if (!providerPaymentId) throw new Error("A completed payment is missing its provider identifier.");
      const intentKey = `${eventKey}:${payment.id}`;
      const refundRequest = { bookingId, sourcePaymentId: payment.id, amountMinor: refundMinor, reason: normalized.reason };
      const intent = requirePrismaResult2(await prisma.refundIntent.create({
        data: {
          intentKey,
          requestHash: hashLifecycleRequest(refundRequest),
          cancellationEventKey: eventKey,
          propertyKey: HOTEL_PROPERTY_KEY,
          bookingId,
          sourcePaymentId: payment.id,
          paymentProviderId: payment.paymentProvider.id,
          amountMinor: refundMinor,
          currencyCode: String(payment.currency || "USD").toUpperCase(),
          reason: normalized.reason,
          actorId: actorId || null,
          status: "pending",
          attempts: 0,
          maxAttempts: REFUND_MAX_ATTEMPTS,
          availableAt: /* @__PURE__ */ new Date()
        },
        select: { id: true }
      }));
      createdIntentIds.push(intent.id);
    }
    if (remainingRefundMinor !== 0) throw new Error("Cancellation refund allocation did not match captured payment evidence.");
    const hasOutstandingRefunds = createdIntentIds.length > 0 || booking.refundIntents.some(
      (intent) => ["pending", "processing", "failed", "dead_letter"].includes(intent.status)
    );
    const retainedMinor = Math.max(0, availableCapturedMinor - cancellationTerms.refundableMinor);
    const outstandingFeeMinor = Math.max(0, cancellationTerms.cancellationFeeMinor - retainedMinor);
    const finalPaymentStatus = outstandingFeeMinor > 0 ? retainedMinor > 0 ? "partial" : "unpaid" : availableCapturedMinor > 0 && cancellationTerms.refundableMinor === availableCapturedMinor ? "refunded" : booking.paymentStatus;
    const now = /* @__PURE__ */ new Date();
    const updated = requirePrismaResult2(await prisma.booking.update({
      where: { id: bookingId },
      data: hasOutstandingRefunds ? { status: "cancellation_pending", balanceDueMinor: outstandingFeeMinor, balanceDue: outstandingFeeMinor / 100 } : {
        status: source === "no_show" ? "no_show" : "cancelled",
        paymentStatus: finalPaymentStatus,
        balanceDueMinor: outstandingFeeMinor,
        balanceDue: outstandingFeeMinor / 100,
        cancelledAt: now
      }
    }));
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: actorId || null,
      identity,
      beforeSnapshot: { status: booking.status, paymentStatus: booking.paymentStatus, balanceDue: booking.balanceDue },
      afterSnapshot: {
        status: updated.status,
        folioId,
        refundIntentIds: createdIntentIds,
        manualRefundIds,
        cancellationTerms
      },
      metadata: { confirmationNumber: booking.confirmationNumber, refundReason: normalized.reason, source }
    });
    if (!hasOutstandingRefunds) {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: source === "no_show" ? "booking_no_show" : "booking_cancelled",
        eventKey,
        cancellation: {
          summary: cancellationTerms.summary,
          refundableMinor: cancellationTerms.refundableMinor,
          cancellationFeeMinor: cancellationTerms.cancellationFeeMinor
        }
      });
    }
    return updated;
  };
  if (withinTransaction) return execute(context);
  for (let attempt = 1; attempt <= TRANSACTION_RETRY_LIMIT; attempt += 1) {
    try {
      return await context.transaction(execute, { maxWait: 5e3, timeout: 3e4, isolationLevel: "ReadCommitted" });
    } catch (error) {
      if (!retryableTransactionError(error) || attempt === TRANSACTION_RETRY_LIMIT) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
  throw new Error("Cancellation transaction retry limit exceeded.");
}
async function claimRefundIntents(prisma, options) {
  const workerId = String(options.workerId || "").trim();
  if (!workerId) throw new Error("Refund workerId is required.");
  const now = options.now || /* @__PURE__ */ new Date();
  const limit = Math.min(50, Math.max(1, Number(options.limit || 10)));
  const leaseMs = Math.min(15 * 6e4, Math.max(5e3, Number(options.leaseMs || 6e4)));
  const leaseToken = `${workerId}:${(0, import_node_crypto6.randomUUID)()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return requirePrismaResult2(await prisma.$queryRaw(import_client.Prisma.sql`
    WITH candidates AS (
      SELECT "id" FROM "RefundIntent"
      WHERE "propertyKey" = ${HOTEL_PROPERTY_KEY}
        AND (("status" IN ('pending','failed') AND "availableAt" <= ${now})
          OR ("status" = 'processing' AND "leaseExpiresAt" <= ${now}))
      ORDER BY "availableAt", "createdAt", "id"
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE "RefundIntent" AS intent
    SET "status"='processing', "attempts"=intent."attempts"+1,
        "leaseToken"=${leaseToken}, "leaseExpiresAt"=${leaseExpiresAt},
        "lastAttemptAt"=${now}, "updatedAt"=${now}
    FROM candidates WHERE intent."id"=candidates."id"
    RETURNING intent."id", intent."intentKey", intent."cancellationEventKey", intent."propertyKey",
      intent."booking" AS "bookingId", intent."sourcePayment" AS "sourcePaymentId",
      intent."paymentProvider" AS "paymentProviderId", intent."amountMinor",
      intent."currencyCode", intent."reason", intent."actorId", intent."attempts", intent."maxAttempts",
      intent."leaseToken"
  `));
}
function retryDelay(attempts) {
  return Math.min(60 * 6e4, 5e3 * 2 ** Math.max(0, Math.min(10, attempts - 1)));
}
async function failRefundIntent(prisma, intent, error) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2e3);
  const dead = intent.attempts >= intent.maxAttempts;
  await prisma.refundIntent.updateMany({
    where: { id: intent.id, status: "processing", leaseToken: intent.leaseToken },
    data: {
      status: dead ? "dead_letter" : "failed",
      lastError: message,
      availableAt: new Date(Date.now() + retryDelay(intent.attempts)),
      deadLetteredAt: dead ? /* @__PURE__ */ new Date() : null,
      leaseToken: "",
      leaseExpiresAt: null
    }
  });
  return dead;
}
async function settleRefundIntent(context, intent, providerResult) {
  return context.transaction(async (tx) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-refund:${intent.intentKey}`);
    const current = await prisma.refundIntent.findUnique({
      where: { id: intent.id },
      include: { sourcePayment: true, paymentProvider: true, booking: true }
    });
    if (current?.status === "succeeded") return;
    if (!current || current.status !== "processing" || current.leaseToken !== intent.leaseToken) {
      throw new Error("Refund intent lease was lost.");
    }
    const providerRefundId = String(providerResult?.data?.id || providerResult?.data?.refund_id || "").trim();
    if (!providerRefundId) throw new Error("Provider did not return durable refund evidence.");
    const returnedAmount = providerResult?.amount ?? providerResult?.data?.amount;
    if (returnedAmount !== void 0 && Number(returnedAmount) !== current.amountMinor) {
      throw new Error("Provider refund amount does not match the durable intent.");
    }
    const refundId = `refund_${(0, import_node_crypto6.createHash)("sha256").update(current.intentKey).digest("hex").slice(0, 24)}`;
    let refund = await prisma.bookingPayment.findUnique({ where: { id: refundId } });
    if (!refund) {
      refund = await prisma.bookingPayment.create({
        data: {
          id: refundId,
          bookingId: current.bookingId,
          paymentProviderId: current.paymentProviderId,
          amountMinor: -current.amountMinor,
          amount: -(current.amountMinor / 100),
          currency: current.currencyCode,
          paymentType: "refund",
          paymentMethod: current.sourcePayment.paymentMethod || "credit_card",
          status: "refunded",
          providerPaymentId: current.sourcePayment.providerCaptureId || current.sourcePayment.providerPaymentId || current.sourcePayment.stripePaymentIntentId,
          providerRefundId,
          providerData: { providerResult: providerResult.data || {}, sourcePaymentId: current.sourcePaymentId, refundIntentKey: current.intentKey },
          description: `Refund for booking ${current.booking.confirmationNumber}`,
          processedAt: /* @__PURE__ */ new Date(),
          refundedAt: /* @__PURE__ */ new Date()
        }
      });
    }
    await ensurePaymentFolioPosting(tx, refund.id);
    await prisma.refundIntent.update({
      where: { id: current.id },
      data: { status: "succeeded", providerRefundId, providerResultSnapshot: providerResult.data || {}, completedAt: /* @__PURE__ */ new Date(), lastError: "", leaseToken: "", leaseExpiresAt: null }
    });
    const isCancellation = String(current.cancellationEventKey || "").startsWith("booking:cancel:");
    if (!isCancellation) {
      await recomputeBookingPaymentState(prisma, current.bookingId);
      await queueBookingCommunication(prisma, {
        bookingId: current.bookingId,
        kind: "booking_refund",
        eventKey: current.intentKey,
        cancellation: { summary: current.reason, refundableMinor: current.amountMinor, cancellationFeeMinor: 0 }
      });
      return;
    }
    const outstanding = await prisma.refundIntent.count({
      where: {
        bookingId: current.bookingId,
        cancellationEventKey: current.cancellationEventKey,
        status: { in: ["pending", "processing", "failed", "dead_letter"] }
      }
    });
    if (!outstanding) {
      const eventKey = `${current.cancellationEventKey}:completed`;
      const identity = {
        request: { bookingId: current.bookingId, cancellationEventKey: current.cancellationEventKey },
        aggregateType: "booking",
        aggregateId: current.bookingId,
        action: "cancellation_settled"
      };
      await lockHotelLifecycle(prisma, eventKey);
      if (!await findHotelLifecycleReplay(prisma, eventKey, identity)) {
        const [booking, ledger, cancellationAudit] = await Promise.all([
          prisma.booking.findUniqueOrThrow({ where: { id: current.bookingId } }),
          prisma.bookingPayment.findMany({
            where: { bookingId: current.bookingId, status: { in: ["completed", "refunded"] } },
            select: { paymentType: true, amountMinor: true }
          }),
          prisma.hotelAuditEvent.findUnique({ where: { eventKey: current.cancellationEventKey } })
        ]);
        const netRetainedMinor = Math.max(0, ledger.reduce((sum, payment) => sum + (payment.paymentType === "refund" ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
        const terms = cancellationAudit?.afterSnapshot?.cancellationTerms || {};
        const cancellationFeeMinor = Math.max(0, Number(terms.cancellationFeeMinor || 0));
        const outstandingFeeMinor = Math.max(0, cancellationFeeMinor - netRetainedMinor);
        const finalStatus = cancellationSettlementStatus(cancellationAudit);
        const updated = await prisma.booking.update({
          where: { id: current.bookingId },
          data: {
            status: finalStatus,
            paymentStatus: outstandingFeeMinor > 0 ? netRetainedMinor > 0 ? "partial" : "unpaid" : netRetainedMinor === 0 ? "refunded" : "paid",
            balanceDueMinor: outstandingFeeMinor,
            balanceDue: outstandingFeeMinor / 100,
            cancelledAt: /* @__PURE__ */ new Date()
          }
        });
        await recordHotelLifecycleEvent({
          prisma,
          eventKey,
          actorId: current.actorId,
          identity,
          beforeSnapshot: { status: booking.status, paymentStatus: booking.paymentStatus },
          afterSnapshot: { status: updated.status, paymentStatus: updated.paymentStatus, netRetainedMinor, outstandingFeeMinor },
          metadata: { cancellationEventKey: current.cancellationEventKey }
        });
        await queueBookingCommunication(prisma, {
          bookingId: current.bookingId,
          kind: finalStatus === "no_show" ? "booking_no_show" : "booking_cancelled",
          eventKey,
          cancellation: {
            summary: String(terms.summary || "The booked cancellation terms were applied."),
            refundableMinor: Number(terms.refundableMinor || 0),
            cancellationFeeMinor: Number(terms.cancellationFeeMinor || 0)
          }
        });
      }
    }
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}
async function dispatchRefundIntentBatch(context, options) {
  const intents = await claimRefundIntents(context.prisma, options);
  const result = { succeeded: 0, retried: 0, deadLettered: 0 };
  for (const intent of intents) {
    try {
      const [sourcePayment, provider] = await Promise.all([
        context.prisma.bookingPayment.findUnique({ where: { id: intent.sourcePaymentId } }),
        context.prisma.paymentProvider.findUnique({ where: { id: intent.paymentProviderId } })
      ]);
      if (!sourcePayment || !provider) throw new Error("Refund intent provider evidence is incomplete.");
      const paymentId = sourcePayment.providerCaptureId || sourcePayment.providerPaymentId || sourcePayment.stripePaymentIntentId;
      if (!paymentId) throw new Error("Refund source provider id is missing.");
      const providerResult = await refundPayment({
        provider,
        paymentId,
        amount: intent.amountMinor,
        currency: intent.currencyCode,
        idempotencyKey: intent.intentKey,
        metadata: { bookingId: intent.bookingId, sourcePaymentId: intent.sourcePaymentId, refundIntentKey: intent.intentKey }
      });
      await settleRefundIntent(context, intent, providerResult);
      result.succeeded += 1;
    } catch (error) {
      const dead = await failRefundIntent(context.prisma, intent, error);
      if (dead) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

// features/keystone/mutations/cancelBooking.ts
async function cancelBooking(_root, { bookingId, refundReason, idempotencyKey }, context) {
  const isStaff = permissions.canManageBookings({ session: context.session });
  if (!isStaff) await assertGuestBookingAccess(context, bookingId);
  await ensureDefaultPaymentProviders(context);
  return requestBookingCancellation({
    context,
    bookingId,
    refundReason,
    idempotencyKey,
    actorId: isStaff ? context.session.itemId : null,
    source: isStaff ? "staff" : "guest"
  });
}

// features/keystone/lib/channelSync.ts
var import_crypto = __toESM(require("crypto"));

// features/keystone/lib/guestProfiles.ts
function normalizeGuestEmail(value) {
  const email2 = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email2)) throw new Error("A valid guest email is required.");
  return email2;
}
function splitGuestName(value) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw new Error("Guest name is required.");
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || "Guest"
  };
}
async function ensureGuestProfile(context, { name, email: email2, phone }) {
  const normalizedEmail = normalizeGuestEmail(email2);
  const existing = await context.prisma.guest.findUnique({ where: { email: normalizedEmail } });
  if (existing) return existing;
  const names = splitGuestName(name);
  return context.prisma.guest.create({
    data: {
      ...names,
      email: normalizedEmail,
      phone: phone?.trim() || ""
    }
  });
}

// features/keystone/lib/inventoryLock.ts
function utcDay(date) {
  const day = new Date(date.getTime());
  day.setUTCHours(0, 0, 0, 0);
  return day;
}
function getInventoryLockKeys(roomTypeId, checkIn, checkOut) {
  if (!roomTypeId || Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    throw new Error("Invalid booking dates.");
  }
  const keys = [];
  const current = utcDay(checkIn);
  const end = utcDay(checkOut);
  while (current < end) {
    keys.push(
      `hotel-inventory:${roomTypeId}:${current.toISOString().slice(0, 10)}`
    );
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys.sort();
}
async function lockRoomInventory(prisma, roomTypeId, checkIn, checkOut) {
  for (const key3 of getInventoryLockKeys(roomTypeId, checkIn, checkOut)) {
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      key3
    );
  }
}

// features/keystone/lib/hotelAvailability.ts
var UNSAFE_SELL_STATUSES = /* @__PURE__ */ new Set(["maintenance", "out_of_order"]);
var MAX_PUBLIC_STAY_NIGHTS = 31;
function hotelStayDates(checkInValue, checkOutValue) {
  const checkIn = new Date(checkInValue);
  const checkOut = new Date(checkOutValue);
  checkIn.setUTCHours(0, 0, 0, 0);
  checkOut.setUTCHours(0, 0, 0, 0);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    throw new Error("Invalid stay dates.");
  }
  const days = [];
  for (const day = new Date(checkIn); day < checkOut; day.setUTCDate(day.getUTCDate() + 1)) days.push(new Date(day));
  if (days.length > MAX_PUBLIC_STAY_NIGHTS) throw new Error(`Stays may not exceed ${MAX_PUBLIC_STAY_NIGHTS} nights.`);
  return { checkIn, checkOut, days };
}
function key2(date) {
  return date.toISOString().slice(0, 10);
}
async function getHotelAvailability(context, options) {
  const { checkIn, checkOut, days } = hotelStayDates(options.checkInDate, options.checkOutDate);
  const roomTypes = await context.prisma.roomType.findMany({
    where: options.roomTypeId ? { id: options.roomTypeId } : void 0,
    orderBy: [{ baseRateMinor: "asc" }, { id: "asc" }],
    take: options.roomTypeId ? 1 : 100,
    include: {
      rooms: { select: { id: true, status: true } },
      roomImages: { orderBy: { order: "asc" }, take: 12 }
    }
  });
  if (options.roomTypeId && !roomTypes.length) throw new Error("Room type not found.");
  const roomTypeIds = roomTypes.map((item) => item.id);
  const [bookings, inventories, allocations] = await Promise.all([
    context.prisma.booking.findMany({
      where: {
        OR: [
          { status: { in: ["confirmed", "checked_in", "cancellation_pending"] } },
          { status: "pending", holdExpiresAt: { gt: /* @__PURE__ */ new Date() } }
        ],
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
        roomAssignments: { some: { roomTypeId: { in: roomTypeIds } } },
        ...options.excludeBookingId ? { id: { not: options.excludeBookingId } } : {}
      },
      take: 500,
      select: { id: true, checkInDate: true, checkOutDate: true, roomAssignments: { select: { roomTypeId: true } } }
    }),
    context.prisma.roomInventory.findMany({
      where: { roomTypeId: { in: roomTypeIds }, date: { gte: checkIn, lt: checkOut } },
      take: roomTypeIds.length * days.length
    }),
    context.prisma.groupBlockAllocation.findMany({
      where: {
        roomTypeId: { in: roomTypeIds },
        groupBlock: { status: { in: ["tentative", "definite"] }, arrivalDate: { lt: checkOut }, departureDate: { gt: checkIn } }
      },
      take: 500,
      include: { groupBlock: { select: { arrivalDate: true, departureDate: true } } }
    })
  ]);
  const inventoryMap = new Map(inventories.map((item) => [`${item.roomTypeId}:${key2(item.date)}`, item]));
  return roomTypes.map((roomType) => {
    const sellable = roomType.rooms.filter((room) => !UNSAFE_SELL_STATUSES.has(room.status)).length;
    const unavailablePhysical = roomType.rooms.length - sellable;
    const byDay = days.map((day) => {
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      const booked = bookings.filter(
        (booking) => booking.checkInDate < next && booking.checkOutDate > day && booking.roomAssignments.some((assignment) => assignment.roomTypeId === roomType.id)
      ).length;
      const held = allocations.filter(
        (allocation) => allocation.roomTypeId === roomType.id && allocation.groupBlock.arrivalDate < next && allocation.groupBlock.departureDate > day
      ).reduce((sum, allocation) => sum + Math.max(0, allocation.roomsHeld - allocation.roomsPickedUp), 0);
      const inventory = inventoryMap.get(`${roomType.id}:${key2(day)}`);
      const total = inventory?.totalRooms ?? roomType.rooms.length;
      const blocked = Math.max(inventory?.blockedRooms ?? 0, unavailablePhysical);
      const excludedInventory = options.excludeInventoryBooking;
      const selfInventory = excludedInventory && excludedInventory.roomTypeId === roomType.id && excludedInventory.checkInDate < next && excludedInventory.checkOutDate > day ? 1 : 0;
      const occupied = Math.max(Math.max(0, Number(inventory?.bookedRooms ?? 0) - selfInventory), booked);
      return { date: key2(day), available: Math.max(0, total - blocked - occupied - held), booked: occupied, held, blocked, total };
    });
    return { ...roomType, availabilityByDay: byDay, availableCount: Math.min(...byDay.map((day) => day.available)) };
  });
}
async function assertHotelAvailability(context, options) {
  const result = (await getHotelAvailability(context, options))[0];
  if (!result || result.availableCount < 1) {
    const soldOut = result?.availabilityByDay.find((day) => day.available < 1);
    throw new Error(`Room type is sold out${soldOut ? ` on ${soldOut.date}` : ""}.`);
  }
  return result;
}

// features/keystone/lib/bookingAmendment.ts
function must2(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function inventoryDayKeys(roomTypeId, start, end, delta, deltas) {
  for (const day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const key3 = `${roomTypeId}:${date.toISOString().slice(0, 10)}`;
    const existing = deltas.get(key3);
    deltas.set(key3, { roomTypeId, date, delta: (existing?.delta || 0) + delta });
  }
}
function testFailure(stage) {
  if (process.env.NODE_ENV === "test" && process.env.HOTEL_AMENDMENT_FAIL_AFTER === stage) throw new Error(`Injected amendment failure after ${stage}.`);
}
async function transferChannelInventory(prisma, booking, oldRoomTypeId, roomTypeId, checkIn, checkOut) {
  if (booking.source !== "ota") return;
  const deltas = /* @__PURE__ */ new Map();
  inventoryDayKeys(oldRoomTypeId, booking.checkInDate, booking.checkOutDate, -1, deltas);
  inventoryDayKeys(roomTypeId, checkIn, checkOut, 1, deltas);
  for (const [inventoryKey, item] of [...deltas.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (item.delta === 0) continue;
    const existing = must2(await prisma.roomInventory.findUnique({ where: { inventoryKey } }));
    if (!existing) {
      if (item.delta < 0) continue;
      const totalRooms = must2(await prisma.room.count({ where: { roomTypeId: item.roomTypeId } }));
      if (item.delta > totalRooms) throw new Error("Channel amendment exceeds physical room inventory.");
      must2(await prisma.roomInventory.create({ data: { inventoryKey, roomTypeId: item.roomTypeId, date: item.date, totalRooms, bookedRooms: item.delta, blockedRooms: 0 } }));
      continue;
    }
    const bookedRooms = Math.max(0, Number(existing.bookedRooms || 0) + item.delta);
    if (bookedRooms + Number(existing.blockedRooms || 0) > Number(existing.totalRooms || 0)) throw new Error("Channel amendment exceeds available room inventory.");
    must2(await prisma.roomInventory.update({ where: { id: existing.id }, data: { bookedRooms } }));
  }
}
async function amendUnpaidBooking({
  context,
  bookingId,
  checkInDate,
  checkOutDate,
  roomTypeId,
  guestName,
  guestEmail,
  guestProfileId,
  numberOfGuests,
  totalAmountMinor,
  currencyCode = "USD",
  idempotencyKey,
  source = "channel",
  withinTransaction = false,
  commercialPricing,
  actorId = null,
  queueCommunication = true
}) {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) throw new Error("Invalid amendment stay dates.");
  if (!Number.isSafeInteger(totalAmountMinor) || totalAmountMinor < 0) throw new Error("Invalid amendment total.");
  const eventKey = String(idempotencyKey || "").trim();
  if (!eventKey) throw new Error("Amendment idempotency key is required.");
  if (commercialPricing && commercialPricing.totalMinor !== totalAmountMinor) throw new Error("Amendment pricing total is inconsistent.");
  const identity = { request: { bookingId, checkInDate: checkIn.toISOString(), checkOutDate: checkOut.toISOString(), roomTypeId, guestName, guestEmail, numberOfGuests, totalAmountMinor, currencyCode, source, commercialPricing }, aggregateType: "booking", aggregateId: bookingId, action: "commercial_terms_amended" };
  const execute = async (tx) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return prisma.booking.findUnique({ where: { id: bookingId } });
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: true, lineItems: { where: { snapshotStatus: "active" } }, folio: { include: { entries: { include: { reversedBy: true } } } }, payments: true }
    });
    if (!booking || !["pending", "confirmed"].includes(booking.status)) throw new Error("Only open, pre-arrival bookings can be amended.");
    const netPaidMinor = Math.max(0, booking.payments.filter((payment) => ["completed", "refunded"].includes(payment.status)).reduce((sum, payment) => sum + (payment.paymentType === "refund" ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
    if (totalAmountMinor < netPaidMinor) {
      throw new Error(`Refund ${netPaidMinor - totalAmountMinor} minor units through the payment workflow before applying this lower-priced amendment.`);
    }
    const currentRoomTypeId = booking.roomAssignments[0]?.roomTypeId;
    if (!currentRoomTypeId) throw new Error("Booking room type is missing.");
    await lockRoomInventory(prisma, currentRoomTypeId, booking.checkInDate, booking.checkOutDate);
    await lockRoomInventory(prisma, roomTypeId, checkIn, checkOut);
    for (const assignment2 of booking.roomAssignments.filter((item) => item.roomId).sort((a, b) => a.roomId.localeCompare(b.roomId))) {
      await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${assignment2.roomId}`);
      const conflict = await prisma.roomAssignment.findFirst({
        where: {
          roomId: assignment2.roomId,
          bookingId: { not: bookingId },
          booking: {
            status: { in: ["pending", "confirmed", "checked_in"] },
            checkInDate: { lt: checkOut },
            checkOutDate: { gt: checkIn }
          }
        },
        include: { room: true, booking: true }
      });
      if (conflict?.booking) {
        throw new Error(`Room ${conflict.room?.roomNumber || assignment2.roomId} conflicts with ${conflict.booking.confirmationNumber} for the amended dates.`);
      }
    }
    await assertHotelAvailability(tx, {
      roomTypeId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      excludeBookingId: bookingId,
      excludeInventoryBooking: booking.source === "ota" ? { roomTypeId: currentRoomTypeId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate } : void 0
    });
    await transferChannelInventory(prisma, booking, currentRoomTypeId, roomTypeId, checkIn, checkOut);
    testFailure("inventory");
    const ensured = await ensureBookingFolio(tx, bookingId, { postSnapshotEntries: true });
    const folio = await prisma.folio.findUniqueOrThrow({ where: { id: ensured.folioId }, include: { entries: { include: { reversedBy: true } } } });
    const activeLineIds = new Set(booking.lineItems.map((line) => line.id));
    const posted = folio.entries.filter((entry) => entry.sourceType === "reservation_snapshot" && activeLineIds.has(entry.sourceId) && !entry.reversedBy);
    const now = /* @__PURE__ */ new Date();
    for (const entry of posted) {
      const reversal = buildFolioReversalPosting(entry, { postingKey: `${eventKey}:reverse:${entry.id}`, reason: `${source} commercial amendment` });
      await prisma.folioEntry.create({ data: { folioId: folio.id, ...reversal, serviceDate: now, postedAt: now, metadataSnapshot: { ...reversal.metadataSnapshot, source, amendmentEventKey: eventKey } } });
    }
    testFailure("reversals");
    await prisma.reservationLineItem.updateMany({ where: { id: { in: [...activeLineIds] } }, data: { snapshotStatus: "superseded", supersededAt: now } });
    const revision = Number(booking.pricingRevision || 1) + 1;
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 864e5));
    const fallbackNightly = Array.from({ length: nights }, (_, index) => Math.floor(totalAmountMinor / nights) + (index < totalAmountMinor % nights ? 1 : 0)).map((amountMinor, index) => ({ date: new Date(checkIn.getTime() + index * 864e5).toISOString().slice(0, 10), amountMinor }));
    const roomSubtotalMinor = commercialPricing?.roomSubtotalMinor ?? totalAmountMinor;
    const taxMinor = commercialPricing?.taxMinor ?? 0;
    const feesMinor = commercialPricing?.feesMinor ?? 0;
    const nightlyRates = commercialPricing?.nightlyRates ?? fallbackNightly;
    const balanceDueMinor = Math.max(0, totalAmountMinor - netPaidMinor);
    const paymentStatus = netPaidMinor <= 0 ? "unpaid" : balanceDueMinor === 0 ? "paid" : "partial";
    const updated = await prisma.booking.update({ where: { id: bookingId }, data: {
      guestName,
      guestEmail,
      guestProfileId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      numberOfGuests,
      roomRateMinor: roomSubtotalMinor,
      taxAmountMinor: taxMinor,
      feesAmountMinor: feesMinor,
      totalAmountMinor,
      balanceDueMinor,
      paymentStatus,
      currencyCode,
      roomRate: roomSubtotalMinor / 100,
      taxAmount: taxMinor / 100,
      feesAmount: feesMinor / 100,
      totalAmount: totalAmountMinor / 100,
      balanceDue: balanceDueMinor / 100,
      ratePlanId: commercialPricing?.ratePlanId ?? booking.ratePlanId,
      pricingVersion: commercialPricing?.pricingVersion ?? `${source}-amendment-v1`,
      pricingRevision: revision,
      pricingSnapshot: { snapshotKeyPrefix: `v${revision}`, source, nightlyRates, roomSubtotalMinor, taxMinor, feesMinor, totalMinor: totalAmountMinor, currencyCode, taxRateBasisPoints: commercialPricing?.taxRateBasisPoints ?? 0 }
    } });
    testFailure("booking");
    const assignment = booking.roomAssignments[0];
    await prisma.roomAssignment.update({ where: { id: assignment.id }, data: { roomTypeId, guestName, ratePerNightMinor: Math.round(roomSubtotalMinor / nights), ratePerNight: roomSubtotalMinor / nights / 100 } });
    await ensureReservationSnapshots(tx, bookingId);
    await ensureBookingFolio(tx, bookingId, { postSnapshotEntries: true });
    testFailure("snapshots");
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId,
      identity,
      beforeSnapshot: { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, roomTypeId: currentRoomTypeId, totalAmountMinor: booking.totalAmountMinor },
      afterSnapshot: { checkInDate: updated.checkInDate, checkOutDate: updated.checkOutDate, roomTypeId, totalAmountMinor, pricingRevision: revision, netPaidMinor, balanceDueMinor, paymentStatus },
      metadata: { source, reversedSnapshotPostingCount: posted.length }
    });
    if (queueCommunication) {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: "booking_updated",
        eventKey
      });
    }
    return updated;
  };
  if (withinTransaction) return execute(context);
  return context.transaction(execute, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}

// features/keystone/lib/channelSync.ts
var DEFAULT_RETRY_DELAY_MS = 2 * 60 * 1e3;
async function serializableChannelTransaction(context, operation) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await context.transaction(operation, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
    } catch (error) {
      const detail = `${error?.message || ""} ${error?.extensions?.debug?.message || ""}`;
      const retryable = error?.code === "P2034" || error?.code === "40001" || error?.extensions?.prisma?.code === "P2034" || /could not serialize|write conflict|deadlock/i.test(detail);
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
}
function getDateRangeDays(startDate, endDate) {
  const days = [];
  const current = new Date(startDate.getTime());
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate.getTime());
  end.setUTCHours(0, 0, 0, 0);
  while (current < end) {
    days.push(new Date(current.getTime()));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}
function getDayWindow(date) {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
function toCents(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}
function mapReservationPayload(raw) {
  const reservation = raw?.reservation ?? raw?.data ?? raw;
  return {
    externalId: reservation?.externalId || reservation?.id || reservation?.reservationId || "",
    status: reservation?.status || reservation?.channelStatus || raw?.eventType || raw?.type || "unknown",
    guestName: reservation?.guestName || reservation?.guest?.name || "Unknown Guest",
    guestEmail: reservation?.guestEmail || reservation?.guest?.email,
    checkInDate: reservation?.checkInDate || reservation?.arrivalDate,
    checkOutDate: reservation?.checkOutDate || reservation?.departureDate,
    roomTypeCode: reservation?.roomTypeCode || reservation?.roomTypeId || reservation?.roomType,
    roomTypeName: reservation?.roomTypeName,
    totalAmount: reservation?.totalAmount ?? reservation?.amount,
    commission: reservation?.commission,
    numberOfGuests: reservation?.numberOfGuests || reservation?.guests,
    specialRequests: reservation?.specialRequests,
    roomCount: reservation?.roomCount || reservation?.rooms || 1,
    rawData: reservation
  };
}
async function logChannelSyncEvent(context, data) {
  await context.sudo().query.ChannelSyncEvent.createOne({
    data: {
      channel: { connect: { id: data.channelId } },
      action: data.action,
      status: data.status,
      replayKey: data.replayKey,
      message: data.message,
      payload: data.payload || {},
      errorMessage: data.errorMessage,
      attempts: data.attempts ?? 0,
      nextAttemptAt: data.nextAttemptAt ? data.nextAttemptAt.toISOString() : null
    },
    query: "id"
  });
}
async function appendChannelSyncError(context, channelId, error) {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: "id syncErrors"
  });
  const existingErrors = Array.isArray(channel?.syncErrors) ? channel.syncErrors : [];
  const nextErrors = [...existingErrors, { message: error, occurredAt: (/* @__PURE__ */ new Date()).toISOString() }].slice(-20);
  await context.sudo().query.Channel.updateOne({
    where: { id: channelId },
    data: {
      syncErrors: nextErrors,
      syncStatus: "error",
      lastSyncAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
}
async function updateChannelSyncStatus(context, channelId, status) {
  await context.sudo().query.Channel.updateOne({
    where: { id: channelId },
    data: {
      syncStatus: status,
      lastSyncAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
}
async function resolveRoomTypeId(context, channel, payload) {
  const mappingRules = channel?.mappingRules || {};
  const roomTypeMapping = mappingRules.roomTypes || mappingRules;
  const mappedId = payload.roomTypeCode ? roomTypeMapping[payload.roomTypeCode] : null;
  if (mappedId) {
    const mappedRoom = await context.sudo().query.RoomType.findOne({
      where: { id: mappedId },
      query: "id name"
    });
    if (mappedRoom) {
      return mappedRoom.id;
    }
  }
  if (payload.roomTypeName) {
    const matched = await context.sudo().query.RoomType.findMany({
      where: { name: { equals: payload.roomTypeName } },
      query: "id name",
      take: 1
    });
    if (matched[0]) {
      return matched[0].id;
    }
  }
  return null;
}
async function getOrCreateRoomInventory(context, roomTypeId, date, roomsToBook) {
  const window = getDayWindow(date);
  const inventoryKey = `${roomTypeId}:${window.start.toISOString().slice(0, 10)}`;
  const existing = await context.sudo().query.RoomInventory.findMany({
    where: {
      roomType: { id: { equals: roomTypeId } },
      date: { gte: window.start.toISOString(), lt: window.end.toISOString() }
    },
    query: "id bookedRooms totalRooms blockedRooms date",
    take: 1
  });
  if (existing[0]) {
    return { record: existing[0], wasCreated: false };
  }
  const roomCount = await context.sudo().query.Room.count({
    where: { roomType: { id: { equals: roomTypeId } } }
  });
  if (roomsToBook > roomCount) {
    throw new Error("Channel reservation exceeds physical room inventory");
  }
  const record = await context.sudo().query.RoomInventory.createOne({
    data: {
      inventoryKey,
      date: window.start.toISOString(),
      roomType: { connect: { id: roomTypeId } },
      totalRooms: roomCount || 0,
      bookedRooms: Math.max(roomsToBook, 0),
      blockedRooms: 0
    },
    query: "id bookedRooms totalRooms blockedRooms date"
  });
  return { record, wasCreated: true };
}
async function adjustBookedRooms(context, roomTypeId, checkInDate, checkOutDate, delta) {
  if (!checkInDate || !checkOutDate) return;
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return;
  }
  const days = getDateRangeDays(start, end);
  for (const day of days) {
    const { record, wasCreated } = await getOrCreateRoomInventory(context, roomTypeId, day, delta);
    if (!wasCreated) {
      const nextBookedRooms = Math.max(0, (record.bookedRooms || 0) + delta);
      if (nextBookedRooms + (record.blockedRooms || 0) > (record.totalRooms || 0)) {
        throw new Error("Channel reservation exceeds available room inventory");
      }
      await context.sudo().query.RoomInventory.updateOne({
        where: { id: record.id },
        data: {
          bookedRooms: nextBookedRooms
        }
      });
    }
  }
}
async function upsertChannelReservation(context, channel, payload, eventType, verifiedEvent) {
  if (!payload.externalId) {
    throw new Error("Channel reservation payload missing externalId");
  }
  const channelKey = `${channel.id}:${payload.externalId}`;
  if (!verifiedEvent.eventKey || !/^[a-f0-9]{64}$/i.test(verifiedEvent.payloadHash)) throw new Error("Verified channel event identity is required");
  const existing = await context.sudo().query.ChannelReservation.findMany({
    where: {
      externalId: { equals: payload.externalId },
      channel: { id: { equals: channel.id } }
    },
    query: "id checkInDate checkOutDate roomType { id name } reservation { id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } } }",
    take: 1
  });
  const reservation = existing[0];
  const roomTypeId = await resolveRoomTypeId(context, channel, payload);
  const roomCount = payload.roomCount && payload.roomCount > 0 ? payload.roomCount : 1;
  if (!Number.isInteger(roomCount) || roomCount !== 1) throw new Error("Multi-room channel reservations require an explicit group allocation.");
  if (!reservation) {
    const guestProfile = await ensureGuestProfile(context, {
      name: payload.guestName,
      email: payload.guestEmail || `channel-${channel.id}-${payload.externalId}@invalid.local`
    });
    if (!roomTypeId) throw new Error("Channel reservation room type is not mapped");
    await lockRoomInventory(context.prisma, roomTypeId, new Date(payload.checkInDate), new Date(payload.checkOutDate));
    await assertHotelAvailability(context, { roomTypeId, checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate });
    const createdBooking = await context.prisma.booking.create({
      data: {
        confirmationNumber: `BK-OTA-${import_crypto.default.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail || guestProfile.email,
        guestProfileId: guestProfile.id,
        checkInDate: new Date(payload.checkInDate),
        checkOutDate: new Date(payload.checkOutDate),
        numberOfGuests: payload.numberOfGuests || 1,
        status: "confirmed",
        source: "ota",
        roomRateMinor: toCents(payload.totalAmount),
        taxAmountMinor: 0,
        feesAmountMinor: 0,
        totalAmountMinor: toCents(payload.totalAmount),
        depositAmountMinor: 0,
        balanceDueMinor: toCents(payload.totalAmount),
        currencyCode: "USD",
        roomRate: payload.totalAmount || 0,
        taxAmount: 0,
        feesAmount: 0,
        totalAmount: payload.totalAmount || 0,
        depositAmount: 0,
        balanceDue: payload.totalAmount || 0,
        pricingVersion: "channel-create-v1",
        pricingRevision: 1,
        pricingSnapshot: { snapshotKeyPrefix: "v1", source: "channel", roomSubtotalMinor: toCents(payload.totalAmount), taxMinor: 0, feesMinor: 0, totalMinor: toCents(payload.totalAmount), currencyCode: "USD" }
      }
    });
    await context.prisma.roomAssignment.create({
      data: {
        bookingId: createdBooking.id,
        roomTypeId,
        guestName: payload.guestName,
        ratePerNightMinor: Math.round(toCents(payload.totalAmount) / Math.max(1, Math.round((new Date(payload.checkOutDate).getTime() - new Date(payload.checkInDate).getTime()) / 864e5)))
      }
    });
    await ensureBookingHasGuestAccess(context, createdBooking.id);
    await ensureReservationSnapshots(context, createdBooking.id);
    await ensureBookingFolio(context, createdBooking.id);
    const booking = await context.sudo().query.Booking.findOne({
      where: { id: createdBooking.id },
      query: "id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } }"
    });
    if (!booking) throw new Error("Channel booking projection failed");
    await context.sudo().query.ChannelReservation.createOne({
      data: {
        channel: { connect: { id: channel.id } },
        channelKey,
        externalId: payload.externalId,
        reservation: { connect: { id: booking.id } },
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : void 0,
        checkInDate: new Date(payload.checkInDate).toISOString(),
        checkOutDate: new Date(payload.checkOutDate).toISOString(),
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: toCents(payload.totalAmount),
        commission: toCents(payload.commission),
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      query: "id"
    });
    if (roomTypeId) {
      await adjustBookedRooms(context, roomTypeId, payload.checkInDate, payload.checkOutDate, roomCount);
    }
    await recordHotelLifecycleEvent({
      prisma: context.prisma,
      eventKey: `channel-booking:create:${channelKey}`,
      actorId: null,
      identity: { request: { channelKey, checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate, totalAmountMinor: toCents(payload.totalAmount) }, aggregateType: "booking", aggregateId: booking.id, action: "created_from_channel" },
      afterSnapshot: { status: "confirmed", checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate, totalAmountMinor: toCents(payload.totalAmount) },
      metadata: { channelId: channel.id, externalId: payload.externalId }
    });
    return { action: "created", booking };
  }
  if (eventType === "cancel") {
    if (!reservation.reservation?.id) throw new Error("Channel reservation is not linked to a booking");
    await requestBookingCancellation({
      context,
      bookingId: reservation.reservation.id,
      refundReason: `Channel cancellation ${channelKey}`,
      idempotencyKey: `channel:${channelKey}:cancel:${verifiedEvent.eventKey}`,
      actorId: null,
      source: "channel",
      withinTransaction: true
    });
    if (reservation.roomType?.id) {
      await adjustBookedRooms(context, reservation.roomType.id, reservation.checkInDate, reservation.checkOutDate, -roomCount);
    }
    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        channelStatus: "cancelled",
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
        syncErrors: []
      }
    });
    return { action: "cancellation_requested", booking: reservation.reservation };
  }
  if (eventType === "modify") {
    const guestProfile = await ensureGuestProfile(context, {
      name: payload.guestName,
      email: payload.guestEmail || `channel-${channel.id}-${payload.externalId}@invalid.local`
    });
    if (!reservation.reservation?.id || !roomTypeId) throw new Error("Channel modification lacks booking or room-type binding");
    await amendUnpaidBooking({
      context,
      bookingId: reservation.reservation.id,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      roomTypeId,
      guestName: payload.guestName,
      guestEmail: payload.guestEmail || guestProfile.email,
      guestProfileId: guestProfile.id,
      numberOfGuests: payload.numberOfGuests || 1,
      totalAmountMinor: toCents(payload.totalAmount),
      idempotencyKey: `channel:${channelKey}:modify:${verifiedEvent.eventKey}`,
      source: "channel",
      withinTransaction: true
    });
    const updatedBooking = await context.sudo().query.Booking.findOne({
      where: { id: reservation.reservation.id },
      query: "id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } }"
    });
    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : void 0,
        checkInDate: new Date(payload.checkInDate).toISOString(),
        checkOutDate: new Date(payload.checkOutDate).toISOString(),
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: toCents(payload.totalAmount),
        commission: toCents(payload.commission),
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return { action: "modified", booking: updatedBooking };
  }
  await context.sudo().query.ChannelReservation.updateOne({
    where: { id: reservation.id },
    data: {
      channelStatus: payload.status,
      rawData: payload.rawData || {},
      lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  return { action: "updated", booking: reservation.reservation };
}
function resolveEventType(eventType) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("cancel")) return "cancel";
  if (normalized.includes("modif") || normalized.includes("update")) return "modify";
  if (normalized.includes("create") || normalized.includes("new")) return "create";
  return "create";
}
async function postToChannel(endpoint2, payload, headers) {
  const response = await fetch(endpoint2, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Channel request failed: ${response.status} ${responseText}`);
  }
  return response.json().catch(() => ({}));
}
async function pushInventoryToChannel(context, channelId, dateRange) {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: "id name isActive syncStatus credentials mappingRules"
  });
  if (!channel) {
    throw new Error("Channel not found");
  }
  const mode = channelIntegrationMode(channel);
  if (mode === "disabled" || mode === "demo") {
    return {
      channelId: channel.id,
      status: "skipped",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { message: `Channel inventory sync is explicitly ${mode}.`, mode }
    };
  }
  const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : /* @__PURE__ */ new Date();
  const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
  const inventoryRecords = await context.sudo().query.RoomInventory.findMany({
    where: {
      date: { gte: startDate.toISOString(), lte: endDate.toISOString() }
    },
    query: "id date totalRooms bookedRooms blockedRooms roomType { id name }"
  });
  const payload = {
    channelId: channel.id,
    channelName: channel.name,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    inventory: inventoryRecords.map((record) => ({
      date: record.date,
      roomTypeId: record.roomType?.id,
      roomTypeName: record.roomType?.name,
      totalRooms: record.totalRooms,
      bookedRooms: record.bookedRooms,
      blockedRooms: record.blockedRooms
    }))
  };
  try {
    const outbound = requireLiveChannelEndpoint(channel, "inventory");
    await postToChannel(outbound.endpoint, payload, {
      "X-OpenFront-Channel": channel.id,
      ...outbound.headers
    });
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: "inventory_push",
      status: "success",
      message: "Inventory pushed to channel",
      payload
    });
    await updateChannelSyncStatus(context, channel.id, "active");
    return {
      channelId: channel.id,
      status: "success",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { inventoryCount: inventoryRecords.length }
    };
  } catch (error) {
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: "inventory_push",
      status: "failed",
      message: "Inventory push failed",
      payload,
      errorMessage: error.message,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DEFAULT_RETRY_DELAY_MS)
    });
    await appendChannelSyncError(context, channel.id, error.message);
    return {
      channelId: channel.id,
      status: "failed",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { error: error.message }
    };
  }
}
async function pullReservationsFromChannel(context, channelId) {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: "id name isActive syncStatus credentials mappingRules"
  });
  if (!channel) {
    throw new Error("Channel not found");
  }
  const mode = channelIntegrationMode(channel);
  if (mode === "disabled" || mode === "demo") {
    return {
      channelId: channel.id,
      status: "skipped",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { message: `Channel reservation pull is explicitly ${mode}.`, mode }
    };
  }
  const payload = {
    channelId: channel.id,
    channelName: channel.name
  };
  try {
    const outbound = requireLiveChannelEndpoint(channel, "reservations");
    const reservationsResponse = await postToChannel(outbound.endpoint, payload, {
      "X-OpenFront-Channel": channel.id,
      ...outbound.headers
    });
    const reservations = Array.isArray(reservationsResponse?.reservations) ? reservationsResponse.reservations : [];
    for (const reservation of reservations) {
      const mapped = mapReservationPayload(reservation);
      const eventType = resolveEventType(mapped.status);
      const canonical = JSON.stringify(reservation);
      const payloadHash = import_crypto.default.createHash("sha256").update(canonical).digest("hex");
      const providerVersion = String(reservation?.eventId || reservation?.version || reservation?.updatedAt || payloadHash).slice(0, 255);
      const verifiedEvent = { eventKey: `pull:${channel.id}:${mapped.externalId}:${providerVersion}`, payloadHash };
      await serializableChannelTransaction(
        context,
        (transactionContext) => upsertChannelReservation(transactionContext, channel, mapped, eventType, verifiedEvent)
      );
    }
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: "reservation_pull",
      status: "success",
      message: "Reservations pulled from channel",
      payload: { reservationCount: reservations.length }
    });
    await updateChannelSyncStatus(context, channel.id, "active");
    return {
      channelId: channel.id,
      status: "success",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { reservationCount: reservations.length }
    };
  } catch (error) {
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: "reservation_pull",
      status: "failed",
      message: "Reservation pull failed",
      payload,
      errorMessage: error.message,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DEFAULT_RETRY_DELAY_MS)
    });
    await appendChannelSyncError(context, channel.id, error.message);
    return {
      channelId: channel.id,
      status: "failed",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { error: error.message }
    };
  }
}
async function retryFailedChannelSyncs(context) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const failedEvents = await context.sudo().query.ChannelSyncEvent.findMany({
    where: {
      status: { equals: "failed" },
      nextAttemptAt: { lte: now }
    },
    query: "id channel { id } action attempts payload",
    take: 25
  });
  let succeeded = 0;
  let failed = 0;
  for (const event of failedEvents) {
    const attempts = (event.attempts || 0) + 1;
    try {
      if (event.action === "inventory_push") {
        await pushInventoryToChannel(context, event.channel.id, event.payload?.dateRange);
      } else if (event.action === "reservation_pull") {
        await pullReservationsFromChannel(context, event.channel.id);
      }
      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: {
          status: "success",
          attempts,
          nextAttemptAt: null,
          message: "Retry succeeded"
        }
      });
      succeeded += 1;
    } catch (error) {
      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: {
          status: "failed",
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * DEFAULT_RETRY_DELAY_MS).toISOString(),
          errorMessage: error.message,
          message: "Retry failed"
        }
      });
      await appendChannelSyncError(context, event.channel.id, error.message);
      failed += 1;
    }
  }
  return {
    processed: failedEvents.length,
    succeeded,
    failed,
    retriedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// features/keystone/mutations/pushInventoryToChannel.ts
async function pushInventoryToChannelMutation(root, { channelId, dateRange }, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to sync channel inventory");
  }
  return pushInventoryToChannel(context, channelId, dateRange || void 0);
}

// features/keystone/mutations/pullReservationsFromChannel.ts
async function pullReservationsFromChannelMutation(root, { channelId }, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to sync channel reservations");
  }
  return pullReservationsFromChannel(context, channelId);
}

// features/keystone/mutations/initiateBookingPaymentSession.ts
var PAYABLE_BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed"]);
function requestHeader(context, name) {
  const headers = context?.req?.headers;
  const value = typeof headers?.get === "function" ? headers.get(name) : headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : typeof value === "string" ? value : "";
}
function canonicalHttpOrigin(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Payment return origin is invalid.");
  }
  return url.origin;
}
function paymentRequestOrigin(context, env = process.env) {
  const configured = String(env.NEXT_PUBLIC_SITE_URL || env.NEXTAUTH_URL || "").trim();
  if (configured) return canonicalHttpOrigin(configured);
  const browserOrigin = requestHeader(context, "origin");
  if (browserOrigin) return canonicalHttpOrigin(browserOrigin);
  if (env.NODE_ENV !== "production") {
    const host = requestHeader(context, "x-forwarded-host") || requestHeader(context, "host");
    const protocol = requestHeader(context, "x-forwarded-proto") || "http";
    if (host) return canonicalHttpOrigin(`${protocol}://${host}`);
  }
  throw new Error("Payment return origin could not be verified from this checkout request.");
}
function safePaymentReturnUrl(value, context, allowedPath, env = process.env) {
  if (!value) throw new Error("Payment return URL is required.");
  const url = new URL(value, paymentRequestOrigin(context, env));
  if (url.origin !== paymentRequestOrigin(context, env) || url.pathname !== allowedPath || url.username || url.password || url.hash) {
    throw new Error("Payment return URL is not allowed.");
  }
  return url.toString();
}
async function initiateBookingPaymentSession(root, {
  bookingId,
  paymentProviderCode,
  returnUrl,
  cancelUrl
}, context) {
  const sudoContext = context.sudo();
  await assertGuestBookingAccess(context, bookingId);
  assertCustomerPaymentProvider(paymentProviderCode);
  await ensureDefaultPaymentProviders(context);
  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      confirmationNumber
      guestEmail
      status
      totalAmount
      balanceDue
      totalAmountMinor
      balanceDueMinor
      currencyCode
      holdExpiresAt
      paymentStatus
      paymentSessions {
        id
        amount
        idempotencyKey
        isSelected
        isInitiated
        paymentProvider {
          id
          code
        }
        payment {
          id
        }
        data
      }
    `
  });
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (!PAYABLE_BOOKING_STATUSES.has(booking.status)) {
    throw new Error(`Payments cannot be started for a ${booking.status} booking.`);
  }
  if (booking.status === "pending" && booking.holdExpiresAt && new Date(booking.holdExpiresAt) <= /* @__PURE__ */ new Date()) {
    throw new Error("This reservation hold has expired.");
  }
  const amountInCents = Number(booking.balanceDueMinor || 0);
  if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0 || booking.paymentStatus === "paid") {
    throw new Error("This booking has no outstanding balance.");
  }
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: paymentProviderCode } });
  if (!provider || !isPaymentProviderConfigured(provider)) {
    throw new Error("Payment provider is disabled or not completely configured.");
  }
  const currencyCode = String(booking.currencyCode || "USD").toUpperCase();
  const idempotencyKey = `${booking.id}:${provider.code}:${amountInCents}:${currencyCode}`;
  const existingSession = booking.paymentSessions?.find(
    (session) => session.idempotencyKey === idempotencyKey
  );
  if (existingSession) {
    if (existingSession.payment?.id) {
      throw new Error("This booking balance has already been paid.");
    }
    if (existingSession.isInitiated) {
      throw new Error("This payment session is already being processed.");
    }
    for (const session of booking.paymentSessions || []) {
      if (session.id !== existingSession.id && session.isSelected) {
        await sudoContext.query.BookingPaymentSession.updateOne({
          where: { id: session.id },
          data: { isSelected: false }
        });
      }
    }
    await sudoContext.query.BookingPaymentSession.updateOne({
      where: { id: existingSession.id },
      data: { isSelected: true }
    });
    return await sudoContext.query.BookingPaymentSession.findOne({
      where: { id: existingSession.id },
      query: `
        id
        amount
        isSelected
        isInitiated
        data
        paymentProvider {
          id
          code
          name
          metadata
        }
      `
    });
  }
  const sessionData = await createPayment({
    provider,
    amount: amountInCents,
    currency: currencyCode,
    idempotencyKey,
    metadata: {
      bookingId: booking.id,
      confirmationNumber: booking.confirmationNumber,
      guestEmail: booking.guestEmail,
      returnUrl: safePaymentReturnUrl(
        returnUrl,
        context,
        paymentProviderCode === "pp_paypal_paypal" ? "/paypal/return" : "/stripe/return"
      ),
      cancelUrl: safePaymentReturnUrl(cancelUrl, context, "/book"),
      idempotencyKey
    }
  });
  for (const session of booking.paymentSessions || []) {
    if (session.isSelected) {
      await sudoContext.query.BookingPaymentSession.updateOne({
        where: { id: session.id },
        data: { isSelected: false }
      });
    }
  }
  try {
    return await sudoContext.query.BookingPaymentSession.createOne({
      data: {
        booking: { connect: { id: booking.id } },
        paymentProvider: { connect: { id: provider.id } },
        amount: amountInCents,
        isSelected: true,
        isInitiated: false,
        data: sessionData,
        idempotencyKey
      },
      query: `
        id
        amount
        isSelected
        isInitiated
        data
        paymentProvider {
          id
          code
          name
          metadata
        }
      `
    });
  } catch (error) {
    const concurrentSession = await sudoContext.query.BookingPaymentSession.findOne({
      where: { idempotencyKey },
      query: `
        id
        amount
        isSelected
        isInitiated
        data
        paymentProvider {
          id
          code
          name
          metadata
        }
      `
    });
    if (concurrentSession) return concurrentSession;
    throw error;
  }
}
var initiateBookingPaymentSession_default = initiateBookingPaymentSession;

// features/keystone/lib/bookingPaymentSettlement.ts
var import_node_crypto7 = require("node:crypto");
var TRANSACTION_OPTIONS = {
  maxWait: 5e3,
  timeout: 3e4,
  isolationLevel: "Serializable"
};
function isRetryableTransactionError2(error) {
  return error?.code === "P2034" || error?.code === "P2002";
}
async function serializableTransaction(context, operation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await context.transaction(operation, TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isRetryableTransactionError2(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Payment transaction retry limit exceeded.");
}
async function lockBookingPayment(prisma, bookingId) {
  await prisma.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    `hotel-payment:${bookingId}`
  );
}
function assertReplayMatches(existing, replay) {
  if (existing.providerCode !== replay.providerCode || existing.providerEventId !== replay.providerEventId || existing.eventType !== replay.eventType || existing.payloadHash !== replay.payloadHash) {
    throw new Error("Payment replay key is already bound to different evidence.");
  }
}
async function finalizeBookingPayment({
  context,
  bookingId,
  paymentSessionId,
  providerCode,
  providerPaymentId,
  providerCaptureId,
  amount,
  currencyCode,
  providerData,
  replay
}) {
  return serializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockBookingPayment(prisma, bookingId);
    if (replay) {
      const existingEvent = await prisma.paymentEvent.findUnique({
        where: { replayKey: replay.replayKey }
      });
      if (existingEvent) {
        assertReplayMatches(existingEvent, replay);
        return {
          paymentId: existingEvent.paymentId,
          replayed: true
        };
      }
    }
    const session = await prisma.bookingPaymentSession.findUnique({
      where: { id: paymentSessionId },
      include: { booking: true, paymentProvider: true, payment: true }
    });
    if (!session || session.bookingId !== bookingId || !session.booking) {
      throw new Error("Payment session not found for booking.");
    }
    if (!session.paymentProvider || session.paymentProvider.code !== providerCode) {
      throw new Error("Settlement provider does not match the payment session.");
    }
    if (session.payment) {
      if (replay) {
        await prisma.paymentEvent.create({
          data: {
            ...replay,
            status: "processed",
            processedAt: /* @__PURE__ */ new Date(),
            evidence: { duplicateSettlement: true },
            bookingId,
            paymentId: session.payment.id
          }
        });
      }
      await ensurePaymentFolioPosting(transactionContext, session.payment.id);
      return { paymentId: session.payment.id, replayed: true };
    }
    if (!["pending", "confirmed"].includes(String(session.booking.status))) {
      throw new Error(`Payments cannot be completed for a ${session.booking.status} booking.`);
    }
    if (!Number.isSafeInteger(amount) || amount !== session.amount) {
      throw new Error("Settlement amount does not match the payment session.");
    }
    if (currencyCode.trim().toUpperCase() !== "USD") {
      throw new Error("Settlement currency does not match the booking currency.");
    }
    if (!providerPaymentId) {
      throw new Error("Provider payment identifier is required.");
    }
    const now = /* @__PURE__ */ new Date();
    const payment = await prisma.bookingPayment.create({
      data: {
        paymentReference: `PAY-${(0, import_node_crypto7.randomUUID)().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        paymentType: "full_payment",
        amountMinor: amount,
        amount: amount / 100,
        currency: "USD",
        paymentMethod: providerCode === "pp_paypal_paypal" ? "paypal" : "credit_card",
        status: "completed",
        providerPaymentId,
        providerCaptureId: providerCaptureId || providerPaymentId,
        providerData: providerData || {},
        stripePaymentIntentId: providerCode === "pp_stripe_stripe" ? providerPaymentId : "",
        description: `Payment for booking ${session.booking.confirmationNumber}`,
        receiptEmail: session.booking.guestEmail,
        processedAt: now,
        bookingId,
        paymentProviderId: session.paymentProviderId,
        paymentSessionId: session.id
      }
    });
    await ensurePaymentFolioPosting(transactionContext, payment.id);
    await prisma.bookingPaymentSession.update({
      where: { id: session.id },
      data: {
        isInitiated: true,
        paymentAuthorizedAt: now,
        data: {
          ...session.data || {},
          completionResult: providerData || {}
        }
      }
    });
    const ledger = await prisma.bookingPayment.findMany({
      where: {
        bookingId,
        status: { in: ["completed", "refunded"] }
      },
      select: { paymentType: true, amountMinor: true }
    });
    const paidMinor = Math.max(0, ledger.reduce((sum, item) => sum + (item.paymentType === "refund" ? -Math.abs(Number(item.amountMinor || 0)) : Math.max(0, Number(item.amountMinor || 0))), 0));
    const totalMinor = Number(session.booking.totalAmountMinor || Math.round(Number(session.booking.totalAmount || 0) * 100));
    const remainingMinor = Math.max(0, totalMinor - paidMinor);
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: remainingMinor <= 0 ? "paid" : paidMinor > 0 ? "partial" : "unpaid",
        balanceDueMinor: remainingMinor,
        balanceDue: remainingMinor / 100,
        ...remainingMinor <= 0 ? {
          status: "confirmed",
          holdExpiresAt: null,
          confirmedAt: session.booking.confirmedAt || now
        } : {}
      }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey: `payment:${payment.id}:settled`,
      identity: {
        request: {
          bookingId,
          paymentSessionId: session.id,
          providerCode,
          providerPaymentId,
          amount,
          currencyCode: "USD"
        },
        aggregateType: "booking_payment",
        aggregateId: payment.id,
        action: "settled"
      },
      afterSnapshot: {
        status: payment.status,
        amountMinor: amount,
        currencyCode: "USD",
        bookingId
      },
      metadata: { providerCode, paymentSessionId: session.id }
    });
    if (remainingMinor <= 0) {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: "booking_confirmation",
        eventKey: `booking:${bookingId}:confirmation:v${session.booking.pricingRevision || 1}`
      });
    }
    if (replay) {
      await prisma.paymentEvent.create({
        data: {
          ...replay,
          status: "processed",
          processedAt: now,
          evidence: { amount, currencyCode: "USD", providerPaymentId },
          bookingId,
          paymentId: payment.id
        }
      });
    }
    return { paymentId: payment.id, replayed: false };
  });
}

// features/keystone/mutations/completeBookingPayment.ts
var PAYMENT_QUERY = `
  id
  status
  amount
  providerPaymentId
  stripePaymentIntentId
  paymentProvider { id code name metadata }
`;
async function completeBookingPayment(root, {
  bookingId,
  paymentSessionId,
  providerPaymentId
}, context) {
  await assertGuestBookingAccess(context, bookingId);
  await ensureDefaultPaymentProviders(context);
  const session = await context.sudo().query.BookingPaymentSession.findOne({
    where: { id: paymentSessionId },
    query: `
      id amount data
      payment { ${PAYMENT_QUERY} }
      booking { id status paymentStatus balanceDue }
      paymentProvider { id code name metadata }
    `
  });
  if (!session || session.booking?.id !== bookingId) {
    throw new Error("Payment session not found for booking.");
  }
  if (session.payment) return session.payment;
  if (!session.paymentProvider) throw new Error("Payment provider missing from session.");
  const provider = session.paymentProvider;
  assertCustomerPaymentProvider(provider.code);
  if (!["pending", "confirmed"].includes(session.booking.status)) {
    throw new Error(`Payments cannot be completed for a ${session.booking.status} booking.`);
  }
  if (session.booking.paymentStatus === "paid" || Number(session.booking.balanceDue || 0) <= 0) {
    throw new Error("This booking has no outstanding balance.");
  }
  const storedPaymentId = session.data?.paymentIntentId || session.data?.orderId || session.data?.id || null;
  if (providerPaymentId && storedPaymentId && providerPaymentId !== storedPaymentId) {
    throw new Error("Provider payment identifier does not match this payment session.");
  }
  const paymentIdentifier = providerPaymentId || storedPaymentId;
  if (!paymentIdentifier) {
    throw new Error("Provider payment identifier is required to complete payment.");
  }
  const result = await completePayment({
    provider,
    paymentId: paymentIdentifier,
    amount: session.amount
  });
  const settlement = result?.settlement || {};
  if (!settlement.isSettled) {
    throw new Error("The payment provider has not confirmed settlement.");
  }
  if (String(settlement.bookingId || "") !== bookingId) {
    throw new Error("Provider settlement is not linked to this booking.");
  }
  const finalized = await finalizeBookingPayment({
    context,
    bookingId,
    paymentSessionId: session.id,
    providerCode: provider.code,
    providerPaymentId: String(settlement.providerPaymentId || paymentIdentifier),
    providerCaptureId: String(settlement.providerPaymentId || paymentIdentifier),
    amount: Number(settlement.amount),
    currencyCode: String(settlement.currencyCode || ""),
    providerData: result.data || {}
  });
  return context.sudo().query.BookingPayment.findOne({
    where: { id: finalized.paymentId },
    query: PAYMENT_QUERY
  });
}
var completeBookingPayment_default = completeBookingPayment;

// features/keystone/mutations/createStorefrontBooking.ts
var import_node_crypto10 = require("node:crypto");

// features/keystone/lib/hotelPricing.ts
var import_node_crypto8 = require("node:crypto");
var QUOTE_TTL_MS = 15 * 6e4;
function minor(value, legacy) {
  const direct = Number(value);
  if (Number.isSafeInteger(direct) && direct >= 0) return direct;
  const converted = Math.round(Number(legacy || 0) * 100);
  if (!Number.isSafeInteger(converted) || converted < 0) throw new Error("Invalid monetary configuration.");
  return converted;
}
function quoteSecret() {
  const value = process.env.HOTEL_QUOTE_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-hotel-quote-secret-at-least-32");
  if (value.length < 32) throw new Error("Hotel quote signing is not configured.");
  return value;
}
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function signature(payload) {
  return (0, import_node_crypto8.createHmac)("sha256", quoteSecret()).update(payload).digest("base64url");
}
function safeEqual2(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && (0, import_node_crypto8.timingSafeEqual)(a, b);
}
async function calculateHotelPrice(context, input) {
  const { checkIn, checkOut, days } = hotelStayDates(input.checkInDate, input.checkOutDate);
  const adults = Number(input.numberOfAdults);
  const children = Number(input.numberOfChildren || 0);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) throw new Error("Invalid guest count.");
  const [roomType, ratePlan, settings, seasonalRates] = await Promise.all([
    context.prisma.roomType.findUnique({ where: { id: input.roomTypeId } }),
    context.prisma.ratePlan.findUnique({ where: { id: input.ratePlanId } }),
    context.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
    context.prisma.seasonalRate.findMany({
      where: { roomTypeId: input.roomTypeId, isActive: true, startDate: { lt: checkOut }, endDate: { gte: checkIn } },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
      take: 100
    })
  ]);
  if (!roomType || !ratePlan || ratePlan.roomTypeId !== roomType.id || ratePlan.status !== "active" || !ratePlan.isPublic) {
    throw new Error("Selected rate plan is not bookable.");
  }
  if (!settings) throw new Error("Hotel pricing settings are not configured.");
  if (adults + children > roomType.maxOccupancy) throw new Error(`${roomType.name} supports up to ${roomType.maxOccupancy} guests.`);
  if (days.length < Number(ratePlan.minimumStay || 1) || ratePlan.maximumStay && days.length > ratePlan.maximumStay) {
    throw new Error("Stay length does not satisfy the selected rate plan.");
  }
  const now = /* @__PURE__ */ new Date();
  const advanceDays = Math.floor((checkIn.getTime() - new Date(now.toISOString().slice(0, 10)).getTime()) / 864e5);
  if (advanceDays < Number(ratePlan.advanceBookingMin || 0) || ratePlan.advanceBookingMax && advanceDays > ratePlan.advanceBookingMax) {
    throw new Error("Booking window does not satisfy the selected rate plan.");
  }
  if (ratePlan.validFrom && checkIn < ratePlan.validFrom || ratePlan.validTo && checkOut > ratePlan.validTo) {
    throw new Error("Selected rate plan is not valid for the complete stay.");
  }
  const expectedPromo = String(ratePlan.promoCode || "").trim().toLowerCase();
  if (ratePlan.isPromotional && (!expectedPromo || String(input.promoCode || "").trim().toLowerCase() !== expectedPromo)) {
    throw new Error("A valid promotional code is required for this rate plan.");
  }
  const applicableDays = ratePlan.applicableDays || {};
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (days.some((day) => applicableDays[weekdays[day.getUTCDay()]] === false)) throw new Error("Selected rate plan is unavailable on one or more stay nights.");
  const baseRateMinor = minor(ratePlan.baseRateMinor, ratePlan.baseRate);
  const nightlyRates = days.map((day) => {
    const season = seasonalRates.find((candidate) => candidate.startDate <= day && candidate.endDate >= day);
    let amount = baseRateMinor;
    if (season) {
      if (season.priceMultiplier !== null && season.priceMultiplier !== void 0) amount = Math.round(amount * Number(season.priceMultiplier));
      amount += Number(season.priceAdjustment || 0);
      if (days.length < Number(season.minimumStay || 1)) throw new Error(`Stay does not satisfy seasonal rule ${season.name}.`);
    }
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Seasonal pricing produced an invalid amount.");
    return { date: day.toISOString().slice(0, 10), amountMinor: amount, seasonalRateId: season?.id || null, seasonalRateName: season?.name || null };
  });
  const roomSubtotalMinor = nightlyRates.reduce((sum, night) => sum + night.amountMinor, 0);
  const taxRateBasisPoints = Number(settings.taxRateBasisPoints || 0);
  const taxMinor = Math.round(roomSubtotalMinor * taxRateBasisPoints / 1e4);
  const feesMinor = Number(settings.serviceFeeMinor || 0);
  const totalMinor = roomSubtotalMinor + taxMinor + feesMinor;
  const currencyCode = String(ratePlan.currencyCode || roomType.currencyCode || settings.currencyCode || "USD").toUpperCase();
  if (new Set([ratePlan.currencyCode, roomType.currencyCode, settings.currencyCode].filter(Boolean).map((v) => v.toUpperCase())).size > 1) {
    throw new Error("Pricing currency configuration is inconsistent.");
  }
  return {
    roomType,
    ratePlan,
    settings,
    checkIn,
    checkOut,
    adults,
    children,
    numberOfGuests: adults + children,
    nightlyRates,
    roomSubtotalMinor,
    taxMinor,
    feesMinor,
    totalMinor,
    currencyCode,
    taxRateBasisPoints,
    pricingVersion: settings.pricingVersion || "hotel-pricing-v2"
  };
}
function issueHotelQuoteToken(quote) {
  const claims = {
    roomTypeId: quote.roomType.id,
    ratePlanId: quote.ratePlan.id,
    checkInDate: quote.checkIn.toISOString(),
    checkOutDate: quote.checkOut.toISOString(),
    adults: quote.adults,
    children: quote.children,
    roomSubtotalMinor: quote.roomSubtotalMinor,
    taxMinor: quote.taxMinor,
    feesMinor: quote.feesMinor,
    totalMinor: quote.totalMinor,
    currencyCode: quote.currencyCode,
    pricingVersion: quote.pricingVersion,
    expiresAt: Date.now() + QUOTE_TTL_MS
  };
  const payload = encode(claims);
  return `${payload}.${signature(payload)}`;
}
function verifyHotelQuoteToken(token, quote) {
  const [payload, supplied] = String(token || "").split(".");
  if (!payload || !supplied || !safeEqual2(signature(payload), supplied)) throw new Error("Quote identity is invalid.");
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Quote identity is invalid.");
  }
  const expected = {
    roomTypeId: quote.roomType.id,
    ratePlanId: quote.ratePlan.id,
    checkInDate: quote.checkIn.toISOString(),
    checkOutDate: quote.checkOut.toISOString(),
    adults: quote.adults,
    children: quote.children,
    roomSubtotalMinor: quote.roomSubtotalMinor,
    taxMinor: quote.taxMinor,
    feesMinor: quote.feesMinor,
    totalMinor: quote.totalMinor,
    currencyCode: quote.currencyCode,
    pricingVersion: quote.pricingVersion
  };
  if (claims.expiresAt < Date.now() || Object.entries(expected).some(([key3, value]) => claims[key3] !== value)) {
    throw new Error("Quote is stale; request a current price before booking.");
  }
  return claims;
}

// features/keystone/lib/abuseControl.ts
var import_node_crypto9 = require("node:crypto");
var import_client2 = require("@prisma/client");
function normalizeIp(value) {
  const ip = value.trim().replace(/^::ffff:/, "");
  return /^[a-f0-9:.]{2,64}$/i.test(ip) ? ip : "unknown";
}
function requestNetworkIdentity(context) {
  const req = context?.req;
  const trustMode = String(process.env.TRUST_PROXY || "off").toLowerCase();
  const railwayRequestId = String(req?.headers?.["x-railway-request-id"] || "");
  const railwayBoundary = trustMode === "railway" && Boolean(process.env.RAILWAY_ENVIRONMENT) && /^[a-zA-Z0-9_-]{8,128}$/.test(railwayRequestId);
  if (railwayBoundary) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0];
    if (forwarded) return normalizeIp(forwarded);
  }
  return normalizeIp(String(req?.socket?.remoteAddress || "unknown"));
}
async function enforceAbuseLimit(context, options) {
  const now = /* @__PURE__ */ new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / options.windowMs) * options.windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + options.windowMs * 2);
  const network = options.includeNetwork === false ? "global" : requestNetworkIdentity(context);
  const identity = `${network}:${String(options.identity || "").trim().toLowerCase().slice(0, 200)}`;
  const digest = (0, import_node_crypto9.createHash)("sha256").update(`${options.scope}:${identity}:${windowStartedAt.toISOString()}`).digest("hex");
  const rows = await context.prisma.$queryRaw(import_client2.Prisma.sql`
    INSERT INTO "HotelAbuseBucket" ("id", "bucketKey", "count", "windowStartedAt", "expiresAt")
    VALUES (${`abuse_${digest.slice(0, 24)}`}, ${digest}, 1, ${windowStartedAt}, ${expiresAt})
    ON CONFLICT ("bucketKey") DO UPDATE SET "count" = "HotelAbuseBucket"."count" + 1
    RETURNING "count"
  `);
  const count = Number(rows[0]?.count || 0);
  if (count > options.limit) {
    const error = new Error("Too many requests. Please wait and try again.");
    error.rateLimitEvidence = { scope: options.scope, count, limit: options.limit };
    throw error;
  }
}

// features/keystone/mutations/createStorefrontBooking.ts
function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 255) throw new Error(`${label} is required.`);
  return normalized;
}
async function getStorefrontBookingQuote(input, context) {
  const quote = await calculateHotelPrice(context, input);
  await assertHotelAvailability(context, input);
  return { ...quote, quoteToken: issueHotelQuoteToken(quote) };
}
async function createStorefrontBooking(_root, { data }, context) {
  await enforceAbuseLimit(context, { scope: "storefront-booking-create", identity: data.guestEmail, limit: 5, windowMs: 60 * 6e4 });
  const guestName = required(data.guestName, "Guest name");
  const guestEmail = required(data.guestEmail, "Guest email").toLowerCase();
  const checkIn = new Date(data.checkInDate);
  const checkOut = new Date(data.checkOutDate);
  const guestAccessToken = createGuestAccessToken();
  const booking = await context.transaction(async (tx) => {
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    const quote = await calculateHotelPrice(tx, data);
    await assertHotelAvailability(tx, data);
    verifyHotelQuoteToken(String(data.quoteToken || ""), quote);
    const guest = await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: data.guestPhone });
    const created = await tx.prisma.booking.create({
      data: {
        confirmationNumber: `BK-${(0, import_node_crypto10.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        guestName,
        guestEmail,
        guestPhone: data.guestPhone?.trim() || "",
        guestProfileId: guest.id,
        checkInDate: quote.checkIn,
        checkOutDate: quote.checkOut,
        numberOfGuests: quote.numberOfGuests,
        numberOfAdults: quote.adults,
        numberOfChildren: quote.children,
        roomRateMinor: quote.roomSubtotalMinor,
        taxAmountMinor: quote.taxMinor,
        feesAmountMinor: quote.feesMinor,
        totalAmountMinor: quote.totalMinor,
        depositAmountMinor: 0,
        balanceDueMinor: quote.totalMinor,
        currencyCode: quote.currencyCode,
        roomRate: quote.roomSubtotalMinor / 100,
        taxAmount: quote.taxMinor / 100,
        feesAmount: quote.feesMinor / 100,
        totalAmount: quote.totalMinor / 100,
        depositAmount: 0,
        balanceDue: quote.totalMinor / 100,
        ratePlanId: quote.ratePlan.id,
        pricingVersion: quote.pricingVersion,
        pricingRevision: 1,
        pricingSnapshot: {
          snapshotKeyPrefix: "v1",
          ratePlanId: quote.ratePlan.id,
          ratePlanName: quote.ratePlan.name,
          cancellationPolicy: quote.ratePlan.cancellationPolicy,
          mealPlan: quote.ratePlan.mealPlan,
          taxRateBasisPoints: quote.taxRateBasisPoints,
          nightlyRates: quote.nightlyRates,
          roomSubtotalMinor: quote.roomSubtotalMinor,
          taxMinor: quote.taxMinor,
          feesMinor: quote.feesMinor,
          totalMinor: quote.totalMinor,
          currencyCode: quote.currencyCode
        },
        status: "pending",
        paymentStatus: "unpaid",
        source: "website",
        holdExpiresAt: new Date(Date.now() + 30 * 6e4),
        specialRequests: data.specialRequests?.trim() || "",
        guestAccessTokenHash: hashGuestAccessToken(guestAccessToken),
        guestAccessTokenIssuedAt: /* @__PURE__ */ new Date()
      }
    });
    const averageNightMinor = Math.round(quote.roomSubtotalMinor / quote.nightlyRates.length);
    await tx.prisma.roomAssignment.create({
      data: {
        bookingId: created.id,
        roomTypeId: quote.roomType.id,
        guestName,
        ratePerNightMinor: averageNightMinor,
        ratePerNight: averageNightMinor / 100,
        specialRequests: data.specialRequests?.trim() || ""
      }
    });
    await ensureReservationSnapshots(tx, created.id);
    await ensureBookingFolio(tx, created.id);
    return tx.sudo().query.Booking.findOne({
      where: { id: created.id },
      query: `
        id confirmationNumber guestName guestEmail guestPhone checkInDate checkOutDate numberOfNights
        numberOfGuests numberOfAdults numberOfChildren roomRate taxAmount feesAmount totalAmount
        depositAmount balanceDue roomRateMinor taxAmountMinor feesAmountMinor totalAmountMinor
        depositAmountMinor balanceDueMinor currencyCode status paymentStatus specialRequests createdAt
        ratePlan { id name cancellationPolicy mealPlan }
        roomAssignments {
          id ratePerNight ratePerNightMinor guestName
          roomType { id name thumbnail roomImages(orderBy: { order: asc }) { id image { url } imagePath altText caption order isPrimary } }
          room { roomNumber }
        }
      `
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  setGuestBookingAccess(context, booking.id, guestAccessToken);
  return booking;
}
var createStorefrontBooking_default = createStorefrontBooking;

// features/keystone/mutations/createStaffBooking.ts
var import_node_crypto11 = require("node:crypto");
var STAFF_SOURCES = /* @__PURE__ */ new Set(["direct", "phone", "walk_in"]);
var STAFF_CREATE_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed"]);
function bounded2(value, label, max, required3 = true) {
  const normalized = String(value || "").trim();
  if (required3 && !normalized || normalized.length > max) {
    throw new Error(`${label} ${required3 ? "is required and " : ""}must be at most ${max} characters.`);
  }
  return normalized;
}
async function createStaffBooking(_root, { data }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to create staff reservations.");
  }
  const idempotencyKey = bounded2(data.idempotencyKey, "idempotencyKey", 200);
  const eventKey = `staff-booking:create:${idempotencyKey}`;
  const guestName = bounded2(data.guestName, "Guest name", 255);
  const guestEmail = bounded2(data.guestEmail, "Guest email", 320).toLowerCase();
  const guestPhone = bounded2(data.guestPhone, "Guest phone", 80, false);
  const specialRequests = bounded2(data.specialRequests, "Special requests", 2e3, false);
  const internalNotes = bounded2(data.internalNotes, "Internal notes", 4e3, false);
  const source = String(data.source || "phone").trim();
  const status = String(data.status || "confirmed").trim();
  if (!STAFF_SOURCES.has(source)) throw new Error("Staff reservation source must be direct, phone, or walk in.");
  if (!STAFF_CREATE_STATUSES.has(status)) throw new Error("Staff reservations must start pending or confirmed.");
  const request = {
    roomTypeId: data.roomTypeId,
    ratePlanId: data.ratePlanId,
    checkInDate: new Date(data.checkInDate).toISOString(),
    checkOutDate: new Date(data.checkOutDate).toISOString(),
    numberOfAdults: data.numberOfAdults,
    numberOfChildren: data.numberOfChildren || 0,
    promoCode: data.promoCode || null,
    guestName,
    guestEmail,
    guestPhone,
    specialRequests,
    internalNotes,
    source,
    status
  };
  const identity = {
    request,
    aggregateType: "booking",
    aggregateId: idempotencyKey,
    action: "staff_created"
  };
  const guestAccessToken = createGuestAccessToken();
  const bookingId = await context.transaction(async (tx) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) {
      const replayId = String(replay.afterSnapshot?.bookingId || "");
      if (!replayId) throw new Error("Staff reservation replay evidence is incomplete.");
      return replayId;
    }
    const checkIn = new Date(data.checkInDate);
    const checkOut = new Date(data.checkOutDate);
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    const quote = await calculateHotelPrice(tx, data);
    await assertHotelAvailability(tx, data);
    const guest = await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: guestPhone });
    const now = /* @__PURE__ */ new Date();
    const created = await tx.prisma.booking.create({
      data: {
        confirmationNumber: `BK-${(0, import_node_crypto11.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        guestName,
        guestEmail,
        guestPhone,
        guestProfileId: guest.id,
        checkInDate: quote.checkIn,
        checkOutDate: quote.checkOut,
        numberOfGuests: quote.numberOfGuests,
        numberOfAdults: quote.adults,
        numberOfChildren: quote.children,
        roomRateMinor: quote.roomSubtotalMinor,
        taxAmountMinor: quote.taxMinor,
        feesAmountMinor: quote.feesMinor,
        totalAmountMinor: quote.totalMinor,
        depositAmountMinor: 0,
        balanceDueMinor: quote.totalMinor,
        currencyCode: quote.currencyCode,
        roomRate: quote.roomSubtotalMinor / 100,
        taxAmount: quote.taxMinor / 100,
        feesAmount: quote.feesMinor / 100,
        totalAmount: quote.totalMinor / 100,
        depositAmount: 0,
        balanceDue: quote.totalMinor / 100,
        ratePlanId: quote.ratePlan.id,
        pricingVersion: quote.pricingVersion,
        pricingRevision: 1,
        pricingSnapshot: {
          snapshotKeyPrefix: "v1",
          source: "staff",
          ratePlanId: quote.ratePlan.id,
          ratePlanName: quote.ratePlan.name,
          cancellationPolicy: quote.ratePlan.cancellationPolicy,
          mealPlan: quote.ratePlan.mealPlan,
          taxRateBasisPoints: quote.taxRateBasisPoints,
          nightlyRates: quote.nightlyRates,
          roomSubtotalMinor: quote.roomSubtotalMinor,
          taxMinor: quote.taxMinor,
          feesMinor: quote.feesMinor,
          totalMinor: quote.totalMinor,
          currencyCode: quote.currencyCode
        },
        status,
        paymentStatus: "unpaid",
        source,
        holdExpiresAt: status === "pending" ? new Date(now.getTime() + 2 * 60 * 6e4) : null,
        confirmedAt: status === "confirmed" ? now : null,
        specialRequests,
        internalNotes,
        guestAccessTokenHash: hashGuestAccessToken(guestAccessToken),
        guestAccessTokenIssuedAt: now
      }
    });
    const averageNightMinor = Math.round(quote.roomSubtotalMinor / quote.nightlyRates.length);
    await tx.prisma.roomAssignment.create({
      data: {
        bookingId: created.id,
        roomTypeId: quote.roomType.id,
        guestName,
        ratePerNightMinor: averageNightMinor,
        ratePerNight: averageNightMinor / 100,
        specialRequests
      }
    });
    await ensureReservationSnapshots(tx, created.id);
    await ensureBookingFolio(tx, created.id);
    await recordHotelLifecycleEvent({
      prisma: tx.prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      afterSnapshot: {
        bookingId: created.id,
        confirmationNumber: created.confirmationNumber,
        status,
        source,
        totalAmountMinor: quote.totalMinor,
        currencyCode: quote.currencyCode
      }
    });
    if (status === "confirmed") {
      await queueBookingCommunication(tx.prisma, {
        bookingId: created.id,
        kind: "booking_confirmation",
        eventKey: `booking:${created.id}:confirmation:v1`
      });
    }
    return created.id;
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/mutations/amendStaffBooking.ts
async function amendStaffBooking(_root, {
  bookingId,
  checkInDate,
  checkOutDate,
  roomTypeId,
  ratePlanId,
  promoCode,
  idempotencyKey
}, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to amend staff reservations.");
  }
  const booking = await context.prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, payments: true }
  });
  if (!booking || !["pending", "confirmed"].includes(booking.status)) {
    throw new Error("Only open, pre-arrival reservations can be amended.");
  }
  const selectedRoomTypeId = String(roomTypeId || booking.roomAssignments[0]?.roomTypeId || "");
  const selectedRatePlanId = String(ratePlanId || booking.ratePlanId || "");
  if (!selectedRoomTypeId || !selectedRatePlanId) {
    throw new Error("Reservation room type and rate plan are required for repricing.");
  }
  const selectedRatePlan = await context.prisma.ratePlan.findUnique({
    where: { id: selectedRatePlanId },
    select: { isPromotional: true, promoCode: true }
  });
  if (!selectedRatePlan) throw new Error("Selected rate plan was not found.");
  const effectivePromoCode = promoCode || (selectedRatePlan.isPromotional ? selectedRatePlan.promoCode : null);
  const quote = await calculateHotelPrice(context, {
    roomTypeId: selectedRoomTypeId,
    ratePlanId: selectedRatePlanId,
    checkInDate,
    checkOutDate,
    numberOfAdults: Number(booking.numberOfAdults || booking.numberOfGuests || 1),
    numberOfChildren: Number(booking.numberOfChildren || 0),
    promoCode: effectivePromoCode
  });
  return amendUnpaidBooking({
    context,
    bookingId,
    checkInDate: quote.checkIn.toISOString(),
    checkOutDate: quote.checkOut.toISOString(),
    roomTypeId: selectedRoomTypeId,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestProfileId: booking.guestProfileId,
    numberOfGuests: quote.numberOfGuests,
    totalAmountMinor: quote.totalMinor,
    currencyCode: quote.currencyCode,
    idempotencyKey,
    source: "staff-modification",
    actorId: context.session.itemId,
    commercialPricing: {
      ratePlanId: quote.ratePlan.id,
      pricingVersion: quote.pricingVersion,
      roomSubtotalMinor: quote.roomSubtotalMinor,
      taxMinor: quote.taxMinor,
      feesMinor: quote.feesMinor,
      totalMinor: quote.totalMinor,
      taxRateBasisPoints: quote.taxRateBasisPoints,
      nightlyRates: quote.nightlyRates
    }
  });
}

// features/keystone/mutations/submitHotelContactMessage.ts
async function submitHotelContactMessage(_root, {
  name,
  email: email2,
  phone,
  subject,
  message,
  idempotencyKey
}, context) {
  await enforceAbuseLimit(context, {
    scope: "hotel-contact-message",
    identity: String(email2 || "").trim().toLowerCase(),
    limit: 5,
    windowMs: 60 * 6e4
  });
  return queueContactCommunication(context.prisma, {
    name,
    email: email2,
    phone,
    subject,
    message,
    idempotencyKey
  });
}

// features/keystone/mutations/requestBookingPaymentRefund.ts
async function requestBookingPaymentRefund2(_root, {
  paymentId,
  amountMinor,
  reason,
  idempotencyKey
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to refund booking payments.");
  }
  return requestBookingPaymentRefund({
    context,
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
    actorId: context.session.itemId
  });
}

// features/keystone/mutations/updateHotelPropertySettings.ts
var import_node_crypto12 = require("node:crypto");

// features/keystone/lib/hotelPropertySettings.ts
function haveHotelPricingInputsChanged(before, after) {
  return !before || before.currencyCode !== after.currencyCode || before.taxRateBasisPoints !== after.taxRateBasisPoints || before.serviceFeeMinor !== after.serviceFeeMinor;
}

// features/storefront/lib/storefront-theme.ts
var DEFAULT_STOREFRONT_ACCENT_PRESET = "brass";
var STOREFRONT_ACCENT_PRESETS = [
  {
    key: "brass",
    label: "Aged brass",
    description: "Warm and editorial",
    swatch: "#9a7046",
    tokens: {
      accent: "oklch(58% 0.09 65)",
      deep: "oklch(44% 0.085 58)",
      pale: "oklch(92% 0.03 78)",
      focus: "oklch(52% 0.11 62)"
    }
  },
  {
    key: "forest",
    label: "Forest",
    description: "Grounded and restorative",
    swatch: "#397354",
    tokens: {
      accent: "oklch(52% 0.09 150)",
      deep: "oklch(39% 0.075 150)",
      pale: "oklch(92% 0.028 145)",
      focus: "oklch(47% 0.1 150)"
    }
  },
  {
    key: "harbor",
    label: "Harbor",
    description: "Calm and coastal",
    swatch: "#44748b",
    tokens: {
      accent: "oklch(54% 0.075 225)",
      deep: "oklch(40% 0.07 230)",
      pale: "oklch(92% 0.025 220)",
      focus: "oklch(48% 0.095 230)"
    }
  },
  {
    key: "claret",
    label: "Claret",
    description: "Rich and intimate",
    swatch: "#8a4a55",
    tokens: {
      accent: "oklch(52% 0.1 15)",
      deep: "oklch(39% 0.085 15)",
      pale: "oklch(92% 0.025 15)",
      focus: "oklch(47% 0.115 15)"
    }
  }
];
var STOREFRONT_ACCENT_PRESET_KEYS = STOREFRONT_ACCENT_PRESETS.map(
  (preset) => preset.key
);
function parseStorefrontAccentPreset(value) {
  const normalized = String(value || "").trim();
  if (!STOREFRONT_ACCENT_PRESET_KEYS.includes(normalized)) {
    throw new Error("Storefront accent preset is invalid.");
  }
  return normalized;
}
function resolveStorefrontAccentPreset(value) {
  const key3 = STOREFRONT_ACCENT_PRESET_KEYS.includes(value) ? value : DEFAULT_STOREFRONT_ACCENT_PRESET;
  return STOREFRONT_ACCENT_PRESETS.find((preset) => preset.key === key3);
}

// features/keystone/mutations/updateHotelPropertySettings.ts
function text40(value, label, max, required3 = false) {
  const normalized = String(value || "").trim();
  if (required3 && !normalized || normalized.length > max) throw new Error(`${label} is invalid.`);
  return normalized;
}
function stayTime(value, label) {
  const normalized = text40(value, label, 20, true);
  if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM))$/i.test(normalized)) {
    throw new Error(`${label} must use 24-hour HH:mm or h:mm AM/PM format.`);
  }
  return normalized;
}
function imagePath(value, label) {
  const normalized = text40(value, label, 500);
  if (!normalized) return "";
  if (normalized.startsWith("/images/") && !normalized.includes("..") && !normalized.includes("\\")) return normalized;
  throw new Error(`${label} must be a canonical local /images/ path.`);
}
async function updateHotelPropertySettings(_root, { data, idempotencyKey }, context) {
  if (!permissions.canManageOnboarding({ session: context.session })) throw new Error("Not authorized to configure the property.");
  const key3 = String(idempotencyKey || "").trim();
  if (!key3 || key3.length > 180) throw new Error("A bounded idempotency key is required.");
  const eventKey = `hotel-settings:${key3}`;
  const currencyCode = text40(data.currencyCode, "Currency code", 3, true).toUpperCase();
  if (currencyCode !== "USD") throw new Error("The bounded initial release supports USD settlement only.");
  const taxRateBasisPoints = Number(data.taxRateBasisPoints);
  const serviceFeeMinor = Number(data.serviceFeeMinor);
  if (!Number.isSafeInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 1e4) throw new Error("Tax rate basis points must be between 0 and 10000.");
  if (!Number.isSafeInteger(serviceFeeMinor) || serviceFeeMinor < 0) throw new Error("Service fee must be a non-negative integer amount.");
  const contactEmail = text40(data.contactEmail, "Contact email", 320, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Contact email is invalid.");
  const propertyName = text40(data.propertyName, "Property name", 200, true);
  if (/\b(?:grand hotel|openfront(?: hotel)?|acme|demo)\b/i.test(propertyName)) throw new Error("Property name must use the real public hotel brand.");
  const normalized = {
    propertyName,
    tagline: text40(data.tagline, "Tagline", 300),
    contactEmail,
    contactPhone: text40(data.contactPhone, "Contact phone", 80, true),
    addressLine1: text40(data.addressLine1, "Address line 1", 250, true),
    addressLine2: text40(data.addressLine2, "Address line 2", 250),
    frontDeskCopy: text40(data.frontDeskCopy, "Front desk copy", 250),
    checkInTime: stayTime(data.checkInTime, "Check-in time"),
    checkOutTime: stayTime(data.checkOutTime, "Check-out time"),
    currencyCode,
    taxRateBasisPoints,
    serviceFeeMinor,
    storefrontAccentPreset: parseStorefrontAccentPreset(data.storefrontAccentPreset),
    heroImagePath: imagePath(data.heroImagePath, "Hero image path"),
    heroImageAltText: text40(data.heroImageAltText, "Hero image alt text", 300),
    heroImageCaption: text40(data.heroImageCaption, "Hero image caption", 500),
    amenityImagePath: imagePath(data.amenityImagePath, "Amenity image path"),
    amenityImageAltText: text40(data.amenityImageAltText, "Amenity image alt text", 300),
    amenityImageCaption: text40(data.amenityImageCaption, "Amenity image caption", 500),
    locationImagePath: imagePath(data.locationImagePath, "Location image path"),
    locationImageAltText: text40(data.locationImageAltText, "Location image alt text", 300),
    locationImageCaption: text40(data.locationImageCaption, "Location image caption", 500)
  };
  for (const [pathKey, altKey] of [["heroImagePath", "heroImageAltText"], ["amenityImagePath", "amenityImageAltText"], ["locationImagePath", "locationImageAltText"]]) {
    if (normalized[pathKey] && !normalized[altKey]) throw new Error(`${altKey} is required when ${pathKey} is set.`);
  }
  const identity = { request: normalized, aggregateType: "hotel_settings", aggregateId: HOTEL_PROPERTY_KEY, action: "updated" };
  await runSerializableTransaction(context, async (tx) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-settings:${HOTEL_PROPERTY_KEY}`);
    if (await findHotelLifecycleReplay(tx.prisma, eventKey, identity)) return;
    const [before, clock, nightAuditCount, bookingCount] = await Promise.all([
      tx.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
      tx.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
      tx.prisma.nightAuditRun.count(),
      tx.prisma.booking.count()
    ]);
    const pricingChanged = haveHotelPricingInputsChanged(before, normalized);
    const pricingVersion = pricingChanged ? `hotel-pricing-${(0, import_node_crypto12.createHash)("sha256").update(eventKey).digest("hex").slice(0, 16)}` : before.pricingVersion;
    const updated = await tx.prisma.hotelSettings.upsert({
      where: { id: 1 },
      create: { id: 1, pricingVersion, ...normalized },
      update: { ...normalized, pricingVersion }
    });
    const today = /* @__PURE__ */ new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    let businessDateAfter = clock?.currentBusinessDate || null;
    if (!clock && (nightAuditCount || bookingCount)) {
      throw new Error("Business date is missing for an operational property; restore it from audited evidence before setup.");
    }
    if (!clock) {
      await tx.prisma.hotelBusinessDate.create({ data: { id: 1, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: utcToday } });
      businessDateAfter = utcToday;
    } else if (!nightAuditCount && !bookingCount && clock.currentBusinessDate.getTime() !== utcToday.getTime()) {
      await tx.prisma.hotelBusinessDate.update({ where: { id: 1 }, data: { currentBusinessDate: utcToday } });
      businessDateAfter = utcToday;
    }
    await ensureDefaultPaymentProviders(tx);
    await tx.prisma.user.update({
      where: { id: context.session.itemId },
      data: { onboardingStatus: "completed" }
    });
    await recordHotelLifecycleEvent({
      prisma: tx.prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: before && { propertyName: before.propertyName, contactEmail: before.contactEmail, currencyCode: before.currencyCode, taxRateBasisPoints: before.taxRateBasisPoints, serviceFeeMinor: before.serviceFeeMinor, storefrontAccentPreset: before.storefrontAccentPreset },
      afterSnapshot: { propertyName: updated.propertyName, contactEmail: updated.contactEmail, currencyCode: updated.currencyCode, taxRateBasisPoints: updated.taxRateBasisPoints, serviceFeeMinor: updated.serviceFeeMinor, storefrontAccentPreset: updated.storefrontAccentPreset, pricingVersion: updated.pricingVersion, businessDateBefore: clock?.currentBusinessDate || null, businessDateAfter }
    });
  });
  return context.prisma.hotelSettings.findUnique({ where: { id: 1 } });
}

// features/keystone/mutations/updateBookingStatus.ts
var BLOCKED_CHECK_IN_ROOM_STATUSES = /* @__PURE__ */ new Set(["occupied", "cleaning", "maintenance", "out_of_order"]);
var TRANSITIONS = {
  pending: /* @__PURE__ */ new Set(["confirmed"]),
  confirmed: /* @__PURE__ */ new Set(["checked_in", "no_show"]),
  checked_in: /* @__PURE__ */ new Set(["checked_out"]),
  checked_out: /* @__PURE__ */ new Set(),
  cancelled: /* @__PURE__ */ new Set(),
  no_show: /* @__PURE__ */ new Set()
};
async function updateBookingStatus(root, {
  bookingId,
  status,
  idempotencyKey
}, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to update booking status.");
  }
  if (!TRANSITIONS[status]) throw new Error("Unsupported booking status.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  if (status === "no_show") {
    return requestBookingCancellation({
      context,
      bookingId,
      refundReason: "No-show policy settlement",
      idempotencyKey: eventKey,
      actorId: context.session.itemId,
      source: "no_show"
    });
  }
  const request = { bookingId, status };
  const identity = {
    request,
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "status_changed"
  };
  await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: { include: { room: true } }, billingFolio: true }
    });
    if (!booking?.guestProfileId) throw new Error("Booking or required guest profile not found.");
    if (booking.status === status) throw new Error(`Booking is already ${status}.`);
    if (!TRANSITIONS[booking.status]?.has(status)) {
      throw new Error(`Booking status cannot transition from ${booking.status} to ${status}.`);
    }
    const rooms = booking.roomAssignments.map((assignment) => assignment.room).filter(Boolean);
    for (const room of [...rooms].sort((a, b) => a.id.localeCompare(b.id))) {
      await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${room.id}`);
    }
    if (status === "checked_in") {
      if (!rooms.length) throw new Error("Assign a room before checking this guest in.");
      const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
      if (!clock) throw new Error("Property business date is not configured.");
      const businessDay = clock.currentBusinessDate.toISOString().slice(0, 10);
      const arrivalDay = booking.checkInDate.toISOString().slice(0, 10);
      const departureDay = booking.checkOutDate.toISOString().slice(0, 10);
      if (arrivalDay > businessDay) throw new Error(`This reservation arrives on ${arrivalDay}; the current business date is ${businessDay}.`);
      if (departureDay < businessDay) throw new Error("This reservation has already passed its departure business date.");
      const blocked = rooms.find((room) => BLOCKED_CHECK_IN_ROOM_STATUSES.has(room.status));
      if (blocked) throw new Error(`Room ${blocked.roomNumber} is ${blocked.status.replaceAll("_", " ")} and cannot be checked in.`);
    }
    if (status === "cancelled") {
      throw new Error("Use the policy-aware cancellation operation.");
    }
    const now = /* @__PURE__ */ new Date();
    let folioId = null;
    if (status === "checked_out") {
      const ensured = await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
      folioId = ensured.folioId;
      const entries = await prisma.folioEntry.findMany({
        where: { folioId },
        select: { direction: true, amountMinor: true }
      });
      if (!booking.billingFolioId) assertFolioCanClose(entries);
    }
    const timestamps = {};
    if (status === "confirmed") timestamps.confirmedAt = booking.confirmedAt || now;
    if (status === "checked_in") timestamps.checkedInAt = booking.checkedInAt || now;
    if (status === "checked_out") timestamps.checkedOutAt = booking.checkedOutAt || now;
    if (status === "cancelled") timestamps.cancelledAt = booking.cancelledAt || now;
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status, ...timestamps }
    });
    if (status === "checked_in") {
      await prisma.room.updateMany({ where: { id: { in: rooms.map((room) => room.id) } }, data: { status: "occupied" } });
    }
    if (status === "checked_out") {
      for (const room of rooms) {
        await prisma.room.update({ where: { id: room.id }, data: { status: "cleaning" } });
        const existingTask = await prisma.housekeepingTask.findFirst({
          where: {
            roomId: room.id,
            taskType: "checkout_clean",
            status: { in: ["pending", "in_progress", "inspection_needed", "on_hold"] }
          }
        });
        if (!existingTask) {
          await prisma.housekeepingTask.create({
            data: {
              roomId: room.id,
              taskType: "checkout_clean",
              status: "pending",
              priority: 1,
              notes: `Auto-created after checkout for ${booking.confirmationNumber} (${booking.guestName}).`
            }
          });
        }
      }
      if (folioId && !booking.billingFolioId) {
        await prisma.folio.update({ where: { id: folioId }, data: { status: "closed", closedAt: now } });
      }
      const completed = await prisma.booking.aggregate({
        where: { guestProfileId: booking.guestProfileId, status: "checked_out" },
        _count: { id: true },
        _sum: { totalAmountMinor: true },
        _max: { checkedOutAt: true }
      });
      await prisma.guest.update({
        where: { id: booking.guestProfileId },
        data: {
          totalStays: String(completed._count.id),
          totalSpent: (Number(completed._sum.totalAmountMinor || 0) / 100).toFixed(2),
          lastStayAt: completed._max.checkedOutAt || now
        }
      });
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: booking.status, roomStatuses: rooms.map((room) => ({ id: room.id, status: room.status })) },
      afterSnapshot: { status: updated.status, roomStatus: status === "checked_in" ? "occupied" : status === "checked_out" ? "cleaning" : null, folioId },
      metadata: { confirmationNumber: booking.confirmationNumber, guestProfileId: booking.guestProfileId }
    });
    if (status === "confirmed") {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: "booking_confirmation",
        eventKey: `booking:${bookingId}:confirmation:v${booking.pricingRevision || 1}`
      });
    }
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/mutations/updateRoomOperationalStatus.ts
var ROOM_STATUSES = /* @__PURE__ */ new Set(["vacant", "occupied", "cleaning", "maintenance", "out_of_order"]);
async function updateRoomOperationalStatus(root, {
  roomId,
  status,
  notes,
  idempotencyKey
}, context) {
  const canUpdate = permissions.canManageRooms({ session: context.session }) || permissions.canManageHousekeeping({ session: context.session });
  if (!canUpdate) throw new Error("Not authorized to update room status.");
  if (!ROOM_STATUSES.has(status)) throw new Error("Unsupported room status.");
  if (status === "occupied") throw new Error("Rooms become occupied only through reservation check-in.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const normalizedNotes = notes?.trim() || null;
  const request = { roomId, status, notes: normalizedNotes };
  const identity = {
    request,
    aggregateType: "room",
    aggregateId: roomId,
    action: "operational_status_changed"
  };
  await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `hotel-room:${roomId}`
    );
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room?.roomTypeId) throw new Error("Room or required room type not found.");
    if (room.status === status) throw new Error(`Room is already ${status}.`);
    const checkedInAssignments = await prisma.roomAssignment.count({
      where: { roomId, booking: { status: "checked_in" } }
    });
    if (checkedInAssignments > 0) {
      throw new Error("Move or check out the in-house guest before changing this room status.");
    }
    if (status === "vacant") {
      const [openMaintenance, openTasks] = await Promise.all([
        prisma.maintenanceRequest.count({
          where: { roomId, status: { notIn: ["verified", "cancelled"] } }
        }),
        prisma.housekeepingTask.count({
          where: { roomId, status: { not: "completed" } }
        })
      ]);
      if (openMaintenance || openTasks) {
        throw new Error("Resolve open maintenance and housekeeping work before marking the room ready.");
      }
    }
    const now = /* @__PURE__ */ new Date();
    const nextNotes = normalizedNotes ? [room.notes, `[${now.toISOString()}] ${normalizedNotes}`].filter(Boolean).join("\n") : room.notes;
    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        status,
        notes: nextNotes,
        ...status === "vacant" ? { lastCleaned: now } : {}
      }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: room.status, notes: room.notes, lastCleaned: room.lastCleaned },
      afterSnapshot: { status: updated.status, notes: updated.notes, lastCleaned: updated.lastCleaned },
      metadata: { roomTypeId: room.roomTypeId }
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.room.findUnique({ where: { id: roomId } });
}

// features/keystone/mutations/reportRoomMaintenanceIssue.ts
var import_node_crypto13 = require("node:crypto");
var CATEGORIES = /* @__PURE__ */ new Set(["plumbing", "electrical", "hvac", "furniture", "appliance", "structural", "cleaning", "other"]);
var PRIORITIES = /* @__PURE__ */ new Set(["low", "medium", "high", "emergency"]);
async function reportRoomMaintenanceIssue(root, {
  roomId,
  title,
  description,
  category = "other",
  priority = "medium",
  idempotencyKey
}, context) {
  const canReport = permissions.canManageHousekeeping({ session: context.session }) || permissions.canManageRooms({ session: context.session });
  if (!canReport) throw new Error("Not authorized to report maintenance issues.");
  const normalizedTitle = title.trim();
  const normalizedDescription = description?.trim() || null;
  if (!normalizedTitle || normalizedTitle.length > 200) throw new Error("Title must contain between 1 and 200 characters.");
  if (!CATEGORIES.has(category)) throw new Error("Unsupported maintenance category.");
  if (!PRIORITIES.has(priority)) throw new Error("Unsupported maintenance priority.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const requestId = `maintenance_${(0, import_node_crypto13.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24)}`;
  const request = { roomId, title: normalizedTitle, description: normalizedDescription, category, priority };
  const identity = {
    request,
    aggregateType: "maintenance_request",
    aggregateId: requestId,
    action: "reported"
  };
  await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${roomId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room?.roomTypeId) throw new Error("Room or required room type not found.");
    const now = /* @__PURE__ */ new Date();
    const maintenance = await prisma.maintenanceRequest.create({
      data: {
        id: requestId,
        roomId,
        title: normalizedTitle,
        description: normalizedDescription || `Reported from room operations for room ${room.roomNumber}`,
        category,
        priority,
        status: "reported",
        reportedById: context.session.itemId,
        notes: `Created from controlled room operations at ${now.toISOString()}`
      }
    });
    const roomStatus = priority === "emergency" ? "out_of_order" : "maintenance";
    await prisma.room.update({
      where: { id: roomId },
      data: {
        status: roomStatus,
        notes: [room.notes, `[${now.toISOString()}] Maintenance reported: ${normalizedTitle}`].filter(Boolean).join("\n")
      }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      afterSnapshot: {
        id: maintenance.id,
        roomId,
        status: maintenance.status,
        priority: maintenance.priority,
        roomStatus
      },
      metadata: { roomTypeId: room.roomTypeId }
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
}

// features/keystone/mutations/assignRoomToBooking.ts
var BLOCKED_ROOM_STATUSES = /* @__PURE__ */ new Set(["occupied", "cleaning", "maintenance", "out_of_order"]);
var ACTIVE_BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed", "checked_in"]);
var ASSIGNABLE_BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed"]);
async function assignRoomToBooking(root, {
  bookingId,
  roomId,
  idempotencyKey
}, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to assign rooms.");
  }
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const request = { bookingId, roomId };
  const identity = {
    request,
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "room_assigned"
  };
  await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${roomId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const [booking, room] = await Promise.all([
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: { roomAssignments: true }
      }),
      prisma.room.findUnique({ where: { id: roomId }, include: { roomType: true } })
    ]);
    if (!booking) throw new Error("Booking not found.");
    if (!room?.roomTypeId || !room.roomType) throw new Error("Room or required room type not found.");
    if (!ASSIGNABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new Error("Rooms can be assigned only before check-in; in-house room moves require a separate controlled workflow.");
    }
    if (BLOCKED_ROOM_STATUSES.has(room.status)) {
      throw new Error(`Room ${room.roomNumber} is ${room.status.replaceAll("_", " ")} and cannot be assigned.`);
    }
    const existing = booking.roomAssignments[0];
    if (!existing?.roomTypeId) throw new Error("The reservation is missing its required booked room type assignment.");
    if (existing.roomTypeId !== room.roomTypeId) {
      throw new Error(`Room ${room.roomNumber} does not match the reservation's booked room type.`);
    }
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId,
        bookingId: { not: bookingId },
        booking: {
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          checkInDate: { lt: booking.checkOutDate },
          checkOutDate: { gt: booking.checkInDate }
        }
      },
      include: { booking: true }
    });
    if (conflict?.booking) {
      throw new Error(`Room ${room.roomNumber} is already assigned to ${conflict.booking.confirmationNumber} for overlapping dates.`);
    }
    const nights = Math.max(1, Math.ceil(
      (booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 864e5
    ));
    const assignmentData = {
      bookingId,
      roomId,
      roomTypeId: room.roomTypeId,
      guestName: booking.guestName,
      ratePerNightMinor: Math.round(Number(booking.roomRateMinor || 0) / nights),
      ratePerNight: Number(booking.roomRateMinor || 0) / nights / 100
    };
    const assignment = existing ? await prisma.roomAssignment.update({ where: { id: existing.id }, data: assignmentData }) : await prisma.roomAssignment.create({ data: assignmentData });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: existing && { assignmentId: existing.id, roomId: existing.roomId, roomTypeId: existing.roomTypeId },
      afterSnapshot: { assignmentId: assignment.id, roomId, roomTypeId: room.roomTypeId },
      metadata: { confirmationNumber: booking.confirmationNumber }
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/lib/bookingStayDates.ts
var ACTIVE_BOOKING_STATUSES2 = ["pending", "confirmed", "checked_in"];
async function changeUnpricedBookingStayDatesInTransaction({
  prisma,
  bookingId,
  checkIn,
  checkOut
}) {
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, lineItems: { select: { id: true }, take: 1 } }
  });
  if (!booking) throw new Error("Booking not found.");
  if (!ACTIVE_BOOKING_STATUSES2.includes(booking.status)) throw new Error("Cannot change dates for closed or cancelled bookings.");
  if (booking.lineItems.length) throw new Error("Priced reservations require a controlled amendment; immutable commercial snapshots cannot be rewritten.");
  const roomIds = booking.roomAssignments.map((assignment) => assignment.roomId).filter(Boolean).sort();
  for (const roomId of roomIds) {
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${roomId}`);
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId,
        bookingId: { not: bookingId },
        booking: { status: { in: ACTIVE_BOOKING_STATUSES2 }, checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } }
      },
      include: { booking: true, room: true }
    });
    if (conflict?.booking) throw new Error(`Room ${conflict.room?.roomNumber || roomId} conflicts with ${conflict.booking.confirmationNumber} for the new stay dates.`);
  }
  const updated = await prisma.booking.update({ where: { id: bookingId }, data: { checkInDate: checkIn, checkOutDate: checkOut } });
  return { booking, updated, roomIds };
}

// features/keystone/mutations/updateBookingStayDates.ts
async function updateBookingStayDates(root, {
  bookingId,
  checkInDate,
  checkOutDate,
  idempotencyKey
}, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to update booking dates.");
  }
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) throw new Error("Invalid stay dates.");
  if (checkOut <= checkIn) throw new Error("Check-out must be after check-in.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const request = { bookingId, checkInDate: checkIn.toISOString(), checkOutDate: checkOut.toISOString() };
  const identity = {
    request,
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "stay_dates_changed"
  };
  await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const { booking, updated, roomIds } = await changeUnpricedBookingStayDatesInTransaction({ prisma, bookingId, checkIn, checkOut });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate },
      afterSnapshot: { checkInDate: updated.checkInDate, checkOutDate: updated.checkOutDate },
      metadata: { roomIds }
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/mutations/retryFailedChannelSyncs.ts
async function retryFailedChannelSyncsMutation(root, args, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to retry channel syncs");
  }
  return retryFailedChannelSyncs(context);
}

// features/keystone/mutations/updateMaintenanceRequestStatus.ts
function inspectionMarker(requestId) {
  return `[maintenance-request:${requestId}]`;
}
var TRANSITIONS2 = {
  reported: /* @__PURE__ */ new Set(["assigned", "in_progress", "cancelled"]),
  assigned: /* @__PURE__ */ new Set(["in_progress", "cancelled"]),
  in_progress: /* @__PURE__ */ new Set(["completed", "cancelled"]),
  completed: /* @__PURE__ */ new Set(["verified"]),
  verified: /* @__PURE__ */ new Set(),
  cancelled: /* @__PURE__ */ new Set()
};
async function updateMaintenanceRequestStatus(root, {
  requestId,
  status,
  notes,
  idempotencyKey
}, context) {
  const canManage = permissions.canManageRooms({ session: context.session }) || permissions.canManageHousekeeping({ session: context.session });
  if (!canManage) throw new Error("Not authorized to update maintenance requests.");
  if (!TRANSITIONS2[status]) throw new Error("Unsupported maintenance status.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const normalizedNotes = notes?.trim() || null;
  const requestIntent = { requestId, status, notes: normalizedNotes };
  const identity = {
    request: requestIntent,
    aggregateType: "maintenance_request",
    aggregateId: requestId,
    action: "status_changed"
  };
  await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const maintenance = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { room: true }
    });
    if (!maintenance?.roomId || !maintenance.room) throw new Error("Maintenance request or room not found.");
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${maintenance.roomId}`);
    if (maintenance.status === status) throw new Error(`Maintenance request is already ${status}.`);
    if (!TRANSITIONS2[maintenance.status]?.has(status)) {
      throw new Error(`Maintenance status cannot transition from ${maintenance.status} to ${status}.`);
    }
    let verificationInspectionId = null;
    if (status === "verified") {
      const marker = inspectionMarker(maintenance.id);
      let completedInspection = await prisma.housekeepingTask.findFirst({
        where: { roomId: maintenance.roomId, taskType: "inspection", status: "completed", notes: { contains: marker } }
      });
      if (!completedInspection) {
        const legacyInspection = await prisma.housekeepingTask.findFirst({
          where: {
            roomId: maintenance.roomId,
            taskType: "inspection",
            status: "completed",
            notes: { contains: `Inspect room after maintenance: ${maintenance.title}` },
            NOT: { notes: { contains: "[maintenance-request:" } }
          },
          orderBy: { completedAt: "desc" }
        });
        if (legacyInspection) {
          completedInspection = await prisma.housekeepingTask.update({
            where: { id: legacyInspection.id },
            data: { notes: `${legacyInspection.notes || ""}
${marker}`.trim() }
          });
        }
      }
      if (!completedInspection) throw new Error("Complete the request-linked post-maintenance inspection before verification.");
      verificationInspectionId = completedInspection.id;
    }
    const now = /* @__PURE__ */ new Date();
    const nextNotes = [
      maintenance.notes,
      `[${now.toISOString()}] Status changed to ${status.replaceAll("_", " ")}`,
      normalizedNotes
    ].filter(Boolean).join("\n");
    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status,
        notes: nextNotes,
        assignedToId: ["assigned", "in_progress"].includes(status) ? maintenance.assignedToId || context.session.itemId : maintenance.assignedToId,
        completedAt: status === "completed" ? maintenance.completedAt || now : maintenance.completedAt
      }
    });
    let roomStatus = maintenance.room.status;
    if (["assigned", "in_progress"].includes(status)) roomStatus = "maintenance";
    if (status === "completed") roomStatus = "cleaning";
    if (status === "verified") {
      const [otherMaintenance, openTasks] = await Promise.all([
        prisma.maintenanceRequest.findMany({
          where: { roomId: maintenance.roomId, id: { not: maintenance.id }, status: { notIn: ["verified", "cancelled"] } },
          select: { status: true }
        }),
        prisma.housekeepingTask.count({ where: { roomId: maintenance.roomId, status: { not: "completed" } } })
      ]);
      const maintenanceInProgress = otherMaintenance.some((item) => ["reported", "assigned", "in_progress"].includes(item.status));
      roomStatus = maintenanceInProgress ? "maintenance" : otherMaintenance.length || openTasks ? "cleaning" : "vacant";
    }
    if (roomStatus !== maintenance.room.status || status === "verified") {
      await prisma.room.update({
        where: { id: maintenance.roomId },
        data: {
          status: roomStatus,
          ...status === "verified" && roomStatus === "vacant" ? { lastCleaned: now } : {}
        }
      });
    }
    if (status === "completed") {
      const marker = inspectionMarker(maintenance.id);
      const existingInspection = await prisma.housekeepingTask.findFirst({
        where: {
          roomId: maintenance.roomId,
          taskType: "inspection",
          status: { in: ["pending", "in_progress", "inspection_needed", "on_hold"] },
          notes: { contains: marker }
        }
      });
      if (!existingInspection) {
        await prisma.housekeepingTask.create({
          data: {
            roomId: maintenance.roomId,
            taskType: "inspection",
            status: "inspection_needed",
            priority: 1,
            notes: `${marker} Inspect room after maintenance: ${maintenance.title}`
          }
        });
      }
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: {
        status: maintenance.status,
        assignedToId: maintenance.assignedToId,
        notes: maintenance.notes,
        roomStatus: maintenance.room.status
      },
      afterSnapshot: {
        status: updated.status,
        assignedToId: updated.assignedToId,
        notes: updated.notes,
        roomStatus,
        verificationInspectionId
      }
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
  return context.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
}

// features/keystone/mutations/updateRoomInventoryControls.ts
function getInventoryDay(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid inventory date.");
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function buildInventoryKey(roomTypeId, dateInput) {
  return `${roomTypeId}:${getInventoryDay(dateInput).toISOString().slice(0, 10)}`;
}
async function updateRoomInventoryControls(root, {
  roomTypeId,
  date,
  totalRooms,
  bookedRooms,
  blockedRooms,
  idempotencyKey
}, context) {
  const canManageInventory = permissions.canManageRooms({ session: context.session }) || permissions.canManageBookings({ session: context.session });
  if (!canManageInventory) throw new Error("Not authorized to manage room inventory.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  for (const [name, value] of Object.entries({ totalRooms, bookedRooms, blockedRooms })) {
    if (value != null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }
  const day = getInventoryDay(date);
  const inventoryKey = buildInventoryKey(roomTypeId, day);
  const request = { roomTypeId, date: day.toISOString(), totalRooms, bookedRooms, blockedRooms };
  const identity = {
    request,
    aggregateType: "room_inventory",
    aggregateId: inventoryKey,
    action: "controls_changed"
  };
  let inventoryId = "";
  await runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `hotel-inventory:${inventoryKey}`
    );
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const current = await prisma.roomInventory.findUnique({ where: { inventoryKey } });
      if (!current) throw new Error("Replayed inventory record no longer exists.");
      inventoryId = current.id;
      return;
    }
    const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!roomType) throw new Error("Room type not found.");
    const physicalRoomCount = await prisma.room.count({ where: { roomTypeId } });
    const existing = await prisma.roomInventory.findUnique({ where: { inventoryKey } });
    const next = {
      totalRooms: totalRooms ?? existing?.totalRooms ?? physicalRoomCount,
      bookedRooms: bookedRooms ?? existing?.bookedRooms ?? 0,
      blockedRooms: blockedRooms ?? existing?.blockedRooms ?? 0
    };
    if (next.totalRooms > physicalRoomCount) {
      throw new Error("Inventory total cannot exceed the physical room count.");
    }
    if (next.bookedRooms + next.blockedRooms > next.totalRooms) {
      throw new Error("Booked plus blocked rooms cannot exceed total rooms.");
    }
    const updated = existing ? await prisma.roomInventory.update({ where: { id: existing.id }, data: next }) : await prisma.roomInventory.create({
      data: { inventoryKey, date: day, roomTypeId, ...next }
    });
    inventoryId = updated.id;
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: existing && {
        totalRooms: existing.totalRooms,
        bookedRooms: existing.bookedRooms,
        blockedRooms: existing.blockedRooms
      },
      afterSnapshot: next,
      metadata: { roomTypeName: roomType.name }
    });
  });
  return context.prisma.roomInventory.findUnique({ where: { id: inventoryId } });
}

// features/keystone/mutations/requestBookingModification.ts
var import_node_crypto14 = require("node:crypto");
var MAX_MESSAGE_LENGTH = 2e3;
var MAX_STAY_DAYS = 365;
function boundedDate(value, name) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} is invalid.`);
  return date;
}
async function requestBookingModification(root, { bookingId, guestEmail, requestedCheckInDate, requestedCheckOutDate, message }, context) {
  await assertGuestBookingAccess(context, bookingId);
  const normalizedEmail = String(guestEmail || "").trim().toLowerCase();
  const requestedIn = boundedDate(requestedCheckInDate, "Requested check-in");
  const requestedOut = boundedDate(requestedCheckOutDate, "Requested check-out");
  const guestMessage = String(message || "").trim();
  if (!requestedIn && !requestedOut && !guestMessage) throw new Error("At least one requested stay date or message is required.");
  if (requestedIn && requestedOut) {
    const days = (requestedOut.getTime() - requestedIn.getTime()) / 864e5;
    if (days <= 0 || days > MAX_STAY_DAYS) throw new Error("Requested stay dates are outside the supported range.");
  }
  if (guestMessage.length > MAX_MESSAGE_LENGTH) throw new Error("Modification message is too long.");
  return context.transaction(async (tx) => {
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    const booking = await tx.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error("Booking not found.");
    if (String(booking.guestEmail || "").trim().toLowerCase() !== normalizedEmail) throw new Error("Email does not match this booking.");
    if (!["pending", "confirmed"].includes(booking.status)) throw new Error("Only upcoming pending or confirmed bookings can request changes.");
    const nextIn = requestedIn || booking.checkInDate;
    const nextOut = requestedOut || booking.checkOutDate;
    const days = (nextOut.getTime() - nextIn.getTime()) / 864e5;
    if (days <= 0 || days > MAX_STAY_DAYS) throw new Error("Requested stay dates are outside the supported range.");
    const existing = await tx.prisma.bookingModificationRequest.findFirst({
      where: { bookingId, status: "pending" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    if (existing) {
      if (existing.requestedCheckInDate?.getTime() === nextIn.getTime() && existing.requestedCheckOutDate?.getTime() === nextOut.getTime() && String(existing.guestMessage || "") === guestMessage) return booking;
      throw new Error("This booking already has a pending modification request.");
    }
    const createdAt = /* @__PURE__ */ new Date();
    const request = await tx.prisma.bookingModificationRequest.create({ data: {
      requestKey: `guest-modification:${(0, import_node_crypto14.randomUUID)()}`,
      bookingId,
      requestedCheckInDate: nextIn,
      requestedCheckOutDate: nextOut,
      guestMessage: guestMessage || null,
      requestedByEmailHash: (0, import_node_crypto14.createHash)("sha256").update(normalizedEmail).digest("hex"),
      status: "pending",
      createdAt,
      updatedAt: createdAt
    } });
    await tx.prisma.booking.update({ where: { id: bookingId }, data: {
      internalNotes: [booking.internalNotes, `Guest modification request ${request.id} is pending staff review.`].filter(Boolean).join("\n\n")
    } });
    return booking;
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}

// features/keystone/mutations/resolveBookingModificationRequest.ts
var MAX_STAY_DAYS2 = 365;
var MAX_NOTE_LENGTH = 2e3;
function must3(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function parseBoundedDate(value, fallback, name) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} is invalid.`);
  return date;
}
function resultFromSnapshot(snapshot, replayed) {
  return {
    requestId: String(snapshot.requestId),
    bookingId: String(snapshot.bookingId),
    status: String(snapshot.status),
    decision: String(snapshot.decision),
    checkInDate: snapshot.checkInDate ? new Date(snapshot.checkInDate) : null,
    checkOutDate: snapshot.checkOutDate ? new Date(snapshot.checkOutDate) : null,
    pricingRevision: Number.isInteger(snapshot.pricingRevision) ? snapshot.pricingRevision : null,
    replayed
  };
}
async function serializableWithRetry(context, operation) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await context.transaction(operation, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
    } catch (error) {
      const detail = `${error?.message || ""} ${error?.extensions?.debug?.message || ""}`;
      const retryable = error?.code === "P2034" || error?.code === "40001" || error?.extensions?.prisma?.code === "P2034" || /could not serialize|write conflict|deadlock/i.test(detail);
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
  throw new Error("Modification resolution could not be serialized.");
}
async function resolveBookingModificationRequest(root, { bookingId, decision, checkInDate, checkOutDate, staffNote, idempotencyKey }, context) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error("Not authorized to resolve booking modification requests.");
  if (!["approved", "declined"].includes(decision)) throw new Error("Decision must be approved or declined.");
  const eventKey = String(idempotencyKey || "").trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A bounded idempotency key is required.");
  const note = String(staffNote || "").trim();
  if (note.length > MAX_NOTE_LENGTH) throw new Error("Staff note is too long.");
  return serializableWithRetry(context, async (tx) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    const request = must3(await prisma.bookingModificationRequest.findFirst({
      where: { bookingId, OR: [{ status: "pending" }, { resolutionKey: eventKey }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    }));
    if (!request) throw new Error("No pending modification request exists for this booking.");
    const booking = must3(await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: true, lineItems: { where: { snapshotStatus: "active" } }, payments: true }
    }));
    if (!booking || request.bookingId !== booking.id) throw new Error("Modification request booking binding is invalid.");
    const nextCheckIn = parseBoundedDate(checkInDate, request.requestedCheckInDate || booking.checkInDate, "Approved check-in");
    const nextCheckOut = parseBoundedDate(checkOutDate, request.requestedCheckOutDate || booking.checkOutDate, "Approved check-out");
    const stayDays = (nextCheckOut.getTime() - nextCheckIn.getTime()) / 864e5;
    if (decision === "approved" && (stayDays <= 0 || stayDays > MAX_STAY_DAYS2)) throw new Error("Approved stay dates are outside the supported range.");
    const resolutionInput = {
      requestId: request.id,
      bookingId,
      decision,
      checkInDate: decision === "approved" ? nextCheckIn.toISOString() : null,
      checkOutDate: decision === "approved" ? nextCheckOut.toISOString() : null,
      staffNote: note || null
    };
    const resolutionHash = hashLifecycleRequest(resolutionInput);
    if (request.status !== "pending") {
      if (request.resolutionKey !== eventKey || request.resolutionRequestHash !== resolutionHash) throw new Error("Modification request is stale or the idempotency key was reused with different evidence.");
      return resultFromSnapshot(request.resultSnapshot, true);
    }
    if (!["pending", "confirmed"].includes(booking.status)) throw new Error("Modification request is stale because the booking is no longer open and pre-arrival.");
    let updated = booking;
    if (decision === "approved") {
      if (booking.lineItems.length === 0) {
        updated = (await changeUnpricedBookingStayDatesInTransaction({ prisma, bookingId, checkIn: nextCheckIn, checkOut: nextCheckOut })).updated;
      } else {
        const assignment = booking.roomAssignments[0];
        if (!assignment?.roomTypeId || !booking.ratePlanId) throw new Error("Priced reservation is missing an authoritative room type or rate plan.");
        const ratePlan = await prisma.ratePlan.findUnique({ where: { id: booking.ratePlanId }, select: { isPromotional: true, promoCode: true } });
        if (!ratePlan) throw new Error("Priced reservation rate plan was not found.");
        const quote = await calculateHotelPrice(tx, {
          roomTypeId: assignment.roomTypeId,
          ratePlanId: booking.ratePlanId,
          checkInDate: nextCheckIn.toISOString(),
          checkOutDate: nextCheckOut.toISOString(),
          numberOfAdults: Number(booking.numberOfAdults || booking.numberOfGuests || 1),
          numberOfChildren: Number(booking.numberOfChildren || 0),
          promoCode: ratePlan.isPromotional ? ratePlan.promoCode : null
        });
        updated = await amendUnpaidBooking({
          context: tx,
          bookingId,
          checkInDate: nextCheckIn.toISOString(),
          checkOutDate: nextCheckOut.toISOString(),
          roomTypeId: assignment.roomTypeId,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          guestProfileId: booking.guestProfileId,
          numberOfGuests: quote.numberOfGuests,
          totalAmountMinor: quote.totalMinor,
          currencyCode: quote.currencyCode,
          idempotencyKey: `${eventKey}:commercial-amendment`,
          source: "staff-modification",
          withinTransaction: true,
          actorId: context.session.itemId,
          queueCommunication: false,
          commercialPricing: {
            ratePlanId: quote.ratePlan.id,
            pricingVersion: quote.pricingVersion,
            roomSubtotalMinor: quote.roomSubtotalMinor,
            taxMinor: quote.taxMinor,
            feesMinor: quote.feesMinor,
            totalMinor: quote.totalMinor,
            taxRateBasisPoints: quote.taxRateBasisPoints,
            nightlyRates: quote.nightlyRates
          }
        });
      }
    }
    const snapshot = {
      requestId: request.id,
      bookingId,
      status: decision,
      decision,
      checkInDate: decision === "approved" ? updated.checkInDate.toISOString() : booking.checkInDate.toISOString(),
      checkOutDate: decision === "approved" ? updated.checkOutDate.toISOString() : booking.checkOutDate.toISOString(),
      pricingRevision: Number(updated.pricingRevision || booking.pricingRevision || 1)
    };
    const resolvedAt = /* @__PURE__ */ new Date();
    const changed = must3(await prisma.$executeRawUnsafe(
      `UPDATE "BookingModificationRequest" SET "status"=$1, "resolutionKey"=$2, "resolutionRequestHash"=$3, "resolvedBy"=$4, "resolvedAt"=$5, "staffNote"=$6, "resultSnapshot"=$7::jsonb, "updatedAt"=$5 WHERE "id"=$8 AND "status"='pending'`,
      decision,
      eventKey,
      resolutionHash,
      context.session.itemId,
      resolvedAt,
      note || "",
      JSON.stringify(snapshot),
      request.id
    ));
    if (Number(changed) !== 1) throw new Error("Modification request was resolved concurrently.");
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity: { request: resolutionInput, aggregateType: "booking_modification_request", aggregateId: request.id, action: `modification_${decision}` },
      beforeSnapshot: { status: "pending", bookingId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, pricingRevision: booking.pricingRevision },
      afterSnapshot: snapshot,
      metadata: { commercialAmendmentEventKey: decision === "approved" && booking.lineItems.length ? `${eventKey}:commercial-amendment` : null }
    });
    await queueBookingCommunication(prisma, {
      bookingId,
      kind: "booking_modification_response",
      eventKey,
      modification: { decision, staffNote: note || null }
    });
    return resultFromSnapshot(snapshot, false);
  });
}

// features/keystone/queries/bookingPaymentProviders.ts
async function bookingPaymentProviders(_root, _args, context) {
  await ensureDefaultPaymentProviders(context);
  const providers = await context.prisma.paymentProvider.findMany({
    where: { code: { in: ["pp_stripe_stripe", "pp_paypal_paypal"] }, isInstalled: true },
    orderBy: { name: "asc" }
  });
  return providers.filter(paymentIntegrationConfigured);
}
var bookingPaymentProviders_default = bookingPaymentProviders;

// features/keystone/queries/activeBookingPaymentSession.ts
async function activeBookingPaymentSession(root, { bookingId }, context) {
  await assertGuestBookingAccess(context, bookingId);
  const booking = await context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      paymentSessions(where: { isInitiated: { equals: false } }) {
        id
        isSelected
        isInitiated
        createdAt
        paymentProvider {
          id
          code
          name
        }
      }
    `
  });
  if (!booking?.paymentSessions?.length) {
    return null;
  }
  return booking.paymentSessions.find((session) => session.isSelected) || booking.paymentSessions[0];
}
var activeBookingPaymentSession_default = activeBookingPaymentSession;

// features/keystone/lib/storefrontBooking.ts
var STOREFRONT_BOOKING_QUERY = `
  id
  confirmationNumber
  guestName
  guestEmail
  guestPhone
  checkInDate
  checkOutDate
  numberOfNights
  numberOfGuests
  numberOfAdults
  numberOfChildren
  roomRate
  taxAmount
  feesAmount
  totalAmount
  depositAmount
  balanceDue
  status
  paymentStatus
  specialRequests
  createdAt
  confirmedAt
  cancelledAt
  roomAssignments {
    id
    ratePerNight
    guestName
    roomType {
      id
      name
      thumbnail
      roomImages(orderBy: { order: asc }) {
        id
        image { url }
        imagePath
        altText
        caption
        order
        isPrimary
      }
    }
    room {
      roomNumber
    }
  }
`;
async function findStorefrontBooking(context, bookingId) {
  return context.sudo().query.Booking.findOne({
    where: { id: bookingId },
    query: STOREFRONT_BOOKING_QUERY
  });
}

// features/keystone/queries/guestBooking.ts
async function guestBooking(root, { bookingId }, context) {
  await assertGuestBookingAccess(context, bookingId);
  const [booking, communication] = await Promise.all([
    findStorefrontBooking(context, bookingId),
    bookingCommunicationStatus(context.prisma, bookingId)
  ]);
  if (!booking) return null;
  return {
    ...booking,
    confirmationDeliveryStatus: communication.confirmation?.status || null,
    updateDeliveryStatus: communication.modification?.status || communication.update?.status || null,
    cancellationDeliveryStatus: communication.cancellation?.status || null
  };
}
var guestBooking_default = guestBooking;

// features/keystone/queries/guestBookings.ts
async function guestBookings(root, { email: email2 }, context) {
  const bookingIds = getGuestAccessBookingIds(context);
  if (!bookingIds.length || !email2.trim()) return [];
  const verifiedIds = [];
  for (const bookingId of bookingIds) {
    try {
      const booking = await assertGuestBookingAccess(context, bookingId);
      if ((booking.guestEmail || "").trim().toLowerCase() === email2.trim().toLowerCase()) {
        verifiedIds.push(bookingId);
      }
    } catch {
    }
  }
  if (!verifiedIds.length) return [];
  const bookings = await context.sudo().query.Booking.findMany({
    where: {
      id: { in: verifiedIds },
      guestEmail: { equals: email2.trim(), mode: "insensitive" }
    },
    orderBy: [{ createdAt: "desc" }],
    query: STOREFRONT_BOOKING_QUERY
  });
  return Promise.all(bookings.map(async (booking) => {
    const communication = await bookingCommunicationStatus(context.prisma, booking.id);
    return {
      ...booking,
      confirmationDeliveryStatus: communication.confirmation?.status || null,
      updateDeliveryStatus: communication.modification?.status || communication.update?.status || null,
      cancellationDeliveryStatus: communication.cancellation?.status || null
    };
  }));
}
var guestBookings_default = guestBookings;

// features/keystone/queries/verifyGuestBooking.ts
async function verifyGuestBooking(root, {
  confirmationNumber: confirmationNumber2,
  email: email2
}, context) {
  const normalizedConfirmation = confirmationNumber2.trim().toUpperCase();
  await enforceAbuseLimit(context, {
    scope: "guest-booking-verify",
    identity: normalizedConfirmation,
    limit: 8,
    windowMs: 15 * 6e4
  });
  if (!normalizedConfirmation || !email2.trim()) return null;
  const bookings = await context.sudo().query.Booking.findMany({
    where: { confirmationNumber: { equals: normalizedConfirmation } },
    take: 1,
    query: STOREFRONT_BOOKING_QUERY
  });
  const booking = bookings[0];
  if (!booking) return null;
  try {
    await verifyBookingEmailOwnership(context, booking, email2);
  } catch (error) {
    if (error instanceof Error && error.message === BOOKING_ACCESS_DENIED_MESSAGE) return null;
    throw error;
  }
  return booking;
}
var verifyGuestBooking_default = verifyGuestBooking;

// features/keystone/queries/storefrontRoomTypes.ts
var ROOM_TYPE_QUERY = `
  id
  name
  shortDescription
  eyebrow
  viewDescription
  thumbnail
  baseRate
  baseRateMinor
  maxOccupancy
  bedConfiguration
  amenities
  squareFeet
  roomsCount
  roomImages(orderBy: { order: asc }) {
    id
    image { url }
    imagePath
    altText
    caption
    order
    isPrimary
  }
  ratePlans(where: { status: { equals: "active" }, isPublic: { equals: true } }) {
    id
    name
    description
    baseRate
    baseRateMinor
    currencyCode
    minimumStay
    cancellationPolicy
    mealPlan
    isPromotional
  }
`;
async function storefrontRoomTypes(root, args, context) {
  return context.sudo().query.RoomType.findMany({
    orderBy: [{ baseRateMinor: "asc" }, { id: "asc" }],
    take: 100,
    query: ROOM_TYPE_QUERY
  });
}
var storefrontRoomTypes_default = storefrontRoomTypes;

// features/keystone/queries/storefrontRoomType.ts
async function storefrontRoomType(root, { id }, context) {
  return context.sudo().query.RoomType.findOne({
    where: { id },
    query: ROOM_TYPE_QUERY
  });
}
var storefrontRoomType_default = storefrontRoomType;

// features/keystone/queries/storefrontAvailability.ts
async function storefrontAvailability(_root, { checkInDate, checkOutDate }, context) {
  const rows = await getHotelAvailability(context, { checkInDate, checkOutDate });
  return rows.map((roomType) => ({
    id: roomType.id,
    name: roomType.name,
    shortDescription: roomType.shortDescription,
    eyebrow: roomType.eyebrow,
    viewDescription: roomType.viewDescription,
    thumbnail: roomType.thumbnail,
    baseRate: roomType.baseRateMinor / 100,
    baseRateMinor: roomType.baseRateMinor,
    maxOccupancy: roomType.maxOccupancy,
    bedConfiguration: roomType.bedConfiguration,
    amenities: roomType.amenities || [],
    squareFeet: roomType.squareFeet,
    availableCount: roomType.availableCount,
    roomImages: roomType.roomImages || []
  }));
}
var storefrontAvailability_default = storefrontAvailability;

// features/keystone/queries/publicHotelSettings.ts
var PUBLIC_HOTEL_SETTINGS_QUERY = `
  propertyName
  tagline
  contactEmail
  contactPhone
  addressLine1
  addressLine2
  frontDeskCopy
  checkInTime
  checkOutTime
  storefrontAccentPreset
  heroImagePath
  heroImageAltText
  heroImageCaption
  amenityImagePath
  amenityImageAltText
  amenityImageCaption
  locationImagePath
  locationImageAltText
  locationImageCaption
`;
async function publicHotelSettings(_root, _args, context) {
  const settings = await context.sudo().query.HotelSettings.findOne({
    where: { id: "1" },
    query: PUBLIC_HOTEL_SETTINGS_QUERY
  });
  if (!settings) {
    return {
      state: "missing",
      accentPreset: DEFAULT_STOREFRONT_ACCENT_PRESET
    };
  }
  const { storefrontAccentPreset, ...publicSettings } = settings;
  return {
    state: "configured",
    accentPreset: resolveStorefrontAccentPreset(storefrontAccentPreset).key,
    ...publicSettings
  };
}

// features/keystone/queries/storefrontQuote.ts
async function storefrontQuote(_root, args, context) {
  await enforceAbuseLimit(context, { scope: "storefront-quote", identity: args.roomTypeId, limit: 60, windowMs: 6e4 });
  const quote = await getStorefrontBookingQuote(args, context);
  return {
    roomTypeId: quote.roomType.id,
    roomTypeName: quote.roomType.name,
    ratePlanId: quote.ratePlan.id,
    ratePlanName: quote.ratePlan.name,
    cancellationPolicy: quote.ratePlan.cancellationPolicy,
    mealPlan: quote.ratePlan.mealPlan,
    checkInDate: quote.checkIn,
    checkOutDate: quote.checkOut,
    nights: quote.nightlyRates.length,
    numberOfGuests: quote.numberOfGuests,
    ratePerNight: quote.nightlyRates.length ? quote.roomSubtotalMinor / quote.nightlyRates.length / 100 : 0,
    roomSubtotal: quote.roomSubtotalMinor / 100,
    taxAmount: quote.taxMinor / 100,
    feesAmount: quote.feesMinor / 100,
    totalAmount: quote.totalMinor / 100,
    roomSubtotalMinor: quote.roomSubtotalMinor,
    taxAmountMinor: quote.taxMinor,
    feesAmountMinor: quote.feesMinor,
    totalAmountMinor: quote.totalMinor,
    currencyCode: quote.currencyCode,
    pricingVersion: quote.pricingVersion,
    quoteToken: quote.quoteToken
  };
}
var storefrontQuote_default = storefrontQuote;

// features/keystone/queries/guestCancellationQuote.ts
async function guestCancellationQuote(_root, { bookingId }, context) {
  await assertGuestBookingAccess(context, bookingId);
  const booking = await context.prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      ratePlan: true,
      lineItems: {
        where: { snapshotStatus: "active" },
        orderBy: [{ date: "asc" }, { id: "asc" }]
      },
      payments: {
        where: { status: "completed", paymentType: { not: "refund" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }
    }
  });
  if (!booking) throw new Error("Booking not found.");
  const available = await Promise.all(
    booking.payments.map((payment) => refundablePaymentMinor(context.prisma, payment))
  );
  const capturedMinor = available.reduce((sum, amount) => sum + amount, 0);
  const firstRoomNight = booking.lineItems.find((line) => line.type === "room");
  const policy = firstRoomNight?.cancellationPolicySnapshot || booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy;
  const stayNights = Math.max(1, Math.round((booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 864e5));
  const bookingTotalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
  const firstNightMinor = Number(firstRoomNight?.totalPrice || 0) || Math.ceil(bookingTotalMinor / stayNights);
  const terms = calculateCancellationTerms({
    policy,
    checkInDate: booking.checkInDate,
    capturedMinor,
    firstNightMinor,
    bookingTotalMinor
  });
  return {
    ...terms,
    canCancel: ["pending", "confirmed"].includes(booking.status),
    fullRefundDeadline: terms.fullRefundDeadline,
    currencyCode: booking.currencyCode || "USD"
  };
}

// features/keystone/mutations/ensureReservationSnapshots.ts
async function ensureReservationSnapshots2(root, { bookingId }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to manage reservation snapshots.");
  }
  return context.transaction(async (transactionContext) => {
    const result = await ensureReservationSnapshots(transactionContext, bookingId);
    await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
    return result;
  }, {
    maxWait: 5e3,
    timeout: 3e4,
    isolationLevel: "Serializable"
  });
}

// features/keystone/mutations/runHotelOnboarding.ts
var import_node_crypto15 = require("node:crypto");

// features/platform/onboarding/lib/seed.json
var seed_default = {
  hotelSettings: {
    propertyName: "The Alder House",
    tagline: "Independent city hotel \xB7 direct reservations",
    contactEmail: "stay@thealderhouse.example",
    contactPhone: "+1 (212) 555-0148",
    addressLine1: "18 Alder Street",
    addressLine2: "Metropolitan City",
    frontDeskCopy: "Front desk \xB7 24 hours",
    checkInTime: "3:00 PM",
    checkOutTime: "11:00 AM",
    storefrontAccentPreset: "brass",
    heroImagePath: "/images/hotel/the-alder-house-lobby-hero.webp",
    heroImageAltText: "Warm wood reception and lounge at The Alder House",
    heroImageCaption: "The lobby at The Alder House",
    amenityImagePath: "/images/hotel/the-alder-house-breakfast-lounge-amenity.webp",
    amenityImageAltText: "Breakfast buffet and lounge seating at The Alder House",
    amenityImageCaption: "Breakfast in The Alder House lounge",
    locationImagePath: "/images/hotel/the-alder-house-exterior-neighborhood-location.webp",
    locationImageAltText: "Brick city hotel exterior on the tree-lined Alder Street neighborhood",
    locationImageCaption: "The Alder House neighborhood"
  },
  roomTypes: [
    {
      name: "Classic Queen",
      description: "A bright guest room designed for short city stays with a queen bed, desk, and rainfall shower.",
      shortDescription: "A bright queen room with a writing desk, rainfall shower, and a calm courtyard outlook.",
      eyebrow: "Courtyard calm",
      viewDescription: "Courtyard-facing with soft morning light.",
      baseRate: 159,
      maxOccupancy: 2,
      bedConfiguration: "queen",
      amenities: ["wifi", "tv", "desk", "shower", "ac", "hair_dryer", "coffee_maker"],
      squareFeet: 280,
      roomImages: [
        {
          imagePath: "/images/hotel/the-alder-house-room-classic-queen.webp",
          altText: "Classic Queen room with a queen bed, writing desk, and city-facing window",
          caption: "Classic Queen guest room",
          order: 0,
          isPrimary: true
        }
      ]
    },
    {
      name: "Deluxe King",
      description: "A larger king room with lounge chair, premium linens, and skyline views for direct-booking guests.",
      shortDescription: "A generous king room with a lounge chair, premium linens, and an open skyline view.",
      eyebrow: "Skyline light",
      viewDescription: "High-floor city view from the bed and lounge area.",
      baseRate: 229,
      maxOccupancy: 2,
      bedConfiguration: "king",
      amenities: ["wifi", "tv", "desk", "shower", "ac", "hair_dryer", "coffee_maker", "city_view", "safe", "minibar"],
      squareFeet: 360,
      roomImages: [
        {
          imagePath: "/images/hotel/the-alder-house-room-deluxe-king.webp",
          altText: "Deluxe King room with a king bed, lounge chair, desk, and skyline view",
          caption: "Deluxe King skyline room",
          order: 0,
          isPrimary: true
        }
      ]
    },
    {
      name: "Family Suite",
      description: "A flexible family suite with a king bedroom, sofa bed, and extra space for longer stays.",
      shortDescription: "A spacious king suite with a separate sofa-bed lounge and room for longer family stays.",
      eyebrow: "Room to settle in",
      viewDescription: "Tree-lined neighborhood views from the bedroom and lounge.",
      baseRate: 319,
      maxOccupancy: 4,
      bedConfiguration: "king_sofa",
      amenities: ["wifi", "tv", "desk", "bathtub", "ac", "hair_dryer", "coffee_maker", "city_view", "safe", "room_service"],
      squareFeet: 520,
      roomImages: [
        {
          imagePath: "/images/hotel/the-alder-house-room-family-suite.webp",
          altText: "Family Suite with a king bed and a separate sofa-bed lounge",
          caption: "Family Suite bedroom and lounge",
          order: 0,
          isPrimary: true
        }
      ]
    }
  ],
  rooms: [
    { roomNumber: "101", roomType: "Classic Queen", floor: 1, status: "vacant", notes: "Quiet courtyard side." },
    { roomNumber: "102", roomType: "Classic Queen", floor: 1, status: "occupied", notes: "Near housekeeping closet." },
    { roomNumber: "103", roomType: "Classic Queen", floor: 1, status: "cleaning", notes: "Turnover in progress." },
    { roomNumber: "201", roomType: "Deluxe King", floor: 2, status: "occupied", notes: "Preferred high-floor upgrade room." },
    { roomNumber: "202", roomType: "Deluxe King", floor: 2, status: "vacant", notes: "Popular direct booking room." },
    { roomNumber: "203", roomType: "Deluxe King", floor: 2, status: "maintenance", notes: "AC inspection scheduled." },
    { roomNumber: "301", roomType: "Family Suite", floor: 3, status: "occupied", notes: "Extended stay family suite." },
    { roomNumber: "302", roomType: "Family Suite", floor: 3, status: "vacant", notes: "Ready for weekend arrivals." }
  ],
  ratePlans: [
    {
      name: "Classic Flexible",
      description: "Standard direct-booking rate with free cancellation up to 48 hours before arrival.",
      roomType: "Classic Queen",
      baseRate: 159,
      minimumStay: 1,
      maximumStay: 14,
      advanceBookingMin: 0,
      advanceBookingMax: 180,
      cancellationPolicy: "flexible",
      mealPlan: "room_only",
      status: "active",
      isPublic: true,
      isPromotional: false,
      priority: 10
    },
    {
      name: "Deluxe Flexible",
      description: "Best available direct rate for Deluxe King stays.",
      roomType: "Deluxe King",
      baseRate: 229,
      minimumStay: 1,
      maximumStay: 14,
      advanceBookingMin: 0,
      advanceBookingMax: 180,
      cancellationPolicy: "flexible",
      mealPlan: "room_only",
      status: "active",
      isPublic: true,
      isPromotional: false,
      priority: 10
    },
    {
      name: "Bed & Breakfast",
      description: "Breakfast included for guests who want an easy direct-booking package.",
      roomType: "Deluxe King",
      baseRate: 249,
      minimumStay: 1,
      maximumStay: 10,
      advanceBookingMin: 0,
      advanceBookingMax: 120,
      cancellationPolicy: "moderate",
      mealPlan: "breakfast",
      status: "active",
      isPublic: true,
      isPromotional: false,
      priority: 20
    },
    {
      name: "Family Escape",
      description: "Family suite package with flexible cancellation and breakfast included.",
      roomType: "Family Suite",
      baseRate: 339,
      minimumStay: 2,
      maximumStay: 7,
      advanceBookingMin: 1,
      advanceBookingMax: 180,
      cancellationPolicy: "moderate",
      mealPlan: "breakfast",
      status: "active",
      isPublic: true,
      isPromotional: false,
      priority: 30
    }
  ],
  seasonalRates: [
    {
      name: "Spring City Weekend",
      roomType: "Deluxe King",
      startDate: "2026-03-20T00:00:00.000Z",
      endDate: "2026-03-23T00:00:00.000Z",
      priceMultiplier: 1.2,
      minimumStay: 2,
      priority: 20,
      isActive: true
    },
    {
      name: "Family Break Offer",
      roomType: "Family Suite",
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2026-04-08T00:00:00.000Z",
      priceMultiplier: 0.92,
      minimumStay: 2,
      priority: 15,
      isActive: true
    }
  ],
  guests: [
    {
      firstName: "Ava",
      lastName: "Carter",
      email: "ava.carter@example.com",
      phone: "+1-312-555-0142",
      preferences: {
        pillowType: "firm",
        floorPreference: "high",
        smokingPreference: "non-smoking",
        bedType: "king",
        earlyCheckIn: false,
        lateCheckOut: true,
        specialDiet: "vegetarian",
        accessibility: []
      },
      loyaltyNumber: "OFH-1001",
      loyaltyTier: "gold",
      communicationPreferences: {
        emailMarketing: true,
        smsNotifications: true,
        phoneNotifications: false,
        preferredLanguage: "en",
        newsletterSubscribed: true
      },
      company: "Northline Design",
      specialNotes: "Prefers quiet floors and late checkout when available.",
      isVip: true,
      totalStays: "4",
      totalSpent: "1840.00"
    },
    {
      firstName: "Liam",
      lastName: "Brooks",
      email: "liam.brooks@example.com",
      phone: "+1-773-555-0188",
      preferences: {
        pillowType: "standard",
        floorPreference: "low",
        smokingPreference: "non-smoking",
        bedType: "queen",
        earlyCheckIn: true,
        lateCheckOut: false,
        specialDiet: "",
        accessibility: []
      },
      loyaltyNumber: "OFH-1002",
      loyaltyTier: "silver",
      communicationPreferences: {
        emailMarketing: false,
        smsNotifications: true,
        phoneNotifications: false,
        preferredLanguage: "en",
        newsletterSubscribed: false
      },
      company: "Lakefront Legal",
      specialNotes: "Often books one-night business stays.",
      isVip: false,
      totalStays: "2",
      totalSpent: "620.00"
    },
    {
      firstName: "Sofia",
      lastName: "Martinez",
      email: "sofia.martinez@example.com",
      phone: "+1-847-555-0196",
      preferences: {
        pillowType: "soft",
        floorPreference: "any",
        smokingPreference: "non-smoking",
        bedType: "suite",
        earlyCheckIn: false,
        lateCheckOut: false,
        specialDiet: "gluten-free",
        accessibility: []
      },
      loyaltyNumber: "OFH-1003",
      loyaltyTier: "bronze",
      communicationPreferences: {
        emailMarketing: true,
        smsNotifications: false,
        phoneNotifications: false,
        preferredLanguage: "es",
        newsletterSubscribed: true
      },
      company: "",
      specialNotes: "Travels with children during school breaks.",
      isVip: false,
      totalStays: "1",
      totalSpent: "410.00"
    }
  ],
  bookings: [
    {
      key: "ava-deluxe-weekend",
      label: "Ava Carter \xB7 Deluxe King \xB7 Mar 18\u201320",
      guestEmail: "ava.carter@example.com",
      guestName: "Ava Carter",
      roomType: "Deluxe King",
      roomNumber: "201",
      checkInDate: "2026-03-18T15:00:00.000Z",
      checkOutDate: "2026-03-20T11:00:00.000Z",
      numberOfGuests: 2,
      numberOfAdults: 2,
      numberOfChildren: 0,
      roomRate: 458,
      taxAmount: 54,
      feesAmount: 18,
      totalAmount: 530,
      depositAmount: 150,
      balanceDue: 380,
      status: "confirmed",
      paymentStatus: "partial",
      source: "website",
      specialRequests: "High floor and late arrival after 9pm."
    },
    {
      key: "liam-classic-business",
      label: "Liam Brooks \xB7 Classic Queen \xB7 Mar 12\u201313",
      guestEmail: "liam.brooks@example.com",
      guestName: "Liam Brooks",
      roomType: "Classic Queen",
      roomNumber: "102",
      checkInDate: "2026-03-12T15:00:00.000Z",
      checkOutDate: "2026-03-13T11:00:00.000Z",
      numberOfGuests: 1,
      numberOfAdults: 1,
      numberOfChildren: 0,
      roomRate: 159,
      taxAmount: 19,
      feesAmount: 12,
      totalAmount: 190,
      depositAmount: 0,
      balanceDue: 190,
      status: "checked_in",
      paymentStatus: "unpaid",
      source: "corporate",
      specialRequests: "Quiet room near elevator access."
    },
    {
      key: "sofia-family-break",
      label: "Sofia Martinez \xB7 Family Suite \xB7 Apr 3\u20136",
      guestEmail: "sofia.martinez@example.com",
      guestName: "Sofia Martinez",
      roomType: "Family Suite",
      roomNumber: "301",
      checkInDate: "2026-04-03T15:00:00.000Z",
      checkOutDate: "2026-04-06T11:00:00.000Z",
      numberOfGuests: 4,
      numberOfAdults: 2,
      numberOfChildren: 2,
      roomRate: 1017,
      taxAmount: 122,
      feesAmount: 36,
      totalAmount: 1175,
      depositAmount: 250,
      balanceDue: 925,
      status: "pending",
      paymentStatus: "unpaid",
      source: "website",
      specialRequests: "Connecting crib and gluten-free breakfast options."
    }
  ],
  bookingPayments: [
    {
      key: "ava-deposit",
      label: "Ava Carter deposit",
      bookingKey: "ava-deluxe-weekend",
      providerCode: "pp_manual_manual",
      amount: 150,
      currency: "USD",
      paymentType: "deposit",
      paymentMethod: "credit_card",
      status: "completed",
      description: "Seed payment: Ava Carter deposit for Deluxe King weekend stay."
    },
    {
      key: "liam-checkin-balance",
      label: "Liam Brooks balance payment",
      bookingKey: "liam-classic-business",
      providerCode: "pp_manual_manual",
      amount: 190,
      currency: "USD",
      paymentType: "balance",
      paymentMethod: "cash",
      status: "pending",
      description: "Seed payment: Liam Brooks balance due at front desk check-in."
    }
  ],
  housekeepingTasks: [
    {
      key: "hk-room-103",
      label: "Room 103 checkout clean",
      roomNumber: "103",
      taskType: "checkout_clean",
      status: "in_progress",
      priority: 1,
      notes: "Seed housekeeping: Room 103 checkout clean after early departure."
    },
    {
      key: "hk-room-203-follow-up",
      label: "Room 203 maintenance follow-up",
      roomNumber: "203",
      taskType: "inspection",
      status: "inspection_needed",
      priority: 2,
      notes: "Seed housekeeping: Room 203 inspection after HVAC maintenance ticket."
    }
  ],
  maintenanceRequests: [
    {
      key: "maint-203-hvac",
      label: "203 HVAC inspection",
      roomNumber: "203",
      title: "203 HVAC inspection",
      description: "Guest reported intermittent cooling; engineering should inspect fan coil and thermostat calibration.",
      category: "hvac",
      priority: "high",
      status: "assigned",
      notes: "Seed maintenance: assign before releasing Room 203 back to inventory."
    },
    {
      key: "maint-102-lamp",
      label: "102 desk lamp replacement",
      roomNumber: "102",
      title: "102 desk lamp replacement",
      description: "Desk lamp flickers and needs replacement before next arrival.",
      category: "electrical",
      priority: "medium",
      status: "reported",
      notes: "Seed maintenance: low complexity in occupied room, coordinate with guest."
    }
  ],
  channels: [
    {
      key: "booking-com",
      name: "Booking.com",
      channelType: "ota",
      isActive: false,
      commission: 15,
      syncInventory: false,
      syncRates: false,
      syncStatus: "paused",
      syncErrors: [],
      mappingRules: {
        "Deluxe King": "DLX-KING",
        "Classic Queen": "STD-QUEEN"
      },
      credentials: {
        mode: "demo",
        externalPropertyId: "OFH-DEMO-100"
      }
    },
    {
      key: "expedia",
      name: "Expedia",
      channelType: "ota",
      isActive: false,
      commission: 18,
      syncInventory: false,
      syncRates: false,
      syncStatus: "paused",
      syncErrors: ["Demo warning: rate plan mapping requires review"],
      mappingRules: {
        "Family Suite": "FAM-SUITE",
        "Deluxe King": "KING-DELUXE"
      },
      credentials: {
        mode: "demo",
        externalPropertyId: "OFH-DEMO-EXP"
      }
    }
  ],
  channelReservations: [
    {
      key: "bookingcom-ava",
      label: "Booking.com \xB7 Ava Carter",
      channel: "Booking.com",
      bookingKey: "ava-deluxe-weekend",
      roomType: "Deluxe King",
      externalId: "BDC-AVA-0318",
      guestName: "Ava Carter",
      guestEmail: "ava.carter@example.com",
      checkInDate: "2026-03-18T15:00:00.000Z",
      checkOutDate: "2026-03-20T11:00:00.000Z",
      totalAmount: 53e3,
      commission: 7950,
      channelStatus: "confirmed"
    },
    {
      key: "expedia-family",
      label: "Expedia \xB7 Sofia Martinez",
      channel: "Expedia",
      bookingKey: "sofia-family-break",
      roomType: "Family Suite",
      externalId: "EXP-SOFIA-0403",
      guestName: "Sofia Martinez",
      guestEmail: "sofia.martinez@example.com",
      checkInDate: "2026-04-03T15:00:00.000Z",
      checkOutDate: "2026-04-06T11:00:00.000Z",
      totalAmount: 117500,
      commission: 21150,
      channelStatus: "pending_mapping_review"
    }
  ],
  channelSyncEvents: [
    {
      key: "bookingcom-sync-ok",
      label: "Booking.com inventory push",
      channel: "Booking.com",
      channelName: "Booking.com",
      action: "inventory_push",
      status: "success",
      message: "Seed sync: pushed Deluxe King and Classic Queen availability to Booking.com.",
      errorMessage: "",
      attempts: 1,
      occurredAt: "2026-03-10T08:15:00.000Z",
      payload: {
        roomTypes: ["Deluxe King", "Classic Queen"],
        nights: 14
      }
    },
    {
      key: "expedia-sync-warning",
      label: "Expedia reservation pull",
      channel: "Expedia",
      channelName: "Expedia",
      action: "reservation_pull",
      status: "failed",
      message: "Seed sync: Expedia reservation pull needs rate-plan mapping review.",
      errorMessage: "Demo warning: Family Suite external rate plan not mapped.",
      attempts: 2,
      occurredAt: "2026-03-10T08:20:00.000Z",
      payload: {
        externalReservationId: "EXP-SOFIA-0403",
        issue: "rate_plan_mapping"
      }
    }
  ],
  loyaltyTransactions: [
    {
      key: "ava-gold-bonus",
      label: "Ava Carter bonus points",
      guestEmail: "ava.carter@example.com",
      bookingKey: "ava-deluxe-weekend",
      points: 500,
      type: "bonus",
      description: "Seed loyalty: Gold tier direct-booking bonus for Ava Carter."
    },
    {
      key: "liam-stay-credit",
      label: "Liam Brooks stay credit",
      guestEmail: "liam.brooks@example.com",
      bookingKey: "liam-classic-business",
      points: 190,
      type: "earned",
      description: "Seed loyalty: points earned from Liam Brooks business stay."
    }
  ],
  inventory: [
    {
      key: "classic-2026-03-18",
      label: "Classic Queen \xB7 Mar 18",
      roomType: "Classic Queen",
      date: "2026-03-18T00:00:00.000Z",
      totalRooms: 3,
      bookedRooms: 1,
      blockedRooms: 0
    },
    {
      key: "deluxe-2026-03-18",
      label: "Deluxe King \xB7 Mar 18",
      roomType: "Deluxe King",
      date: "2026-03-18T00:00:00.000Z",
      totalRooms: 3,
      bookedRooms: 1,
      blockedRooms: 1
    },
    {
      key: "family-2026-04-03",
      label: "Family Suite \xB7 Apr 3",
      roomType: "Family Suite",
      date: "2026-04-03T00:00:00.000Z",
      totalRooms: 2,
      bookedRooms: 1,
      blockedRooms: 0
    }
  ],
  dailyMetrics: []
};

// features/keystone/mutations/runHotelOnboarding.ts
var SEED_VERSION = "hotel-seed-v2";
var CUSTOM_SECTIONS = /* @__PURE__ */ new Set([
  "hotelSettings",
  "roomTypes",
  "rooms",
  "ratePlans",
  "seasonalRates",
  "guests",
  "bookings",
  "bookingPayments",
  "housekeepingTasks",
  "maintenanceRequests",
  "channels",
  "channelReservations",
  "channelSyncEvents",
  "loyaltyTransactions",
  "inventory",
  "dailyMetrics"
]);
var MINIMAL_KEYS = {
  roomTypes: /* @__PURE__ */ new Set(["Classic Queen", "Deluxe King"]),
  rooms: /* @__PURE__ */ new Set(["101", "102", "103", "201", "203"]),
  ratePlans: /* @__PURE__ */ new Set(["Classic Flexible", "Deluxe Flexible"]),
  seasonalRates: /* @__PURE__ */ new Set(["Spring City Weekend"]),
  guests: /* @__PURE__ */ new Set(["ava.carter@example.com"]),
  bookings: /* @__PURE__ */ new Set(["ava-deluxe-weekend"]),
  bookingPayments: /* @__PURE__ */ new Set(["ava-deposit"]),
  housekeepingTasks: /* @__PURE__ */ new Set(["hk-room-103"]),
  maintenanceRequests: /* @__PURE__ */ new Set(["maint-203-hvac"]),
  channels: /* @__PURE__ */ new Set(["booking-com"]),
  channelReservations: /* @__PURE__ */ new Set(["bookingcom-ava"]),
  channelSyncEvents: /* @__PURE__ */ new Set(["bookingcom-sync-ok"]),
  loyaltyTransactions: /* @__PURE__ */ new Set(["ava-gold-bonus"]),
  inventory: /* @__PURE__ */ new Set(["classic-2026-03-18", "deluxe-2026-03-18"]),
  dailyMetrics: /* @__PURE__ */ new Set()
};
function assertCanRunHotelOnboarding(session) {
  if (!session?.itemId || !session?.data?.role?.canManageOnboarding) {
    throw new Error("You do not have permission to run hotel onboarding.");
  }
}
function normalizeHotelOnboardingTemplate(value) {
  if (value === "full" || value === "minimal" || value === "custom") return value;
  throw new Error("Unsupported onboarding template.");
}
function normalizeCustomSeed(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Custom onboarding data must be an object.");
  const source = value;
  const unknown = Object.keys(source).filter((key3) => !CUSTOM_SECTIONS.has(key3));
  if (unknown.length) throw new Error("Custom onboarding data contains unsupported sections.");
  const encoded = JSON.stringify(source);
  if (encoded.length > 25e4) throw new Error("Custom onboarding data is too large.");
  for (const [key3, rows] of Object.entries(source)) {
    if (key3 === "hotelSettings") continue;
    if (!Array.isArray(rows) || rows.length > 500) throw new Error(`Custom onboarding section ${key3} must be a bounded array.`);
    if (key3 === "dailyMetrics" && rows.length) throw new Error("dailyMetrics is legacy-only; operational reports derive facts from bookings, folios, and payments.");
  }
  return source;
}
function canonicalSeedForTemplate(template, customData) {
  const source = template === "custom" ? normalizeCustomSeed(customData) : seed_default;
  if (template === "full" || template === "custom") return source;
  const result = { hotelSettings: source.hotelSettings };
  for (const [section, rows] of Object.entries(source)) {
    if (!Array.isArray(rows)) continue;
    const allowed = MINIMAL_KEYS[section];
    result[section] = allowed ? rows.filter(
      (row) => allowed.has(
        section === "roomTypes" || section === "ratePlans" || section === "seasonalRates" ? row.name : section === "rooms" ? row.roomNumber : section === "guests" ? row.email : section === "dailyMetrics" ? row.date : row.key
      )
    ) : rows;
  }
  return result;
}
function confirmationNumber() {
  return `BK-SEED-${(0, import_node_crypto15.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
function paymentReference() {
  return `PAY-SEED-${(0, import_node_crypto15.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
function canonicalSeedValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalSeedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key3, nested]) => [key3, canonicalSeedValue(nested)]));
  }
  return value;
}
function seedValuesMatch(existing, expected) {
  return Object.entries(expected).every(
    ([key3, value]) => value === void 0 || JSON.stringify(canonicalSeedValue(existing[key3] ?? null)) === JSON.stringify(canonicalSeedValue(value ?? null))
  );
}
function seedRowKey(section, row, index) {
  const natural = row?.key || row?.name || row?.roomNumber || row?.email || row?.externalId || row?.date;
  if (!natural) throw new Error(`Onboarding ${section}[${index}] requires a stable key.`);
  return `${section}:${String(natural).trim().toLowerCase()}`;
}
function seedContentHash(row) {
  return (0, import_node_crypto15.createHash)("sha256").update(JSON.stringify(row)).digest("hex");
}
async function bindSeedRecord(prisma, seedKey, section, entityId, row) {
  await prisma.hotelSeedRecord.upsert({
    where: { seedKey },
    create: { seedKey, section, entityId, contentHash: seedContentHash(row), seedVersion: SEED_VERSION },
    update: { entityId, contentHash: seedContentHash(row), seedVersion: SEED_VERSION }
  });
}
async function runHotelOnboarding(_root, { template, data }, context) {
  assertCanRunHotelOnboarding(context.session);
  const normalizedTemplate = normalizeHotelOnboardingTemplate(template);
  const seed = canonicalSeedForTemplate(normalizedTemplate, data);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "the-alder-house-onboarding"
    );
    const results = [];
    const settings = {
      ...seed.hotelSettings,
      storefrontAccentPreset: parseStorefrontAccentPreset(
        seed.hotelSettings?.storefrontAccentPreset || DEFAULT_STOREFRONT_ACCENT_PRESET
      )
    };
    const existingSettings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (!existingSettings) {
      await prisma.hotelSettings.create({ data: { id: 1, ...settings } });
      results.push("created");
    } else if (!seedValuesMatch(existingSettings, settings)) {
      await prisma.hotelSettings.update({ where: { id: 1 }, data: settings });
      results.push("updated");
    } else {
      results.push("skipped");
    }
    await bindSeedRecord(prisma, "hotelSettings:the-alder-house", "hotelSettings", "1", settings);
    const roomTypeIds = {};
    for (const [index, roomType] of (seed.roomTypes || []).entries()) {
      const seedKey = seedRowKey("roomTypes", roomType, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.roomType.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.roomType.findUnique({ where: { name: roomType.name } });
      const data2 = {
        shortDescription: roomType.shortDescription || roomType.description,
        eyebrow: roomType.eyebrow,
        viewDescription: roomType.viewDescription,
        baseRateMinor: Math.round(Number(roomType.baseRate || 0) * 100),
        currencyCode: roomType.currencyCode || "USD",
        baseRate: roomType.baseRate,
        maxOccupancy: roomType.maxOccupancy,
        bedConfiguration: roomType.bedConfiguration,
        amenities: roomType.amenities,
        squareFeet: roomType.squareFeet
      };
      let record = existing;
      if (!existing) {
        record = await prisma.roomType.create({ data: { name: roomType.name, ...data2 } });
        results.push("created");
      } else if (!seedValuesMatch(existing, { name: roomType.name, ...data2 })) {
        record = await prisma.roomType.update({ where: { id: existing.id }, data: { name: roomType.name, ...data2 } });
        results.push("updated");
      } else {
        results.push("skipped");
      }
      roomTypeIds[roomType.name] = record.id;
      await bindSeedRecord(prisma, seedKey, "roomTypes", record.id, roomType);
      for (const image2 of roomType.roomImages || []) {
        const { key: _imageSeedKey, ...imageData } = image2;
        const existingImage = await prisma.roomImage.findFirst({
          where: { roomTypeId: record.id, imagePath: image2.imagePath }
        });
        if (existingImage) {
          if (!seedValuesMatch(existingImage, imageData)) {
            await prisma.roomImage.update({ where: { id: existingImage.id }, data: imageData });
            results.push("updated");
          } else results.push("skipped");
          await bindSeedRecord(prisma, `roomImages:${record.id}:${image2.imagePath}`, "roomImages", existingImage.id, image2);
        } else {
          const createdImage = await prisma.roomImage.create({ data: { ...imageData, roomTypeId: record.id } });
          await bindSeedRecord(prisma, `roomImages:${record.id}:${image2.imagePath}`, "roomImages", createdImage.id, image2);
          results.push("created");
        }
      }
    }
    const roomIds = {};
    for (const [index, room] of (seed.rooms || []).entries()) {
      const seedKey = seedRowKey("rooms", room, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.room.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.room.findUnique({ where: { roomNumber: room.roomNumber } });
      const roomData = { floor: room.floor, notes: room.notes, roomTypeId: roomTypeIds[room.roomType] };
      let record = existing;
      if (!existing) {
        record = await prisma.room.create({ data: { roomNumber: room.roomNumber, status: room.status, ...roomData } });
        results.push("created");
      } else if (!seedValuesMatch(existing, { roomNumber: room.roomNumber, status: room.status, ...roomData })) {
        record = await prisma.room.update({ where: { id: existing.id }, data: { roomNumber: room.roomNumber, status: room.status, ...roomData } });
        results.push("updated");
      } else results.push("skipped");
      roomIds[room.roomNumber] = record.id;
      await bindSeedRecord(prisma, seedKey, "rooms", record.id, room);
    }
    for (const [index, rate] of (seed.ratePlans || []).entries()) {
      const seedKey = seedRowKey("ratePlans", rate, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.ratePlan.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.ratePlan.findUnique({ where: { name: rate.name } });
      const { roomType, key: _rateSeedKey, ...sourceData } = rate;
      const rateData = { ...sourceData, baseRateMinor: Math.round(Number(rate.baseRate || 0) * 100), currencyCode: rate.currencyCode || "USD", roomTypeId: roomTypeIds[roomType] };
      let record = existing;
      if (!existing) {
        record = await prisma.ratePlan.create({ data: rateData });
        results.push("created");
      } else if (!seedValuesMatch(existing, rateData)) {
        record = await prisma.ratePlan.update({ where: { id: existing.id }, data: rateData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "ratePlans", record.id, rate);
    }
    for (const [index, rate] of (seed.seasonalRates || []).entries()) {
      const seedKey = seedRowKey("seasonalRates", rate, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.seasonalRate.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.seasonalRate.findFirst({ where: { name: rate.name } });
      const { roomType, key: _seasonSeedKey, ...data2 } = rate;
      const rateData = { ...data2, startDate: new Date(data2.startDate), endDate: new Date(data2.endDate), roomTypeId: roomTypeIds[roomType] };
      let record = existing;
      if (!existing) {
        record = await prisma.seasonalRate.create({ data: rateData });
        results.push("created");
      } else if (!seedValuesMatch(existing, rateData)) {
        record = await prisma.seasonalRate.update({ where: { id: existing.id }, data: rateData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "seasonalRates", record.id, rate);
    }
    const guestIds = {};
    for (const [index, guest] of (seed.guests || []).entries()) {
      const seedKey = seedRowKey("guests", guest, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.guest.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.guest.findUnique({ where: { email: guest.email } });
      let record = existing;
      const safeData = Object.fromEntries(Object.entries(guest).filter(([key3]) => !["key", "totalStays", "totalSpent", "lastStayAt", "loyaltyPoints", "loyaltyTier"].includes(key3)));
      if (!existing) {
        record = await prisma.guest.create({ data: safeData });
        results.push("created");
      } else {
        if (!seedValuesMatch(existing, safeData)) {
          record = await prisma.guest.update({ where: { id: existing.id }, data: safeData });
          results.push("updated");
        } else results.push("skipped");
      }
      guestIds[guest.email] = record.id;
      await bindSeedRecord(prisma, seedKey, "guests", record.id, guest);
    }
    const bookingIds = {};
    for (const [index, booking] of (seed.bookings || []).entries()) {
      const marker = `seed:${booking.key}`;
      const seedKey = seedRowKey("bookings", booking, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.booking.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.booking.findFirst({ where: { internalNotes: { startsWith: marker } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      let record = existing;
      if (!record) {
        const token = createGuestAccessToken();
        record = await prisma.booking.create({
          data: {
            confirmationNumber: confirmationNumber(),
            guestName: booking.guestName,
            guestEmail: booking.guestEmail,
            checkInDate: new Date(booking.checkInDate),
            checkOutDate: new Date(booking.checkOutDate),
            numberOfGuests: booking.numberOfGuests,
            numberOfAdults: booking.numberOfAdults,
            numberOfChildren: booking.numberOfChildren,
            roomRateMinor: Math.round(Number(booking.roomRate || 0) * 100),
            taxAmountMinor: Math.round(Number(booking.taxAmount || 0) * 100),
            feesAmountMinor: Math.round(Number(booking.feesAmount || 0) * 100),
            totalAmountMinor: Math.round(Number(booking.totalAmount || 0) * 100),
            depositAmountMinor: Math.round(Number(booking.depositAmount || 0) * 100),
            balanceDueMinor: Math.round(Number(booking.balanceDue || 0) * 100),
            currencyCode: booking.currencyCode || "USD",
            roomRate: booking.roomRate,
            taxAmount: booking.taxAmount,
            feesAmount: booking.feesAmount,
            totalAmount: booking.totalAmount,
            depositAmount: booking.depositAmount,
            balanceDue: booking.balanceDue,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            source: booking.source,
            specialRequests: booking.specialRequests,
            internalNotes: marker,
            guestProfileId: guestIds[booking.guestEmail],
            guestAccessTokenHash: hashGuestAccessToken(token),
            guestAccessTokenIssuedAt: /* @__PURE__ */ new Date()
          }
        });
        await prisma.roomAssignment.create({
          data: {
            bookingId: record.id,
            roomId: roomIds[booking.roomNumber],
            roomTypeId: roomTypeIds[booking.roomType],
            guestName: booking.guestName,
            ratePerNightMinor: Math.round(Number(booking.roomRate || 0) * 100 / Math.max(1, Math.round((new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 864e5))),
            ratePerNight: booking.roomRate,
            specialRequests: booking.specialRequests
          }
        });
      }
      bookingIds[booking.key] = record.id;
      await bindSeedRecord(prisma, seedKey, "bookings", record.id, booking);
      await ensureBookingHasGuestAccess(transactionContext, record.id);
      results.push(existing ? "skipped" : "created");
    }
    const allBookings = await prisma.booking.findMany({ select: { id: true, folio: { select: { status: true } } } });
    for (const booking of allBookings) {
      await ensureBookingHasGuestAccess(transactionContext, booking.id);
      const snapshotResult = await ensureReservationSnapshots(
        transactionContext,
        booking.id
      );
      results.push(...Array(snapshotResult.created).fill("created"));
      results.push(...Array(snapshotResult.existing).fill("skipped"));
      const folioResult2 = await ensureBookingFolio(transactionContext, booking.id, { postSnapshotEntries: booking.folio?.status !== "closed" && booking.folio?.status !== "voided" });
      results.push(...Array(folioResult2.created).fill("created"));
      results.push(...Array(folioResult2.existing).fill("skipped"));
    }
    await ensureDefaultPaymentProviders(transactionContext);
    const providers = await prisma.paymentProvider.findMany({
      select: { id: true, code: true }
    });
    const providerIds = Object.fromEntries(providers.map((provider) => [provider.code, provider.id]));
    for (const [index, payment] of (seed.bookingPayments || []).entries()) {
      const seedKey = seedRowKey("bookingPayments", payment, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.bookingPayment.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.bookingPayment.findFirst({ where: {
        description: payment.description,
        amountMinor: Math.round(Number(payment.amount || 0) * 100),
        paymentType: payment.paymentType,
        booking: { internalNotes: { startsWith: `seed:${payment.bookingKey}` } }
      }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const record = existing || await prisma.bookingPayment.create({
        data: {
          paymentReference: paymentReference(),
          bookingId: bookingIds[payment.bookingKey],
          paymentProviderId: providerIds[payment.providerCode],
          amountMinor: Math.round(Number(payment.amount || 0) * 100),
          amount: payment.amount,
          currency: payment.currency,
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
          status: payment.status,
          description: payment.description,
          processedAt: payment.status === "completed" ? /* @__PURE__ */ new Date() : null
        }
      });
      await bindSeedRecord(prisma, seedKey, "bookingPayments", record.id, payment);
      results.push(existing ? "skipped" : "created");
    }
    const settledPayments = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "BookingPayment"
       WHERE "booking" IS NOT NULL AND "status" IN ('completed', 'refunded')
       ORDER BY "id" ASC`
    );
    for (const payment of settledPayments) {
      const existingEntry = await prisma.folioEntry.findUnique({
        where: { postingKey: `folio:payment:${payment.id}` },
        select: { id: true }
      });
      await ensurePaymentFolioPosting(transactionContext, payment.id);
      results.push(existingEntry ? "skipped" : "created");
    }
    for (const [index, task] of (seed.housekeepingTasks || []).entries()) {
      const seedKey = seedRowKey("housekeepingTasks", task, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      let record = (binding ? await prisma.housekeepingTask.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.housekeepingTask.findFirst({ where: { roomId: roomIds[task.roomNumber], taskType: task.taskType, notes: task.notes }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const taskData = { roomId: roomIds[task.roomNumber], taskType: task.taskType, priority: task.priority, notes: task.notes };
      if (!record) {
        record = await prisma.housekeepingTask.create({ data: { ...taskData, status: task.status } });
        results.push("created");
      } else if (!seedValuesMatch(record, taskData)) {
        record = await prisma.housekeepingTask.update({ where: { id: record.id }, data: taskData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "housekeepingTasks", record.id, task);
    }
    for (const [index, request] of (seed.maintenanceRequests || []).entries()) {
      const seedKey = seedRowKey("maintenanceRequests", request, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      let record = (binding ? await prisma.maintenanceRequest.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.maintenanceRequest.findFirst({ where: { roomId: roomIds[request.roomNumber], title: request.title, description: request.description }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const requestData = { roomId: roomIds[request.roomNumber], title: request.title, description: request.description, category: request.category, priority: request.priority, notes: request.notes };
      if (!record) {
        record = await prisma.maintenanceRequest.create({ data: { ...requestData, status: request.status } });
        results.push("created");
      } else if (!seedValuesMatch(record, requestData)) {
        record = await prisma.maintenanceRequest.update({ where: { id: record.id }, data: requestData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "maintenanceRequests", record.id, request);
    }
    const channelIds = {};
    for (const [index, channel] of (seed.channels || []).entries()) {
      const seedKey = seedRowKey("channels", channel, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.channel.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.channel.findUnique({ where: { name: channel.name } });
      const live = channel.isActive === true && String(channel.credentials?.mode || "").toLowerCase() === "live";
      const channelData = {
        channelType: channel.channelType,
        isActive: live,
        commission: channel.commission,
        syncInventory: channel.syncInventory,
        syncRates: false,
        syncStatus: live ? channel.syncStatus : "paused",
        syncErrors: channel.syncErrors,
        mappingRules: channel.mappingRules,
        credentials: channel.credentials
      };
      let record = existing;
      if (!record) {
        record = await prisma.channel.create({ data: { name: channel.name, ...channelData } });
        results.push("created");
      } else if (!seedValuesMatch(record, { name: channel.name, ...channelData })) {
        record = await prisma.channel.update({ where: { id: record.id }, data: { name: channel.name, ...channelData } });
        results.push("updated");
      } else results.push("skipped");
      channelIds[channel.name] = record.id;
      await bindSeedRecord(prisma, seedKey, "channels", record.id, channel);
    }
    for (const [index, reservation] of (seed.channelReservations || []).entries()) {
      const seedKey = seedRowKey("channelReservations", reservation, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.channelReservation.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.channelReservation.findFirst({ where: { externalId: reservation.externalId, channelId: channelIds[reservation.channel] } });
      const reservationData = {
        channelId: channelIds[reservation.channel],
        channelKey: `${channelIds[reservation.channel]}:${reservation.externalId}`,
        externalId: reservation.externalId,
        reservationId: bookingIds[reservation.bookingKey],
        roomTypeId: roomTypeIds[reservation.roomType],
        guestName: reservation.guestName,
        guestEmail: reservation.guestEmail,
        checkInDate: new Date(reservation.checkInDate),
        checkOutDate: new Date(reservation.checkOutDate),
        totalAmount: reservation.totalAmount,
        commission: reservation.commission,
        channelStatus: reservation.channelStatus
      };
      let record = existing;
      if (!record) {
        record = await prisma.channelReservation.create({ data: reservationData });
        results.push("created");
      } else if (!seedValuesMatch(record, reservationData)) {
        record = await prisma.channelReservation.update({ where: { id: record.id }, data: reservationData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "channelReservations", record.id, reservation);
    }
    for (const [index, event] of (seed.channelSyncEvents || []).entries()) {
      const seedKey = seedRowKey("channelSyncEvents", event, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.channelSyncEvent.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.channelSyncEvent.findFirst({ where: { channelId: channelIds[event.channel], message: event.message }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const eventData = {
        channelId: channelIds[event.channel],
        action: event.action,
        status: event.status,
        message: event.message,
        errorMessage: event.errorMessage,
        attempts: event.attempts,
        occurredAt: new Date(event.occurredAt),
        payload: event.payload
      };
      let record = existing;
      if (!record) {
        record = await prisma.channelSyncEvent.create({ data: eventData });
        results.push("created");
      } else if (!seedValuesMatch(record, eventData)) {
        record = await prisma.channelSyncEvent.update({ where: { id: record.id }, data: eventData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "channelSyncEvents", record.id, event);
    }
    for (const [index, entry] of (seed.loyaltyTransactions || []).entries()) {
      const seedKey = seedRowKey("loyaltyTransactions", entry, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.loyaltyTransaction.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.loyaltyTransaction.findFirst({ where: { guestId: guestIds[entry.guestEmail], description: entry.description, type: entry.type }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const entryData = { guestId: guestIds[entry.guestEmail], bookingId: bookingIds[entry.bookingKey], points: entry.points, type: entry.type, description: entry.description };
      let record = existing;
      if (!record) {
        record = await prisma.loyaltyTransaction.create({ data: entryData });
        results.push("created");
      } else if (!seedValuesMatch(record, entryData)) {
        record = await prisma.loyaltyTransaction.update({ where: { id: record.id }, data: entryData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "loyaltyTransactions", record.id, entry);
    }
    for (const [index, inventory] of (seed.inventory || []).entries()) {
      const date = new Date(inventory.date);
      const seedKey = seedRowKey("inventory", inventory, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.roomInventory.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.roomInventory.findFirst({ where: { roomTypeId: roomTypeIds[inventory.roomType], date } });
      const inventoryData = {
        totalRooms: inventory.totalRooms,
        bookedRooms: inventory.bookedRooms,
        blockedRooms: inventory.blockedRooms
      };
      let record = existing;
      if (!record) {
        record = await prisma.roomInventory.create({ data: {
          roomTypeId: roomTypeIds[inventory.roomType],
          inventoryKey: buildInventoryKey(roomTypeIds[inventory.roomType], date),
          date,
          ...inventoryData
        } });
        results.push("created");
      } else if (!seedValuesMatch(record, inventoryData)) {
        record = await prisma.roomInventory.update({ where: { id: record.id }, data: inventoryData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "inventory", record.id, inventory);
    }
    await prisma.user.update({
      where: { id: context.session.itemId },
      data: { onboardingStatus: "completed" }
    });
    return {
      success: true,
      message: "The Alder House onboarding completed atomically.",
      createdCount: results.filter((result) => result === "created").length,
      updatedCount: results.filter((result) => result === "updated").length,
      skippedCount: results.filter((result) => result === "skipped").length
    };
  }, { timeout: 12e4 });
}
var runHotelOnboarding_default = runHotelOnboarding;

// features/keystone/lib/folioPosting.ts
var import_node_crypto16 = require("node:crypto");

// features/keystone/lib/folioPostingPolicy.ts
function assertNewOperatorPostingAllowed(folioStatus) {
  if (folioStatus !== "open") {
    throw new Error("Closed or voided folios cannot accept new operator postings.");
  }
}

// features/keystone/lib/folioPosting.ts
function must4(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
var OPERATOR_ENTRY_TYPES = /* @__PURE__ */ new Set(["addon", "adjustment"]);
var OPERATOR_PAYMENT_METHODS = /* @__PURE__ */ new Set([
  "credit_card",
  "debit_card",
  "cash",
  "bank_transfer",
  "check",
  "other"
]);
function normalizePostingKey(value) {
  const postingKey = value.trim();
  if (!postingKey || postingKey.length > 200) {
    throw new Error("postingKey must contain between 1 and 200 characters.");
  }
  return postingKey;
}
function normalizeDescription(value, label = "description") {
  const description = value.trim();
  if (!description || description.length > 500) {
    throw new Error(`${label} must contain between 1 and 500 characters.`);
  }
  return description;
}
function assertSamePosting(existing, expected) {
  const fields = [
    "folioId",
    "postingKey",
    "entryType",
    "direction",
    "amountMinor",
    "currencyCode",
    "description",
    "sourceType",
    "sourceId"
  ];
  if (fields.some((field) => existing[field] !== expected[field])) {
    throw new Error("postingKey is already bound to different folio evidence.");
  }
}
async function lock(prisma, key3) {
  await prisma.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    key3
  );
}
async function folioResult(prisma, entry, replayed) {
  const entries = must4(await prisma.folioEntry.findMany({
    where: { folioId: entry.folioId },
    select: { direction: true, amountMinor: true }
  }));
  const balance = calculateFolioBalance(entries);
  return {
    folioId: entry.folioId,
    entryId: entry.id,
    postingKey: entry.postingKey,
    replayed,
    ...balance
  };
}
async function postOperatorFolioEntry({
  context,
  bookingId,
  postingKey,
  entryType,
  direction,
  amountMinor,
  currencyCode,
  description,
  serviceDate
}) {
  if (!OPERATOR_ENTRY_TYPES.has(entryType)) {
    throw new Error("Operators may post only add-on or adjustment entries through this operation.");
  }
  const posting = validateFolioPosting({
    postingKey: normalizePostingKey(postingKey),
    entryType,
    direction,
    amountMinor,
    currencyCode,
    description: normalizeDescription(description)
  });
  const parsedServiceDate = serviceDate ? new Date(serviceDate) : /* @__PURE__ */ new Date();
  if (Number.isNaN(parsedServiceDate.getTime())) throw new Error("serviceDate must be a valid date.");
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lock(prisma, `hotel-folio-booking:${bookingId}`);
    const ensured = await ensureBookingFolio(transactionContext, bookingId);
    const expected = {
      folioId: ensured.folioId,
      ...posting,
      sourceType: "operator",
      sourceId: context.session.itemId
    };
    const existing = must4(await prisma.folioEntry.findUnique({
      where: { postingKey: posting.postingKey }
    }));
    if (existing) {
      assertSamePosting(existing, expected);
      return folioResult(prisma, existing, true);
    }
    assertNewOperatorPostingAllowed(ensured.status);
    const entry = must4(await prisma.folioEntry.create({
      data: {
        ...expected,
        serviceDate: parsedServiceDate,
        postedAt: /* @__PURE__ */ new Date(),
        postedById: context.session.itemId,
        metadataSnapshot: { actorId: context.session.itemId }
      }
    }));
    return folioResult(prisma, entry, false);
  });
}
async function reverseFolioPosting({
  context,
  entryId,
  postingKey,
  reason
}) {
  const normalizedPostingKey = normalizePostingKey(postingKey);
  const normalizedReason = normalizeDescription(reason, "reason");
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lock(prisma, `hotel-folio-entry:${entryId}`);
    const original = await prisma.folioEntry.findUnique({
      where: { id: entryId },
      include: { folio: true, reversedBy: true }
    });
    if (!original?.folioId || !original.folio) throw new Error("Folio entry not found.");
    if (original.folio.status !== "open") {
      throw new Error("Closed or voided folios cannot accept reversals.");
    }
    if (["payment", "refund"].includes(original.entryType)) {
      throw new Error("Payment and refund entries must be corrected through the payment domain.");
    }
    if (original.reversedBy) {
      if (original.reversedBy.postingKey !== normalizedPostingKey) {
        throw new Error("This folio entry has already been reversed.");
      }
      return folioResult(prisma, original.reversedBy, true);
    }
    const posting = buildFolioReversalPosting(original, {
      postingKey: normalizedPostingKey,
      reason: normalizedReason
    });
    const expected = {
      folioId: original.folioId,
      ...posting,
      postedById: context.session.itemId
    };
    const existing = await prisma.folioEntry.findUnique({
      where: { postingKey: normalizedPostingKey }
    });
    if (existing) {
      assertSamePosting(existing, expected);
      return folioResult(prisma, existing, true);
    }
    const now = /* @__PURE__ */ new Date();
    const entry = await prisma.folioEntry.create({
      data: {
        ...posting,
        folioId: original.folioId,
        serviceDate: now,
        postedAt: now,
        postedById: context.session.itemId
      }
    });
    return folioResult(prisma, entry, false);
  });
}
async function recordOperatorBookingPayment({
  context,
  bookingId,
  postingKey,
  amountMinor,
  currencyCode,
  paymentMethod,
  description
}) {
  const normalizedKey = normalizePostingKey(postingKey);
  const normalizedDescription = normalizeDescription(description);
  const validated = validateFolioPosting({
    postingKey: normalizedKey,
    entryType: "payment",
    direction: "credit",
    amountMinor,
    currencyCode,
    description: normalizedDescription
  });
  if (!OPERATOR_PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error("Unsupported operator payment method.");
  }
  if (validated.currencyCode !== "USD") {
    throw new Error("Operator payments currently support USD only.");
  }
  const paymentId = `manual_${(0, import_node_crypto16.createHash)("sha256").update(`${bookingId}:${normalizedKey}`).digest("hex").slice(0, 24)}`;
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lock(prisma, `hotel-folio-booking:${bookingId}`);
    await lock(prisma, `hotel-folio-operator-payment:${normalizedKey}`);
    const booking = must4(await prisma.booking.findUnique({ where: { id: bookingId } }));
    if (!booking) throw new Error("Booking not found.");
    const provider = must4(await prisma.paymentProvider.findUnique({
      where: { code: "pp_manual_manual" }
    }));
    if (!provider) throw new Error("Manual payment provider is not configured.");
    const existingPayment = must4(await prisma.bookingPayment.findUnique({ where: { id: paymentId } }));
    if (existingPayment) {
      const evidence = existingPayment.providerData || {};
      if (existingPayment.bookingId !== bookingId || Math.round(Number(existingPayment.amount) * 100) !== amountMinor || existingPayment.currency !== validated.currencyCode || existingPayment.paymentMethod !== paymentMethod || existingPayment.description !== normalizedDescription || evidence.operatorPostingKey !== normalizedKey) {
        throw new Error("postingKey is already bound to different payment evidence.");
      }
      const entry2 = await ensurePaymentFolioPosting(transactionContext, existingPayment.id);
      return folioResult(prisma, entry2, true);
    }
    const now = /* @__PURE__ */ new Date();
    const payment = must4(await prisma.bookingPayment.create({
      data: {
        id: paymentId,
        paymentReference: `PAY-${(0, import_node_crypto16.randomUUID)().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        bookingId,
        paymentProviderId: provider.id,
        amountMinor,
        amount: amountMinor / 100,
        currency: validated.currencyCode,
        paymentType: "full_payment",
        paymentMethod,
        status: "completed",
        providerPaymentId: `manual:${normalizedKey}`,
        providerData: {
          operatorPostingKey: normalizedKey,
          recordedBy: context.session.itemId
        },
        description: normalizedDescription,
        processedAt: now,
        processedById: context.session.itemId
      }
    }));
    const entry = await ensurePaymentFolioPosting(transactionContext, payment.id);
    const ledger = await prisma.bookingPayment.findMany({
      where: { bookingId, status: { in: ["completed", "refunded"] } },
      select: { paymentType: true, amountMinor: true }
    });
    const paidMinor = Math.max(0, ledger.reduce((sum, item) => sum + (item.paymentType === "refund" ? -Math.abs(Number(item.amountMinor || 0)) : Math.max(0, Number(item.amountMinor || 0))), 0));
    const totalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
    const terminal = ["cancelled", "no_show"].includes(booking.status);
    const terminalEntries = terminal ? await prisma.folioEntry.findMany({
      where: { folioId: entry.folioId },
      select: { direction: true, amountMinor: true }
    }) : [];
    const remainingMinor = terminal ? Math.max(0, calculateFolioBalance(terminalEntries).balanceMinor) : Math.max(0, totalMinor - paidMinor);
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: remainingMinor <= 0 ? "paid" : paidMinor > 0 ? "partial" : "unpaid",
        balanceDueMinor: remainingMinor,
        balanceDue: remainingMinor / 100
      }
    });
    return folioResult(prisma, entry, false);
  });
}

// features/keystone/mutations/postFolioEntry.ts
async function postFolioEntry(root, {
  bookingId,
  postingKey,
  entryType,
  direction,
  amountMinor,
  currencyCode,
  description,
  serviceDate
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to post folio entries.");
  }
  return postOperatorFolioEntry({
    context,
    bookingId,
    postingKey,
    entryType,
    direction,
    amountMinor,
    currencyCode,
    description,
    serviceDate
  });
}

// features/keystone/mutations/reverseFolioEntry.ts
async function reverseFolioEntry(root, {
  entryId,
  postingKey,
  reason
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to reverse folio entries.");
  }
  return reverseFolioPosting({ context, entryId, postingKey, reason });
}

// features/keystone/mutations/recordBookingPayment.ts
async function recordBookingPayment(root, {
  bookingId,
  postingKey,
  amountMinor,
  currencyCode,
  paymentMethod,
  description
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to record booking payments.");
  }
  await ensureDefaultPaymentProviders(context);
  return recordOperatorBookingPayment({
    context,
    bookingId,
    postingKey,
    amountMinor,
    currencyCode,
    paymentMethod,
    description
  });
}

// features/keystone/mutations/closeReconciledFolio.ts
var TERMINAL_BOOKING_STATUSES = /* @__PURE__ */ new Set(["checked_out", "cancelled", "no_show"]);
async function closeReconciledFolio(_root, {
  bookingId,
  idempotencyKey
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to close reconciled folios.");
  }
  const key3 = String(idempotencyKey || "").trim();
  if (!key3 || key3.length > 200) throw new Error("A bounded idempotencyKey is required.");
  const eventKey = `folio:reconciled-close:${key3}`;
  const identity = {
    request: { bookingId },
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "folio_reconciled"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-folio-booking:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      return { ...replay.afterSnapshot, replayed: true };
    }
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { folio: { include: { entries: { select: { direction: true, amountMinor: true } } } } }
    });
    if (!booking?.folio) throw new Error("Booking folio not found.");
    if (booking.billingFolioId) throw new Error("Group master folios require group settlement.");
    if (!TERMINAL_BOOKING_STATUSES.has(booking.status)) {
      throw new Error("Only terminal booking folios can be reconciled and closed.");
    }
    if (booking.folio.status === "voided") throw new Error("Voided folios cannot be closed.");
    if (booking.folio.status === "closed") {
      throw new Error("Folio is already closed; replay requires the original idempotency key.");
    }
    const balance = calculateFolioBalance(booking.folio.entries);
    if (balance.balanceMinor !== 0) {
      throw new Error(`Folio cannot close with an outstanding balance of ${balance.balanceMinor} minor units.`);
    }
    const closedAt = /* @__PURE__ */ new Date();
    await prisma.folio.update({
      where: { id: booking.folio.id },
      data: { status: "closed", closedAt }
    });
    const result = {
      folioId: booking.folio.id,
      status: "closed",
      balanceMinor: 0,
      replayed: false
    };
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: booking.folio.status, ...balance },
      afterSnapshot: result,
      metadata: { confirmationNumber: booking.confirmationNumber, closedAt: closedAt.toISOString() }
    });
    return result;
  });
}

// features/keystone/mutations/updateHousekeepingTaskStatus.ts
var TRANSITIONS3 = {
  pending: /* @__PURE__ */ new Set(["in_progress", "on_hold"]),
  in_progress: /* @__PURE__ */ new Set(["completed", "inspection_needed", "on_hold"]),
  on_hold: /* @__PURE__ */ new Set(["pending", "in_progress"]),
  inspection_needed: /* @__PURE__ */ new Set(["in_progress", "completed", "on_hold"]),
  completed: /* @__PURE__ */ new Set()
};
async function updateHousekeepingTaskStatus(root, {
  taskId,
  status,
  assignedToId,
  notes,
  idempotencyKey
}, context) {
  if (!permissions.canManageHousekeeping({ session: context.session })) {
    throw new Error("Not authorized to update housekeeping tasks.");
  }
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  if (!TRANSITIONS3[status]) throw new Error("Unsupported housekeeping status.");
  const normalizedNotes = notes?.trim() || null;
  const request = { taskId, status, assignedToId: assignedToId || null, notes: normalizedNotes };
  const identity = {
    request,
    aggregateType: "housekeeping_task",
    aggregateId: taskId,
    action: "status_changed"
  };
  await runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const task = await prisma.housekeepingTask.findUnique({
      where: { id: taskId },
      include: { room: true }
    });
    if (!task?.roomId || !task.room) throw new Error("Housekeeping task or room not found.");
    if (task.status === status) throw new Error(`Housekeeping task is already ${status}.`);
    if (!TRANSITIONS3[task.status]?.has(status)) {
      throw new Error(`Housekeeping status cannot transition from ${task.status} to ${status}.`);
    }
    const now = /* @__PURE__ */ new Date();
    const nextNotes = normalizedNotes ? [task.notes, `[${now.toISOString()}] ${normalizedNotes}`].filter(Boolean).join("\n") : task.notes;
    const updated = await prisma.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status,
        assignedToId: assignedToId === void 0 ? task.assignedToId : assignedToId,
        notes: nextNotes,
        startedAt: status === "in_progress" ? task.startedAt || now : task.startedAt,
        completedAt: status === "completed" ? task.completedAt || now : task.completedAt
      }
    });
    let roomStatus = task.room.status;
    if (status === "in_progress") roomStatus = task.taskType === "maintenance" ? "maintenance" : "cleaning";
    if (status === "inspection_needed") roomStatus = "cleaning";
    if (status === "completed") {
      const [remainingTasks, openMaintenance] = await Promise.all([
        prisma.housekeepingTask.count({
          where: { roomId: task.roomId, id: { not: task.id }, status: { not: "completed" } }
        }),
        prisma.maintenanceRequest.findMany({
          where: { roomId: task.roomId, status: { notIn: ["verified", "cancelled"] } },
          select: { status: true }
        })
      ]);
      const maintenanceInProgress = openMaintenance.some((item) => ["reported", "assigned", "in_progress"].includes(item.status));
      roomStatus = maintenanceInProgress ? "maintenance" : remainingTasks || openMaintenance.length ? "cleaning" : "vacant";
    }
    if (roomStatus !== task.room.status || status === "completed") {
      await prisma.room.update({
        where: { id: task.roomId },
        data: {
          status: roomStatus,
          ...status === "completed" && roomStatus === "vacant" ? { lastCleaned: now } : {}
        }
      });
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: {
        status: task.status,
        assignedToId: task.assignedToId,
        notes: task.notes,
        roomStatus: task.room.status
      },
      afterSnapshot: {
        status: updated.status,
        assignedToId: updated.assignedToId,
        notes: updated.notes,
        roomStatus
      }
    });
  });
  return context.prisma.housekeepingTask.findUnique({ where: { id: taskId } });
}

// features/keystone/mutations/updateRatePlanPublication.ts
var RATE_STATUSES = /* @__PURE__ */ new Set(["active", "inactive", "draft"]);
async function updateRatePlanPublication(root, {
  ratePlanId,
  status,
  isPublic,
  idempotencyKey
}, context) {
  if (!permissions.canManageRooms({ session: context.session })) {
    throw new Error("Not authorized to publish rate plans.");
  }
  if (status === void 0 && isPublic === void 0) {
    throw new Error("Provide status or isPublic.");
  }
  if (status != null && !RATE_STATUSES.has(status)) throw new Error("Unsupported rate plan status.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const request = { ratePlanId, status: status ?? null, isPublic: isPublic ?? null };
  const identity = {
    request,
    aggregateType: "rate_plan",
    aggregateId: ratePlanId,
    action: "publication_changed"
  };
  await runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const plan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
    if (!plan?.roomTypeId) throw new Error("Rate plan or required room type not found.");
    const nextStatus = status ?? plan.status;
    const nextIsPublic = isPublic ?? plan.isPublic;
    if (nextStatus === "active" && String(plan.currencyCode || "").toUpperCase() !== "USD") {
      throw new Error("The bounded initial release supports USD rate plans only.");
    }
    if (nextStatus === "active" && (!Number.isSafeInteger(plan.baseRateMinor) || plan.baseRateMinor < 0)) {
      throw new Error("Active rate plans require a non-negative integer minor-unit rate.");
    }
    if (nextStatus === "active" && nextIsPublic && plan.isPromotional && !String(plan.promoCode || "").trim()) {
      throw new Error("A public promotional rate cannot be activated without a promo code.");
    }
    const updated = await prisma.ratePlan.update({
      where: { id: ratePlanId },
      data: { status: nextStatus, isPublic: nextIsPublic }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: plan.status, isPublic: plan.isPublic },
      afterSnapshot: { status: updated.status, isPublic: updated.isPublic },
      metadata: { roomTypeId: plan.roomTypeId }
    });
  });
  return context.prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
}

// features/keystone/queries/hotelOperations.ts
var HOTEL_PROPERTY_KEY2 = "the-alder-house";
function requireHotelPermission(context, permission, propertyKey) {
  if (propertyKey !== HOTEL_PROPERTY_KEY2) {
    throw new Error("Property access denied.");
  }
  if (!context.session?.data?.role?.[permission]) {
    throw new Error("Not authorized for this hotel workspace.");
  }
}
function boundedDateRange(startValue, endValue, maxDays) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const duration = end.getTime() - start.getTime();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || duration < 0 || duration > maxDays * 864e5) {
    throw new Error(`Date range must be between 0 and ${maxDays} days.`);
  }
  return { start, end };
}
function syncErrorSummary(value) {
  if (!Array.isArray(value)) return { count: 0, latestMessage: null, latestAt: null };
  const latest = value.at(-1);
  if (!latest || typeof latest !== "object") {
    return { count: value.length, latestMessage: null, latestAt: null };
  }
  const error = latest;
  return {
    count: value.length,
    latestMessage: typeof error.message === "string" ? error.message : null,
    latestAt: typeof error.occurredAt === "string" ? error.occurredAt : null
  };
}
var hotelOperationsTypeDefs = String.raw`
  type HotelRoomTypeRef { id: ID!, name: String!, baseRate: Float, baseRateMinor: Int }
  type HotelRoomRef { id: ID!, roomNumber: String!, status: String, floor: String, roomType: HotelRoomTypeRef }
  type HotelUserRef { id: ID!, name: String }

  type HotelModificationRequestProjection {
    id: ID!
    requestedCheckInDate: DateTime
    requestedCheckOutDate: DateTime
    guestMessage: String
  }

  type HotelReservationProjection {
    id: ID!
    confirmationNumber: String!
    guestName: String!
    checkInDate: DateTime!
    checkOutDate: DateTime!
    status: String!
    source: String!
    numberOfGuests: Int!
    totalAmount: Float!
    balanceDue: Float!
    totalAmountMinor: Int!
    balanceDueMinor: Int!
    internalNotes: String
    hasPendingModificationRequest: Boolean!
    pendingModificationRequest: HotelModificationRequestProjection
    room: HotelRoomRef
    roomType: HotelRoomTypeRef
  }

  type HotelReservationBoard {
    businessDate: DateTime!
    reservations: [HotelReservationProjection!]!
    rooms: [HotelRoomRef!]!
  }

  type HotelTaskSummary { id: ID!, taskType: String!, status: String!, priority: String! }
  type HotelRoomOperationsItem {
    id: ID!
    roomNumber: String!
    floor: String
    status: String!
    notes: String
    lastCleaned: DateTime
    roomType: HotelRoomTypeRef!
    activeTask: HotelTaskSummary
  }
  type HotelRoomOperations { rooms: [HotelRoomOperationsItem!]! }

  type HotelInventoryProjection {
    id: ID!
    date: DateTime!
    totalRooms: Int!
    bookedRooms: Int!
    blockedRooms: Int!
    availableRooms: Int!
    isAvailable: Boolean!
    roomType: HotelRoomTypeRef!
  }
  type HotelRatePlanProjection {
    id: ID!
    name: String!
    description: String
    baseRate: Float!
    baseRateMinor: Int!
    currencyCode: String!
    minimumStay: Int
    maximumStay: Int
    cancellationPolicy: String
    mealPlan: String
    status: String
    isPublic: Boolean
    isPromotional: Boolean
    promoCode: String
    priority: Int
    validFrom: DateTime
    validTo: DateTime
    roomType: HotelRoomTypeRef!
  }
  type HotelRoomTypeCapacity { id: ID!, name: String!, totalRooms: Int!, sellableRooms: Int! }
  type HotelRateOperations {
    roomTypes: [HotelRoomTypeCapacity!]!
    inventories: [HotelInventoryProjection!]!
    ratePlans: [HotelRatePlanProjection!]!
  }

  type HotelHousekeepingTaskProjection {
    id: ID!
    status: String!
    taskType: String!
    priority: String!
    notes: String
    startedAt: DateTime
    completedAt: DateTime
    room: HotelRoomRef!
    assignedTo: HotelUserRef
  }
  type HotelHousekeepingMetrics {
    completedToday: Int!
    averageCleanMinutes: Int!
  }
  type HotelHousekeepingOperations {
    rooms: [HotelRoomRef!]!
    tasks: [HotelHousekeepingTaskProjection!]!
    assignees: [HotelUserRef!]!
    metrics: HotelHousekeepingMetrics!
  }

  type HotelMaintenanceProjection {
    id: ID!
    title: String!
    category: String!
    priority: String!
    status: String!
    notes: String
    completedAt: DateTime
    room: HotelRoomRef!
    assignedTo: HotelUserRef
    createdAt: DateTime!
  }
  type HotelMaintenanceOperations { requests: [HotelMaintenanceProjection!]! }

  type HotelFolioEntryProjection {
    id: ID!
    postingKey: String!
    entryType: String!
    direction: String!
    amountMinor: Int!
    currencyCode: String!
    description: String!
    serviceDate: DateTime
    postedAt: DateTime!
    sourceType: String
    taxCategorySnapshot: String
    reversesId: ID
    reversedById: ID
  }
  type HotelFolioProjection {
    id: ID!
    folioNumber: String!
    status: String!
    currencyCode: String!
    openedAt: DateTime!
    booking: HotelReservationProjection
    entries: [HotelFolioEntryProjection!]!
    debitMinor: Int!
    creditMinor: Int!
    balanceMinor: Int!
  }
  type HotelFolioOperations {
    folios: [HotelFolioProjection!]!
    overdueExceptions: [HotelReservationProjection!]!
  }

  type HotelChannelProjection {
    id: ID!
    name: String!
    channelType: String!
    isActive: Boolean!
    syncInventory: Boolean!
    syncRates: Boolean!
    commission: Float
    syncStatus: String!
    lastSyncAt: DateTime
    syncErrorCount: Int!
    latestSyncError: String
    latestSyncErrorAt: DateTime
  }
  type HotelChannelReservationProjection {
    id: ID!
    externalId: String!
    guestName: String!
    checkInDate: DateTime!
    checkOutDate: DateTime!
    channelStatus: String
    totalAmount: Float
    commission: Float
    channel: HotelChannelProjection!
    reservation: HotelReservationProjection
    roomType: HotelRoomTypeRef
  }
  type HotelChannelSyncProjection {
    id: ID!
    action: String!
    status: String!
    message: String
    errorMessage: String
    attempts: Int!
    nextAttemptAt: DateTime
    occurredAt: DateTime!
    channel: HotelChannelProjection!
  }
  type HotelChannelOperations {
    channels: [HotelChannelProjection!]!
    reservations: [HotelChannelReservationProjection!]!
    events: [HotelChannelSyncProjection!]!
  }

  type HotelPaymentProviderProjection { id: ID!, name: String!, code: String!, isInstalled: Boolean!, configured: Boolean! }
  type HotelPaymentProjection {
    id: ID!
    paymentReference: String!
    amount: Float!
    amountMinor: Int!
    currency: String!
    paymentType: String!
    paymentMethod: String!
    status: String!
    booking: HotelReservationProjection!
    paymentProvider: HotelPaymentProviderProjection!
    createdAt: DateTime!
  }
  type HotelPaymentSummary {
    capturedAmount: Float!
    refundedAmount: Float!
    capturedAmountMinor: Int!
    refundedAmountMinor: Int!
    completedCount: Int!
    refundedCount: Int!
    failedCount: Int!
  }
  type HotelPaymentOperations { payments: [HotelPaymentProjection!]!, summary: HotelPaymentSummary! }
  type HotelRefundQuote { paymentId: ID!, refundableMinor: Int!, currencyCode: String! }

  type HotelOperationalReportDay {
    date: DateTime!
    availableRoomNights: Int!
    occupiedRoomNights: Int!
    occupancyRate: Float!
    roomRevenueMinor: Int!
    taxMinor: Int!
    feeMinor: Int!
    totalRevenueMinor: Int!
    adrMinor: Int!
    revparMinor: Int!
    arrivals: Int!
    departures: Int!
    newReservations: Int!
    cancellations: Int!
    noShows: Int!
    paymentsMinor: Int!
    refundsMinor: Int!
  }
  type HotelOperationalReportSummary {
    start: DateTime!
    end: DateTime!
    businessDate: DateTime!
    currencyCode: String!
    availableRoomNights: Int!
    occupiedRoomNights: Int!
    occupancyRate: Float!
    roomRevenueMinor: Int!
    taxMinor: Int!
    feeMinor: Int!
    totalRevenueMinor: Int!
    adrMinor: Int!
    revparMinor: Int!
    arrivals: Int!
    departures: Int!
    newReservations: Int!
    cancellations: Int!
    noShows: Int!
    paymentsMinor: Int!
    refundsMinor: Int!
    openFolioBalanceMinor: Int!
    openFolioCount: Int!
  }
  type HotelChannelReport { source: String!, bookings: Int!, revenueMinor: Int! }
  type HotelRoomTypeReport { id: ID!, name: String!, availableRoomNights: Int!, occupiedRoomNights: Int!, occupancyRate: Float!, roomRevenueMinor: Int!, adrMinor: Int! }
  type HotelAnalyticsOperations {
    summary: HotelOperationalReportSummary!
    days: [HotelOperationalReportDay!]!
    channels: [HotelChannelReport!]!
    roomTypes: [HotelRoomTypeReport!]!
  }

  type HotelGuestProjection {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    phone: String
    loyaltyNumber: String
    loyaltyTier: String
    loyaltyPoints: String
    isVip: Boolean!
    isBlacklisted: Boolean!
    lastStayAt: DateTime
    totalStays: String
    totalSpent: String
    createdAt: DateTime!
  }
  type HotelGuestOperations { guests: [HotelGuestProjection!]! }
  type HotelPaymentProviderOperations { providers: [HotelPaymentProviderProjection!]! }
  type HotelOperatorCapabilities {
    canAccessDashboard: Boolean!
    canManageRooms: Boolean!
    canManageBookings: Boolean!
    canManageHousekeeping: Boolean!
    canManageGuests: Boolean!
    canManagePayments: Boolean!
    canManageOnboarding: Boolean!
    canManageAudit: Boolean!
    canManageIntegrations: Boolean!
  }

  type HotelNightAuditRunProjection {
    id: ID!
    businessDate: DateTime!
    status: String!
    dueBookingCount: Int!
    postedEntryCount: Int!
    existingEntryCount: Int!
    exceptionCount: Int!
    debitMinor: Int!
    completedAt: DateTime!
  }
  type HotelNightAuditOperations {
    currentBusinessDate: DateTime!
    runs: [HotelNightAuditRunProjection!]!
  }
  type HotelGroupAllocationProjection {
    id: ID!
    allocationKey: String!
    roomType: HotelRoomTypeRef!
    roomsHeld: Int!
    roomsPickedUp: Int!
    rateMinor: Int!
    currencyCode: String!
  }
  type HotelGroupBlockProjection {
    id: ID!
    blockCode: String!
    name: String!
    status: String!
    arrivalDate: DateTime!
    departureDate: DateTime!
    releaseDate: DateTime
    contactName: String!
    contactEmail: String!
    billingType: String!
    allocations: [HotelGroupAllocationProjection!]!
  }
  type HotelGroupOperations { groups: [HotelGroupBlockProjection!]! }

  type HotelOutboxAttemptProjection { id: ID!, attemptNumber: Int!, status: String!, workerId: String!, errorMessage: String, startedAt: DateTime!, finishedAt: DateTime }
  type HotelOutboxEventProjection {
    id: ID!, eventKey: String!, topic: String!, aggregateType: String!, aggregateId: String!, status: String!, attempts: Int!,
    availableAt: DateTime!, deliveredAt: DateTime, deadLetteredAt: DateTime, lastError: String, replayedFromEventKey: String,
    attemptsEvidence: [HotelOutboxAttemptProjection!]!
  }
  type HotelRefundIntentProjection {
    id: ID!, intentKey: String!, amountMinor: Int!, currencyCode: String!, reason: String!, status: String!, attempts: Int!,
    lastError: String, availableAt: DateTime!, completedAt: DateTime, booking: HotelReservationProjection!
  }
  type HotelOutboxOperations { events: [HotelOutboxEventProjection!]!, refundIntents: [HotelRefundIntentProjection!]! }

  extend type Query {
    hotelOperatorCapabilities: HotelOperatorCapabilities!
    hotelFrontDesk(propertyKey: String!, start: DateTime!, end: DateTime!): HotelReservationBoard!
    hotelReservationCalendar(propertyKey: String!, start: DateTime!, end: DateTime!): HotelReservationBoard!
    hotelRoomOperations(propertyKey: String!): HotelRoomOperations!
    hotelRateOperations(propertyKey: String!, start: DateTime!, end: DateTime!): HotelRateOperations!
    hotelHousekeepingOperations(propertyKey: String!): HotelHousekeepingOperations!
    hotelMaintenanceOperations(propertyKey: String!): HotelMaintenanceOperations!
    hotelFolioOperations(propertyKey: String!): HotelFolioOperations!
    hotelChannelOperations(propertyKey: String!): HotelChannelOperations!
    hotelPaymentOperations(propertyKey: String!): HotelPaymentOperations!
    hotelRefundQuote(propertyKey: String!, paymentId: ID!): HotelRefundQuote!
    hotelAnalyticsOperations(propertyKey: String!, start: DateTime!, end: DateTime!): HotelAnalyticsOperations!
    hotelGuestOperations(propertyKey: String!, search: String): HotelGuestOperations!
    hotelPaymentProviderOperations(propertyKey: String!): HotelPaymentProviderOperations!
    hotelNightAuditOperations(propertyKey: String!): HotelNightAuditOperations!
    hotelGroupOperations(propertyKey: String!): HotelGroupOperations!
    hotelOutboxOperations(propertyKey: String!): HotelOutboxOperations!
  }
`;
function mapRoom(room) {
  if (!room) return null;
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor || null,
    status: room.status || null,
    roomType: room.roomType ? { id: room.roomType.id, name: room.roomType.name, baseRate: room.roomType.baseRateMinor / 100, baseRateMinor: room.roomType.baseRateMinor } : null
  };
}
function mapReservation(booking) {
  if (!booking) return null;
  const assignment = booking.roomAssignments?.[0];
  return {
    id: booking.id,
    confirmationNumber: booking.confirmationNumber,
    guestName: booking.guestName,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    status: booking.status,
    source: booking.source,
    numberOfGuests: booking.numberOfGuests,
    totalAmount: booking.totalAmountMinor / 100,
    balanceDue: booking.balanceDueMinor / 100,
    totalAmountMinor: booking.totalAmountMinor,
    balanceDueMinor: booking.balanceDueMinor,
    internalNotes: booking.internalNotes || null,
    hasPendingModificationRequest: Boolean(booking.modificationRequests?.length),
    pendingModificationRequest: booking.modificationRequests?.[0] || null,
    room: mapRoom(assignment?.room),
    roomType: assignment?.roomType ? { id: assignment.roomType.id, name: assignment.roomType.name, baseRate: assignment.roomType.baseRateMinor / 100, baseRateMinor: assignment.roomType.baseRateMinor } : null
  };
}
var reservationInclude = {
  roomAssignments: {
    take: 1,
    include: { room: { include: { roomType: true } }, roomType: true }
  },
  modificationRequests: {
    where: { status: "pending" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      requestedCheckInDate: true,
      requestedCheckOutDate: true,
      guestMessage: true
    }
  }
};
async function reservationBoard(context, args, permission, maxDays, vacantOnly, includePendingModifications = false) {
  requireHotelPermission(context, permission, args.propertyKey);
  const { start, end } = boundedDateRange(args.start, args.end, maxDays);
  const dateOverlap = { checkOutDate: { gt: start }, checkInDate: { lt: end } };
  const [bookings, rooms, clock] = await Promise.all([
    context.prisma.booking.findMany({
      where: includePendingModifications ? { OR: [dateOverlap, { modificationRequests: { some: { status: "pending" } } }] } : dateOverlap,
      orderBy: [{ checkInDate: "asc" }, { id: "asc" }],
      take: 251,
      include: reservationInclude
    }),
    context.prisma.room.findMany({
      where: vacantOnly ? { status: "vacant" } : void 0,
      orderBy: [{ roomNumber: "asc" }],
      take: 251,
      include: { roomType: true }
    }),
    context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { currentBusinessDate: true } })
  ]);
  if (!clock) throw new Error("Property business date is not configured.");
  if (bookings.length > 250 || rooms.length > 250) throw new Error("Reservation board exceeds the supported 250-record bound; narrow the date range.");
  return { businessDate: clock.currentBusinessDate, reservations: bookings.map(mapReservation), rooms: rooms.map(mapRoom) };
}
var hotelOperationsResolvers = {
  Query: {
    hotelOperatorCapabilities: (_root, _args, context) => {
      if (!context.session?.itemId) throw new Error("Authentication is required.");
      const role = context.session.data?.role || {};
      return {
        canAccessDashboard: Boolean(role.canAccessDashboard),
        canManageRooms: Boolean(role.canManageRooms),
        canManageBookings: Boolean(role.canManageBookings),
        canManageHousekeeping: Boolean(role.canManageHousekeeping),
        canManageGuests: Boolean(role.canManageGuests),
        canManagePayments: Boolean(role.canManagePayments),
        canManageOnboarding: Boolean(role.canManageOnboarding),
        canManageAudit: Boolean(role.canManageAudit),
        canManageIntegrations: Boolean(role.canManageIntegrations)
      };
    },
    hotelFrontDesk: (_root, args, context) => reservationBoard(context, args, "canManageBookings", 31, true, true),
    hotelReservationCalendar: (_root, args, context) => reservationBoard(context, args, "canManageBookings", 120, false),
    hotelRoomOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageRooms", args.propertyKey);
      const rooms = await context.prisma.room.findMany({
        orderBy: [{ roomNumber: "asc" }],
        take: 250,
        include: {
          roomType: true,
          housekeepingTasks: {
            where: { status: { not: "completed" } },
            orderBy: [{ createdAt: "desc" }],
            take: 1
          }
        }
      });
      return {
        rooms: rooms.map((room) => ({
          ...mapRoom(room),
          notes: room.notes || null,
          lastCleaned: room.lastCleaned,
          activeTask: room.housekeepingTasks[0] || null
        }))
      };
    },
    hotelRateOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageRooms", args.propertyKey);
      const { start, end } = boundedDateRange(args.start, args.end, 120);
      const [roomTypes, inventories, ratePlans] = await Promise.all([
        context.prisma.roomType.findMany({ orderBy: { name: "asc" }, include: { rooms: true } }),
        context.prisma.roomInventory.findMany({
          where: { date: { gte: start, lte: end } },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          take: 500,
          include: { roomType: true }
        }),
        context.prisma.ratePlan.findMany({
          orderBy: [{ status: "asc" }, { priority: "desc" }, { baseRateMinor: "asc" }],
          take: 100,
          include: { roomType: true }
        })
      ]);
      return {
        roomTypes: roomTypes.map((type) => ({
          id: type.id,
          name: type.name,
          totalRooms: type.rooms.length,
          sellableRooms: type.rooms.filter((room) => !["maintenance", "out_of_order"].includes(room.status)).length
        })),
        inventories: inventories.map((item) => ({
          ...item,
          availableRooms: Math.max(0, item.totalRooms - item.bookedRooms - item.blockedRooms),
          isAvailable: item.totalRooms - item.bookedRooms - item.blockedRooms > 0
        })),
        ratePlans
      };
    },
    hotelHousekeepingOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageHousekeeping", args.propertyKey);
      const completedSince = /* @__PURE__ */ new Date();
      completedSince.setUTCHours(0, 0, 0, 0);
      const [rooms, tasks, assignees] = await Promise.all([
        context.prisma.room.findMany({ orderBy: { roomNumber: "asc" }, take: 250, include: { roomType: true } }),
        context.prisma.housekeepingTask.findMany({
          where: {
            OR: [
              { status: { in: ["pending", "in_progress", "on_hold", "inspection_needed"] } },
              { status: "completed", completedAt: { gte: completedSince } }
            ]
          },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          take: 250,
          include: { room: { include: { roomType: true } }, assignedTo: true }
        }),
        context.prisma.user.findMany({
          where: { role: { name: "Housekeeping" } },
          orderBy: { name: "asc" },
          take: 100
        })
      ]);
      const completed = tasks.filter((task) => task.status === "completed" && task.completedAt >= completedSince);
      const durations = completed.filter((task) => task.startedAt && task.completedAt).map((task) => Math.max(0, Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 6e4)));
      return {
        rooms: rooms.map(mapRoom),
        tasks: tasks.map((task) => ({ ...task, room: mapRoom(task.room) })),
        assignees,
        metrics: {
          completedToday: completed.length,
          averageCleanMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0
        }
      };
    },
    hotelMaintenanceOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageRooms", args.propertyKey);
      const requests = await context.prisma.maintenanceRequest.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 100,
        include: { room: { include: { roomType: true } }, assignedTo: true }
      });
      return { requests: requests.map((item) => ({ ...item, room: mapRoom(item.room) })) };
    },
    hotelFolioOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManagePayments", args.propertyKey);
      const [folios, clock] = await Promise.all([context.prisma.folio.findMany({
        orderBy: [{ openedAt: "desc" }],
        take: 50,
        include: {
          booking: { include: reservationInclude },
          entries: {
            orderBy: [{ postedAt: "asc" }, { id: "asc" }],
            include: { reversedBy: { select: { id: true } } }
          }
        }
      }), context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } })]);
      const overdueExceptions = clock ? await context.prisma.booking.findMany({
        where: { status: "checked_in", checkOutDate: { lte: clock.currentBusinessDate } },
        orderBy: [{ checkOutDate: "asc" }, { id: "asc" }],
        take: 100,
        include: reservationInclude
      }) : [];
      return {
        overdueExceptions: overdueExceptions.map(mapReservation),
        folios: folios.map((folio) => {
          const debitMinor = folio.entries.filter((entry) => entry.direction === "debit").reduce((sum, entry) => sum + entry.amountMinor, 0);
          const creditMinor = folio.entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + entry.amountMinor, 0);
          return {
            ...folio,
            booking: mapReservation(folio.booking),
            entries: folio.entries.map((entry) => ({
              ...entry,
              reversesId: entry.reversesId || null,
              reversedById: entry.reversedBy?.id || null
            })),
            debitMinor,
            creditMinor,
            balanceMinor: debitMinor - creditMinor
          };
        })
      };
    },
    hotelChannelOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageBookings", args.propertyKey);
      requireHotelPermission(context, "canManageIntegrations", args.propertyKey);
      const [channels, reservations, events] = await Promise.all([
        context.prisma.channel.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
        context.prisma.channelReservation.findMany({
          orderBy: { lastSyncedAt: "desc" },
          take: 50,
          include: {
            channel: true,
            reservation: { include: reservationInclude },
            roomType: true
          }
        }),
        context.prisma.channelSyncEvent.findMany({
          orderBy: { occurredAt: "desc" },
          take: 50,
          include: { channel: true }
        })
      ]);
      const mapChannel = (channel) => {
        const errors = syncErrorSummary(channel.syncErrors);
        return {
          id: channel.id,
          name: channel.name,
          channelType: channel.channelType,
          isActive: channel.isActive,
          syncInventory: channel.syncInventory,
          syncRates: channel.syncRates,
          commission: channel.commission,
          syncStatus: channel.syncStatus || "unknown",
          lastSyncAt: channel.lastSyncAt,
          syncErrorCount: errors.count,
          latestSyncError: errors.latestMessage,
          latestSyncErrorAt: errors.latestAt
        };
      };
      return {
        channels: channels.map(mapChannel),
        reservations: reservations.map((item) => ({
          ...item,
          channel: mapChannel(item.channel),
          reservation: mapReservation(item.reservation)
        })),
        events: events.map((item) => ({ ...item, channel: mapChannel(item.channel) }))
      };
    },
    hotelPaymentOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManagePayments", args.propertyKey);
      const payments = await context.prisma.bookingPayment.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { booking: { include: reservationInclude }, paymentProvider: true }
      });
      const completed = payments.filter((payment) => payment.status === "completed");
      const refunded = payments.filter((payment) => payment.status === "refunded");
      return {
        payments: payments.map((payment) => ({
          ...payment,
          amount: payment.amountMinor / 100,
          booking: mapReservation(payment.booking),
          paymentProvider: {
            id: payment.paymentProvider.id,
            name: payment.paymentProvider.name,
            code: payment.paymentProvider.code,
            isInstalled: payment.paymentProvider.isInstalled
          }
        })),
        summary: {
          capturedAmountMinor: completed.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountMinor || 0)), 0),
          refundedAmountMinor: refunded.reduce((sum, payment) => sum + Math.abs(Number(payment.amountMinor || 0)), 0),
          capturedAmount: completed.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountMinor || 0)), 0) / 100,
          refundedAmount: refunded.reduce((sum, payment) => sum + Math.abs(Number(payment.amountMinor || 0)), 0) / 100,
          completedCount: completed.length,
          refundedCount: refunded.length,
          failedCount: payments.filter((payment) => payment.status === "failed").length
        }
      };
    },
    hotelRefundQuote: async (_root, args, context) => {
      requireHotelPermission(context, "canManagePayments", args.propertyKey);
      const payment = await context.prisma.bookingPayment.findUnique({ where: { id: args.paymentId } });
      if (!payment || payment.status !== "completed" || payment.paymentType === "refund") {
        throw new Error("Only a completed capture has a refundable balance.");
      }
      return {
        paymentId: payment.id,
        refundableMinor: await refundablePaymentMinor(context.prisma, payment),
        currencyCode: String(payment.currency || "USD").toUpperCase()
      };
    },
    hotelAnalyticsOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageBookings", args.propertyKey);
      const { start, end } = boundedDateRange(args.start, args.end, 370);
      if (end <= start) throw new Error("Reporting end must be after start.");
      if ([start, end].some((date) => date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds() || date.getUTCMilliseconds())) {
        throw new Error("Reporting ranges must use exclusive UTC midnight day boundaries.");
      }
      const [settings, clock, roomTypes, inventories, bookings, payments, openFolios, policyFees] = await Promise.all([
        context.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
        context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { currentBusinessDate: true } }),
        context.prisma.roomType.findMany({ orderBy: { name: "asc" }, include: { rooms: true } }),
        context.prisma.roomInventory.findMany({
          where: { date: { gte: start, lt: end } },
          orderBy: [{ date: "asc" }, { roomTypeId: "asc" }],
          take: 20001
        }),
        context.prisma.booking.findMany({
          where: {
            OR: [
              { checkOutDate: { gt: start }, checkInDate: { lt: end } },
              { createdAt: { gte: start, lt: end } },
              { cancelledAt: { gte: start, lt: end } }
            ]
          },
          orderBy: [{ checkInDate: "asc" }, { id: "asc" }],
          take: 5001,
          include: {
            roomAssignments: { take: 1, include: { roomType: true } },
            lineItems: {
              where: { snapshotStatus: "active", date: { gte: start, lt: end } },
              orderBy: [{ date: "asc" }, { id: "asc" }]
            }
          }
        }),
        context.prisma.bookingPayment.findMany({
          where: {
            status: { in: ["completed", "refunded"] },
            OR: [
              { processedAt: { gte: start, lt: end } },
              { refundedAt: { gte: start, lt: end } },
              { createdAt: { gte: start, lt: end } }
            ]
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 5001
        }),
        context.prisma.folio.findMany({
          where: { status: "open" },
          orderBy: { openedAt: "asc" },
          take: 2001,
          include: { entries: { select: { direction: true, amountMinor: true } } }
        }),
        context.prisma.folioEntry.findMany({
          where: {
            direction: "debit",
            postedAt: { gte: start, lt: end },
            postingKey: { startsWith: "booking:cancel:", endsWith: ":fee" }
          },
          orderBy: [{ postedAt: "asc" }, { id: "asc" }],
          take: 5001,
          select: { amountMinor: true, serviceDate: true, postedAt: true }
        })
      ]);
      if (!settings) throw new Error("Hotel settings are not configured.");
      if (!clock) throw new Error("Property business date is not configured.");
      if (inventories.length > 2e4 || bookings.length > 5e3 || payments.length > 5e3 || openFolios.length > 2e3 || policyFees.length > 5e3) {
        throw new Error("Reporting range exceeds the bounded launch dataset; request a shorter period.");
      }
      const dayKey2 = (value) => {
        const date = new Date(value);
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
      };
      const dayDates = [];
      for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        dayDates.push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())));
      }
      const operationalRoomCount = (type) => type.rooms.filter((room) => !["maintenance", "out_of_order"].includes(room.status)).length;
      const totalPhysicalRooms = roomTypes.reduce((sum2, type) => sum2 + operationalRoomCount(type), 0);
      const inventoryByDay = /* @__PURE__ */ new Map();
      for (const inventory of inventories) {
        const key3 = dayKey2(inventory.date);
        inventoryByDay.set(key3, [...inventoryByDay.get(key3) || [], inventory]);
      }
      const activeStatuses = /* @__PURE__ */ new Set(["confirmed", "checked_in", "checked_out"]);
      const activeBookings = bookings.filter((booking) => activeStatuses.has(booking.status));
      const policyFeeByDay = /* @__PURE__ */ new Map();
      for (const fee of policyFees) {
        const key3 = dayKey2(fee.serviceDate || fee.postedAt);
        policyFeeByDay.set(key3, (policyFeeByDay.get(key3) || 0) + Number(fee.amountMinor || 0));
      }
      const paymentByDay = /* @__PURE__ */ new Map();
      for (const payment of payments) {
        const timestamp33 = payment.paymentType === "refund" ? payment.refundedAt || payment.processedAt || payment.createdAt : payment.processedAt || payment.createdAt;
        const key3 = dayKey2(timestamp33);
        const current = paymentByDay.get(key3) || { paymentsMinor: 0, refundsMinor: 0 };
        if (payment.paymentType === "refund" || Number(payment.amountMinor || 0) < 0) current.refundsMinor += Math.abs(Number(payment.amountMinor || 0));
        else current.paymentsMinor += Math.max(0, Number(payment.amountMinor || 0));
        paymentByDay.set(key3, current);
      }
      const days = dayDates.map((date) => {
        const key3 = dayKey2(date);
        const next = new Date(date);
        next.setUTCDate(next.getUTCDate() + 1);
        const inventoryRows = inventoryByDay.get(key3) || [];
        const blocked = inventoryRows.reduce((sum2, item) => sum2 + Math.max(0, Number(item.blockedRooms || 0)), 0);
        const availableRoomNights2 = Math.max(0, totalPhysicalRooms - blocked);
        const occupiedBookings = activeBookings.filter((booking) => booking.checkInDate < next && booking.checkOutDate > date);
        const lines = occupiedBookings.flatMap((booking) => booking.lineItems.filter((line) => dayKey2(line.date) === key3));
        const roomRevenueMinor2 = lines.filter((line) => line.type === "room").reduce((sum2, line) => sum2 + Number(line.totalPrice || 0), 0);
        const taxMinor = lines.filter((line) => line.type === "tax").reduce((sum2, line) => sum2 + Number(line.totalPrice || 0), 0);
        const feeMinor = lines.filter((line) => !["room", "tax"].includes(line.type)).reduce((sum2, line) => sum2 + Number(line.totalPrice || 0), 0) + (policyFeeByDay.get(key3) || 0);
        const occupiedRoomNights2 = occupiedBookings.length;
        const paymentsForDay = paymentByDay.get(key3) || { paymentsMinor: 0, refundsMinor: 0 };
        return {
          date,
          availableRoomNights: availableRoomNights2,
          occupiedRoomNights: occupiedRoomNights2,
          occupancyRate: availableRoomNights2 ? occupiedRoomNights2 / availableRoomNights2 * 100 : 0,
          roomRevenueMinor: roomRevenueMinor2,
          taxMinor,
          feeMinor,
          totalRevenueMinor: roomRevenueMinor2 + taxMinor + feeMinor,
          adrMinor: occupiedRoomNights2 ? Math.round(roomRevenueMinor2 / occupiedRoomNights2) : 0,
          revparMinor: availableRoomNights2 ? Math.round(roomRevenueMinor2 / availableRoomNights2) : 0,
          arrivals: activeBookings.filter((booking) => dayKey2(booking.checkInDate) === key3).length,
          departures: activeBookings.filter((booking) => dayKey2(booking.checkOutDate) === key3).length,
          newReservations: bookings.filter((booking) => dayKey2(booking.createdAt) === key3).length,
          cancellations: bookings.filter((booking) => booking.status !== "no_show" && booking.cancelledAt && dayKey2(booking.cancelledAt) === key3).length,
          noShows: bookings.filter((booking) => booking.status === "no_show" && dayKey2(booking.checkInDate) === key3).length,
          ...paymentsForDay
        };
      });
      const sum = (field) => days.reduce((total, day) => total + Number(day[field] || 0), 0);
      const availableRoomNights = sum("availableRoomNights");
      const occupiedRoomNights = sum("occupiedRoomNights");
      const roomRevenueMinor = sum("roomRevenueMinor");
      const openFolioBalanceMinor = openFolios.reduce((folioTotal, folio) => folioTotal + folio.entries.reduce(
        (entryTotal, entry) => entryTotal + (entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor),
        0
      ), 0);
      const channelMap = /* @__PURE__ */ new Map();
      const roomTypeMap = new Map(roomTypes.map((type) => [type.id, {
        id: type.id,
        name: type.name,
        availableRoomNights: dayDates.reduce((total, date) => {
          const inventory = (inventoryByDay.get(dayKey2(date)) || []).find((item) => item.roomTypeId === type.id);
          return total + Math.max(0, operationalRoomCount(type) - Number(inventory?.blockedRooms || 0));
        }, 0),
        occupiedRoomNights: 0,
        roomRevenueMinor: 0
      }]));
      for (const booking of activeBookings) {
        const periodLines = booking.lineItems.filter((line) => new Date(line.date) >= start && new Date(line.date) < end);
        const revenueMinor = periodLines.reduce((total, line) => total + Number(line.totalPrice || 0), 0);
        if (periodLines.length) {
          const source = String(booking.source || "direct");
          const channel = channelMap.get(source) || { source, bookings: /* @__PURE__ */ new Set(), revenueMinor: 0 };
          channel.bookings.add(booking.id);
          channel.revenueMinor += revenueMinor;
          channelMap.set(source, channel);
        }
        const roomTypeId = booking.roomAssignments[0]?.roomTypeId;
        const roomType = roomTypeId ? roomTypeMap.get(roomTypeId) : null;
        if (roomType) {
          roomType.occupiedRoomNights += periodLines.filter((line) => line.type === "room").length;
          roomType.roomRevenueMinor += periodLines.filter((line) => line.type === "room").reduce((total, line) => total + Number(line.totalPrice || 0), 0);
        }
      }
      return {
        summary: {
          start,
          end,
          businessDate: clock.currentBusinessDate,
          currencyCode: settings.currencyCode || "USD",
          availableRoomNights,
          occupiedRoomNights,
          occupancyRate: availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0,
          roomRevenueMinor,
          taxMinor: sum("taxMinor"),
          feeMinor: sum("feeMinor"),
          totalRevenueMinor: sum("totalRevenueMinor"),
          adrMinor: occupiedRoomNights ? Math.round(roomRevenueMinor / occupiedRoomNights) : 0,
          revparMinor: availableRoomNights ? Math.round(roomRevenueMinor / availableRoomNights) : 0,
          arrivals: sum("arrivals"),
          departures: sum("departures"),
          newReservations: sum("newReservations"),
          cancellations: sum("cancellations"),
          noShows: sum("noShows"),
          paymentsMinor: sum("paymentsMinor"),
          refundsMinor: sum("refundsMinor"),
          openFolioBalanceMinor,
          openFolioCount: openFolios.length
        },
        days,
        channels: [...channelMap.values()].map((item) => ({ source: item.source, bookings: item.bookings.size, revenueMinor: item.revenueMinor })),
        roomTypes: [...roomTypeMap.values()].map((item) => ({
          ...item,
          occupancyRate: item.availableRoomNights ? item.occupiedRoomNights / item.availableRoomNights * 100 : 0,
          adrMinor: item.occupiedRoomNights ? Math.round(item.roomRevenueMinor / item.occupiedRoomNights) : 0
        }))
      };
    },
    hotelGuestOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageGuests", args.propertyKey);
      const search = String(args.search || "").trim();
      const guests = await context.prisma.guest.findMany({
        where: search ? { OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } }
        ] } : void 0,
        orderBy: [{ updatedAt: "desc" }],
        take: 100,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          loyaltyNumber: true,
          loyaltyTier: true,
          isVip: true,
          isBlacklisted: true,
          loyaltyPoints: true,
          createdAt: true,
          updatedAt: true
        }
      });
      const stayFacts = guests.length ? await context.prisma.booking.groupBy({
        by: ["guestProfileId"],
        where: { guestProfileId: { in: guests.map((guest) => guest.id) }, status: "checked_out" },
        _count: { _all: true },
        _sum: { totalAmountMinor: true },
        _max: { checkOutDate: true }
      }) : [];
      const factsByGuest = new Map(stayFacts.map((fact) => [fact.guestProfileId, fact]));
      return {
        guests: guests.map((guest) => {
          const facts = factsByGuest.get(guest.id);
          return {
            ...guest,
            totalStays: String(facts?._count?._all || 0),
            totalSpent: (Number(facts?._sum?.totalAmountMinor || 0) / 100).toFixed(2),
            lastStayAt: facts?._max?.checkOutDate || null
          };
        })
      };
    },
    hotelPaymentProviderOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManagePayments", args.propertyKey);
      await ensureDefaultPaymentProviders(context);
      const providers = await context.prisma.paymentProvider.findMany({
        orderBy: { name: "asc" },
        take: 20,
        select: { id: true, name: true, code: true, isInstalled: true, credentials: true }
      });
      return { providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        code: provider.code,
        isInstalled: provider.isInstalled,
        configured: paymentIntegrationConfigured(provider)
      })) };
    },
    hotelNightAuditOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManagePayments", args.propertyKey);
      const [clock, runs] = await Promise.all([
        context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
        context.prisma.nightAuditRun.findMany({
          orderBy: { businessDate: "desc" },
          take: 30
        })
      ]);
      if (!clock) throw new Error("Property business date is not configured.");
      return { currentBusinessDate: clock.currentBusinessDate, runs };
    },
    hotelOutboxOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageAudit", args.propertyKey);
      const [events, refundIntents] = await Promise.all([
        context.prisma.hotelOutboxEvent.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 100,
          include: { attemptsEvidence: { orderBy: { attemptNumber: "asc" }, take: 20 } }
        }),
        context.prisma.refundIntent.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 100,
          include: { booking: { include: reservationInclude } }
        })
      ]);
      return { events, refundIntents: refundIntents.map((item) => ({ ...item, booking: mapReservation(item.booking) })) };
    },
    hotelGroupOperations: async (_root, args, context) => {
      requireHotelPermission(context, "canManageBookings", args.propertyKey);
      const groups = await context.prisma.groupBlock.findMany({
        orderBy: [{ arrivalDate: "asc" }, { id: "asc" }],
        take: 100,
        include: { allocations: { include: { roomType: true } } }
      });
      return { groups };
    }
  }
};

// features/keystone/mutations/runHotelNightAudit.ts
function utcBusinessDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Business date is invalid.");
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
async function runHotelNightAudit(_root, { propertyKey, businessDate: value, idempotencyKey }, context) {
  if (propertyKey !== HOTEL_PROPERTY_KEY || !context.session?.data?.role?.canManagePayments) {
    throw new Error("Not authorized to run night audit for this property.");
  }
  if (!String(idempotencyKey || "").trim()) throw new Error("Idempotency key is required.");
  const businessDate = utcBusinessDate(value);
  const nextBusinessDate = new Date(businessDate);
  nextBusinessDate.setUTCDate(nextBusinessDate.getUTCDate() + 1);
  const eventKey = `night-audit:${HOTEL_PROPERTY_KEY}:${idempotencyKey.trim()}`;
  const identity = {
    request: { propertyKey, businessDate: businessDate.toISOString() },
    aggregateType: "night_audit",
    aggregateId: businessDate.toISOString().slice(0, 10),
    action: "completed"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `hotel-business-date:${HOTEL_PROPERTY_KEY}`
    );
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const run2 = await prisma.nightAuditRun.findUnique({ where: { businessDate } });
      if (!run2) throw new Error("Night-audit replay evidence is incomplete.");
      return run2;
    }
    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || clock.propertyKey !== HOTEL_PROPERTY_KEY) {
      throw new Error("Property business date is not configured.");
    }
    if (utcBusinessDate(clock.currentBusinessDate.toISOString()).getTime() !== businessDate.getTime()) {
      throw new Error(`Night audit must run for the current business date ${clock.currentBusinessDate.toISOString().slice(0, 10)}.`);
    }
    const departureCandidates = await prisma.booking.findMany({
      where: {
        status: { in: ["checked_in", "checked_out"] },
        checkOutDate: { lte: nextBusinessDate }
      },
      include: {
        folio: { include: { entries: true } },
        billingFolio: { include: { entries: true } }
      }
    });
    const unsettledDepartures = departureCandidates.filter((booking) => {
      if (booking.billingFolioId) return false;
      if (booking.status !== "checked_out" || booking.folio?.status !== "closed") return true;
      const balanceMinor = booking.folio.entries.reduce(
        (balance, entry) => balance + (entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor),
        0
      );
      return balanceMinor !== 0;
    });
    if (unsettledDepartures.length) {
      throw new Error(
        `Night audit refused: ${unsettledDepartures.length} departing reservations are not checked out with settled, closed folios.`
      );
    }
    const bookings = await prisma.booking.findMany({
      where: {
        status: "checked_in",
        checkInDate: { lt: nextBusinessDate },
        checkOutDate: { gt: businessDate }
      },
      orderBy: { id: "asc" },
      include: {
        lineItems: {
          where: { date: { gte: businessDate, lt: nextBusinessDate }, totalPrice: { gt: 0 } },
          orderBy: [{ date: "asc" }, { id: "asc" }]
        },
        folio: true,
        billingFolio: true
      }
    });
    const missingSnapshots = bookings.filter((booking) => booking.lineItems.length === 0);
    const closedFolios = bookings.filter((booking) => {
      const folio = booking.billingFolio || booking.folio;
      return folio && folio.status !== "open";
    });
    if (missingSnapshots.length || closedFolios.length) {
      throw new Error(
        `Night audit refused: ${missingSnapshots.length} reservations lack due snapshots and ${closedFolios.length} folios are not open.`
      );
    }
    const startedAt = /* @__PURE__ */ new Date();
    let postedEntryCount = 0;
    let existingEntryCount = 0;
    let debitMinor = 0;
    for (const booking of bookings) {
      const result = await ensureBookingFolio(transactionContext, booking.id, {
        postSnapshotEntries: true,
        serviceDate: businessDate
      });
      postedEntryCount += result.created;
      existingEntryCount += result.existing;
      debitMinor += booking.lineItems.reduce(
        (sum, line) => sum + Number(line.totalPrice),
        0
      );
    }
    const completedAt = /* @__PURE__ */ new Date();
    const run = await prisma.nightAuditRun.create({
      data: {
        eventKey,
        requestHash: hashLifecycleRequest(identity.request),
        propertyKey: HOTEL_PROPERTY_KEY,
        businessDate,
        status: "completed",
        dueBookingCount: bookings.length,
        postedEntryCount,
        existingEntryCount,
        exceptionCount: 0,
        debitMinor,
        startedAt,
        completedAt
      }
    });
    await prisma.hotelBusinessDate.update({
      where: { id: clock.id },
      data: { currentBusinessDate: nextBusinessDate, updatedAt: completedAt }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { currentBusinessDate: businessDate.toISOString() },
      afterSnapshot: {
        currentBusinessDate: nextBusinessDate.toISOString(),
        runId: run.id,
        dueBookingCount: bookings.length,
        postedEntryCount,
        existingEntryCount,
        debitMinor
      }
    });
    return run;
  });
}

// features/keystone/mutations/createHotelGroupBlock.ts
var import_node_crypto17 = require("node:crypto");

// features/keystone/lib/boundedLaunch.ts
var GROUP_OPERATIONS_DISABLED_MESSAGE = "Group operations are disabled for the bounded direct-booking launch.";
function rejectDisabledGroupOperation() {
  throw new Error(GROUP_OPERATIONS_DISABLED_MESSAGE);
}

// features/keystone/mutations/createHotelGroupBlock.ts
function requiredText(value, label, max = 200) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}
async function createHotelGroupBlock(_root, args, context) {
  rejectDisabledGroupOperation();
  if (!context.session?.data?.role?.canManageBookings) {
    throw new Error("Not authorized to manage group blocks.");
  }
  const idempotencyKey = requiredText(args.idempotencyKey, "Idempotency key");
  const contactEmail = requiredText(args.contactEmail, "Contact email", 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Contact email must be valid.");
  const currencyCode = requiredText(args.currencyCode, "Currency", 3).toUpperCase();
  if (currencyCode !== "USD") throw new Error("The bounded hotel scope supports USD group references only.");
  const arrivalDate = new Date(args.arrivalDate);
  const departureDate = new Date(args.departureDate);
  const releaseDate = args.releaseDate ? new Date(args.releaseDate) : null;
  if (Number.isNaN(arrivalDate.getTime()) || Number.isNaN(departureDate.getTime()) || releaseDate && (Number.isNaN(releaseDate.getTime()) || releaseDate > arrivalDate) || departureDate <= arrivalDate || departureDate.getTime() - arrivalDate.getTime() > 366 * 864e5) {
    throw new Error("Group stay dates are invalid or exceed one year.");
  }
  if (!Number.isInteger(args.roomsHeld) || args.roomsHeld < 1) {
    throw new Error("Rooms held must be a positive integer.");
  }
  if (!Number.isSafeInteger(args.rateMinor) || args.rateMinor < 0) {
    throw new Error("Group rate must be a nonnegative minor-unit integer.");
  }
  if (!["guest_pays", "master_folio", "split"].includes(args.billingType)) {
    throw new Error("Unsupported group billing type.");
  }
  const eventKey = `group-block:create:${idempotencyKey}`;
  const groupId = `grp_${(0, import_node_crypto17.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24)}`;
  const identity = {
    request: { ...args, arrivalDate: arrivalDate.toISOString(), departureDate: departureDate.toISOString() },
    aggregateType: "group_block",
    aggregateId: groupId,
    action: "created"
  };
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const existingId = replay.afterSnapshot?.id;
      if (!existingId) throw new Error("Group block replay evidence is incomplete.");
      return prisma.groupBlock.findUnique({
        where: { id: existingId },
        include: { allocations: { include: { roomType: true } } }
      });
    }
    await lockRoomInventory(prisma, args.roomTypeId, arrivalDate, departureDate);
    const roomType = await prisma.roomType.findUnique({
      where: { id: args.roomTypeId },
      include: { rooms: true }
    });
    if (!roomType) throw new Error("Room type not found.");
    const [overlappingGroups, overlappingBookings, inventories] = await Promise.all([
      prisma.groupBlockAllocation.findMany({
        where: {
          roomTypeId: args.roomTypeId,
          groupBlock: {
            status: { in: ["tentative", "definite"] },
            arrivalDate: { lt: departureDate },
            departureDate: { gt: arrivalDate }
          }
        },
        include: { groupBlock: true }
      }),
      prisma.booking.findMany({
        where: {
          status: { in: ["pending", "confirmed", "checked_in"] },
          checkInDate: { lt: departureDate },
          checkOutDate: { gt: arrivalDate },
          roomAssignments: { some: { roomTypeId: args.roomTypeId } }
        },
        select: { checkInDate: true, checkOutDate: true }
      }),
      prisma.roomInventory.findMany({
        where: {
          roomTypeId: args.roomTypeId,
          date: { gte: arrivalDate, lt: departureDate }
        }
      })
    ]);
    const inventoryByDay = new Map(
      inventories.map((inventory) => [inventory.date.toISOString().slice(0, 10), inventory])
    );
    const physicalTotal = roomType.rooms.length;
    const physicalBlocked = roomType.rooms.filter(
      (room) => ["maintenance", "out_of_order"].includes(room.status)
    ).length;
    for (const day = new Date(arrivalDate); day < departureDate; day.setUTCDate(day.getUTCDate() + 1)) {
      const nextDay = new Date(day);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const existingHeld = overlappingGroups.filter(
        (allocation) => allocation.groupBlock.arrivalDate < nextDay && allocation.groupBlock.departureDate > day
      ).reduce(
        (sum, allocation) => sum + Math.max(0, allocation.roomsHeld - allocation.roomsPickedUp),
        0
      );
      const booked = overlappingBookings.filter(
        (booking) => booking.checkInDate < nextDay && booking.checkOutDate > day
      ).length;
      const inventory = inventoryByDay.get(day.toISOString().slice(0, 10));
      const total = inventory?.totalRooms ?? physicalTotal;
      const blocked = inventory?.blockedRooms ?? physicalBlocked;
      if (existingHeld + booked + blocked + args.roomsHeld > total) {
        throw new Error(`Group block exceeds sellable capacity on ${day.toISOString().slice(0, 10)}.`);
      }
    }
    const block = await prisma.groupBlock.create({
      data: {
        id: groupId,
        blockCode: `GRP-${(0, import_node_crypto17.randomUUID)().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        name: requiredText(args.name, "Group name"),
        status: "tentative",
        arrivalDate,
        departureDate,
        releaseDate,
        contactName: requiredText(args.contactName, "Contact name"),
        contactEmail,
        billingType: args.billingType,
        allocations: {
          create: {
            allocationKey: `${eventKey}:${args.roomTypeId}`,
            roomTypeId: args.roomTypeId,
            roomsHeld: args.roomsHeld,
            roomsPickedUp: 0,
            rateMinor: args.rateMinor,
            currencyCode
          }
        }
      },
      include: { allocations: { include: { roomType: true } } }
    });
    if (args.billingType === "master_folio") {
      await prisma.folio.create({
        data: {
          groupBlockId: block.id,
          folioNumber: `GFOL-${block.blockCode}`,
          currencyCode,
          status: "open",
          openedAt: /* @__PURE__ */ new Date()
        }
      });
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session?.itemId || null,
      identity,
      beforeSnapshot: null,
      afterSnapshot: {
        id: block.id,
        blockCode: block.blockCode,
        status: block.status,
        allocationKey: block.allocations[0]?.allocationKey,
        masterFolio: args.billingType === "master_folio" ? `GFOL-${block.blockCode}` : null
      }
    });
    return prisma.groupBlock.findUnique({
      where: { id: block.id },
      include: { allocations: { include: { roomType: true } }, masterFolio: true }
    });
  });
}

// features/keystone/lib/hotelOutbox.ts
var import_node_crypto18 = require("node:crypto");
var import_client3 = require("@prisma/client");
var OUTBOX_DEFAULT_LEASE_MS = 6e4;
var OUTBOX_DEFAULT_BATCH_SIZE = 25;
function normalizePropertyKey(value) {
  const propertyKey = String(value || "").trim();
  if (!propertyKey || propertyKey !== HOTEL_PROPERTY_KEY) {
    throw new Error("Unknown hotel property.");
  }
  return propertyKey;
}
function boundedInt(value, fallback, min, max) {
  const candidate = Number(value ?? fallback);
  if (!Number.isInteger(candidate)) return fallback;
  return Math.min(max, Math.max(min, candidate));
}
function outboxBackoffMs(attemptNumber, baseMs = 5e3, maxMs = 15 * 6e4) {
  const attempt = boundedInt(attemptNumber, 1, 1, 30);
  const base = boundedInt(baseMs, 5e3, 100, maxMs);
  return Math.min(maxMs, base * 2 ** (attempt - 1));
}
function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2e3);
}
async function claimHotelOutboxEvents(prisma, options) {
  const propertyKey = normalizePropertyKey(options.propertyKey);
  const workerId = String(options.workerId || "").trim();
  if (!workerId || workerId.length > 200) throw new Error("A workerId is required.");
  const limit = boundedInt(options.limit, OUTBOX_DEFAULT_BATCH_SIZE, 1, 100);
  const leaseMs = boundedInt(options.leaseMs, OUTBOX_DEFAULT_LEASE_MS, 1e3, 15 * 6e4);
  const now = options.now || /* @__PURE__ */ new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const leaseToken = `${workerId}:${(0, import_node_crypto18.randomUUID)()}`;
  const topics = [...new Set((options.topics || []).map((topic) => String(topic).trim()).filter(Boolean))];
  const topicFilter = topics.length ? import_client3.Prisma.sql`AND "topic" IN (${import_client3.Prisma.join(topics)})` : import_client3.Prisma.empty;
  const claimed = await prisma.$queryRaw(import_client3.Prisma.sql`
    WITH candidates AS (
      SELECT "id"
      FROM "HotelOutboxEvent"
      WHERE "propertyKey" = ${propertyKey}
        AND (
          ("status" IN ('pending', 'failed') AND "availableAt" <= ${now})
          OR ("status" = 'processing' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= ${now})
        )
        ${topicFilter}
      ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "HotelOutboxEvent" AS event
    SET "status" = 'processing',
        "attempts" = event."attempts" + 1,
        "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "lastAttemptAt" = ${now},
        "updatedAt" = ${now}
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event."id", event."eventKey", event."propertyKey", event."topic",
      event."aggregateType", event."aggregateId", event."payloadSnapshot", event."status",
      event."attempts", event."maxAttempts", event."leaseToken", event."leaseExpiresAt"
  `);
  for (const event of claimed) {
    await prisma.hotelOutboxAttempt.create({
      data: {
        outboxId: event.id,
        propertyKey,
        attemptNumber: event.attempts,
        workerId,
        status: "failed",
        errorMessage: "Dispatch started; completion not yet recorded.",
        startedAt: now
      }
    });
  }
  return claimed;
}
async function finishAttempt(prisma, eventId, attemptNumber, data) {
  await prisma.hotelOutboxAttempt.update({
    where: { outboxId_attemptNumber: { outboxId: eventId, attemptNumber } },
    data
  });
}
async function markDelivered(prisma, event, response, now) {
  const updated = await prisma.hotelOutboxEvent.updateMany({
    where: { id: event.id, propertyKey: event.propertyKey, status: "processing", leaseToken: event.leaseToken },
    data: {
      status: "delivered",
      deliveredAt: now,
      leaseToken: "",
      leaseExpiresAt: null,
      lastError: "",
      dispatchResultSnapshot: response ?? {},
      updatedAt: now
    }
  });
  if (updated.count !== 1) throw new Error("Outbox lease was lost before delivery could be recorded.");
  await finishAttempt(prisma, event.id, event.attempts, {
    status: "succeeded",
    errorMessage: "",
    responseSnapshot: response ?? {},
    finishedAt: now
  });
}
async function markFailed(prisma, event, error, now) {
  const deadLettered = event.attempts >= event.maxAttempts;
  const availableAt = new Date(now.getTime() + outboxBackoffMs(event.attempts));
  const message = errorMessage(error);
  const updated = await prisma.hotelOutboxEvent.updateMany({
    where: { id: event.id, propertyKey: event.propertyKey, status: "processing", leaseToken: event.leaseToken },
    data: {
      status: deadLettered ? "dead_letter" : "failed",
      availableAt,
      deadLetteredAt: deadLettered ? now : null,
      lastError: message,
      leaseToken: "",
      leaseExpiresAt: null,
      updatedAt: now
    }
  });
  if (updated.count !== 1) throw new Error("Outbox lease was lost before failure could be recorded.");
  await finishAttempt(prisma, event.id, event.attempts, {
    status: "failed",
    errorMessage: message,
    finishedAt: now
  });
  return deadLettered;
}
async function dispatchHotelOutboxBatch(prisma, options, handler) {
  const events = await claimHotelOutboxEvents(prisma, options);
  const result = { delivered: 0, retried: 0, deadLettered: 0, skipped: 0 };
  for (const event of events) {
    try {
      const response = await handler(event);
      await markDelivered(prisma, event, response, /* @__PURE__ */ new Date());
      result.delivered += 1;
    } catch (error) {
      const deadLettered = await markFailed(prisma, event, error, /* @__PURE__ */ new Date());
      if (deadLettered) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}
async function replayHotelDeadLetter(prisma, options) {
  const propertyKey = normalizePropertyKey(options.propertyKey);
  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("A stable replay idempotency key is required.");
  const source = await prisma.hotelOutboxEvent.findUnique({ where: { id: options.eventId } });
  if (!source || source.propertyKey !== propertyKey) throw new Error("Outbox event not found for this property.");
  if (source.status !== "dead_letter") throw new Error("Only dead-letter events can be replayed.");
  const eventKey = `hotel-outbox:replay:${idempotencyKey}`;
  const request = { sourceEventKey: source.eventKey, eventId: source.id, idempotencyKey };
  const requestHash = hashLifecycleRequest(request);
  const existing = await prisma.hotelOutboxEvent.findUnique({ where: { eventKey } });
  if (existing) {
    if (existing.requestHash !== requestHash || existing.propertyKey !== propertyKey) {
      throw new Error("Outbox replay key is already bound to different evidence.");
    }
    return { event: existing, replayed: true };
  }
  const replay = await prisma.hotelOutboxEvent.create({
    data: {
      eventKey,
      requestHash,
      propertyKey,
      topic: source.topic,
      aggregateType: source.aggregateType,
      aggregateId: source.aggregateId,
      payloadSnapshot: source.payloadSnapshot,
      status: "pending",
      attempts: 0,
      maxAttempts: source.maxAttempts,
      availableAt: /* @__PURE__ */ new Date(),
      replayedFromEventKey: source.eventKey,
      dispatchResultSnapshot: {}
    }
  });
  return { event: replay, replayed: false };
}
function outboxBodyHash(body) {
  return (0, import_node_crypto18.createHash)("sha256").update(body).digest("hex");
}
function signHotelOutboxBody(body, credentialKeyId, sentAt, secret) {
  return (0, import_node_crypto18.createHmac)("sha256", secret).update(`${sentAt}.${credentialKeyId}.${body}`).digest("hex");
}
function createHttpOutboxHandler(options) {
  const url = String(options.url || "").trim();
  const secret = String(options.secret || "");
  const credentialKeyId = String(options.credentialKeyId || "").trim();
  if (!url || !secret || !credentialKeyId) {
    throw new Error("Outbox HTTP dispatch requires a URL, secret, and credential key id.");
  }
  const timeoutMs = boundedInt(options.timeoutMs, 15e3, 1e3, 6e4);
  return async (event) => {
    const body = JSON.stringify({
      eventKey: event.eventKey,
      propertyKey: event.propertyKey,
      topic: event.topic,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payloadSnapshot
    });
    const sentAt = (/* @__PURE__ */ new Date()).toISOString();
    const bodyHash = outboxBodyHash(body);
    const signature2 = signHotelOutboxBody(body, credentialKeyId, sentAt, secret);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openfront-outbox-event-key": event.eventKey,
        "x-openfront-outbox-credential-key-id": credentialKeyId,
        "x-openfront-outbox-sent-at": sentAt,
        "x-openfront-outbox-signature": signature2
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`Outbox receiver returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("Outbox receiver did not return a JSON receipt.");
    const ack = await response.json();
    if (ack.accepted !== true || !ack.receiptId || ack.eventKey !== event.eventKey || ack.propertyKey !== event.propertyKey || ack.bodyHash !== bodyHash || ack.credentialKeyId !== credentialKeyId) {
      throw new Error("Outbox receiver acknowledgement did not match the dispatched evidence.");
    }
    return ack;
  };
}

// features/keystone/mutations/replayHotelOutboxEvent.ts
async function replayHotelOutboxEvent(_root, { eventId, idempotencyKey }, context) {
  if (!permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to replay hotel outbox events.");
  }
  const key3 = String(idempotencyKey || "").trim();
  if (!key3 || key3.length > 200) throw new Error("A stable replay idempotency key is required.");
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, `hotel-outbox-replay:${key3}`);
    const auditEventKey = `hotel-outbox-replay:${key3}`;
    const request = { eventId, idempotencyKey: key3 };
    const existingAudit = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: auditEventKey } });
    if (existingAudit && existingAudit.requestHash !== hashLifecycleRequest(request)) {
      throw new Error("Outbox replay key is already bound to different evidence.");
    }
    const result = await replayHotelDeadLetter(prisma, {
      propertyKey: HOTEL_PROPERTY_KEY,
      eventId,
      idempotencyKey: key3
    });
    if (!existingAudit) {
      await recordHotelLifecycleEvent({
        prisma,
        eventKey: auditEventKey,
        actorId: context.session.itemId,
        identity: {
          request,
          aggregateType: "outbox_event",
          aggregateId: eventId,
          action: "replayed"
        },
        beforeSnapshot: { sourceEventId: eventId },
        afterSnapshot: {
          replayEventId: result.event.id,
          replayEventKey: result.event.eventKey,
          replayed: result.replayed
        }
      });
    }
    return {
      id: result.event.id,
      eventKey: result.event.eventKey,
      status: result.event.status,
      replayed: result.replayed
    };
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}

// features/keystone/mutations/pickupHotelGroupBlock.ts
async function pickupHotelGroupBlock(_root, { groupBlockId, allocationId, bookingId, idempotencyKey }, context) {
  rejectDisabledGroupOperation();
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to pick up group rooms.");
  }
  const key3 = String(idempotencyKey || "").trim();
  if (!key3 || key3.length > 200) throw new Error("A stable idempotency key is required.");
  const eventKey = `group-block:pickup:${key3}`;
  const identity = {
    request: { groupBlockId, allocationId, bookingId },
    aggregateType: "group_block",
    aggregateId: groupBlockId,
    action: "room_picked_up"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${groupBlockId}`);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) return prisma.booking.findUnique({ where: { id: bookingId } });
    const [block, allocation, booking] = await Promise.all([
      prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { masterFolio: true } }),
      prisma.groupBlockAllocation.findUnique({ where: { id: allocationId } }),
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          groupBlock: true,
          groupBlockAllocation: true,
          folio: { include: { entries: { take: 1 } } },
          roomAssignments: true
        }
      })
    ]);
    if (!block || !allocation || allocation.groupBlockId !== block.id || !booking) {
      throw new Error("Group block, allocation, or booking was not found.");
    }
    if (!["tentative", "definite"].includes(block.status)) throw new Error("This group block is no longer open for pickup.");
    if (block.releaseDate && /* @__PURE__ */ new Date() >= block.releaseDate) throw new Error("The group pickup cutoff has passed.");
    if (allocation.roomsPickedUp >= allocation.roomsHeld) throw new Error("The group allocation is fully picked up.");
    if (booking.groupBlockId || booking.groupBlockAllocationId) throw new Error("Booking is already attached to a group block.");
    if (booking.checkInDate.getTime() !== block.arrivalDate.getTime() || booking.checkOutDate.getTime() !== block.departureDate.getTime()) {
      throw new Error("Booking dates must match the group block dates.");
    }
    if (!booking.roomAssignments.some((assignment) => assignment.roomTypeId === allocation.roomTypeId)) {
      throw new Error("Booking room type does not match the group allocation.");
    }
    if (block.billingType === "master_folio" && !block.masterFolio) {
      throw new Error("Master-folio group is missing its master folio.");
    }
    if (block.billingType === "master_folio" && booking.folio?.entries?.length) {
      throw new Error("A reservation with posted folio history cannot be rerouted to a master folio.");
    }
    const updated = await prisma.groupBlockAllocation.update({
      where: { id: allocation.id },
      data: { roomsPickedUp: { increment: 1 } }
    });
    const linked = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        groupBlock: { connect: { id: block.id } },
        groupBlockAllocation: { connect: { id: allocation.id } },
        ...block.billingType === "master_folio" && block.masterFolio ? { billingFolio: { connect: { id: block.masterFolio.id } } } : {}
      }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { roomsPickedUp: allocation.roomsPickedUp, bookingGroupBlockId: booking.groupBlockId },
      afterSnapshot: {
        roomsPickedUp: updated.roomsPickedUp,
        bookingId: linked.id,
        billingFolioId: block.masterFolio?.id || null
      }
    });
    return linked;
  });
}

// features/keystone/mutations/updateHotelGroupBlockStatus.ts
var TRANSITIONS4 = {
  tentative: /* @__PURE__ */ new Set(["definite", "released", "cancelled"]),
  definite: /* @__PURE__ */ new Set(["released", "cancelled"]),
  released: /* @__PURE__ */ new Set(),
  cancelled: /* @__PURE__ */ new Set()
};
async function updateHotelGroupBlockStatus(_root, { groupBlockId, status, idempotencyKey }, context) {
  rejectDisabledGroupOperation();
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to change group block status.");
  }
  const key3 = String(idempotencyKey || "").trim();
  if (!key3 || key3.length > 200) throw new Error("A stable idempotency key is required.");
  if (!TRANSITIONS4[status]) throw new Error("Unsupported group block status.");
  const eventKey = `group-block:status:${key3}`;
  const identity = {
    request: { groupBlockId, status },
    aggregateType: "group_block",
    aggregateId: groupBlockId,
    action: "status_changed"
  };
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${groupBlockId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      return prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { allocations: { include: { roomType: true } }, masterFolio: true } });
    }
    const block = await prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { allocations: true, masterFolio: true } });
    if (!block) throw new Error("Group block not found.");
    if (!TRANSITIONS4[block.status]?.has(status)) throw new Error(`Group block cannot transition from ${block.status} to ${status}.`);
    if (status === "cancelled" && block.allocations.some((allocation) => allocation.roomsPickedUp > 0)) {
      throw new Error("Picked-up group rooms must be released from their reservations before cancellation.");
    }
    const updated = await prisma.groupBlock.update({
      where: { id: block.id },
      data: { status },
      include: { allocations: { include: { roomType: true } }, masterFolio: true }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: block.status },
      afterSnapshot: { status: updated.status, releasedRooms: status === "released" }
    });
    return updated;
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}

// features/keystone/mutations/resolveOverdueCheckedInBooking.ts
function normalize(value, label, max) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}
async function resolveOverdueCheckedInBooking(_root, { bookingId, idempotencyKey, reason }, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to resolve overdue stays.");
  }
  const key3 = normalize(idempotencyKey, "idempotencyKey", 200);
  const resolutionReason = normalize(reason, "reason", 500);
  const eventKey = `overdue-stay-resolution:${key3}`;
  const identity = {
    request: { bookingId, resolution: "write_off", reason: resolutionReason },
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "overdue_stay_resolved"
  };
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      const booking2 = await prisma.booking.findUnique({ where: { id: bookingId }, include: { folio: true } });
      if (!booking2?.folio || booking2.status !== "checked_out" || booking2.folio.status !== "closed") {
        throw new Error("Overdue resolution replay evidence is incomplete.");
      }
      return {
        bookingId,
        folioId: booking2.folio.id,
        status: booking2.status,
        folioStatus: booking2.folio.status,
        writtenOffMinor: Number(replay.afterSnapshot?.writtenOffMinor || 0),
        replayed: true
      };
    }
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: { include: { room: true } }, folio: true }
    });
    if (!booking?.guestProfileId) throw new Error("Booking or required guest profile not found.");
    if (booking.status !== "checked_in") throw new Error("Only checked-in bookings can use overdue resolution.");
    if (booking.billingFolioId) throw new Error("Group master-folio stays must be resolved through group settlement.");
    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || booking.checkOutDate.getTime() > clock.currentBusinessDate.getTime()) {
      throw new Error("The checked-in booking is not overdue for the current property business date.");
    }
    for (const assignment of [...booking.roomAssignments].sort((a, b) => a.id.localeCompare(b.id))) {
      if (assignment.roomId) {
        await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${assignment.roomId}`);
      }
    }
    const ensured = await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
    const entries = await prisma.folioEntry.findMany({
      where: { folioId: ensured.folioId },
      select: { direction: true, amountMinor: true }
    });
    const beforeBalance = calculateFolioBalance(entries);
    if (beforeBalance.balanceMinor < 0) throw new Error("Credit folios require refund reconciliation before overdue resolution.");
    const now = /* @__PURE__ */ new Date();
    const postingKey = `${eventKey}:write-off`;
    if (beforeBalance.balanceMinor > 0) {
      await prisma.folioEntry.create({
        data: {
          folioId: ensured.folioId,
          postingKey,
          entryType: "adjustment",
          direction: "credit",
          amountMinor: beforeBalance.balanceMinor,
          currencyCode: "USD",
          description: `Authorized overdue-stay write-off: ${resolutionReason}`,
          serviceDate: clock.currentBusinessDate,
          postedAt: now,
          sourceType: "operator",
          sourceId: context.session.itemId,
          postedById: context.session.itemId,
          metadataSnapshot: {
            resolution: "write_off",
            reason: resolutionReason,
            bookingId,
            confirmationNumber: booking.confirmationNumber,
            priorBalanceMinor: beforeBalance.balanceMinor
          }
        }
      });
    }
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "checked_out", checkedOutAt: now, balanceDueMinor: 0, balanceDue: 0 }
    });
    await prisma.folio.update({ where: { id: ensured.folioId }, data: { status: "closed", closedAt: now } });
    for (const assignment of booking.roomAssignments) {
      if (!assignment.room) continue;
      await prisma.room.update({ where: { id: assignment.room.id }, data: { status: "cleaning" } });
      const openTask = await prisma.housekeepingTask.findFirst({
        where: {
          roomId: assignment.room.id,
          taskType: "checkout_clean",
          status: { in: ["pending", "in_progress", "inspection_needed", "on_hold"] }
        }
      });
      if (!openTask) {
        await prisma.housekeepingTask.create({
          data: {
            roomId: assignment.room.id,
            taskType: "checkout_clean",
            status: "pending",
            priority: 1,
            notes: `Auto-created after overdue resolution for ${booking.confirmationNumber} (${booking.guestName}).`
          }
        });
      }
    }
    const completed = await prisma.booking.aggregate({
      where: { guestProfileId: booking.guestProfileId, status: "checked_out" },
      _count: { id: true },
      _sum: { totalAmountMinor: true },
      _max: { checkedOutAt: true }
    });
    await prisma.guest.update({
      where: { id: booking.guestProfileId },
      data: {
        totalStays: String(completed._count.id),
        totalSpent: (Number(completed._sum.totalAmountMinor || 0) / 100).toFixed(2),
        lastStayAt: completed._max.checkedOutAt || now
      }
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: {
        status: booking.status,
        folioId: ensured.folioId,
        folioStatus: booking.folio?.status || "open",
        balanceMinor: beforeBalance.balanceMinor,
        roomStatuses: booking.roomAssignments.map((item) => ({ id: item.roomId, status: item.room?.status }))
      },
      afterSnapshot: {
        status: updated.status,
        folioId: ensured.folioId,
        folioStatus: "closed",
        balanceMinor: 0,
        writtenOffMinor: beforeBalance.balanceMinor,
        postingKey: beforeBalance.balanceMinor > 0 ? postingKey : null,
        roomStatus: "cleaning"
      },
      metadata: { resolution: "write_off", reason: resolutionReason, confirmationNumber: booking.confirmationNumber }
    });
    return {
      bookingId,
      folioId: ensured.folioId,
      status: updated.status,
      folioStatus: "closed",
      writtenOffMinor: beforeBalance.balanceMinor,
      replayed: false
    };
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}

// features/keystone/mutations/replayRefundIntent.ts
async function replayRefundIntent(_root, { intentId, idempotencyKey }, context) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to replay refund intents.");
  }
  const key3 = String(idempotencyKey || "").trim();
  if (!key3 || key3.length > 200) throw new Error("A stable idempotency key is required.");
  const eventKey = `refund-intent-replay:${key3}`;
  const identity = { request: { intentId }, aggregateType: "refund_intent", aggregateId: intentId, action: "replayed" };
  return context.transaction(async (tx) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    const intent = await prisma.refundIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new Error("Refund intent not found.");
    if (replay) return intent;
    if (intent.status !== "dead_letter") throw new Error("Only dead-letter refund intents can be replayed.");
    const updated = await prisma.refundIntent.update({ where: { id: intentId }, data: { status: "pending", attempts: 0, availableAt: /* @__PURE__ */ new Date(), deadLetteredAt: null, lastError: "" } });
    await recordHotelLifecycleEvent({ prisma, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { status: intent.status, attempts: intent.attempts }, afterSnapshot: { status: updated.status, attempts: updated.attempts } });
    return updated;
  }, { maxWait: 5e3, timeout: 15e3, isolationLevel: "Serializable" });
}

// features/keystone/mutations/redeemHotelPasswordResetToken.ts
var bcrypt = require("bcryptjs");
var FAKE_TOKEN_HASH = "$2a$10$7EqJtq98hPqEX7fNZaFWoO5s7g7C2xKj.c0k7.o9KfKQZ7ZfWl8eK";
async function redeemHotelPasswordResetToken(root, { email: email2, token, password: password2 }, context) {
  const identity = String(email2 || "").trim().toLowerCase().slice(0, 255);
  await enforceAbuseLimit(context, { scope: "auth-reset-redeem-backend", identity, limit: 8, windowMs: 15 * 6e4 });
  await enforceAbuseLimit(context, { scope: "auth-reset-redeem-backend-account", identity, limit: 12, windowMs: 15 * 6e4, includeNetwork: false });
  if (String(password2 || "").length < 10 || String(password2 || "").length > 1e3) {
    return { code: "FAILURE", message: "Password reset could not be completed." };
  }
  const ttlMinutes = Math.min(1440, Math.max(1, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 10)));
  return context.transaction(async (tx) => {
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-password-reset:${identity}`);
    const user = await tx.prisma.user.findUnique({ where: { email: identity } });
    const matches = await bcrypt.compare(String(token || ""), user?.passwordResetToken || FAKE_TOKEN_HASH);
    if (!user || !matches) return { code: "FAILURE", message: "Password reset could not be completed." };
    if (user.passwordResetRedeemedAt) return { code: "TOKEN_REDEEMED", message: "This password reset token has already been used." };
    if (!user.passwordResetIssuedAt || Date.now() - user.passwordResetIssuedAt.getTime() > ttlMinutes * 6e4) {
      return { code: "TOKEN_EXPIRED", message: "This password reset token has expired." };
    }
    const passwordHash = await bcrypt.hash(password2, 10);
    const changed = await tx.prisma.user.updateMany({
      where: { id: user.id, passwordResetRedeemedAt: null, authVersion: user.authVersion },
      data: { password: passwordHash, passwordResetRedeemedAt: /* @__PURE__ */ new Date(), authVersion: Number(user.authVersion || 1) + 1 }
    });
    if (changed.count !== 1) return { code: "TOKEN_REDEEMED", message: "This password reset token has already been used." };
    return { code: null, message: "Password reset completed." };
  }, { maxWait: 5e3, timeout: 15e3, isolationLevel: "Serializable" });
}

// features/keystone/mutations/configureHotelPaymentProvider.ts
function bounded3(value, label, max = 500) {
  const text41 = String(value || "").trim();
  if (!text41 || text41.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return text41;
}
async function configureHotelPaymentProvider(_root, { code, enabled, credentials }, context) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to configure payment providers.");
  }
  if (!isOnlinePaymentProviderCode(code)) throw new Error("Unsupported payment provider.");
  await ensureDefaultPaymentProviders(context);
  const existing = await context.prisma.paymentProvider.findUnique({ where: { code } });
  if (!existing) throw new Error("Payment provider record is unavailable.");
  const data = { isInstalled: false };
  if (enabled) {
    const input = credentials && typeof credentials === "object" ? credentials : {};
    data.credentials = code === "pp_stripe_stripe" ? {
      secretKey: bounded3(input.secretKey, "Stripe secret key"),
      publishableKey: bounded3(input.publishableKey, "Stripe publishable key"),
      webhookSecret: bounded3(input.webhookSecret, "Stripe webhook secret")
    } : {
      clientId: bounded3(input.clientId, "PayPal client ID"),
      clientSecret: bounded3(input.clientSecret, "PayPal client secret"),
      webhookId: bounded3(input.webhookId, "PayPal webhook ID"),
      sandbox: input.sandbox !== false
    };
    data.isInstalled = true;
  }
  await context.query.PaymentProvider.updateOne({ where: { id: existing.id }, data, query: "id" });
  const provider = await context.prisma.paymentProvider.findUniqueOrThrow({ where: { id: existing.id } });
  return {
    id: provider.id,
    name: provider.name,
    code: provider.code,
    isInstalled: provider.isInstalled,
    configured: paymentIntegrationConfigured(provider)
  };
}

// features/keystone/mutations/index.ts
var graphql5 = String.raw;
function mapCheckoutPaymentProvider(provider) {
  if (!provider) return null;
  const metadata = provider.metadata && typeof provider.metadata === "object" ? provider.metadata : {};
  const credentials = paymentProviderCredentials(provider);
  return {
    id: provider.id,
    name: provider.name,
    code: provider.code,
    displayName: typeof metadata.displayName === "string" ? metadata.displayName : provider.name,
    publicClientKey: provider.code === "pp_stripe_stripe" ? credentials.publishableKey || null : provider.code === "pp_paypal_paypal" ? credentials.clientId || null : null
  };
}
function mapCheckoutPaymentSession(session) {
  if (!session) return null;
  const data = session.data && typeof session.data === "object" ? session.data : {};
  return {
    ...session,
    clientSecret: typeof data.clientSecret === "string" ? data.clientSecret : null,
    paymentIntentId: typeof data.paymentIntentId === "string" ? data.paymentIntentId : null,
    orderId: typeof data.orderId === "string" ? data.orderId : null,
    approveLink: typeof data.approveLink === "string" ? data.approveLink : null,
    paymentProvider: mapCheckoutPaymentProvider(session.paymentProvider)
  };
}
function mapChannelSyncResult(result) {
  const details = result?.details && typeof result.details === "object" ? result.details : {};
  return {
    channelId: result.channelId,
    status: result.status,
    syncedAt: result.syncedAt,
    message: typeof details.message === "string" ? details.message : typeof details.error === "string" ? details.error : null,
    processedCount: Number.isInteger(details.processed) ? details.processed : 0,
    failedCount: Number.isInteger(details.failed) ? details.failed : 0
  };
}
function mapStorefrontRoomImage(image2) {
  return {
    id: image2.id,
    url: image2.image?.url || null,
    imagePath: image2.imagePath || null,
    altText: image2.altText || null,
    caption: image2.caption || null,
    order: image2.order ?? 0,
    isPrimary: Boolean(image2.isPrimary)
  };
}
function mapStorefrontRoomType(roomType) {
  if (!roomType) return null;
  return {
    ...roomType,
    amenities: roomType.amenities || [],
    roomsCount: roomType.roomsCount ?? null,
    availableCount: roomType.availableCount ?? null,
    roomImages: (roomType.roomImages || []).map(mapStorefrontRoomImage),
    ratePlans: roomType.ratePlans || []
  };
}
function mapGuestBooking(booking) {
  if (!booking) return null;
  return {
    ...booking,
    checkInDate: booking.checkInDate ? new Date(booking.checkInDate) : null,
    checkOutDate: booking.checkOutDate ? new Date(booking.checkOutDate) : null,
    createdAt: booking.createdAt ? new Date(booking.createdAt) : null,
    confirmedAt: booking.confirmedAt ? new Date(booking.confirmedAt) : null,
    cancelledAt: booking.cancelledAt ? new Date(booking.cancelledAt) : null,
    roomAssignments: (booking.roomAssignments || []).map((assignment) => ({
      id: assignment.id,
      ratePerNight: assignment.ratePerNight ?? null,
      guestName: assignment.guestName || null,
      roomType: assignment.roomType ? mapStorefrontRoomType(assignment.roomType) : null,
      roomNumber: assignment.room?.roomNumber || null
    }))
  };
}
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql5`
      ${hotelOperationsTypeDefs}

      type PublicHotelSettings {
        state: String!
        accentPreset: String!
        propertyName: String
        tagline: String
        contactEmail: String
        contactPhone: String
        addressLine1: String
        addressLine2: String
        frontDeskCopy: String
        checkInTime: String
        checkOutTime: String
        heroImagePath: String
        heroImageAltText: String
        heroImageCaption: String
        amenityImagePath: String
        amenityImageAltText: String
        amenityImageCaption: String
        locationImagePath: String
        locationImageAltText: String
        locationImageCaption: String
      }

      type BookingCheckoutPaymentProvider {
        id: ID!
        name: String!
        code: String!
        displayName: String
        publicClientKey: String
      }

      type BookingCheckoutPaymentSession {
        id: ID!
        amount: Int!
        isSelected: Boolean!
        isInitiated: Boolean!
        clientSecret: String
        paymentIntentId: String
        orderId: String
        approveLink: String
        paymentProvider: BookingCheckoutPaymentProvider
      }

      type BookingCheckoutPaymentResult {
        id: ID!
        status: String!
        amount: Float
        providerPaymentId: String
        stripePaymentIntentId: String
        paymentProvider: BookingCheckoutPaymentProvider
      }

      type ActiveBookingPaymentSession {
        id: ID!
        isSelected: Boolean!
        isInitiated: Boolean!
        paymentProvider: BookingCheckoutPaymentProvider
      }

      type StorefrontQuote {
        roomTypeId: ID!
        roomTypeName: String!
        ratePlanId: ID!
        ratePlanName: String!
        cancellationPolicy: String
        mealPlan: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        nights: Int!
        numberOfGuests: Int!
        ratePerNight: Float!
        roomSubtotal: Float!
        taxAmount: Float!
        feesAmount: Float!
        totalAmount: Float!
        roomSubtotalMinor: Int!
        taxAmountMinor: Int!
        feesAmountMinor: Int!
        totalAmountMinor: Int!
        currencyCode: String!
        pricingVersion: String!
        quoteToken: String!
      }

      type StorefrontRoomImage {
        id: ID!
        url: String
        imagePath: String
        altText: String
        caption: String
        order: Int
        isPrimary: Boolean!
      }

      type StorefrontRatePlan {
        id: ID!
        name: String!
        description: String
        baseRate: Float!
        baseRateMinor: Int!
        currencyCode: String!
        minimumStay: Int
        cancellationPolicy: String
        mealPlan: String
        isPromotional: Boolean!
      }

      type StorefrontRoomType {
        id: ID!
        name: String!
        shortDescription: String
        eyebrow: String
        viewDescription: String
        thumbnail: String
        baseRate: Float!
        baseRateMinor: Int!
        maxOccupancy: Int!
        bedConfiguration: String
        amenities: [String!]!
        squareFeet: Int
        roomsCount: Int
        availableCount: Int
        roomImages: [StorefrontRoomImage!]!
        ratePlans: [StorefrontRatePlan!]!
      }

      type GuestRoomAssignment {
        id: ID!
        ratePerNight: Float
        guestName: String
        roomType: StorefrontRoomType
        roomNumber: String
      }

      type GuestBookingActionResult {
        id: ID!
        status: String
        paymentStatus: String
        balanceDueMinor: Int!
        cancelledAt: DateTime
      }

      type HotelPasswordResetResult {
        code: String
        message: String!
      }

      type BookingModificationResolutionResult {
        requestId: ID!
        bookingId: ID!
        status: String!
        decision: String!
        checkInDate: DateTime
        checkOutDate: DateTime
        pricingRevision: Int
        replayed: Boolean!
      }

      type HotelContactMessageResult {
        reference: String!
        status: String!
        replayed: Boolean!
      }

      type BookingPaymentRefundRequestResult {
        status: String!
        paymentId: ID!
        intentId: ID
        amountMinor: Int!
      }

      type GuestCancellationQuote {
        canCancel: Boolean!
        policy: String!
        summary: String!
        refundableMinor: Int!
        cancellationFeeMinor: Int!
        capturedMinor: Int!
        currencyCode: String!
        fullRefundDeadline: DateTime
      }

      type GuestBooking {
        id: ID!
        confirmationNumber: String!
        guestName: String!
        guestEmail: String!
        guestPhone: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        numberOfNights: Int!
        numberOfGuests: Int!
        numberOfAdults: Int
        numberOfChildren: Int
        roomRate: Float
        taxAmount: Float
        feesAmount: Float
        totalAmount: Float
        depositAmount: Float
        balanceDue: Float
        roomRateMinor: Int
        taxAmountMinor: Int
        feesAmountMinor: Int
        totalAmountMinor: Int
        depositAmountMinor: Int
        balanceDueMinor: Int
        currencyCode: String
        status: String
        paymentStatus: String
        specialRequests: String
        createdAt: DateTime
        confirmedAt: DateTime
        cancelledAt: DateTime
        confirmationDeliveryStatus: String
        updateDeliveryStatus: String
        cancellationDeliveryStatus: String
        roomAssignments: [GuestRoomAssignment!]!
      }

      type Query {
        redirectToInit: Boolean
        publicHotelSettings: PublicHotelSettings!
        bookingPaymentProviders: [BookingCheckoutPaymentProvider!]!
        activeBookingPaymentSession(bookingId: ID!): ActiveBookingPaymentSession
        storefrontRoomTypes: [StorefrontRoomType!]!
        storefrontRoomType(id: ID!): StorefrontRoomType
        storefrontAvailability(checkInDate: DateTime!, checkOutDate: DateTime!): [StorefrontRoomType!]!
        storefrontQuote(
          roomTypeId: ID!
          ratePlanId: ID!
          checkInDate: DateTime!
          checkOutDate: DateTime!
          numberOfAdults: Int!
          numberOfChildren: Int
          promoCode: String
        ): StorefrontQuote!
        guestBooking(bookingId: ID!): GuestBooking
        guestBookings(email: String!): [GuestBooking!]!
        guestCancellationQuote(bookingId: ID!): GuestCancellationQuote!
      }

      input ChannelSyncDateRangeInput {
        startDate: DateTime
        endDate: DateTime
      }

      type ChannelSyncResult {
        channelId: ID!
        status: String!
        syncedAt: DateTime!
        message: String
        processedCount: Int!
        failedCount: Int!
      }

      type ReservationSnapshotResult {
        bookingId: ID!
        created: Int!
        existing: Int!
        total: Int!
      }

      type ChannelRetryResult {
        processed: Int!
        succeeded: Int!
        failed: Int!
        retriedAt: DateTime!
      }

      type HotelOutboxReplayResult {
        id: ID!
        eventKey: String!
        status: String!
        replayed: Boolean!
      }

      type OverdueStayResolutionResult {
        bookingId: ID!
        folioId: ID!
        status: String!
        folioStatus: String!
        writtenOffMinor: Int!
        replayed: Boolean!
      }

      type HotelOnboardingResult {
        success: Boolean!
        message: String!
        createdCount: Int!
        updatedCount: Int!
        skippedCount: Int!
      }

      type FolioPostingResult {
        folioId: ID!
        entryId: ID!
        postingKey: String!
        replayed: Boolean!
        debitMinor: Int!
        creditMinor: Int!
        balanceMinor: Int!
      }

      type FolioClosureResult {
        folioId: ID!
        status: String!
        balanceMinor: Int!
        replayed: Boolean!
      }

      input StorefrontBookingCreateInput {
        guestName: String!
        guestEmail: String!
        guestPhone: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        numberOfAdults: Int!
        numberOfChildren: Int
        roomTypeId: ID!
        ratePlanId: ID!
        promoCode: String
        quoteToken: String!
        specialRequests: String
      }

      input HotelPropertySettingsInput {
        propertyName: String!
        tagline: String
        contactEmail: String!
        contactPhone: String!
        addressLine1: String!
        addressLine2: String
        frontDeskCopy: String
        checkInTime: String!
        checkOutTime: String!
        currencyCode: String!
        taxRateBasisPoints: Int!
        serviceFeeMinor: Int!
        storefrontAccentPreset: String!
        heroImagePath: String
        heroImageAltText: String
        heroImageCaption: String
        amenityImagePath: String
        amenityImageAltText: String
        amenityImageCaption: String
        locationImagePath: String
        locationImageAltText: String
        locationImageCaption: String
      }

      input HotelPaymentProviderCredentialsInput {
        secretKey: String
        publishableKey: String
        webhookSecret: String
        clientId: String
        clientSecret: String
        webhookId: String
        sandbox: Boolean
      }

      type HotelPaymentProviderConfigurationResult {
        id: ID!
        name: String!
        code: String!
        isInstalled: Boolean!
        configured: Boolean!
      }

      input StaffBookingCreateInput {
        guestName: String!
        guestEmail: String!
        guestPhone: String
        checkInDate: DateTime!
        checkOutDate: DateTime!
        numberOfAdults: Int!
        numberOfChildren: Int
        roomTypeId: ID!
        ratePlanId: ID!
        promoCode: String
        specialRequests: String
        internalNotes: String
        source: String
        status: String
        idempotencyKey: String!
      }

      type Mutation {
        configureHotelPaymentProvider(code: String!, enabled: Boolean!, credentials: HotelPaymentProviderCredentialsInput): HotelPaymentProviderConfigurationResult!
        redeemHotelPasswordResetToken(email: String!, token: String!, password: String!): HotelPasswordResetResult!
        updateHotelPropertySettings(data: HotelPropertySettingsInput!, idempotencyKey: String!): HotelSettings!
        runHotelOnboarding(template: String!, data: JSON): HotelOnboardingResult!
        runHotelNightAudit(
          propertyKey: String!
          businessDate: DateTime!
          idempotencyKey: String!
        ): HotelNightAuditRunProjection!
        replayHotelOutboxEvent(eventId: ID!, idempotencyKey: String!): HotelOutboxReplayResult!
        replayRefundIntent(intentId: ID!, idempotencyKey: String!): RefundIntent!
        resolveOverdueCheckedInBooking(
          bookingId: ID!
          idempotencyKey: String!
          reason: String!
        ): OverdueStayResolutionResult!
        pickupHotelGroupBlock(
          groupBlockId: ID!
          allocationId: ID!
          bookingId: ID!
          idempotencyKey: String!
        ): Booking
        updateHotelGroupBlockStatus(
          groupBlockId: ID!
          status: String!
          idempotencyKey: String!
        ): HotelGroupBlockProjection!
        createHotelGroupBlock(
          name: String!
          arrivalDate: DateTime!
          departureDate: DateTime!
          releaseDate: DateTime
          contactName: String!
          contactEmail: String!
          billingType: String!
          roomTypeId: ID!
          roomsHeld: Int!
          rateMinor: Int!
          currencyCode: String!
          idempotencyKey: String!
        ): HotelGroupBlockProjection!
        verifyGuestBooking(confirmationNumber: String!, email: String!): GuestBooking
        ensureGuestBookingAccess(bookingId: ID!): Boolean!
        ensureReservationSnapshots(bookingId: ID!): ReservationSnapshotResult!
        postFolioEntry(
          bookingId: ID!
          postingKey: String!
          entryType: String!
          direction: String!
          amountMinor: Int!
          currencyCode: String!
          description: String!
          serviceDate: DateTime
        ): FolioPostingResult!
        reverseFolioEntry(
          entryId: ID!
          postingKey: String!
          reason: String!
        ): FolioPostingResult!
        recordBookingPayment(
          bookingId: ID!
          postingKey: String!
          amountMinor: Int!
          currencyCode: String!
          paymentMethod: String!
          description: String!
        ): FolioPostingResult!
        closeReconciledFolio(
          bookingId: ID!
          idempotencyKey: String!
        ): FolioClosureResult!
        cancelBooking(bookingId: ID!, refundReason: String, idempotencyKey: String!): GuestBookingActionResult
        pushInventoryToChannel(channelId: ID!, dateRange: ChannelSyncDateRangeInput): ChannelSyncResult
        pullReservationsFromChannel(channelId: ID!): ChannelSyncResult
        retryFailedChannelSyncs: ChannelRetryResult!
        submitHotelContactMessage(
          name: String!
          email: String!
          phone: String
          subject: String!
          message: String!
          idempotencyKey: String!
        ): HotelContactMessageResult!
        createStorefrontBooking(data: StorefrontBookingCreateInput!): GuestBooking
        createStaffBooking(data: StaffBookingCreateInput!): Booking!
        amendStaffBooking(
          bookingId: ID!
          checkInDate: DateTime!
          checkOutDate: DateTime!
          roomTypeId: ID
          ratePlanId: ID
          promoCode: String
          idempotencyKey: String!
        ): Booking!
        requestBookingPaymentRefund(
          paymentId: ID!
          amountMinor: Int!
          reason: String!
          idempotencyKey: String!
        ): BookingPaymentRefundRequestResult!
        updateBookingStatus(bookingId: ID!, status: String!, idempotencyKey: String!): Booking
        updateRoomOperationalStatus(
          roomId: ID!
          status: String!
          notes: String
          idempotencyKey: String!
        ): Room
        updateHousekeepingTaskStatus(
          taskId: ID!
          status: String!
          assignedToId: ID
          notes: String
          idempotencyKey: String!
        ): HousekeepingTask
        updateRatePlanPublication(
          ratePlanId: ID!
          status: String
          isPublic: Boolean
          idempotencyKey: String!
        ): RatePlan
        reportRoomMaintenanceIssue(
          roomId: ID!
          title: String!
          description: String
          category: String
          priority: String
          idempotencyKey: String!
        ): MaintenanceRequest
        assignRoomToBooking(bookingId: ID!, roomId: ID!, idempotencyKey: String!): Booking
        updateBookingStayDates(
          bookingId: ID!
          checkInDate: DateTime!
          checkOutDate: DateTime!
          idempotencyKey: String!
        ): Booking
        updateMaintenanceRequestStatus(
          requestId: ID!
          status: String!
          notes: String
          idempotencyKey: String!
        ): MaintenanceRequest
        updateRoomInventoryControls(
          roomTypeId: ID!
          date: DateTime!
          totalRooms: Int
          bookedRooms: Int
          blockedRooms: Int
          idempotencyKey: String!
        ): RoomInventory
        requestBookingModification(
          bookingId: ID!
          guestEmail: String!
          requestedCheckInDate: DateTime
          requestedCheckOutDate: DateTime
          message: String
        ): GuestBookingActionResult
        resolveBookingModificationRequest(
          bookingId: ID!
          decision: String!
          checkInDate: DateTime
          checkOutDate: DateTime
          staffNote: String
          idempotencyKey: String!
        ): BookingModificationResolutionResult!
        initiateBookingPaymentSession(
          bookingId: ID!
          paymentProviderCode: String!
          returnUrl: String
          cancelUrl: String
        ): BookingCheckoutPaymentSession
        completeBookingPayment(
          bookingId: ID!
          paymentSessionId: ID!
          providerPaymentId: String
        ): BookingCheckoutPaymentResult
      }
    `,
    resolvers: {
      Query: {
        ...hotelOperationsResolvers.Query,
        redirectToInit: redirectToInit_default,
        publicHotelSettings,
        bookingPaymentProviders: async (root, args, context) => (await bookingPaymentProviders_default(root, args, context)).map(mapCheckoutPaymentProvider),
        activeBookingPaymentSession: activeBookingPaymentSession_default,
        storefrontRoomTypes: async (root, args, context) => (await storefrontRoomTypes_default(root, args, context)).map(mapStorefrontRoomType),
        storefrontRoomType: async (root, args, context) => mapStorefrontRoomType(await storefrontRoomType_default(root, args, context)),
        storefrontAvailability: async (root, args, context) => (await storefrontAvailability_default(root, args, context)).map(mapStorefrontRoomType),
        storefrontQuote: storefrontQuote_default,
        guestBooking: async (root, args, context) => mapGuestBooking(await guestBooking_default(root, args, context)),
        guestBookings: async (root, args, context) => (await guestBookings_default(root, args, context)).map(mapGuestBooking),
        guestCancellationQuote
      },
      Mutation: {
        configureHotelPaymentProvider,
        redeemHotelPasswordResetToken,
        updateHotelPropertySettings,
        runHotelOnboarding: runHotelOnboarding_default,
        runHotelNightAudit,
        createHotelGroupBlock,
        pickupHotelGroupBlock,
        updateHotelGroupBlockStatus,
        replayHotelOutboxEvent,
        replayRefundIntent,
        resolveOverdueCheckedInBooking,
        verifyGuestBooking: async (root, args, context) => mapGuestBooking(await verifyGuestBooking_default(root, args, context)),
        ensureGuestBookingAccess: async (root, { bookingId }, context) => {
          if (!context.session?.data?.role?.canManageBookings) {
            throw new Error("Not authorized to manage booking access.");
          }
          await ensureBookingHasGuestAccess(context, bookingId);
          return true;
        },
        ensureReservationSnapshots: ensureReservationSnapshots2,
        postFolioEntry,
        reverseFolioEntry,
        recordBookingPayment,
        closeReconciledFolio,
        cancelBooking: async (root, args, context) => {
          const booking = await cancelBooking(root, args, context);
          return {
            id: booking.id,
            status: booking.status || null,
            paymentStatus: booking.paymentStatus || null,
            balanceDueMinor: Number(booking.balanceDueMinor || 0),
            cancelledAt: booking.cancelledAt || null
          };
        },
        pushInventoryToChannel: async (root, args, context) => mapChannelSyncResult(await pushInventoryToChannelMutation(root, args, context)),
        pullReservationsFromChannel: async (root, args, context) => mapChannelSyncResult(await pullReservationsFromChannelMutation(root, args, context)),
        retryFailedChannelSyncs: retryFailedChannelSyncsMutation,
        submitHotelContactMessage,
        createStorefrontBooking: async (root, args, context) => mapGuestBooking(await createStorefrontBooking_default(root, args, context)),
        createStaffBooking: async (root, args, context) => createStaffBooking(root, args, context),
        amendStaffBooking,
        requestBookingPaymentRefund: requestBookingPaymentRefund2,
        updateBookingStatus,
        updateRoomOperationalStatus,
        updateHousekeepingTaskStatus,
        updateRatePlanPublication,
        reportRoomMaintenanceIssue,
        assignRoomToBooking,
        updateBookingStayDates,
        updateMaintenanceRequestStatus,
        updateRoomInventoryControls,
        requestBookingModification: async (root, args, context) => {
          const booking = await requestBookingModification(root, args, context);
          return {
            id: booking.id,
            status: booking.status || null,
            paymentStatus: null,
            cancelledAt: null
          };
        },
        resolveBookingModificationRequest,
        initiateBookingPaymentSession: async (root, args, context) => mapCheckoutPaymentSession(await initiateBookingPaymentSession_default(root, args, context)),
        completeBookingPayment: completeBookingPayment_default
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function hotelMailInfrastructureConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}
function getBaseUrlForEmails() {
  const configured = process.env.PASSWORD_RESET_ORIGIN || process.env.SMTP_STORE_LINK || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("Email origin is not configured.");
  return "http://localhost:3001";
}
function mailFrom() {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  if (process.env.NODE_ENV === "production") throw new Error("Email sender is not configured.");
  return "stay@thealderhouse.example";
}
function getTransport() {
  if (!hotelMailInfrastructureConfigured()) throw new Error("Email delivery infrastructure is unconfigured.");
  const host = process.env.SMTP_HOST || (process.env.NODE_ENV === "production" ? "" : "smtp.ethereal.email");
  if (!host) throw new Error("SMTP is not configured.");
  return (0, import_nodemailer.createTransport)({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
}
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await getTransport().sendMail({
    to,
    from: mailFrom(),
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.SMTP_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function emailHeader(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}
function communicationMoney(amountMinor, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode
  }).format(Number(amountMinor || 0) / 100);
}
function communicationDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}
function hotelCommunicationEmail(payload) {
  const recipient = payload.to;
  if (!recipient) throw new Error("Hotel communication recipient is required.");
  const property = escapeHtml(payload.propertyName);
  if (payload.kind === "contact_received") {
    return {
      subject: `[Website] ${emailHeader(payload.contactSubject)}`,
      html: `<body style="font-family:Arial,sans-serif;color:#222"><h1>${property} website message</h1><p><strong>From:</strong> ${escapeHtml(payload.guestName)} &lt;${escapeHtml(payload.replyTo)}&gt;</p><p><strong>Phone:</strong> ${escapeHtml(payload.contactPhone || "Not provided")}</p><p><strong>Subject:</strong> ${escapeHtml(payload.contactSubject)}</p><p style="white-space:pre-wrap">${escapeHtml(payload.contactMessage)}</p></body>`
    };
  }
  const confirmationNumber2 = payload.confirmationNumber;
  if (!confirmationNumber2) throw new Error("Booking communication confirmation number is required.");
  const title = payload.kind === "booking_confirmation" ? "Reservation confirmed" : payload.kind === "booking_updated" ? "Reservation updated" : payload.kind === "booking_modification_response" ? `Change request ${payload.modificationDecision || "reviewed"}` : payload.kind === "booking_no_show" ? "Reservation marked no-show" : payload.kind === "booking_refund" ? "Reservation refund recorded" : "Reservation cancelled";
  const total = communicationMoney(payload.totalAmountMinor, payload.currencyCode);
  const cancellation = payload.kind === "booking_cancelled" || payload.kind === "booking_no_show" ? `<h2>Policy settlement</h2><p>${escapeHtml(payload.cancellationSummary || "The booked terms were applied.")}</p><p><strong>Refund:</strong> ${escapeHtml(communicationMoney(payload.refundableMinor, payload.currencyCode))}<br/><strong>Policy fee:</strong> ${escapeHtml(communicationMoney(payload.cancellationFeeMinor, payload.currencyCode))}</p>` : payload.kind === "booking_refund" ? `<h2>Refund</h2><p>${escapeHtml(payload.cancellationSummary || "A refund was recorded by the property.")}</p><p><strong>Amount:</strong> ${escapeHtml(communicationMoney(payload.refundableMinor, payload.currencyCode))}</p>` : payload.kind === "booking_modification_response" ? `<p><strong>Decision:</strong> ${escapeHtml(payload.modificationDecision || "reviewed")}</p>${payload.staffNote ? `<p><strong>Property note:</strong> ${escapeHtml(payload.staffNote)}</p>` : ""}` : `<p><strong>Total:</strong> ${escapeHtml(total)}</p>`;
  const lookupUrl = `${getBaseUrlForEmails()}/bookings/lookup?confirmation=${encodeURIComponent(confirmationNumber2)}&email=${encodeURIComponent(recipient)}`;
  return {
    subject: `${emailHeader(title)} \xB7 ${emailHeader(payload.confirmationNumber)} \xB7 ${emailHeader(payload.propertyName)}`,
    html: `<body style="font-family:Arial,sans-serif;color:#222"><h1>${escapeHtml(title)}</h1><p>Hello ${escapeHtml(payload.guestName)},</p><p>${payload.kind === "booking_modification_response" ? `Your change request with ${property} has been reviewed.` : `Your reservation with ${property} has been ${payload.kind === "booking_confirmation" ? "confirmed" : payload.kind === "booking_updated" ? "updated" : payload.kind === "booking_no_show" ? "marked as a no-show under the booked terms" : payload.kind === "booking_refund" ? "updated with a refund" : "cancelled"}.`}</p><p><strong>Confirmation:</strong> ${escapeHtml(payload.confirmationNumber)}<br/><strong>Room:</strong> ${escapeHtml(payload.roomTypeName)}<br/><strong>Arrival:</strong> ${escapeHtml(communicationDate(payload.checkInDate))}<br/><strong>Departure:</strong> ${escapeHtml(communicationDate(payload.checkOutDate))}<br/><strong>Guests:</strong> ${escapeHtml(payload.numberOfGuests)}</p>${cancellation}<p><a href="${escapeHtml(lookupUrl)}">Open the secure reservation lookup</a> using your confirmation number and email.</p><p>Questions? Contact <a href="mailto:${escapeHtml(payload.contactEmail)}">${escapeHtml(payload.contactEmail)}</a>.</p></body>`
  };
}
async function sendHotelCommunicationEmail(payload) {
  const message = hotelCommunicationEmail(payload);
  const info = await getTransport().sendMail({
    to: payload.to,
    from: mailFrom(),
    replyTo: payload.replyTo || void 0,
    subject: message.subject,
    html: message.html
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

// features/keystone/jobs/channelSyncJobs.ts
var import_context = require("@keystone-6/core/context");
var PrismaModule = __toESM(require("@prisma/client"));

// features/keystone/lib/workerLease.ts
var import_client4 = require("@prisma/client");
async function acquireWorkerLease(prisma, options) {
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + options.ttlMs);
  const rows = await prisma.$queryRaw(import_client4.Prisma.sql`
    INSERT INTO "HotelWorkerLease" ("id", "leaseKey", "ownerId", "expiresAt", "heartbeatAt")
    VALUES (${`lease_${options.leaseKey}`}, ${options.leaseKey}, ${options.ownerId}, ${expiresAt}, ${now})
    ON CONFLICT ("leaseKey") DO UPDATE SET
      "ownerId" = EXCLUDED."ownerId", "expiresAt" = EXCLUDED."expiresAt", "heartbeatAt" = EXCLUDED."heartbeatAt"
    WHERE "HotelWorkerLease"."expiresAt" <= ${now} OR "HotelWorkerLease"."ownerId" = ${options.ownerId}
    RETURNING "ownerId"
  `);
  return rows[0]?.ownerId === options.ownerId;
}

// features/keystone/jobs/channelSyncJobs.ts
var INVENTORY_SYNC_INTERVAL_MS = 15 * 60 * 1e3;
var RESERVATION_SYNC_INTERVAL_MS = 5 * 60 * 1e3;
var RETRY_INTERVAL_MS = 2 * 60 * 1e3;
function startChannelSyncJobs(config2) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  if (globalThis.__channelSyncJobsState) return;
  const context = (0, import_context.getContext)(config2, PrismaModule);
  const ownerId = process.env.CHANNEL_SYNC_WORKER_ID || `hotel-channel-${process.pid}`;
  let stopping = false;
  const leased = async (leaseKey, ttlMs, job) => {
    if (stopping || !await acquireWorkerLease(context.prisma, { leaseKey, ownerId, ttlMs })) return;
    await job();
  };
  const syncInventory = async () => {
    const channels = await context.sudo().query.Channel.findMany({
      where: { isActive: { equals: true } },
      query: "id name"
    });
    for (const channel of channels) {
      try {
        await pushInventoryToChannel(context, channel.id);
      } catch (error) {
        console.error("Inventory sync failed for channel:", channel.id, error);
      }
    }
  };
  const syncReservations = async () => {
    const channels = await context.sudo().query.Channel.findMany({
      where: { isActive: { equals: true } },
      query: "id name"
    });
    for (const channel of channels) {
      try {
        await pullReservationsFromChannel(context, channel.id);
      } catch (error) {
        console.error("Reservation pull failed for channel:", channel.id, error);
      }
    }
  };
  const retryFailed = async () => {
    try {
      await retryFailedChannelSyncs(context);
    } catch (error) {
      console.error("Channel sync retry failed:", error);
    }
  };
  const inventory = () => leased("channel-inventory", INVENTORY_SYNC_INTERVAL_MS * 2, syncInventory);
  const reservations = () => leased("channel-reservations", RESERVATION_SYNC_INTERVAL_MS * 2, syncReservations);
  const retries = () => leased("channel-retries", RETRY_INTERVAL_MS * 2, retryFailed);
  const intervals = [
    setInterval(() => void inventory(), INVENTORY_SYNC_INTERVAL_MS),
    setInterval(() => void reservations(), RESERVATION_SYNC_INTERVAL_MS),
    setInterval(() => void retries(), RETRY_INTERVAL_MS)
  ];
  intervals.forEach((interval) => interval.unref());
  const shutdown = () => {
    stopping = true;
    intervals.forEach(clearInterval);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  globalThis.__channelSyncJobsState = { intervals, shutdown };
  void inventory();
  void reservations();
  void retries();
}

// features/keystone/jobs/hotelOutboxJobs.ts
var import_context2 = require("@keystone-6/core/context");
var PrismaModule2 = __toESM(require("@prisma/client"));
var DEFAULT_INTERVAL_MS = 5e3;
function startHotelOutboxJobs(config2) {
  if (process.env.NODE_ENV === "test") return;
  const dispatchConfig = getOutboxDispatchConfig();
  const smtpInfrastructureConfigured = hotelMailInfrastructureConfigured();
  if (!dispatchConfig.enabled && !smtpInfrastructureConfigured) return;
  if (globalThis.__hotelOutboxJobsState) return;
  let httpHandler = null;
  if (dispatchConfig.enabled) {
    const { url, secret, credentialKeyId } = dispatchConfig;
    if (!url || !secret || !credentialKeyId) throw new Error("Enabled hotel outbox dispatch configuration is incomplete.");
    httpHandler = createHttpOutboxHandler({ url, secret, credentialKeyId });
  }
  ;
  globalThis.__hotelOutboxJobsState = { starting: true };
  const context = (0, import_context2.getContext)(config2, PrismaModule2);
  const workerId = process.env.HOTEL_OUTBOX_WORKER_ID || `hotel-${process.pid}`;
  const intervalMs = Number(process.env.HOTEL_OUTBOX_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const topics = httpHandler ? void 0 : HOTEL_COMMUNICATION_TOPICS;
  const handler = async (event) => {
    if (isHotelCommunicationTopic(event.topic) && smtpInfrastructureConfigured) {
      const settings = await context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { contactEmail: true } });
      if (!settings?.contactEmail) throw new Error("Property communication settings are unconfigured.");
      return {
        channel: "smtp",
        ...await sendHotelCommunicationEmail(event.payloadSnapshot)
      };
    }
    if (httpHandler) return httpHandler(event);
    throw new Error("No delivery adapter is configured for this outbox topic.");
  };
  const dispatch = async () => {
    try {
      await dispatchHotelOutboxBatch(
        context.prisma,
        { propertyKey: "the-alder-house", workerId, limit: 25, topics },
        handler
      );
    } catch (error) {
      console.error("Hotel outbox dispatch cycle failed:", error instanceof Error ? error.message : error);
    }
  };
  let stopping = false;
  let running = false;
  const guardedDispatch = async () => {
    if (stopping || running) return;
    running = true;
    try {
      await dispatch();
    } finally {
      running = false;
    }
  };
  const interval = setInterval(() => void guardedDispatch(), Number.isFinite(intervalMs) ? Math.max(1e3, intervalMs) : DEFAULT_INTERVAL_MS);
  interval.unref();
  const shutdown = () => {
    stopping = true;
    clearInterval(interval);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  ;
  globalThis.__hotelOutboxJobsState = { interval, shutdown };
  void guardedDispatch();
}

// features/keystone/jobs/hotelRefundJobs.ts
var import_context3 = require("@keystone-6/core/context");
var PrismaModule3 = __toESM(require("@prisma/client"));
var GLOBAL_KEY = "__hotelRefundJobsState";
function startHotelRefundJobs(config2) {
  if (process.env.NODE_ENV === "test") return;
  const globalState = globalThis;
  if (globalState[GLOBAL_KEY]) return;
  const context = (0, import_context3.getContext)(config2, PrismaModule3);
  const workerId = process.env.HOTEL_REFUND_WORKER_ID || `hotel-refund-${process.pid}`;
  const intervalMs = Math.max(1e3, Number(process.env.HOTEL_REFUND_INTERVAL_MS || 5e3));
  let stopping = false;
  let running = false;
  const dispatch = async () => {
    if (stopping || running) return;
    running = true;
    try {
      await dispatchRefundIntentBatch(context, { workerId, limit: 10 });
    } catch (error) {
      console.error("Hotel refund dispatch failed:", error instanceof Error ? error.message : "unknown error");
    } finally {
      running = false;
    }
  };
  const interval = setInterval(() => void dispatch(), intervalMs);
  interval.unref();
  const shutdown = () => {
    stopping = true;
    clearInterval(interval);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  globalState[GLOBAL_KEY] = { interval, shutdown };
  void dispatch();
}

// features/keystone/jobs/hotelHoldJobs.ts
var import_context4 = require("@keystone-6/core/context");
var PrismaModule4 = __toESM(require("@prisma/client"));
var import_client5 = require("@prisma/client");
function startHotelHoldJobs(config2) {
  if (process.env.NODE_ENV === "test") return;
  const globalState = globalThis;
  if (globalState.__hotelHoldJobsState) return;
  const context = (0, import_context4.getContext)(config2, PrismaModule4);
  const ownerId = `hotel-hold-${process.pid}`;
  let stopping = false;
  const run = async () => {
    if (stopping || !await acquireWorkerLease(context.prisma, { leaseKey: "booking-hold-expiry", ownerId, ttlMs: 12e4 })) return;
    await context.transaction(async (tx) => {
      const rows = await tx.prisma.$queryRaw(import_client5.Prisma.sql`SELECT "id" FROM "Booking" WHERE "status"='pending' AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= NOW() ORDER BY "holdExpiresAt", "id" FOR UPDATE SKIP LOCKED LIMIT 50`);
      for (const row of rows) {
        await requestBookingCancellation({
          context: tx,
          bookingId: row.id,
          refundReason: "Unpaid reservation hold expired",
          idempotencyKey: `hold-expired:${row.id}`,
          actorId: null,
          source: "guest",
          withinTransaction: true
        });
      }
    }, { timeout: 3e4 });
  };
  const interval = setInterval(() => void run(), 6e4);
  interval.unref();
  const shutdown = () => {
    stopping = true;
    clearInterval(interval);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  globalState.__hotelHoldJobsState = { interval, shutdown };
  void run();
}

// features/keystone/lib/productionConfig.ts
var PLACEHOLDER2 = /(^|[-_.])(test|dummy|placeholder|changeme|your[_-]|example)([-_.]|$)|keystone|ethereal|localhost|127\.0\.0\.1/i;
function required2(env, key3) {
  const value = String(env[key3] || "").trim();
  if (!value) throw new Error(`${key3} is required in production.`);
  return value;
}
function strongDomainSecret(env, key3) {
  const value = required2(env, key3);
  if (value.length < 32) throw new Error(`${key3} must contain at least 32 characters.`);
  if (PLACEHOLDER2.test(value)) throw new Error(`${key3} contains a development or placeholder value.`);
  return value;
}
function databaseUrl(env) {
  const value = required2(env, "DATABASE_URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  return value;
}
function httpsOrigin(env, key3) {
  const value = required2(env, key3);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key3} must be a valid URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.hostname.endsWith(".local")) {
    throw new Error(`${key3} must be a canonical HTTPS origin without credentials, path, query, or fragment.`);
  }
  return url.origin;
}
function complete2(values) {
  return values.every((value) => Boolean(String(value || "").trim()));
}
function validateProductionConfig(env = process.env) {
  const capabilities2 = {
    mailInfrastructureConfigured: complete2([env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM]),
    storageInfrastructureConfigured: complete2([env.S3_BUCKET_NAME, env.S3_REGION, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY, env.S3_ENDPOINT])
  };
  if (env.NODE_ENV !== "production") return capabilities2;
  databaseUrl(env);
  strongDomainSecret(env, "SESSION_SECRET");
  strongDomainSecret(env, "HOTEL_DATA_ENCRYPTION_KEY");
  strongDomainSecret(env, "HOTEL_QUOTE_SECRET");
  const site = httpsOrigin(env, "NEXT_PUBLIC_SITE_URL");
  const auth = httpsOrigin(env, "NEXTAUTH_URL");
  if (site !== auth) throw new Error("NEXT_PUBLIC_SITE_URL and NEXTAUTH_URL must use the same canonical origin.");
  const trustProxy = String(env.TRUST_PROXY || "off").toLowerCase();
  if (!["off", "railway"].includes(trustProxy)) throw new Error("TRUST_PROXY must be off or railway.");
  if (trustProxy === "railway" && !env.RAILWAY_ENVIRONMENT) throw new Error("TRUST_PROXY=railway requires RAILWAY_ENVIRONMENT.");
  return capabilities2;
}

// features/keystone/index.ts
var isProduction = process.env.NODE_ENV === "production";
var capabilities = validateProductionConfig();
var databaseURL = process.env.DATABASE_URL || (isProduction ? "" : "postgresql://postgres:postgres@127.0.0.1:5432/runtime_hotel");
var sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "local-development-session-secret-change-me");
if (!databaseURL) throw new Error("DATABASE_URL is required outside local development.");
if (sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
var SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
var sessionConfig = {
  maxAge: SESSION_MAX_AGE_SECONDS,
  secret: sessionSecret,
  secure: isProduction,
  sameSite: "lax",
  path: "/"
};
var permissionKeys = [
  "canAccessDashboard",
  "canManageRooms",
  "canManageBookings",
  "canManageHousekeeping",
  "canManageGuests",
  "canManagePayments",
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canManageOnboarding",
  "canManageAudit",
  "canManageIntegrations"
];
function revocableStatelessSessions() {
  const base = (0, import_session.statelessSessions)(sessionConfig);
  const loadCurrent = async (context, session, allowInitialIdentity = false) => {
    if (!session?.itemId || session.listKey !== "User") return void 0;
    const user = await context.prisma.user.findUnique({
      where: { id: session.itemId },
      include: { role: true }
    });
    if (!user?.isActive || !user.role) return void 0;
    if (!allowInitialIdentity && Number(user.authVersion || 0) !== Number(session.data?.authVersion || 0)) return void 0;
    const embeddedRole = session.data?.role || {};
    if (!allowInitialIdentity && permissionKeys.some((key3) => Boolean(user.role[key3]) !== Boolean(embeddedRole[key3]))) return void 0;
    return {
      ...session,
      data: {
        ...session.data,
        name: user.name,
        email: user.email,
        isActive: true,
        authVersion: user.authVersion,
        role: Object.fromEntries(["id", "name", ...permissionKeys].map((key3) => [key3, user.role[key3]]))
      }
    };
  };
  return {
    get: async ({ context }) => {
      const session = await base.get({ context });
      return loadCurrent(context, session);
    },
    start: async ({ context, data }) => {
      const current = await loadCurrent(context, data, true);
      if (!current) throw new Error("Authentication is not permitted for this account.");
      return base.start({ context, data: current });
    },
    end: (args) => base.end(args)
  };
}
var bucketName = process.env.S3_BUCKET_NAME || "local-disabled";
var region = process.env.S3_REGION || "local-disabled";
var accessKeyId = process.env.S3_ACCESS_KEY_ID || "local-disabled";
var secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "local-disabled";
var endpoint = process.env.S3_ENDPOINT || "https://storage-disabled.invalid";
var { withAuth } = (0, import_auth.createAuth)({
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
          canManageIntegrations: true
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      const settings = await args.context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { contactEmail: true } });
      if (!settings?.contactEmail || !capabilities.mailInfrastructureConfigured) {
        throw new Error("Password reset email is currently unconfigured.");
      }
      await sendPasswordResetEmail(args.token, args.identity);
    }
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
  `
});
var baseConfig = (0, import_core42.config)({
  db: {
    provider: "postgresql",
    url: databaseURL
  },
  lists: models,
  storage: {
    my_images: capabilities.storageInfrastructureConfigured ? {
      kind: "s3",
      type: "image",
      bucketName,
      region,
      accessKeyId,
      secretAccessKey,
      endpoint,
      signed: { expiry: 5e3 },
      forcePathStyle: true
    } : {
      kind: "local",
      type: "image",
      storagePath: ".runtime/disabled-uploads",
      serverRoute: { path: "/disabled-uploads" },
      generateUrl: () => {
        throw new Error("Image uploads are currently unavailable.");
      }
    }
  },
  ui: {
    isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session })
  },
  session: revocableStatelessSessions(),
  graphql: {
    extendGraphqlSchema
  }
});
var configWithAuth = withAuth(baseConfig);
var isRuntimeServer = process.env.NEXT_PHASE !== "phase-production-build" && process.argv.some((argument) => argument === "dev" || argument === "start");
if (isRuntimeServer) {
  startChannelSyncJobs(configWithAuth);
  startHotelOutboxJobs(configWithAuth);
  startHotelRefundJobs(configWithAuth);
  startHotelHoldJobs(configWithAuth);
}
var keystone_default = configWithAuth;

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
