"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __glob = (map) => (path) => {
  var fn = map[path];
  if (fn) return fn();
  throw new Error("Module not found in bundle: " + path);
};
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
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
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
function normalizeAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid payment amount");
  }
  return Math.round(amount);
}
async function createPaymentFunction({ amount, currency, metadata = {} }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: normalizeAmount(amount),
    currency: (currency || "usd").toLowerCase(),
    automatic_payment_methods: {
      enabled: true
    },
    metadata
  });
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    data: paymentIntent
  };
}
async function capturePaymentFunction({ paymentId, amount }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amount ? normalizeAmount(amount) : void 0
  });
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, metadata = {} }) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create({
    payment_intent: paymentId,
    amount: amount ? normalizeAmount(Math.abs(amount)) : void 0,
    metadata
  });
  return {
    status: refund.status,
    amount: refund.amount,
    data: refund
  };
}
async function getPaymentStatusFunction({ paymentId }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    data: paymentIntent
  };
}
async function generatePaymentLinkFunction({ paymentId }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}
async function handleWebhookFunction({ event, headers }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  const stripe = getStripeClient();
  const rawBody = typeof event === "string" ? event : JSON.stringify(event);
  const stripeEvent = stripe.webhooks.constructEvent(
    rawBody,
    headers["stripe-signature"],
    webhookSecret
  );
  return {
    isValid: true,
    event: stripeEvent,
    type: stripeEvent.type,
    resource: stripeEvent.data.object
  };
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    getStripeClient = () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new Error("Stripe secret key not configured");
      }
      return new import_stripe.default(stripeKey, {
        apiVersion: "2025-11-17.clover"
      });
    };
  }
});

// features/integrations/payment/paypal.ts
var paypal_exports = {};
__export(paypal_exports, {
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
async function handleWebhookFunction2({ event, headers }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PayPal webhook ID is not configured");
  }
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: event
    })
  });
  const verification = await response.json();
  const isValid = verification.verification_status === "SUCCESS";
  if (!isValid) {
    throw new Error("Invalid webhook signature");
  }
  return {
    isValid: true,
    event,
    type: event.event_type,
    resource: event.resource
  };
}
async function createPaymentFunction2({ amount, currency, metadata = {} }) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: (currency || "USD").toUpperCase(),
            value: formatPayPalAmount(amount, currency || "USD")
          },
          custom_id: metadata?.bookingId || metadata?.paymentId || void 0
        }
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        return_url: metadata?.returnUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000/paypal/return",
        cancel_url: metadata?.cancelUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000/book",
        user_action: "PAY_NOW"
      }
    })
  });
  const order = await response.json();
  if (order.error) {
    throw new Error(`PayPal order creation failed: ${order.error.message}`);
  }
  return {
    orderId: order.id,
    status: order.status,
    approveLink: order.links?.find((link) => link.rel === "approve")?.href || null,
    data: order
  };
}
async function capturePaymentFunction2({ paymentId }) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${paymentId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });
  const capture = await response.json();
  if (capture.error) {
    throw new Error(`PayPal capture failed: ${capture.error.message}`);
  }
  const capturedAmount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
  return {
    status: capture.status,
    amount: capturedAmount ? parsePayPalAmount(capturedAmount.value, capturedAmount.currency_code) : void 0,
    data: capture
  };
}
async function refundPaymentFunction2({ paymentId, amount, currency = "USD" }) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v2/payments/captures/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      amount: amount ? {
        value: formatPayPalAmount(Math.abs(amount), currency),
        currency_code: currency.toUpperCase()
      } : void 0
    })
  });
  const refund = await response.json();
  if (refund.error) {
    throw new Error(`PayPal refund failed: ${refund.error.message}`);
  }
  return {
    status: refund.status,
    amount: refund.amount ? parsePayPalAmount(refund.amount.value, refund.amount.currency_code) : void 0,
    data: refund
  };
}
async function getPaymentStatusFunction2({ paymentId }) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${paymentId}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });
  const order = await response.json();
  if (order.error) {
    throw new Error(`PayPal status check failed: ${order.error.message}`);
  }
  const orderAmount = order.purchase_units?.[0]?.amount;
  return {
    status: order.status,
    amount: orderAmount ? parsePayPalAmount(orderAmount.value, orderAmount.currency_code) : void 0,
    data: order
  };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return `https://www.paypal.com/activity/payment/${paymentId}`;
}
var NO_DIVISION_CURRENCIES, getPayPalBaseUrl, formatPayPalAmount, parsePayPalAmount, getPayPalAccessToken;
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
    getPayPalBaseUrl = () => {
      const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX !== "false";
      return isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    };
    formatPayPalAmount = (amount, currency) => {
      const upperCurrency = currency.toUpperCase();
      const isNoDivision = NO_DIVISION_CURRENCIES.includes(upperCurrency);
      if (isNoDivision) {
        return Math.round(amount).toString();
      }
      return (Math.round(amount) / 100).toFixed(2);
    };
    parsePayPalAmount = (value, currency) => {
      const upperCurrency = currency.toUpperCase();
      const isNoDivision = NO_DIVISION_CURRENCIES.includes(upperCurrency);
      if (isNoDivision) {
        return parseInt(value, 10);
      }
      return Math.round(parseFloat(value) * 100);
    };
    getPayPalAccessToken = async () => {
      const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("PayPal credentials not configured");
      }
      const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Language": "en_US",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
        },
        body: "grant_type=client_credentials"
      });
      const { access_token } = await response.json();
      if (!access_token) {
        throw new Error("Failed to get PayPal access token");
      }
      return access_token;
    };
  }
});

// features/integrations/payment/manual.ts
var manual_exports = {};
__export(manual_exports, {
  capturePaymentFunction: () => capturePaymentFunction3,
  createPaymentFunction: () => createPaymentFunction3,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction3,
  getPaymentStatusFunction: () => getPaymentStatusFunction3,
  handleWebhookFunction: () => handleWebhookFunction3,
  refundPaymentFunction: () => refundPaymentFunction3
});
async function handleWebhookFunction3({ event, headers }) {
  return {
    isValid: true,
    event,
    type: event?.type || "manual.event",
    resource: event?.data || event
  };
}
async function createPaymentFunction3({ amount, currency }) {
  return {
    status: "pending",
    data: {
      status: "pending",
      amount,
      currency: (currency || "usd").toLowerCase()
    }
  };
}
async function capturePaymentFunction3({ amount }) {
  return {
    status: "captured",
    amount,
    data: {
      status: "captured",
      amount,
      captured_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function refundPaymentFunction3({ amount }) {
  return {
    status: "refunded",
    amount,
    data: {
      status: "refunded",
      amount,
      refunded_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function getPaymentStatusFunction3() {
  return {
    status: "succeeded",
    data: {
      status: "succeeded"
    }
  };
}
async function generatePaymentLinkFunction3() {
  return null;
}
var init_manual = __esm({
  "features/integrations/payment/manual.ts"() {
    "use strict";
  }
});

// features/integrations/payment/index.ts
var payment_exports = {};
__export(payment_exports, {
  paymentProviderAdapters: () => paymentProviderAdapters
});
var paymentProviderAdapters;
var init_payment = __esm({
  "features/integrations/payment/index.ts"() {
    "use strict";
    paymentProviderAdapters = {
      stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
      paypal: () => Promise.resolve().then(() => (init_paypal(), paypal_exports)),
      manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
    };
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
var import_core24 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session);
}
var permissions = {
  canAccessDashboard: ({ session }) => session?.data.role?.canAccessDashboard ?? false,
  canManageRooms: ({ session }) => session?.data.role?.canManageRooms ?? false,
  canManageBookings: ({ session }) => session?.data.role?.canManageBookings ?? false,
  canManageHousekeeping: ({ session }) => session?.data.role?.canManageHousekeeping ?? false,
  canManageGuests: ({ session }) => session?.data.role?.canManageGuests ?? false,
  canManagePayments: ({ session }) => session?.data.role?.canManagePayments ?? false,
  canManagePeople: ({ session }) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }) => session?.data.role?.canManageRoles ?? false,
  canManageOnboarding: ({ session }) => session?.data.role?.canManageOnboarding ?? false
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
      create: () => true,
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
    isActive: (0, import_fields2.checkbox)({ defaultValue: true }),
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
  })
};
var permissionsList = Object.keys(permissionFields);

// features/keystone/models/Role.ts
var Role = (0, import_core2.list)({
  access: {
    operation: {
      query: () => true,
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
  }
});

// features/keystone/models/RoomType.ts
var import_core3 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var RoomType = (0, import_core3.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
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
    // Pricing
    baseRate: (0, import_fields6.float)({
      validation: { isRequired: true, min: 0 },
      label: "Base Rate",
      ui: {
        description: "Nightly rate in default currency"
      }
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
        { label: "Fireplace", value: "fireplace" }
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
  }
});

// features/keystone/models/Room.ts
var import_core4 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
var Room = (0, import_core4.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
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
    roomNumber: (0, import_fields7.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Room Number",
      ui: {
        description: "Unique room identifier (e.g., 101, 202A)"
      }
    }),
    // Room type relationship
    roomType: (0, import_fields7.relationship)({
      ref: "RoomType.rooms",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Location
    floor: (0, import_fields7.integer)({
      validation: { min: 0 },
      label: "Floor",
      ui: {
        description: "Floor number where the room is located"
      }
    }),
    // Status
    status: (0, import_fields7.select)({
      type: "string",
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
    lastCleaned: (0, import_fields7.timestamp)({
      label: "Last Cleaned",
      ui: {
        description: "When the room was last cleaned"
      }
    }),
    // Notes
    notes: (0, import_fields7.text)({
      ui: {
        displayMode: "textarea",
        description: "Maintenance issues, special notes, etc."
      },
      label: "Notes"
    }),
    // Relationships
    housekeepingTasks: (0, import_fields7.relationship)({
      ref: "HousekeepingTask.room",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["taskType", "status", "assignedTo"],
        inlineCreate: { fields: ["taskType", "priority", "notes"] }
      },
      label: "Housekeeping Tasks"
    }),
    roomAssignments: (0, import_fields7.relationship)({
      ref: "RoomAssignment.room",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Room Assignments"
    }),
    ...trackingFields
  }
});

// features/keystone/models/RoomInventory.ts
var import_core5 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var RoomInventory = (0, import_core5.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageRooms
    }
  },
  ui: {
    listView: {
      initialColumns: ["date", "roomType", "totalRooms", "bookedRooms", "availableRooms"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Date for this inventory record
    date: (0, import_fields8.timestamp)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Date",
      ui: {
        description: "Date for this inventory snapshot"
      }
    }),
    // Room type relationship
    roomType: (0, import_fields8.relationship)({
      ref: "RoomType",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Inventory counts
    totalRooms: (0, import_fields8.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Total Rooms",
      ui: {
        description: "Total number of rooms of this type"
      }
    }),
    bookedRooms: (0, import_fields8.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Booked Rooms",
      ui: {
        description: "Number of rooms currently booked"
      }
    }),
    blockedRooms: (0, import_fields8.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Blocked Rooms",
      ui: {
        description: "Number of rooms blocked (out of order, reserved, etc)"
      }
    }),
    // Virtual field for available rooms
    availableRooms: (0, import_fields8.virtual)({
      field: import_core5.graphql.field({
        type: import_core5.graphql.Int,
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
    isAvailable: (0, import_fields8.virtual)({
      field: import_core5.graphql.field({
        type: import_core5.graphql.Boolean,
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
var import_core6 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var HousekeepingTask = (0, import_core6.list)({
  access: {
    operation: {
      query: permissions.canManageHousekeeping,
      create: permissions.canManageHousekeeping,
      update: permissions.canManageHousekeeping,
      delete: permissions.canManageHousekeeping
    }
  },
  ui: {
    listView: {
      initialColumns: ["room", "taskType", "status", "priority", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Room relationship
    room: (0, import_fields9.relationship)({
      ref: "Room.housekeepingTasks",
      ui: {
        displayMode: "select",
        labelField: "roomNumber"
      },
      label: "Room"
    }),
    // Task type
    taskType: (0, import_fields9.select)({
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
    assignedTo: (0, import_fields9.relationship)({
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
    priority: (0, import_fields9.integer)({
      defaultValue: 2,
      validation: { min: 1, max: 5 },
      label: "Priority",
      ui: {
        description: "Task priority (1 = highest, 5 = lowest)"
      }
    }),
    // Status
    status: (0, import_fields9.select)({
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
    startedAt: (0, import_fields9.timestamp)({
      label: "Started At",
      ui: {
        description: "When the task was started"
      }
    }),
    completedAt: (0, import_fields9.timestamp)({
      label: "Completed At",
      ui: {
        description: "When the task was completed"
      }
    }),
    // Notes
    notes: (0, import_fields9.text)({
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
var import_core7 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var RoomAssignment = (0, import_core7.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["booking", "room", "roomType", "guestName", "ratePerNight"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Booking relationship
    booking: (0, import_fields10.relationship)({
      ref: "Booking.roomAssignments",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber"
      },
      label: "Booking"
    }),
    // Room relationship
    room: (0, import_fields10.relationship)({
      ref: "Room.roomAssignments",
      ui: {
        displayMode: "select",
        labelField: "roomNumber"
      },
      label: "Room"
    }),
    // Room type relationship
    roomType: (0, import_fields10.relationship)({
      ref: "RoomType.roomAssignments",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Rate
    ratePerNight: (0, import_fields10.float)({
      validation: { min: 0 },
      label: "Rate Per Night",
      ui: {
        description: "Nightly rate for this room assignment"
      }
    }),
    // Guest information
    guestName: (0, import_fields10.text)({
      label: "Guest Name",
      ui: {
        description: "Name of guest assigned to this room"
      }
    }),
    // Special requests
    specialRequests: (0, import_fields10.text)({
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
var import_core8 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var import_core9 = require("@keystone-6/core");
function generateConfirmationNumber() {
  const timestamp18 = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${timestamp18}-${random}`;
}
var Booking = (0, import_core8.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["confirmationNumber", "guestName", "checkInDate", "checkOutDate", "status", "totalAmount"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Confirmation number (auto-generated)
    confirmationNumber: (0, import_fields11.text)({
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
    guestName: (0, import_fields11.text)({
      validation: { isRequired: true },
      label: "Guest Name",
      ui: {
        description: "Primary guest name"
      }
    }),
    guestEmail: (0, import_fields11.text)({
      label: "Guest Email",
      ui: {
        description: "Contact email for the booking"
      }
    }),
    guestPhone: (0, import_fields11.text)({
      label: "Guest Phone",
      ui: {
        description: "Contact phone number"
      }
    }),
    // Dates
    checkInDate: (0, import_fields11.timestamp)({
      validation: { isRequired: true },
      label: "Check-In Date",
      ui: {
        description: "Expected check-in date and time"
      }
    }),
    checkOutDate: (0, import_fields11.timestamp)({
      validation: { isRequired: true },
      label: "Check-Out Date",
      ui: {
        description: "Expected check-out date and time"
      }
    }),
    // Computed number of nights
    numberOfNights: (0, import_fields11.virtual)({
      field: import_core9.graphql.field({
        type: import_core9.graphql.Int,
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
    numberOfGuests: (0, import_fields11.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Number of Guests",
      ui: {
        description: "Total number of guests"
      }
    }),
    numberOfAdults: (0, import_fields11.integer)({
      validation: { min: 1 },
      defaultValue: 1,
      label: "Number of Adults"
    }),
    numberOfChildren: (0, import_fields11.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Number of Children"
    }),
    // Financials
    roomRate: (0, import_fields11.float)({
      validation: { min: 0 },
      label: "Room Rate",
      ui: {
        description: "Total room rate before taxes"
      }
    }),
    taxAmount: (0, import_fields11.float)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Tax Amount",
      ui: {
        description: "Total tax amount"
      }
    }),
    feesAmount: (0, import_fields11.float)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Fees Amount",
      ui: {
        description: "Additional fees (resort fee, service charge, etc.)"
      }
    }),
    totalAmount: (0, import_fields11.float)({
      validation: { min: 0 },
      label: "Total Amount",
      ui: {
        description: "Total amount including room rate, taxes, and fees"
      }
    }),
    depositAmount: (0, import_fields11.float)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Deposit Amount",
      ui: {
        description: "Deposit or prepayment amount"
      }
    }),
    balanceDue: (0, import_fields11.float)({
      validation: { min: 0 },
      label: "Balance Due",
      ui: {
        description: "Remaining balance to be paid"
      }
    }),
    // Status
    status: (0, import_fields11.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Checked In", value: "checked_in" },
        { label: "Checked Out", value: "checked_out" },
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
    paymentStatus: (0, import_fields11.select)({
      type: "string",
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
    source: (0, import_fields11.select)({
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
    specialRequests: (0, import_fields11.text)({
      ui: {
        displayMode: "textarea",
        description: "Guest special requests and notes"
      },
      label: "Special Requests"
    }),
    // Internal notes
    internalNotes: (0, import_fields11.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal staff notes"
      },
      label: "Internal Notes"
    }),
    // Relationships
    roomAssignments: (0, import_fields11.relationship)({
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
    guestProfile: (0, import_fields11.relationship)({
      ref: "Guest.bookings",
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      label: "Guest Profile"
    }),
    // Legacy guest relationship (for backwards compatibility with User)
    guest: (0, import_fields11.relationship)({
      ref: "User.bookings",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "User Account"
    }),
    // Payments relationship
    payments: (0, import_fields11.relationship)({
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
    paymentSessions: (0, import_fields11.relationship)({
      ref: "BookingPaymentSession.booking",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Payment Sessions"
    }),
    // Timestamps
    confirmedAt: (0, import_fields11.timestamp)({
      label: "Confirmed At",
      ui: {
        description: "When the booking was confirmed"
      }
    }),
    checkedInAt: (0, import_fields11.timestamp)({
      label: "Checked In At",
      ui: {
        description: "Actual check-in time"
      }
    }),
    checkedOutAt: (0, import_fields11.timestamp)({
      label: "Checked Out At",
      ui: {
        description: "Actual check-out time"
      }
    }),
    cancelledAt: (0, import_fields11.timestamp)({
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
    }
  }
});

// features/keystone/models/BookingPayment.ts
var import_core10 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
function generatePaymentReference() {
  const timestamp18 = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PAY-${timestamp18}-${random}`;
}
var BookingPayment = (0, import_core10.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments
    }
  },
  ui: {
    listView: {
      initialColumns: ["paymentReference", "booking", "amount", "paymentType", "status", "createdAt"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Payment reference (auto-generated)
    paymentReference: (0, import_fields12.text)({
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
    paymentType: (0, import_fields12.select)({
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
    // Amount
    amount: (0, import_fields12.float)({
      validation: { isRequired: true },
      label: "Amount",
      ui: {
        description: "Payment amount (negative for refunds)"
      }
    }),
    // Currency
    currency: (0, import_fields12.text)({
      defaultValue: "USD",
      validation: { isRequired: true },
      label: "Currency",
      ui: {
        description: "Currency code (e.g., USD, EUR)"
      }
    }),
    // Payment method
    paymentMethod: (0, import_fields12.select)({
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
    status: (0, import_fields12.select)({
      type: "string",
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
    providerPaymentId: (0, import_fields12.text)({
      label: "Provider Payment ID",
      ui: {
        description: "Primary payment identifier returned by the payment provider",
        createView: { fieldMode: "hidden" }
      }
    }),
    providerCaptureId: (0, import_fields12.text)({
      label: "Provider Capture ID",
      ui: {
        description: "Capture identifier returned by the payment provider",
        createView: { fieldMode: "hidden" }
      }
    }),
    providerRefundId: (0, import_fields12.text)({
      label: "Provider Refund ID",
      ui: {
        description: "Refund identifier returned by the payment provider",
        createView: { fieldMode: "hidden" }
      }
    }),
    providerData: (0, import_fields12.json)({
      label: "Provider Data",
      defaultValue: {},
      ui: {
        description: "Raw provider payload for reconciliation and debugging",
        createView: { fieldMode: "hidden" }
      }
    }),
    stripePaymentIntentId: (0, import_fields12.text)({
      label: "Stripe Payment Intent ID",
      ui: {
        description: "Legacy Stripe payment intent ID for backwards compatibility",
        createView: { fieldMode: "hidden" }
      }
    }),
    stripeChargeId: (0, import_fields12.text)({
      label: "Stripe Charge ID",
      ui: {
        description: "Legacy Stripe charge ID",
        createView: { fieldMode: "hidden" }
      }
    }),
    stripeRefundId: (0, import_fields12.text)({
      label: "Stripe Refund ID",
      ui: {
        description: "Legacy Stripe refund ID for refund transactions",
        createView: { fieldMode: "hidden" }
      }
    }),
    // Card details (masked)
    cardBrand: (0, import_fields12.text)({
      label: "Card Brand",
      ui: {
        description: "Card brand (Visa, Mastercard, etc.)",
        itemView: { fieldMode: "read" }
      }
    }),
    cardLast4: (0, import_fields12.text)({
      label: "Card Last 4",
      ui: {
        description: "Last 4 digits of card number",
        itemView: { fieldMode: "read" }
      }
    }),
    cardExpMonth: (0, import_fields12.text)({
      label: "Card Exp Month",
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    cardExpYear: (0, import_fields12.text)({
      label: "Card Exp Year",
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    // Receipt/invoice info
    receiptEmail: (0, import_fields12.text)({
      label: "Receipt Email",
      ui: {
        description: "Email address for receipt"
      }
    }),
    receiptUrl: (0, import_fields12.text)({
      label: "Receipt URL",
      ui: {
        description: "URL to Stripe receipt",
        itemView: { fieldMode: "read" }
      }
    }),
    // Description/notes
    description: (0, import_fields12.text)({
      ui: {
        displayMode: "textarea",
        description: "Payment description or notes"
      },
      label: "Description"
    }),
    // Internal notes
    internalNotes: (0, import_fields12.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal staff notes"
      },
      label: "Internal Notes"
    }),
    // Failure reason
    failureReason: (0, import_fields12.text)({
      label: "Failure Reason",
      ui: {
        description: "Reason for payment failure",
        itemView: { fieldMode: "read" }
      }
    }),
    // Relationships
    booking: (0, import_fields12.relationship)({
      ref: "Booking.payments",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber"
      },
      label: "Booking"
    }),
    paymentProvider: (0, import_fields12.relationship)({
      ref: "PaymentProvider.bookingPayments",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Payment Provider"
    }),
    paymentSession: (0, import_fields12.relationship)({
      ref: "BookingPaymentSession",
      ui: {
        displayMode: "select",
        labelField: "id"
      },
      label: "Payment Session",
      db: {
        foreignKey: true
      }
    }),
    // Processed by (staff member)
    processedBy: (0, import_fields12.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Processed By"
    }),
    // Timestamps
    processedAt: (0, import_fields12.timestamp)({
      label: "Processed At",
      ui: {
        description: "When the payment was processed",
        itemView: { fieldMode: "read" }
      }
    }),
    refundedAt: (0, import_fields12.timestamp)({
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
var import_core11 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
var BookingPaymentSession = (0, import_core11.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments
    }
  },
  ui: {
    listView: {
      initialColumns: ["booking", "paymentProvider", "amount", "isSelected", "isInitiated", "createdAt"]
    }
  },
  fields: {
    isSelected: (0, import_fields13.checkbox)({
      defaultValue: false
    }),
    isInitiated: (0, import_fields13.checkbox)({
      defaultValue: false
    }),
    amount: (0, import_fields13.integer)({
      validation: { isRequired: true },
      label: "Amount (cents)"
    }),
    formattedAmount: (0, import_fields13.virtual)({
      field: import_core11.graphql.field({
        type: import_core11.graphql.String,
        resolve(item) {
          const amount = Number(item.amount || 0) / 100;
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
          }).format(amount);
        }
      })
    }),
    data: (0, import_fields13.json)({
      defaultValue: {}
    }),
    idempotencyKey: (0, import_fields13.text)({
      isIndexed: true
    }),
    booking: (0, import_fields13.relationship)({
      ref: "Booking.paymentSessions"
    }),
    paymentProvider: (0, import_fields13.relationship)({
      ref: "PaymentProvider.bookingPaymentSessions"
    }),
    paymentAuthorizedAt: (0, import_fields13.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/PaymentProvider.ts
var import_core12 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core12.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments
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
    name: (0, import_fields14.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields14.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores'
        }
      }
    }),
    isInstalled: (0, import_fields14.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields14.json)({
      defaultValue: {}
    }),
    metadata: (0, import_fields14.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields14.text)({ validation: { isRequired: true } }),
    capturePaymentFunction: (0, import_fields14.text)({ validation: { isRequired: true } }),
    refundPaymentFunction: (0, import_fields14.text)({ validation: { isRequired: true } }),
    getPaymentStatusFunction: (0, import_fields14.text)({ validation: { isRequired: true } }),
    generatePaymentLinkFunction: (0, import_fields14.text)({ validation: { isRequired: true } }),
    handleWebhookFunction: (0, import_fields14.text)({ validation: { isRequired: true } }),
    bookingPaymentSessions: (0, import_fields14.relationship)({
      ref: "BookingPaymentSession.paymentProvider",
      many: true
    }),
    bookingPayments: (0, import_fields14.relationship)({
      ref: "BookingPayment.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/ReservationLineItem.ts
var import_core13 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
var ReservationLineItem = (0, import_core13.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["reservation", "type", "description", "quantity", "totalPrice", "date"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Reservation relationship
    reservation: (0, import_fields15.relationship)({
      ref: "Booking",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber"
      },
      label: "Reservation"
    }),
    // Type of charge
    type: (0, import_fields15.select)({
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
    description: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        displayMode: "textarea",
        description: "Description of the charge or service"
      },
      label: "Description"
    }),
    // Quantity
    quantity: (0, import_fields15.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of units"
      }
    }),
    // Unit price (in cents)
    unitPrice: (0, import_fields15.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Unit Price (cents)",
      ui: {
        description: "Price per unit in cents"
      }
    }),
    // Total price (in cents)
    totalPrice: (0, import_fields15.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Total Price (cents)",
      ui: {
        description: "Total price (quantity \xD7 unit price) in cents"
      }
    }),
    // Date of charge
    date: (0, import_fields15.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Date",
      ui: {
        description: "When this charge was incurred"
      }
    }),
    // Posted by (staff member who added the charge)
    postedBy: (0, import_fields15.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member who posted this charge"
      },
      label: "Posted By"
    }),
    // Notes
    notes: (0, import_fields15.text)({
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
var import_core14 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var Guest = (0, import_core14.list)({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: permissions.canManageGuests,
      update: permissions.canManageGuests,
      delete: permissions.canManageBookings
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
    firstName: (0, import_fields16.text)({
      validation: { isRequired: true },
      label: "First Name"
    }),
    lastName: (0, import_fields16.text)({
      validation: { isRequired: true },
      label: "Last Name"
    }),
    email: (0, import_fields16.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      label: "Email",
      ui: {
        description: "Primary contact email"
      }
    }),
    phone: (0, import_fields16.text)({
      label: "Phone Number",
      ui: {
        description: "Primary contact phone number"
      }
    }),
    // Guest preferences
    preferences: (0, import_fields16.json)({
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
    loyaltyNumber: (0, import_fields16.text)({
      isIndexed: "unique",
      label: "Loyalty Number",
      ui: {
        description: "Guest loyalty program number"
      }
    }),
    loyaltyTier: (0, import_fields16.select)({
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
    loyaltyPoints: (0, import_fields16.text)({
      label: "Loyalty Points",
      ui: {
        description: "Current accumulated loyalty points"
      }
    }),
    // Communication preferences
    communicationPreferences: (0, import_fields16.json)({
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
    idType: (0, import_fields16.select)({
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
    idNumber: (0, import_fields16.text)({
      label: "ID Number",
      ui: {
        description: "Identification document number (encrypted)"
      }
    }),
    nationality: (0, import_fields16.text)({
      label: "Nationality",
      ui: {
        description: "Guest nationality/country"
      }
    }),
    // Address
    address1: (0, import_fields16.text)({
      label: "Address Line 1"
    }),
    address2: (0, import_fields16.text)({
      label: "Address Line 2"
    }),
    city: (0, import_fields16.text)({
      label: "City"
    }),
    state: (0, import_fields16.text)({
      label: "State/Province"
    }),
    postalCode: (0, import_fields16.text)({
      label: "Postal Code"
    }),
    country: (0, import_fields16.text)({
      label: "Country"
    }),
    // Company info (for business travelers)
    company: (0, import_fields16.text)({
      label: "Company",
      ui: {
        description: "Company name for business travelers"
      }
    }),
    // Notes and flags
    specialNotes: (0, import_fields16.text)({
      ui: {
        displayMode: "textarea",
        description: "Special notes about this guest"
      },
      label: "Special Notes"
    }),
    isVip: (0, import_fields16.checkbox)({
      defaultValue: false,
      label: "VIP Guest",
      ui: {
        description: "Mark as VIP for special treatment"
      }
    }),
    isBlacklisted: (0, import_fields16.checkbox)({
      defaultValue: false,
      label: "Blacklisted",
      ui: {
        description: "Guest is not allowed to book"
      }
    }),
    // Relationships
    bookings: (0, import_fields16.relationship)({
      ref: "Booking.guestProfile",
      many: true,
      ui: {
        displayMode: "count",
        description: "All bookings made by this guest"
      },
      label: "Bookings"
    }),
    // Linked user account (optional - for guests who create accounts)
    userAccount: (0, import_fields16.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "email",
        description: "Linked user account if guest has registered"
      },
      label: "User Account"
    }),
    // Tracking
    lastStayAt: (0, import_fields16.timestamp)({
      label: "Last Stay",
      ui: {
        description: "Date of last completed stay",
        itemView: { fieldMode: "read" }
      }
    }),
    totalStays: (0, import_fields16.text)({
      label: "Total Stays",
      ui: {
        description: "Number of completed stays",
        itemView: { fieldMode: "read" }
      }
    }),
    totalSpent: (0, import_fields16.text)({
      label: "Total Spent",
      ui: {
        description: "Total amount spent across all stays",
        itemView: { fieldMode: "read" }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/GuestDocument.ts
var import_core15 = require("@keystone-6/core");
var import_access14 = require("@keystone-6/core/access");
var import_fields17 = require("@keystone-6/core/fields");
var GuestDocument = (0, import_core15.list)({
  access: {
    operation: {
      ...(0, import_access14.allOperations)(permissions.canManageBookings),
      query: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["guest", "documentType", "documentNumber", "issuingCountry", "expiryDate", "verified"]
    },
    itemView: {
      defaultFieldMode: "edit"
    },
    labelField: "documentNumber"
  },
  fields: {
    // Guest relationship
    guest: (0, import_fields17.relationship)({
      ref: "Guest",
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      label: "Guest"
    }),
    // Document type
    documentType: (0, import_fields17.select)({
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
    documentNumber: (0, import_fields17.text)({
      validation: { isRequired: true },
      label: "Document Number",
      ui: {
        description: "ID/Passport number"
      }
    }),
    issuingCountry: (0, import_fields17.text)({
      label: "Issuing Country",
      ui: {
        description: "Country that issued the document"
      }
    }),
    expiryDate: (0, import_fields17.timestamp)({
      label: "Expiry Date",
      ui: {
        description: "When the document expires"
      }
    }),
    // Document images (S3 URLs)
    frontImage: (0, import_fields17.text)({
      label: "Front Image URL",
      ui: {
        description: "S3 URL to front image of document"
      }
    }),
    backImage: (0, import_fields17.text)({
      label: "Back Image URL",
      ui: {
        description: "S3 URL to back image of document"
      }
    }),
    // Verification
    verified: (0, import_fields17.checkbox)({
      defaultValue: false,
      label: "Verified",
      ui: {
        description: "Whether document has been verified"
      }
    }),
    verifiedAt: (0, import_fields17.timestamp)({
      label: "Verified At",
      ui: {
        description: "When the document was verified",
        itemView: { fieldMode: "read" }
      }
    }),
    verifiedBy: (0, import_fields17.relationship)({
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
var import_core16 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
var LoyaltyTransaction = (0, import_core16.list)({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: permissions.canManageGuests,
      update: permissions.canManageGuests,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["guest", "points", "type", "description", "createdAt"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Guest relationship
    guest: (0, import_fields18.relationship)({
      ref: "Guest",
      ui: {
        displayMode: "select",
        labelField: "email"
      },
      label: "Guest"
    }),
    // Booking relationship (optional - for earned points from stays)
    booking: (0, import_fields18.relationship)({
      ref: "Booking",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber",
        description: "Associated booking (if applicable)"
      },
      label: "Booking"
    }),
    // Points (can be positive or negative)
    points: (0, import_fields18.integer)({
      validation: { isRequired: true },
      label: "Points",
      ui: {
        description: "Points earned (positive) or redeemed/expired (negative)"
      }
    }),
    // Transaction type
    type: (0, import_fields18.select)({
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
    description: (0, import_fields18.text)({
      validation: { isRequired: true },
      ui: {
        displayMode: "textarea",
        description: "Description of why points were earned/redeemed"
      },
      label: "Description"
    }),
    // Created by (staff member who created transaction)
    createdBy: (0, import_fields18.relationship)({
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
var import_core17 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var RatePlan = (0, import_core17.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
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
    name: (0, import_fields19.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Rate Plan Name",
      ui: {
        description: "e.g., Standard Rate, Weekend Special, Corporate Rate"
      }
    }),
    description: (0, import_fields19.text)({
      ui: {
        displayMode: "textarea",
        description: "Description of this rate plan"
      },
      label: "Description"
    }),
    // Room type relationship
    roomType: (0, import_fields19.relationship)({
      ref: "RoomType.ratePlans",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Base rate
    baseRate: (0, import_fields19.float)({
      validation: { isRequired: true, min: 0 },
      label: "Base Rate",
      ui: {
        description: "Base nightly rate for this plan"
      }
    }),
    // Seasonal adjustments stored as JSON
    seasonalAdjustments: (0, import_fields19.json)({
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
    minimumStay: (0, import_fields19.integer)({
      validation: { min: 1 },
      defaultValue: 1,
      label: "Minimum Stay",
      ui: {
        description: "Minimum number of nights required"
      }
    }),
    maximumStay: (0, import_fields19.integer)({
      validation: { min: 1 },
      label: "Maximum Stay",
      ui: {
        description: "Maximum number of nights allowed (leave empty for no limit)"
      }
    }),
    // Booking window
    advanceBookingMin: (0, import_fields19.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Advance Booking Minimum (days)",
      ui: {
        description: "Minimum days in advance required to book"
      }
    }),
    advanceBookingMax: (0, import_fields19.integer)({
      validation: { min: 0 },
      label: "Advance Booking Maximum (days)",
      ui: {
        description: "Maximum days in advance allowed to book"
      }
    }),
    // Cancellation policy
    cancellationPolicy: (0, import_fields19.select)({
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
    mealPlan: (0, import_fields19.select)({
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
    validFrom: (0, import_fields19.timestamp)({
      label: "Valid From",
      ui: {
        description: "Start date for this rate plan"
      }
    }),
    validTo: (0, import_fields19.timestamp)({
      label: "Valid To",
      ui: {
        description: "End date for this rate plan"
      }
    }),
    // Day restrictions
    applicableDays: (0, import_fields19.json)({
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
    status: (0, import_fields19.select)({
      type: "string",
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
    isPublic: (0, import_fields19.checkbox)({
      defaultValue: true,
      label: "Public Rate",
      ui: {
        description: "Available to all guests"
      }
    }),
    isPromotional: (0, import_fields19.checkbox)({
      defaultValue: false,
      label: "Promotional Rate",
      ui: {
        description: "Mark as promotional/special offer"
      }
    }),
    // Promo code
    promoCode: (0, import_fields19.text)({
      label: "Promo Code",
      ui: {
        description: "Required promo code to access this rate (if applicable)"
      }
    }),
    // Priority for rate selection
    priority: (0, import_fields19.integer)({
      defaultValue: 0,
      label: "Priority",
      ui: {
        description: "Higher priority rates are shown first (0 = default)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/SeasonalRate.ts
var import_core18 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var SeasonalRate = (0, import_core18.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
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
    name: (0, import_fields20.text)({
      validation: { isRequired: true },
      label: "Name",
      ui: {
        description: "e.g., Christmas Week, New Years, Summer Festival"
      }
    }),
    // Date range
    startDate: (0, import_fields20.timestamp)({
      validation: { isRequired: true },
      label: "Start Date",
      ui: {
        description: "First date this rate applies"
      }
    }),
    endDate: (0, import_fields20.timestamp)({
      validation: { isRequired: true },
      label: "End Date",
      ui: {
        description: "Last date this rate applies"
      }
    }),
    // Optional room type filter (null = applies to all room types)
    roomType: (0, import_fields20.relationship)({
      ref: "RoomType",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Leave empty to apply to all room types"
      },
      label: "Room Type"
    }),
    // Price adjustment options (use one or the other)
    priceAdjustment: (0, import_fields20.integer)({
      label: "Price Adjustment (cents)",
      ui: {
        description: "Fixed amount to add/subtract from base price (can be positive or negative)"
      }
    }),
    priceMultiplier: (0, import_fields20.float)({
      validation: { min: 0 },
      label: "Price Multiplier",
      ui: {
        description: "Multiply base price by this factor (e.g., 1.25 for 25% increase, 0.85 for 15% discount)"
      }
    }),
    // Minimum stay requirement for this period
    minimumStay: (0, import_fields20.integer)({
      validation: { min: 1 },
      defaultValue: 1,
      label: "Minimum Stay",
      ui: {
        description: "Minimum number of nights required during this period"
      }
    }),
    // Priority for handling overlapping seasonal rates
    priority: (0, import_fields20.integer)({
      validation: { isRequired: true },
      defaultValue: 0,
      label: "Priority",
      ui: {
        description: "Higher priority wins when multiple seasonal rates overlap (0 = default)"
      }
    }),
    // Active status
    isActive: (0, import_fields20.checkbox)({
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
var import_core19 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var MaintenanceRequest = (0, import_core19.list)({
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
      initialColumns: ["room", "title", "category", "priority", "status", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Room relationship
    room: (0, import_fields21.relationship)({
      ref: "Room",
      ui: {
        displayMode: "select",
        labelField: "roomNumber"
      },
      label: "Room"
    }),
    // Issue details
    title: (0, import_fields21.text)({
      validation: { isRequired: true },
      label: "Title",
      ui: {
        description: "Brief description of the issue"
      }
    }),
    description: (0, import_fields21.text)({
      ui: {
        displayMode: "textarea",
        description: "Detailed description of the maintenance issue"
      },
      label: "Description"
    }),
    // Category
    category: (0, import_fields21.select)({
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
    priority: (0, import_fields21.select)({
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
    status: (0, import_fields21.select)({
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
    reportedBy: (0, import_fields21.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member or guest who reported the issue"
      },
      label: "Reported By"
    }),
    assignedTo: (0, import_fields21.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Maintenance staff member assigned to fix the issue"
      },
      label: "Assigned To"
    }),
    // Images
    images: (0, import_fields21.json)({
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
    scheduledFor: (0, import_fields21.timestamp)({
      label: "Scheduled For",
      ui: {
        description: "When the maintenance is scheduled"
      }
    }),
    completedAt: (0, import_fields21.timestamp)({
      label: "Completed At",
      ui: {
        description: "When the maintenance was completed",
        itemView: { fieldMode: "read" }
      }
    }),
    // Cost tracking
    cost: (0, import_fields21.integer)({
      validation: { min: 0 },
      label: "Cost",
      ui: {
        description: "Cost of maintenance in cents"
      }
    }),
    // Notes
    notes: (0, import_fields21.text)({
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
var import_core20 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var Channel = (0, import_core20.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "channelType", "isActive", "syncStatus", "lastSyncAt"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Channel name
    name: (0, import_fields22.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Channel Name",
      ui: {
        description: "e.g., Booking.com, Expedia, Airbnb"
      }
    }),
    // Channel type
    channelType: (0, import_fields22.select)({
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
    isActive: (0, import_fields22.checkbox)({
      defaultValue: true,
      label: "Active",
      ui: {
        description: "Whether this channel is currently active"
      }
    }),
    // API credentials (encrypted/secured)
    credentials: (0, import_fields22.json)({
      label: "Credentials",
      ui: {
        description: "API keys and authentication credentials (encrypted)",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "hidden" }
      },
      defaultValue: {}
    }),
    // Commission percentage
    commission: (0, import_fields22.float)({
      validation: { min: 0, max: 100 },
      defaultValue: 0,
      label: "Commission (%)",
      ui: {
        description: "Commission percentage charged by this channel"
      }
    }),
    // Sync settings
    syncInventory: (0, import_fields22.checkbox)({
      defaultValue: true,
      label: "Sync Inventory",
      ui: {
        description: "Automatically sync room inventory to this channel"
      }
    }),
    syncRates: (0, import_fields22.checkbox)({
      defaultValue: true,
      label: "Sync Rates",
      ui: {
        description: "Automatically sync room rates to this channel"
      }
    }),
    // Sync status tracking
    lastSyncAt: (0, import_fields22.timestamp)({
      label: "Last Sync At",
      ui: {
        description: "When data was last synced with this channel",
        itemView: { fieldMode: "read" }
      }
    }),
    syncStatus: (0, import_fields22.select)({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Error", value: "error" },
        { label: "Paused", value: "paused" }
      ],
      defaultValue: "active",
      label: "Sync Status",
      ui: {
        description: "Current synchronization status"
      }
    }),
    // Sync errors
    syncErrors: (0, import_fields22.json)({
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
    mappingRules: (0, import_fields22.json)({
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
    channelReservations: (0, import_fields22.relationship)({
      ref: "ChannelReservation.channel",
      many: true,
      ui: {
        displayMode: "count",
        description: "Reservations received from this channel"
      },
      label: "Channel Reservations"
    }),
    ...trackingFields
  }
});

// features/keystone/models/ChannelReservation.ts
var import_core21 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
var ChannelReservation = (0, import_core21.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["externalId", "channel", "guestName", "checkInDate", "checkOutDate", "channelStatus"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Channel relationship
    channel: (0, import_fields23.relationship)({
      ref: "Channel.channelReservations",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Channel"
    }),
    // External booking ID from the channel
    externalId: (0, import_fields23.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "External Booking ID",
      ui: {
        description: "Booking ID from the OTA/channel"
      }
    }),
    // Link to our internal Reservation
    reservation: (0, import_fields23.relationship)({
      ref: "Booking",
      ui: {
        displayMode: "select",
        labelField: "confirmationNumber",
        description: "Linked internal booking/reservation"
      },
      label: "Internal Reservation"
    }),
    // Room type (as provided by channel)
    roomType: (0, import_fields23.relationship)({
      ref: "RoomType",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Room Type"
    }),
    // Dates
    checkInDate: (0, import_fields23.timestamp)({
      validation: { isRequired: true },
      label: "Check-In Date",
      ui: {
        description: "Check-in date from channel"
      }
    }),
    checkOutDate: (0, import_fields23.timestamp)({
      validation: { isRequired: true },
      label: "Check-Out Date",
      ui: {
        description: "Check-out date from channel"
      }
    }),
    // Guest information (as provided by channel)
    guestName: (0, import_fields23.text)({
      validation: { isRequired: true },
      label: "Guest Name",
      ui: {
        description: "Guest name from channel"
      }
    }),
    guestEmail: (0, import_fields23.text)({
      label: "Guest Email",
      ui: {
        description: "Guest email from channel"
      }
    }),
    // Financial details
    totalAmount: (0, import_fields23.integer)({
      validation: { min: 0 },
      label: "Total Amount (cents)",
      ui: {
        description: "Total booking amount in cents"
      }
    }),
    commission: (0, import_fields23.integer)({
      validation: { min: 0 },
      label: "Commission (cents)",
      ui: {
        description: "Commission amount paid to channel in cents"
      }
    }),
    // Channel status (text from OTA)
    channelStatus: (0, import_fields23.text)({
      label: "Channel Status",
      ui: {
        description: "Booking status as reported by the channel"
      }
    }),
    // Raw data payload from channel
    rawData: (0, import_fields23.json)({
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
    lastSyncedAt: (0, import_fields23.timestamp)({
      label: "Last Synced At",
      ui: {
        description: "When this reservation was last synced with channel",
        itemView: { fieldMode: "read" }
      }
    }),
    syncErrors: (0, import_fields23.json)({
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
  },
  hooks: {
    afterOperation: async ({ operation, item, context }) => {
      if (operation === "create" || operation === "update") {
      }
    }
  }
});

// features/keystone/models/ChannelSyncEvent.ts
var import_core22 = require("@keystone-6/core");
var import_fields24 = require("@keystone-6/core/fields");
var ChannelSyncEvent = (0, import_core22.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["channel", "action", "status", "occurredAt", "createdBy"],
      initialSort: { field: "occurredAt", direction: "DESC" }
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    channel: (0, import_fields24.relationship)({
      ref: "Channel",
      ui: {
        displayMode: "select",
        labelField: "name"
      },
      label: "Channel"
    }),
    action: (0, import_fields24.select)({
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
    status: (0, import_fields24.select)({
      type: "string",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
        { label: "Processing", value: "processing" }
      ],
      defaultValue: "success",
      label: "Status"
    }),
    message: (0, import_fields24.text)({
      label: "Message",
      ui: {
        displayMode: "textarea"
      }
    }),
    payload: (0, import_fields24.json)({
      label: "Payload",
      ui: {
        description: "Payload captured during sync for troubleshooting",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      },
      defaultValue: {}
    }),
    errorMessage: (0, import_fields24.text)({
      label: "Error Message",
      ui: {
        displayMode: "textarea"
      }
    }),
    attempts: (0, import_fields24.integer)({
      defaultValue: 0,
      validation: { min: 0 },
      label: "Attempts"
    }),
    nextAttemptAt: (0, import_fields24.timestamp)({
      label: "Next Attempt At",
      ui: {
        description: "When the next retry should occur"
      }
    }),
    occurredAt: (0, import_fields24.timestamp)({
      defaultValue: { kind: "now" },
      label: "Occurred At"
    }),
    createdBy: (0, import_fields24.relationship)({
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
var import_core23 = require("@keystone-6/core");
var import_fields25 = require("@keystone-6/core/fields");
var DailyMetrics = (0, import_core23.list)({
  graphql: {
    plural: "DailyMetricsRecords"
  },
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings
    }
  },
  ui: {
    listView: {
      initialColumns: ["date", "occupancyRate", "totalRevenue", "averageDailyRate", "revenuePerAvailableRoom"]
    },
    itemView: {
      defaultFieldMode: "edit"
    }
  },
  fields: {
    // Date for these metrics
    date: (0, import_fields25.timestamp)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Date",
      ui: {
        description: "Date for this metrics snapshot"
      }
    }),
    // Room inventory metrics
    totalRooms: (0, import_fields25.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Total Rooms",
      ui: {
        description: "Total number of available rooms"
      }
    }),
    occupiedRooms: (0, import_fields25.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: "Occupied Rooms",
      ui: {
        description: "Number of rooms occupied"
      }
    }),
    // Occupancy rate (percentage)
    occupancyRate: (0, import_fields25.float)({
      validation: { min: 0, max: 100 },
      defaultValue: 0,
      label: "Occupancy Rate (%)",
      ui: {
        description: "Percentage of rooms occupied"
      }
    }),
    // ADR - Average Daily Rate (in cents)
    averageDailyRate: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "ADR (cents)",
      ui: {
        description: "Average Daily Rate in cents"
      }
    }),
    // RevPAR - Revenue Per Available Room (in cents)
    revenuePerAvailableRoom: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "RevPAR (cents)",
      ui: {
        description: "Revenue Per Available Room in cents"
      }
    }),
    // Total revenue (in cents)
    totalRevenue: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Total Revenue (cents)",
      ui: {
        description: "Total revenue for the day in cents"
      }
    }),
    // Revenue by channel
    channelRevenue: (0, import_fields25.json)({
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
    newReservations: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "New Reservations",
      ui: {
        description: "Number of new reservations created"
      }
    }),
    cancellations: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Cancellations",
      ui: {
        description: "Number of reservations cancelled"
      }
    }),
    checkIns: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Check-Ins",
      ui: {
        description: "Number of guest check-ins"
      }
    }),
    checkOuts: (0, import_fields25.integer)({
      validation: { min: 0 },
      defaultValue: 0,
      label: "Check-Outs",
      ui: {
        description: "Number of guest check-outs"
      }
    }),
    // Virtual field for formatted ADR
    formattedADR: (0, import_fields25.virtual)({
      field: import_core23.graphql.field({
        type: import_core23.graphql.String,
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
    formattedRevPAR: (0, import_fields25.virtual)({
      field: import_core23.graphql.field({
        type: import_core23.graphql.String,
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
    formattedRevenue: (0, import_fields25.virtual)({
      field: import_core23.graphql.field({
        type: import_core23.graphql.String,
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

// features/keystone/models/index.ts
var models = {
  User,
  Role,
  RoomType,
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
  DailyMetrics
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

// import("../../integrations/payment/**/*") in features/keystone/utils/paymentProviderAdapter.ts
var globImport_integrations_payment = __glob({
  "../../integrations/payment/index.ts": () => Promise.resolve().then(() => (init_payment(), payment_exports)),
  "../../integrations/payment/manual.ts": () => Promise.resolve().then(() => (init_manual(), manual_exports)),
  "../../integrations/payment/paypal.ts": () => Promise.resolve().then(() => (init_paypal(), paypal_exports)),
  "../../integrations/payment/stripe.ts": () => Promise.resolve().then(() => (init_stripe(), stripe_exports))
});

// features/keystone/utils/paymentProviderAdapter.ts
async function executeAdapterFunction({ provider, functionName, args }) {
  const functionPath = provider?.[functionName];
  if (!functionPath) {
    throw new Error(`Provider ${provider?.code || provider?.id || "unknown"} is missing ${functionName}`);
  }
  if (functionPath.startsWith("http")) {
    const response = await fetch(functionPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...args })
    });
    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }
    return response.json();
  }
  const adapter = await globImport_integrations_payment(`../../integrations/payment/${functionPath}`);
  const fn = adapter[functionName];
  if (!fn) {
    throw new Error(`Function ${functionName} not found in adapter ${functionPath}`);
  }
  try {
    return await fn({ provider, ...args });
  } catch (error) {
    throw new Error(`Error executing ${functionName} for provider ${functionPath}: ${error?.message || "Unknown error"}`);
  }
}
async function createPayment({ provider, cart, amount, currency, metadata }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, amount, currency, metadata }
  });
}
async function capturePayment({ provider, paymentId, amount }) {
  return executeAdapterFunction({
    provider,
    functionName: "capturePaymentFunction",
    args: { paymentId, amount }
  });
}
async function refundPayment({ provider, paymentId, amount, currency, metadata }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency, metadata }
  });
}
async function handleWebhook({ provider, event, headers }) {
  return executeAdapterFunction({
    provider,
    functionName: "handleWebhookFunction",
    args: { event, headers }
  });
}

// features/keystone/utils/ensureDefaultPaymentProviders.ts
async function ensureProvider(context, code, data) {
  const existing = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: code } },
    query: `
      id
      name
      code
      isInstalled
      metadata
      credentials
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
    `,
    take: 1
  });
  if (existing[0]) {
    return existing[0];
  }
  return await context.sudo().query.PaymentProvider.createOne({
    data,
    query: `
      id
      name
      code
      isInstalled
      metadata
      credentials
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
    `
  });
}
async function ensureDefaultPaymentProviders(context) {
  const providers = [];
  providers.push(
    await ensureProvider(context, "pp_manual_manual", {
      name: "Manual Payments",
      code: "pp_manual_manual",
      isInstalled: true,
      metadata: {
        provider: "manual",
        displayName: "Pay at property"
      },
      credentials: {},
      createPaymentFunction: "manual",
      capturePaymentFunction: "manual",
      refundPaymentFunction: "manual",
      getPaymentStatusFunction: "manual",
      generatePaymentLinkFunction: "manual",
      handleWebhookFunction: "manual"
    })
  );
  if (process.env.STRIPE_SECRET_KEY) {
    providers.push(
      await ensureProvider(context, "pp_stripe_stripe", {
        name: "Stripe",
        code: "pp_stripe_stripe",
        isInstalled: true,
        metadata: {
          provider: "stripe",
          displayName: "Credit / debit card",
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null
        },
        credentials: {},
        createPaymentFunction: "stripe",
        capturePaymentFunction: "stripe",
        refundPaymentFunction: "stripe",
        getPaymentStatusFunction: "stripe",
        generatePaymentLinkFunction: "stripe",
        handleWebhookFunction: "stripe"
      })
    );
  }
  if (process.env.PAYPAL_CLIENT_SECRET && process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) {
    providers.push(
      await ensureProvider(context, "pp_paypal_paypal", {
        name: "PayPal",
        code: "pp_paypal_paypal",
        isInstalled: true,
        metadata: {
          provider: "paypal",
          displayName: "PayPal",
          clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
          sandbox: process.env.NEXT_PUBLIC_PAYPAL_SANDBOX !== "false"
        },
        credentials: {},
        createPaymentFunction: "paypal",
        capturePaymentFunction: "paypal",
        refundPaymentFunction: "paypal",
        getPaymentStatusFunction: "paypal",
        generatePaymentLinkFunction: "paypal",
        handleWebhookFunction: "paypal"
      })
    );
  }
  return providers;
}

// features/keystone/mutations/cancelBooking.ts
async function cancelBooking(root, { bookingId, refundAmount, refundReason }, context) {
  await ensureDefaultPaymentProviders(context);
  const booking = await context.db.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      confirmationNumber
      status
      paymentStatus
      totalAmount
      payments {
        id
        status
        paymentMethod
        amount
        currency
        providerPaymentId
        providerCaptureId
        providerRefundId
        stripePaymentIntentId
        paymentProvider {
          id
          code
          name
          createPaymentFunction
          capturePaymentFunction
          refundPaymentFunction
          getPaymentStatusFunction
          generatePaymentLinkFunction
          handleWebhookFunction
          metadata
          credentials
        }
      }
    `
  });
  if (!booking) {
    throw new Error("Booking not found.");
  }
  if (booking.status === "cancelled") {
    return booking;
  }
  const shouldRefund = booking.paymentStatus === "paid" || booking.paymentStatus === "partial";
  let refundValue = 0;
  if (shouldRefund) {
    const paymentToRefund = booking.payments?.find(
      (payment) => !!payment?.providerPaymentId || !!payment?.providerCaptureId || !!payment?.stripePaymentIntentId
    );
    if (!paymentToRefund?.paymentProvider) {
      throw new Error("No payment provider found for this booking payment.");
    }
    const providerPaymentId = paymentToRefund.providerCaptureId || paymentToRefund.providerPaymentId || paymentToRefund.stripePaymentIntentId;
    if (!providerPaymentId) {
      throw new Error("No provider payment identifier found for this booking.");
    }
    const rawRefundAmount = typeof refundAmount === "number" && Number.isFinite(refundAmount) ? refundAmount : booking.totalAmount;
    if (!rawRefundAmount || rawRefundAmount <= 0) {
      throw new Error("Invalid refund amount.");
    }
    refundValue = Math.min(rawRefundAmount, booking.totalAmount || rawRefundAmount);
    const refundResult = await refundPayment({
      provider: paymentToRefund.paymentProvider,
      paymentId: providerPaymentId,
      amount: Math.round(refundValue * 100),
      currency: paymentToRefund.currency || "USD",
      metadata: {
        bookingId,
        reason: refundReason || "Booking cancelled"
      }
    });
    await context.db.BookingPayment.createOne({
      data: {
        booking: { connect: { id: bookingId } },
        paymentProvider: { connect: { id: paymentToRefund.paymentProvider.id } },
        amount: -refundValue,
        currency: paymentToRefund.currency || "USD",
        paymentType: "refund",
        paymentMethod: paymentToRefund.paymentMethod || "credit_card",
        status: "refunded",
        providerPaymentId,
        providerRefundId: refundResult?.data?.id || refundResult?.data?.refund_id || null,
        providerData: refundResult?.data || {},
        stripePaymentIntentId: paymentToRefund.stripePaymentIntentId,
        stripeRefundId: paymentToRefund.paymentProvider.code === "pp_stripe_stripe" ? refundResult?.data?.id || null : null,
        description: `Refund for booking ${booking.confirmationNumber}`
      }
    });
    await context.db.BookingPayment.updateMany({
      where: {
        booking: { id: { equals: bookingId } },
        status: { equals: "completed" }
      },
      data: { status: "refunded" }
    });
  }
  const updatedBooking = await context.db.Booking.updateOne({
    where: { id: bookingId },
    data: {
      status: "cancelled",
      paymentStatus: shouldRefund ? "refunded" : booking.paymentStatus,
      balanceDue: 0
    },
    query: `id status paymentStatus totalAmount cancelledAt`
  });
  return updatedBooking;
}

// features/keystone/lib/channelSync.ts
var import_crypto = __toESM(require("crypto"));

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "http://localhost:3001";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
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
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.SMTP_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}
function bookingConfirmationEmail(data) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const primaryColor = "#0066cc";
  const borderColor = "#e0e0e0";
  const checkInDate = new Date(data.checkInDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const checkOutDate = new Date(data.checkOutDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `
    <body style="background: ${backgroundColor}; font-family: Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${backgroundColor};">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 2px solid ${primaryColor};">
                  <h1 style="margin: 0; color: ${primaryColor}; font-size: 28px;">Grand Hotel</h1>
                  <p style="margin: 10px 0 0 0; color: ${textColor}; font-size: 16px;">Booking Confirmation</p>
                </td>
              </tr>

              <!-- Confirmation Number -->
              <tr>
                <td style="padding: 30px 40px; text-align: center; background: #f8f9fa; border-bottom: 1px solid ${borderColor};">
                  <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">Confirmation Number</p>
                  <h2 style="margin: 0; color: ${primaryColor}; font-size: 32px; font-weight: bold;">${data.confirmationNumber}</h2>
                </td>
              </tr>

              <!-- Guest Info -->
              <tr>
                <td style="padding: 30px 40px;">
                  <p style="margin: 0 0 20px 0; color: ${textColor}; font-size: 16px;">Dear ${data.guestName},</p>
                  <p style="margin: 0 0 20px 0; color: ${textColor}; font-size: 16px; line-height: 1.6;">
                    Thank you for choosing Grand Hotel! Your reservation has been confirmed. We look forward to welcoming you.
                  </p>
                </td>
              </tr>

              <!-- Booking Details -->
              <tr>
                <td style="padding: 0 40px 30px 40px;">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid ${borderColor}; border-radius: 5px;">
                    <tr>
                      <td style="padding: 15px; border-bottom: 1px solid ${borderColor}; background: #f8f9fa;">
                        <strong style="color: ${textColor};">Booking Details</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 15px;">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Room Type:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: bold;">${data.roomTypeName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Check-in:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${checkInDate}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Check-out:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${checkOutDate}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Nights:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${data.numberOfNights}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Guests:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${data.numberOfGuests}</td>
                          </tr>
                          ${data.specialRequests ? `
                          <tr>
                            <td colspan="2" style="padding: 8px 0; color: #666; font-size: 14px; border-top: 1px solid ${borderColor};">
                              <strong>Special Requests:</strong><br/>
                              ${data.specialRequests}
                            </td>
                          </tr>
                          ` : ""}
                          <tr>
                            <td style="padding: 15px 0 0 0; color: ${textColor}; font-size: 16px; font-weight: bold; border-top: 2px solid ${borderColor};">Total Amount:</td>
                            <td align="right" style="padding: 15px 0 0 0; color: ${primaryColor}; font-size: 20px; font-weight: bold; border-top: 2px solid ${borderColor};">$${data.totalAmount.toFixed(2)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- View Booking Button -->
              <tr>
                <td align="center" style="padding: 0 40px 30px 40px;">
                  <table border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="border-radius: 5px; background: ${primaryColor};">
                        <a href="${getBaseUrlForEmails()}/booking/confirmation/${data.confirmationNumber}"
                           target="_blank"
                           style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 5px; padding: 12px 30px; border: 1px solid ${primaryColor}; display: inline-block; font-weight: bold;">
                          View Booking Details
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer Info -->
              <tr>
                <td style="padding: 30px 40px; border-top: 1px solid ${borderColor}; background: #f8f9fa;">
                  <p style="margin: 0 0 10px 0; color: ${textColor}; font-size: 14px; line-height: 1.6;">
                    <strong>Check-in time:</strong> 3:00 PM<br/>
                    <strong>Check-out time:</strong> 11:00 AM
                  </p>
                  <p style="margin: 15px 0 0 0; color: #666; font-size: 13px; line-height: 1.6;">
                    If you have any questions or need to modify your reservation, please contact us at
                    <a href="mailto:reservations@grandhotel.com" style="color: ${primaryColor};">reservations@grandhotel.com</a>
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="padding: 20px 40px; color: #999; font-size: 12px;">
                  <p style="margin: 0;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Grand Hotel. All rights reserved.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendBookingConfirmationEmail(data) {
  try {
    const info = await transport.sendMail({
      to: data.guestEmail,
      from: process.env.SMTP_FROM || "noreply@grandhotel.com",
      subject: `Booking Confirmation - ${data.confirmationNumber} - Grand Hotel`,
      html: bookingConfirmationEmail(data)
    });
    if (process.env.SMTP_USER?.includes("ethereal.email")) {
      console.log(`\u{1F4E7} Booking Confirmation Email Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
    } else {
      console.log(`\u{1F4E7} Booking Confirmation Email sent to ${data.guestEmail}`);
    }
  } catch (error) {
    console.error("Error sending booking confirmation email:", error);
  }
}
function reservationUpdateEmail(data, subject, message) {
  const textColor = "#444444";
  const borderColor = "#e0e0e0";
  const checkInDate = new Date(data.checkInDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const checkOutDate = new Date(data.checkOutDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `
    <body style="font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto;">
        <tr>
          <td style="padding: 20px 0; border-bottom: 2px solid ${borderColor};">
            <h2 style="margin: 0;">${subject}</h2>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 0;">
            <p style="margin: 0 0 10px 0;">Hi ${data.guestName},</p>
            <p style="margin: 0 0 15px 0;">${message}</p>
            <p style="margin: 0 0 10px 0;"><strong>Confirmation:</strong> ${data.confirmationNumber}</p>
            <p style="margin: 0 0 10px 0;"><strong>Room Type:</strong> ${data.roomTypeName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Check-in:</strong> ${checkInDate}</p>
            <p style="margin: 0 0 10px 0;"><strong>Check-out:</strong> ${checkOutDate}</p>
            <p style="margin: 0 0 10px 0;"><strong>Nights:</strong> ${data.numberOfNights}</p>
            <p style="margin: 0 0 10px 0;"><strong>Guests:</strong> ${data.numberOfGuests}</p>
            <p style="margin: 0 0 10px 0;"><strong>Total Amount:</strong> $${data.totalAmount.toFixed(2)}</p>
            ${data.specialRequests ? `<p style="margin: 0 0 10px 0;"><strong>Special Requests:</strong> ${data.specialRequests}</p>` : ""}
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendReservationCancellationEmail(data) {
  try {
    await transport.sendMail({
      to: data.guestEmail,
      from: process.env.SMTP_FROM || "noreply@grandhotel.com",
      subject: `Reservation Cancelled - ${data.confirmationNumber}`,
      html: reservationUpdateEmail(
        data,
        "Reservation Cancelled",
        "Your reservation has been cancelled. If this was unexpected, please contact us."
      )
    });
  } catch (error) {
    console.error("Error sending reservation cancellation email:", error);
  }
}
async function sendReservationModificationEmail(data) {
  try {
    await transport.sendMail({
      to: data.guestEmail,
      from: process.env.SMTP_FROM || "noreply@grandhotel.com",
      subject: `Reservation Updated - ${data.confirmationNumber}`,
      html: reservationUpdateEmail(
        data,
        "Reservation Updated",
        "Your reservation details have been updated. Please review the new details below."
      )
    });
  } catch (error) {
    console.error("Error sending reservation update email:", error);
  }
}

// features/keystone/lib/channelSync.ts
var DEFAULT_RETRY_DELAY_MS = 2 * 60 * 1e3;
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
    return void 0;
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
  const record = await context.sudo().query.RoomInventory.createOne({
    data: {
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
      await context.sudo().query.RoomInventory.updateOne({
        where: { id: record.id },
        data: {
          bookedRooms: nextBookedRooms
        }
      });
    }
  }
}
async function sendReservationEmail(payload, booking, type) {
  if (!payload.guestEmail || !booking) {
    return;
  }
  const data = {
    confirmationNumber: booking.confirmationNumber,
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    checkInDate: payload.checkInDate,
    checkOutDate: payload.checkOutDate,
    numberOfNights: booking.numberOfNights || 0,
    roomTypeName: payload.roomTypeName || booking.roomType?.name || "Room",
    totalAmount: booking.totalAmount || 0,
    numberOfGuests: payload.numberOfGuests || booking.numberOfGuests || 1,
    specialRequests: payload.specialRequests
  };
  if (type === "new") {
    await sendBookingConfirmationEmail(data);
  } else if (type === "cancel") {
    await sendReservationCancellationEmail(data);
  } else {
    await sendReservationModificationEmail(data);
  }
}
async function upsertChannelReservation(context, channel, payload, eventType) {
  if (!payload.externalId) {
    throw new Error("Channel reservation payload missing externalId");
  }
  const existing = await context.sudo().query.ChannelReservation.findMany({
    where: {
      externalId: { equals: payload.externalId },
      channel: { id: { equals: channel.id } }
    },
    query: "id checkInDate checkOutDate roomType { id name } reservation { id confirmationNumber numberOfGuests totalAmount numberOfNights roomType { id name } }",
    take: 1
  });
  const reservation = existing[0];
  const roomTypeId = await resolveRoomTypeId(context, channel, payload);
  const roomCount = payload.roomCount && payload.roomCount > 0 ? payload.roomCount : 1;
  if (!reservation) {
    const booking = await context.sudo().query.Booking.createOne({
      data: {
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        numberOfGuests: payload.numberOfGuests || 1,
        status: "confirmed",
        source: "ota",
        totalAmount: payload.totalAmount || 0,
        balanceDue: payload.totalAmount || 0,
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : void 0
      },
      query: "id confirmationNumber numberOfGuests totalAmount numberOfNights roomType { id name }"
    });
    await context.sudo().query.ChannelReservation.createOne({
      data: {
        channel: { connect: { id: channel.id } },
        externalId: payload.externalId,
        reservation: { connect: { id: booking.id } },
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : void 0,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
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
    await sendReservationEmail(payload, booking, "new");
    return { action: "created", booking };
  }
  if (eventType === "cancel") {
    if (reservation.roomType?.id) {
      await adjustBookedRooms(context, reservation.roomType.id, reservation.checkInDate, reservation.checkOutDate, -roomCount);
    }
    if (reservation.reservation?.id) {
      await context.sudo().query.Booking.updateOne({
        where: { id: reservation.reservation.id },
        data: { status: "cancelled" }
      });
    }
    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        channelStatus: "cancelled",
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
        syncErrors: []
      }
    });
    await sendReservationEmail(payload, reservation.reservation, "cancel");
    return { action: "cancelled", booking: reservation.reservation };
  }
  if (eventType === "modify") {
    if (reservation.roomType?.id) {
      await adjustBookedRooms(context, reservation.roomType.id, reservation.checkInDate, reservation.checkOutDate, -roomCount);
    }
    if (roomTypeId) {
      await adjustBookedRooms(context, roomTypeId, payload.checkInDate, payload.checkOutDate, roomCount);
    }
    const bookingUpdate = {
      guestName: payload.guestName,
      guestEmail: payload.guestEmail,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      numberOfGuests: payload.numberOfGuests || 1,
      totalAmount: payload.totalAmount || 0,
      balanceDue: payload.totalAmount || 0
    };
    if (roomTypeId) {
      bookingUpdate.roomType = { connect: { id: roomTypeId } };
    }
    const updatedBooking = reservation.reservation?.id ? await context.sudo().query.Booking.updateOne({
      where: { id: reservation.reservation.id },
      data: bookingUpdate,
      query: "id confirmationNumber numberOfGuests totalAmount numberOfNights roomType { id name }"
    }) : null;
    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : void 0,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: toCents(payload.totalAmount),
        commission: toCents(payload.commission),
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    if (updatedBooking) {
      await sendReservationEmail(payload, updatedBooking, "modify");
    }
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
  if (normalized.includes("modify") || normalized.includes("update")) return "modify";
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
function resolveInventoryEndpoint(channel) {
  const credentials = channel?.credentials || {};
  if (credentials.inventoryEndpoint) return credentials.inventoryEndpoint;
  if (credentials.syncEndpoint) return credentials.syncEndpoint;
  if (credentials.apiBaseUrl) return `${credentials.apiBaseUrl}/inventory/sync`;
  return null;
}
function resolveReservationEndpoint(channel) {
  const credentials = channel?.credentials || {};
  if (credentials.reservationEndpoint) return credentials.reservationEndpoint;
  if (credentials.pullReservationsEndpoint) return credentials.pullReservationsEndpoint;
  if (credentials.apiBaseUrl) return `${credentials.apiBaseUrl}/reservations/pull`;
  return null;
}
async function pushInventoryToChannel(context, channelId, dateRange) {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: "id name isActive syncStatus credentials mappingRules"
  });
  if (!channel) {
    throw new Error("Channel not found");
  }
  if (!channel.isActive) {
    return {
      channelId: channel.id,
      status: "failed",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { message: "Channel is inactive" }
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
    const endpoint2 = resolveInventoryEndpoint(channel);
    if (endpoint2) {
      await postToChannel(endpoint2, payload, {
        "X-OpenFront-Channel": channel.id
      });
    }
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
  if (!channel.isActive) {
    return {
      channelId: channel.id,
      status: "failed",
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      details: { message: "Channel is inactive" }
    };
  }
  const endpoint2 = resolveReservationEndpoint(channel);
  const payload = {
    channelId: channel.id,
    channelName: channel.name
  };
  try {
    const reservationsResponse = endpoint2 ? await postToChannel(endpoint2, payload, {
      "X-OpenFront-Channel": channel.id
    }) : { reservations: [] };
    const reservations = Array.isArray(reservationsResponse?.reservations) ? reservationsResponse.reservations : [];
    for (const reservation of reservations) {
      const mapped = mapReservationPayload(reservation);
      const eventType = resolveEventType(mapped.status);
      await upsertChannelReservation(context, channel, mapped, eventType);
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
    }
  }
}

// features/keystone/mutations/pushInventoryToChannel.ts
async function pushInventoryToChannelMutation(root, { channelId, dateRange }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to sync channel inventory");
  }
  return pushInventoryToChannel(context, channelId, dateRange || void 0);
}

// features/keystone/mutations/pullReservationsFromChannel.ts
async function pullReservationsFromChannelMutation(root, { channelId }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to sync channel reservations");
  }
  return pullReservationsFromChannel(context, channelId);
}

// features/keystone/mutations/initiateBookingPaymentSession.ts
function normalizeCurrency(currency) {
  return (currency || "USD").toUpperCase();
}
function normalizeAmountToCents(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    throw new Error("Invalid booking amount");
  }
  if (Math.abs(amount) < 1e3) {
    return Math.round(amount * 100);
  }
  return Math.round(amount);
}
async function initiateBookingPaymentSession(root, {
  bookingId,
  paymentProviderCode,
  amount,
  currency,
  returnUrl,
  cancelUrl
}, context) {
  const sudoContext = context.sudo();
  await ensureDefaultPaymentProviders(context);
  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: `
      id
      confirmationNumber
      guestName
      guestEmail
      totalAmount
      balanceDue
      payments {
        id
        amount
        status
      }
      paymentSessions {
        id
        isSelected
        isInitiated
        paymentProvider {
          id
          code
        }
        data
      }
    `
  });
  if (!booking) {
    throw new Error("Booking not found");
  }
  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderCode },
    query: `
      id
      code
      name
      isInstalled
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
      metadata
      credentials
    `
  });
  if (!provider || !provider.isInstalled) {
    throw new Error("Payment provider not found or not installed");
  }
  const amountInCents = normalizeAmountToCents(
    typeof amount === "number" ? amount : booking.balanceDue || booking.totalAmount || 0
  );
  const resolvedCurrency = normalizeCurrency(currency);
  const existingSession = booking.paymentSessions?.find(
    (session) => session.paymentProvider?.code === paymentProviderCode && !session.isInitiated
  );
  if (existingSession) {
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
    currency: resolvedCurrency,
    metadata: {
      bookingId: booking.id,
      confirmationNumber: booking.confirmationNumber,
      guestEmail: booking.guestEmail,
      returnUrl,
      cancelUrl
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
  return await sudoContext.query.BookingPaymentSession.createOne({
    data: {
      booking: { connect: { id: booking.id } },
      paymentProvider: { connect: { id: provider.id } },
      amount: amountInCents,
      isSelected: true,
      isInitiated: false,
      data: sessionData,
      idempotencyKey: `${booking.id}:${provider.code}:${amountInCents}`
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
}
var initiateBookingPaymentSession_default = initiateBookingPaymentSession;

// features/keystone/mutations/completeBookingPayment.ts
function toMajorUnit(amountInCents) {
  return amountInCents / 100;
}
function mapCapturedStatus(status) {
  if (!status) return "completed";
  if (status === "succeeded" || status === "captured" || status === "COMPLETED") return "completed";
  if (status === "processing" || status === "requires_capture" || status === "APPROVED") return "processing";
  if (status === "failed" || status === "canceled" || status === "cancelled" || status === "DENIED") return "failed";
  return "completed";
}
async function completeBookingPayment(root, {
  bookingId,
  paymentSessionId,
  providerPaymentId
}, context) {
  const sudoContext = context.sudo();
  await ensureDefaultPaymentProviders(context);
  const session = await sudoContext.query.BookingPaymentSession.findOne({
    where: { id: paymentSessionId },
    query: `
      id
      amount
      isInitiated
      data
      booking {
        id
        confirmationNumber
        totalAmount
        balanceDue
        paymentStatus
      }
      paymentProvider {
        id
        code
        name
        createPaymentFunction
        capturePaymentFunction
        refundPaymentFunction
        getPaymentStatusFunction
        generatePaymentLinkFunction
        handleWebhookFunction
        metadata
        credentials
      }
    `
  });
  if (!session || !session.booking || session.booking.id !== bookingId) {
    throw new Error("Payment session not found for booking");
  }
  const provider = session.paymentProvider;
  if (!provider) {
    throw new Error("Payment provider missing from session");
  }
  const paymentIdentifier = providerPaymentId || session.data?.paymentIntentId || session.data?.orderId || session.data?.id;
  if (!paymentIdentifier && provider.code !== "pp_manual_manual") {
    throw new Error("Provider payment identifier is required to complete payment");
  }
  const captureResult = await capturePayment({
    provider,
    paymentId: paymentIdentifier,
    amount: session.amount
  });
  const normalizedStatus = mapCapturedStatus(captureResult?.status);
  const amountInCents = typeof captureResult?.amount === "number" ? Math.round(captureResult.amount) : session.amount;
  const bookingPayment = await sudoContext.query.BookingPayment.createOne({
    data: {
      booking: { connect: { id: bookingId } },
      paymentProvider: { connect: { id: provider.id } },
      paymentSession: { connect: { id: session.id } },
      amount: toMajorUnit(amountInCents),
      currency: "USD",
      paymentType: "full_payment",
      paymentMethod: provider.code === "pp_paypal_paypal" ? "paypal" : provider.code === "pp_manual_manual" ? "other" : "credit_card",
      status: normalizedStatus,
      providerPaymentId: paymentIdentifier || null,
      providerCaptureId: captureResult?.data?.purchase_units?.[0]?.payments?.captures?.[0]?.id || captureResult?.data?.id || null,
      providerData: captureResult?.data || {},
      stripePaymentIntentId: provider.code === "pp_stripe_stripe" ? paymentIdentifier || null : null,
      description: `Payment for booking ${session.booking.confirmationNumber}`,
      receiptEmail: session.booking?.guestEmail
    },
    query: `
      id
      status
      amount
      providerPaymentId
      stripePaymentIntentId
      paymentProvider {
        id
        code
        name
      }
    `
  });
  await sudoContext.query.BookingPaymentSession.updateOne({
    where: { id: session.id },
    data: {
      isInitiated: true,
      paymentAuthorizedAt: (/* @__PURE__ */ new Date()).toISOString(),
      data: {
        ...session.data || {},
        completionResult: captureResult?.data || {}
      }
    }
  });
  const booking = await sudoContext.query.Booking.findOne({
    where: { id: bookingId },
    query: "id totalAmount balanceDue payments { id amount status paymentType }"
  });
  const completedPayments = (booking?.payments || []).filter((payment) => payment.status === "completed");
  const paidAmount = completedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalAmount = Number(booking?.totalAmount || 0);
  const remainingBalance = Math.max(0, totalAmount - paidAmount);
  await sudoContext.query.Booking.updateOne({
    where: { id: bookingId },
    data: {
      paymentStatus: remainingBalance <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid",
      balanceDue: remainingBalance,
      status: remainingBalance <= 0 ? "confirmed" : void 0,
      confirmedAt: remainingBalance <= 0 ? (/* @__PURE__ */ new Date()).toISOString() : void 0
    }
  });
  return bookingPayment;
}
var completeBookingPayment_default = completeBookingPayment;

// features/keystone/mutations/handleBookingPaymentProviderWebhook.ts
async function handleBookingPaymentProviderWebhook(root, {
  providerCode,
  event,
  headers
}, context) {
  const sudoContext = context.sudo();
  await ensureDefaultPaymentProviders(context);
  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: providerCode },
    query: `
      id
      code
      isInstalled
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
      metadata
      credentials
    `
  });
  if (!provider || !provider.isInstalled) {
    throw new Error("Payment provider not found or not installed");
  }
  const result = await handleWebhook({ provider, event, headers });
  return {
    success: true,
    providerCode,
    type: result.type
  };
}
var handleBookingPaymentProviderWebhook_default = handleBookingPaymentProviderWebhook;

// features/keystone/mutations/createStorefrontBooking.ts
async function createStorefrontBooking(root, { data }, context) {
  const sudoContext = context.sudo();
  const booking = await sudoContext.query.Booking.createOne({
    data,
    query: `
      id
      confirmationNumber
      guestName
      guestEmail
      guestPhone
      checkInDate
      checkOutDate
      numberOfGuests
      totalAmount
      balanceDue
      status
      paymentStatus
      createdAt
    `
  });
  return booking;
}
var createStorefrontBooking_default = createStorefrontBooking;

// features/keystone/mutations/updateBookingStatus.ts
async function updateBookingStatus(root, { bookingId, status }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to update booking status");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const data = { status };
  if (status === "confirmed") data.confirmedAt = now;
  if (status === "checked_in") data.checkedInAt = now;
  if (status === "checked_out") data.checkedOutAt = now;
  if (status === "cancelled") data.cancelledAt = now;
  return context.sudo().query.Booking.updateOne({
    where: { id: bookingId },
    data,
    query: `
      id
      status
      confirmedAt
      checkedInAt
      checkedOutAt
      cancelledAt
    `
  });
}
var updateBookingStatus_default = updateBookingStatus;

// features/keystone/queries/bookingPaymentProviders.ts
async function bookingPaymentProviders(root, args, context) {
  await ensureDefaultPaymentProviders(context);
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { isInstalled: { equals: true } },
    query: `
      id
      name
      code
      metadata
    `
  });
  return providers;
}
var bookingPaymentProviders_default = bookingPaymentProviders;

// features/keystone/queries/activeBookingPaymentSession.ts
async function activeBookingPaymentSession(root, { bookingId }, context) {
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

// features/keystone/mutations/index.ts
var graphql5 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql5`
      type BookingCheckoutPaymentProvider {
        id: ID!
        name: String!
        code: String!
        metadata: JSON
      }

      type BookingCheckoutPaymentSession {
        id: ID!
        amount: Int!
        isSelected: Boolean!
        isInitiated: Boolean!
        data: JSON
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
      }

      type Query {
        redirectToInit: Boolean
        bookingPaymentProviders: [BookingCheckoutPaymentProvider!]!
        activeBookingPaymentSession(bookingId: ID!): ActiveBookingPaymentSession
      }

      input ChannelSyncDateRangeInput {
        startDate: DateTime
        endDate: DateTime
      }

      type ChannelSyncResult {
        channelId: ID!
        status: String!
        syncedAt: DateTime!
        details: JSON
      }

      type BookingPaymentWebhookResult {
        success: Boolean!
        providerCode: String!
        type: String!
      }

      type Mutation {
        cancelBooking(bookingId: ID!, refundAmount: Float, refundReason: String): Booking
        pushInventoryToChannel(channelId: ID!, dateRange: ChannelSyncDateRangeInput): ChannelSyncResult
        pullReservationsFromChannel(channelId: ID!): ChannelSyncResult
        createStorefrontBooking(data: BookingCreateInput!): Booking
        updateBookingStatus(bookingId: ID!, status: String!): Booking
        initiateBookingPaymentSession(
          bookingId: ID!
          paymentProviderCode: String!
          amount: Float
          currency: String
          returnUrl: String
          cancelUrl: String
        ): BookingCheckoutPaymentSession
        completeBookingPayment(
          bookingId: ID!
          paymentSessionId: ID!
          providerPaymentId: String
        ): BookingCheckoutPaymentResult
        handleBookingPaymentProviderWebhook(
          providerCode: String!
          event: JSON!
          headers: JSON!
        ): BookingPaymentWebhookResult!
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        bookingPaymentProviders: bookingPaymentProviders_default,
        activeBookingPaymentSession: activeBookingPaymentSession_default
      },
      Mutation: {
        cancelBooking,
        pushInventoryToChannel: pushInventoryToChannelMutation,
        pullReservationsFromChannel: pullReservationsFromChannelMutation,
        createStorefrontBooking: createStorefrontBooking_default,
        updateBookingStatus: updateBookingStatus_default,
        initiateBookingPaymentSession: initiateBookingPaymentSession_default,
        completeBookingPayment: completeBookingPayment_default,
        handleBookingPaymentProviderWebhook: handleBookingPaymentProviderWebhook_default
      }
    }
  });
}

// features/keystone/jobs/channelSyncJobs.ts
var import_context = require("@keystone-6/core/context");
var PrismaModule = __toESM(require("@prisma/client"));
var INVENTORY_SYNC_INTERVAL_MS = 15 * 60 * 1e3;
var RESERVATION_SYNC_INTERVAL_MS = 5 * 60 * 1e3;
var RETRY_INTERVAL_MS = 2 * 60 * 1e3;
function startChannelSyncJobs(config2) {
  if (process.env.CHANNEL_SYNC_JOBS_ENABLED !== "true") {
    return;
  }
  if (process.env.CHANNEL_SYNC_JOBS_DISABLED === "true") {
    return;
  }
  if (process.env.NODE_ENV === "test") {
    return;
  }
  if (globalThis.__channelSyncJobsStarted) {
    return;
  }
  ;
  globalThis.__channelSyncJobsStarted = true;
  const context = (0, import_context.getContext)(config2, PrismaModule);
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
  syncInventory();
  syncReservations();
  retryFailed();
  setInterval(syncInventory, INVENTORY_SYNC_INTERVAL_MS);
  setInterval(syncReservations, RESERVATION_SYNC_INTERVAL_MS);
  setInterval(retryFailed, RETRY_INTERVAL_MS);
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
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
          canManageOnboarding: true
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
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
    }
  `
});
var baseConfig = (0, import_core24.config)({
  db: {
    provider: "postgresql",
    url: databaseURL
  },
  lists: models,
  storage: {
    my_images: {
      kind: "s3",
      type: "image",
      bucketName,
      region,
      accessKeyId,
      secretAccessKey,
      endpoint,
      signed: { expiry: 5e3 },
      forcePathStyle: true
    }
  },
  ui: {
    isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session })
  },
  session: (0, import_session.statelessSessions)(sessionConfig),
  graphql: {
    extendGraphqlSchema
  }
});
var configWithAuth = withAuth(baseConfig);
startChannelSyncJobs(configWithAuth);
var keystone_default = configWithAuth;

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
