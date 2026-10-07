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
    for (let key4 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key4) && key4 !== except)
        __defProp(to, key4, { get: () => from[key4], enumerable: !(desc = __getOwnPropDesc(from, key4)) || desc.enumerable });
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

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session?.itemId && session.data?.isActive === true);
}
var permissions;
var init_access = __esm({
  "features/keystone/access.ts"() {
    "use strict";
    permissions = {
      canManageGuestPrivacy: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canManageGuestPrivacy ?? false),
      canApproveHotelExceptions: ({ session }) => isSignedIn({ session }) && (session?.data.role?.canApproveHotelExceptions ?? false),
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
  }
});

// features/keystone/lib/guestBookingAccess.ts
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
var import_node_crypto, GUEST_ACCESS_COOKIE, GUEST_ACCESS_MAX_AGE_SECONDS, MAX_GUEST_ACCESS_ENTRIES, BOOKING_ACCESS_DENIED_MESSAGE;
var init_guestBookingAccess = __esm({
  "features/keystone/lib/guestBookingAccess.ts"() {
    "use strict";
    import_node_crypto = require("node:crypto");
    GUEST_ACCESS_COOKIE = "hotel-guest-access";
    GUEST_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
    MAX_GUEST_ACCESS_ENTRIES = 20;
    BOOKING_ACCESS_DENIED_MESSAGE = "Reservation access could not be verified.";
  }
});

// features/keystone/lib/sensitiveData.ts
function key() {
  const secret = process.env.HOTEL_DATA_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : "local-hotel-data-encryption-key-change-me");
  if (secret.length < 32) throw new Error("Hotel data encryption is not configured.");
  return (0, import_node_crypto2.createHash)("sha256").update(secret).digest();
}
function encryptSensitiveText(value) {
  const text46 = String(value || "").trim();
  if (!text46 || text46.startsWith("enc:v1:")) return text46;
  const iv = (0, import_node_crypto2.randomBytes)(12);
  const cipher = (0, import_node_crypto2.createCipheriv)("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(text46, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
function decryptSensitiveText(value) {
  const text46 = String(value || "");
  if (!text46.startsWith("enc:v1:")) return text46;
  const [, , iv, tag, encrypted] = text46.split(":");
  const decipher = (0, import_node_crypto2.createDecipheriv)("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
var import_node_crypto2;
var init_sensitiveData = __esm({
  "features/keystone/lib/sensitiveData.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
  }
});

// features/keystone/lib/hotelLifecycle.ts
function requirePrismaResult(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key4, item]) => [key4, stableValue(item)])
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
var import_node_crypto3, HOTEL_PROPERTY_KEY;
var init_hotelLifecycle = __esm({
  "features/keystone/lib/hotelLifecycle.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    HOTEL_PROPERTY_KEY = "the-alder-house";
  }
});

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
var init_serializableTransaction = __esm({
  "features/keystone/lib/serializableTransaction.ts"() {
    "use strict";
  }
});

// features/keystone/lib/rateEconomics.ts
function rateEconomicsReview(plan, derivedConfig = null) {
  return { name: plan.name, ...Object.fromEntries(ECONOMIC_FIELDS.map((field) => [field, plan[field]])), derivedConfig };
}
function rateEconomicsHash(plan, derivedConfig = null) {
  return hashLifecycleRequest({ plan: Object.fromEntries(ECONOMIC_FIELDS.map((field) => [field, plan[field]])), derivedConfig });
}
async function loadRateEconomics(prisma, ratePlanId) {
  const [plan, events] = await Promise.all([
    prisma.ratePlan.findUnique({ where: { id: ratePlanId } }),
    prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "derived_rate", aggregateId: ratePlanId } })
  ]);
  if (!plan) throw new Error("Rate plan not found.");
  const derivedConfig = events.reduce((latest2, event) => Number(event.afterSnapshot?.derivedRate?.revision || 0) > Number(latest2?.revision || 0) ? event.afterSnapshot.derivedRate : latest2, null);
  return { plan, derivedConfig, economicsHash: rateEconomicsHash(plan, derivedConfig) };
}
var ECONOMIC_FIELDS;
var init_rateEconomics = __esm({
  "features/keystone/lib/rateEconomics.ts"() {
    "use strict";
    init_hotelLifecycle();
    ECONOMIC_FIELDS = ["id", "roomTypeId", "baseRateMinor", "currencyCode", "minimumStay", "maximumStay", "advanceBookingMin", "advanceBookingMax", "validFrom", "validTo", "applicableDays", "isPromotional", "promoCode", "cancellationPolicy", "mealPlan", "seasonalAdjustments"];
  }
});

// features/keystone/lib/hotelGuestGovernance.ts
function text14(value, label, max = 500) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return result;
}
function allow(context, permission) {
  if (!permissions[permission]({ session: context.session })) throw new Error("Not authorized for guest governance or independent approvals.");
}
function idFor(key4) {
  return (0, import_node_crypto4.createHash)("sha256").update(key4).digest("hex").slice(0, 24);
}
function resolveGuestIdentityInput(resolvedData, encrypt = encryptSensitiveText) {
  if (resolvedData.idNumber === void 0) return void 0;
  const value = String(resolvedData.idNumber || "").trim();
  if (value.startsWith("enc:")) throw new Error("Enter the original identification number, not an encrypted payload.");
  return encrypt(value);
}
async function lock(prisma, id) {
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-governance:${id}`);
}
async function evidence(prisma, input) {
  return prisma.hotelAuditEvent.create({ data: {
    eventKey: input.eventKey,
    propertyKey: HOTEL_PROPERTY_KEY,
    requestHash: hashLifecycleRequest(input.request),
    actorId: input.actorId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    action: input.action,
    beforeSnapshot: input.beforeSnapshot || null,
    afterSnapshot: input.afterSnapshot,
    metadataSnapshot: {},
    occurredAt: /* @__PURE__ */ new Date()
  } });
}
async function guestEvents(prisma, guestId) {
  const rows = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "guest_governance", aggregateId: guestId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 5001 });
  if (rows.length > 5e3) throw new Error("Guest governance history exceeds the bounded workspace; use a reviewed archival workflow.");
  return rows;
}
async function activeGuestMerges(prisma) {
  const rows = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "guest_merge" }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 5001 });
  if (rows.length > 5e3) throw new Error("Profile merge history exceeds the bounded workspace; a reviewed archival workflow is required.");
  const latest2 = /* @__PURE__ */ new Map();
  for (const row of rows) latest2.set(row.aggregateId, row.afterSnapshot);
  return [...latest2.values()].filter((value) => value.status === "merged");
}
async function assertGuestProfileEditable(prisma, guestId) {
  const [merges, events] = await Promise.all([activeGuestMerges(prisma), guestEvents(prisma, guestId)]);
  if (merges.some((merge) => merge.sourceGuestId === guestId)) throw new Error("This profile was merged. Use the audited unmerge operation before editing it.");
  if (events.some((event) => event.action === "subject_fulfilled" && event.afterSnapshot?.type === "anonymize" && event.afterSnapshot?.status === "completed")) throw new Error("An anonymized historical profile cannot be repurposed. Create a new guest profile.");
}
function guestGovernanceState(events) {
  const holds = /* @__PURE__ */ new Map();
  const consents = /* @__PURE__ */ new Map();
  const requests = /* @__PURE__ */ new Map();
  let retentionDays = null;
  for (const event of events) {
    const value = event.afterSnapshot || {};
    if (event.action === "legal_hold") holds.set(value.holdId, value);
    if (event.action === "consent") consents.set(value.purpose, value);
    if (event.action === "subject_request" || event.action === "subject_fulfilled") requests.set(value.requestId, value);
    if (event.action === "retention_policy") retentionDays = value.retentionDays;
  }
  return { holds: [...holds.values()].filter((value) => value.active), consents: [...consents.values()], requests: [...requests.values()], retentionDays };
}
async function guestExport(prisma, guestId) {
  const [guest, bookings, documents, events] = await Promise.all([
    prisma.guest.findUnique({ where: { id: guestId }, select: GUEST_EXPORT_FIELDS }),
    prisma.booking.findMany({ where: { guestProfileId: guestId }, take: 5001, orderBy: { createdAt: "asc" }, select: {
      id: true,
      confirmationNumber: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
      totalAmountMinor: true,
      currencyCode: true,
      folio: { select: { folioNumber: true, status: true, entries: { select: { entryType: true, direction: true, amountMinor: true, currencyCode: true, description: true, serviceDate: true } } } }
    } }),
    prisma.guestDocument.findMany({ where: { guestId }, select: { id: true, documentType: true, issuingCountry: true, expiryDate: true, verified: true, verifiedAt: true } }),
    guestEvents(prisma, guestId)
  ]);
  if (!guest) throw new Error("Guest not found.");
  if (bookings.length > 5e3) throw new Error("Guest export exceeds the bounded workspace; use a reviewed archival export.");
  return { guest, bookings, documents, governance: guestGovernanceState(events), history: events.map((event) => ({ id: event.id, action: event.action, occurredAt: event.occurredAt, evidence: event.afterSnapshot })), exportedAt: (/* @__PURE__ */ new Date()).toISOString(), excludedSensitiveFields: ["document numbers and images", "processor credentials and raw payment payloads"] };
}
async function hotelGovernanceGuestSearch(_root, { search }, context) {
  allow(context, "canManageGuestPrivacy");
  const query = text14(search, "Guest name or email", 100);
  if (query.length < 2) throw new Error("Enter at least two characters.");
  return JSON.stringify(await context.prisma.guest.findMany({ where: { OR: [{ email: { contains: query, mode: "insensitive" } }, { firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }] }, take: 25, orderBy: { email: "asc" }, select: { id: true, firstName: true, lastName: true, email: true } }));
}
async function hotelGuestGovernance(_root, { guestId }, context) {
  allow(context, "canManageGuestPrivacy");
  const id = text14(guestId, "Guest ID", 200);
  return JSON.stringify(await guestExport(context.prisma, id));
}
async function updateHotelGuestGovernance(_root, { guestId, command, payload, idempotencyKey }, context) {
  allow(context, "canManageGuestPrivacy");
  const id = text14(guestId, "Guest ID", 200);
  const key4 = `guest-governance:${text14(idempotencyKey, "Idempotency key", 200)}`;
  if (payload.length > 2e4) throw new Error("Governance payload is too large.");
  const data = JSON.parse(payload);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("A structured governance request is required.");
  const request = { guestId: id, command, data, actorId: context.session.itemId };
  return runSerializableTransaction(context, async (tx) => {
    const prisma = tx.prisma;
    const relatedId = command === "merge" ? text14(data.targetGuestId, "Target guest ID", 200) : id;
    for (const target of [.../* @__PURE__ */ new Set([id, relatedId])].sort()) await lock(prisma, target);
    const replay = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: key4 } });
    if (replay) {
      if (replay.requestHash !== hashLifecycleRequest(request)) throw new Error("Governance idempotency key was reused with different evidence.");
      return JSON.stringify(await guestExport(prisma, id));
    }
    const guest = await prisma.guest.findUnique({ where: { id } });
    if (!guest) throw new Error("Guest not found.");
    const events = await guestEvents(prisma, id);
    const state = guestGovernanceState(events);
    let action = command;
    let after;
    let before = null;
    if (command === "consent") {
      const purpose = text14(data.purpose, "Consent purpose", 100);
      const version = text14(data.version, "Notice version", 100);
      if (!["granted", "revoked"].includes(data.status)) throw new Error("Consent must be granted or revoked.");
      after = { purpose, version, status: data.status, evidenceRef: text14(data.evidenceRef, "Consent evidence"), recordedAt: (/* @__PURE__ */ new Date()).toISOString() };
      const preferenceField = { email_marketing: "emailMarketing", email_newsletter: "newsletterSubscribed", sms_notifications: "smsNotifications", phone_notifications: "phoneNotifications" }[purpose];
      if (preferenceField) await prisma.guest.update({ where: { id }, data: { communicationPreferences: { ...guest.communicationPreferences || {}, [preferenceField]: data.status === "granted", ...purpose === "email_marketing" && data.status === "revoked" ? { newsletterSubscribed: false } : {} } } });
    } else if (command === "legal_hold") {
      const holdId = text14(data.holdId, "Hold reference", 100);
      if (typeof data.active !== "boolean") throw new Error("Legal hold active must be true or false.");
      if (!data.active && !state.holds.some((hold) => hold.holdId === holdId)) throw new Error("Active legal hold not found.");
      after = { holdId, active: data.active, reason: text14(data.reason, "Hold or release reason"), recordedAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else if (command === "retention_policy") {
      if (!Number.isSafeInteger(data.retentionDays) || data.retentionDays < 0 || data.retentionDays > 36500) throw new Error("Retention must be a whole number of days between 0 and 36500.");
      after = { retentionDays: data.retentionDays, policyReference: text14(data.policyReference, "Reviewed retention policy reference") };
    } else if (command === "document_register") {
      await assertGuestProfileEditable(prisma, id);
      if (!["passport", "id_card", "drivers_license", "other"].includes(data.documentType)) throw new Error("Unsupported registration document type.");
      const expires = data.expiryDate ? new Date(data.expiryDate) : null;
      if (expires && (!Number.isFinite(expires.getTime()) || expires < /* @__PURE__ */ new Date())) throw new Error("Registration document expiry must be a valid future date.");
      const number = text14(data.documentNumber, "Document number", 200);
      if (number.startsWith("enc:")) throw new Error("Enter the original document number, not an encrypted payload.");
      const document2 = await prisma.guestDocument.create({ data: {
        guestId: id,
        documentType: data.documentType,
        documentNumber: encryptSensitiveText(number),
        issuingCountry: text14(data.issuingCountry, "Issuing country", 100),
        expiryDate: expires,
        verified: data.verified === true,
        verifiedAt: data.verified === true ? /* @__PURE__ */ new Date() : null,
        verifiedById: data.verified === true ? context.session.itemId : null,
        frontImage: "",
        backImage: ""
      } });
      after = { documentId: document2.id, documentType: data.documentType, verified: data.verified === true, evidenceRef: text14(data.evidenceRef, "Identity verification evidence") };
    } else if (command === "subject_request") {
      if (!["export", "anonymize"].includes(data.type) || data.identityVerified !== true) throw new Error("Verify subject identity and select export or anonymize.");
      after = { requestId: idFor(key4), type: data.type, status: "pending", evidenceRef: text14(data.evidenceRef, "Subject verification evidence"), requestedAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else if (command === "subject_fulfilled") {
      const subject = state.requests.find((item) => item.requestId === data.requestId && item.status === "pending");
      if (!subject) throw new Error("Pending subject request not found for this guest.");
      if (subject.type === "anonymize") {
        if (state.holds.length) throw new Error("A legal hold prevents anonymization.");
        if (state.retentionDays === null) throw new Error("Record a reviewed retention policy before anonymization.");
        if ((await activeGuestMerges(prisma)).some((merge) => [merge.sourceGuestId, merge.targetGuestId].includes(id))) throw new Error("Unmerge related profiles before fulfilling an anonymization request.");
        const active = await prisma.booking.findFirst({ where: { guestProfileId: id, status: { in: ["pending", "confirmed", "checked_in", "cancellation_pending"] } }, select: { id: true } });
        if (active) throw new Error("Active reservations must be resolved before anonymization.");
        const latest2 = await prisma.booking.findFirst({ where: { guestProfileId: id }, orderBy: { checkOutDate: "desc" }, select: { checkOutDate: true } });
        const retainedUntil = new Date(latest2?.checkOutDate || guest.createdAt).getTime() + state.retentionDays * 864e5;
        if (Date.now() < retainedUntil) throw new Error("The recorded retention period has not elapsed.");
        await prisma.guestDocument.deleteMany({ where: { guestId: id } });
        const anonymousEmail = `anonymized-${id}@invalid.example`;
        await prisma.guest.update({ where: { id }, data: { firstName: "Anonymized", lastName: "Guest", email: anonymousEmail, phone: "", nationality: "", address1: "", address2: "", city: "", state: "", postalCode: "", country: "", company: "", specialNotes: "", idNumber: "", idType: null, preferences: {}, communicationPreferences: { emailMarketing: false }, loyaltyNumber: null, userAccountId: null, isBlacklisted: true } });
        await prisma.booking.updateMany({ where: { guestProfileId: id }, data: { guestName: "Anonymized Guest", guestEmail: anonymousEmail, guestPhone: "", specialRequests: "" } });
      }
      after = { ...subject, status: "completed", completedAt: (/* @__PURE__ */ new Date()).toISOString(), retainedEvidence: "Financial amounts, stay dates, immutable audit history and restricted provider evidence remain subject to the recorded retention policy." };
    } else if (command === "subject_export") {
      const subject = state.requests.find((item) => item.requestId === data.requestId && item.type === "export" && item.status === "completed");
      if (!subject) throw new Error("Complete a verified export request before downloading subject data.");
      after = { requestId: subject.requestId, downloadedAt: (/* @__PURE__ */ new Date()).toISOString(), excludedSensitiveFields: ["document numbers and images", "processor credentials and raw payment payloads"] };
    } else if (command === "merge") {
      await assertGuestProfileEditable(prisma, id);
      if (relatedId === id) throw new Error("Choose a different target profile.");
      text14(data.evidenceRef, "Verified profile identity evidence");
      const target = await prisma.guest.findUnique({ where: { id: relatedId } });
      if (!target || target.isBlacklisted) throw new Error("An unrestricted target guest is required.");
      if ((await activeGuestMerges(prisma)).some((merge) => [merge.sourceGuestId, merge.targetGuestId].some((value) => [id, relatedId].includes(value)))) throw new Error("Unmerge an existing related mapping before merging these profiles.");
      if (state.holds.length || guestGovernanceState(await guestEvents(prisma, relatedId)).holds.length) throw new Error("Resolve legal holds before merging profiles.");
      const rows = await prisma.booking.findMany({ where: { guestProfileId: id }, select: { id: true }, take: 5001 });
      if (rows.length > 5e3) throw new Error("Profile merge exceeds the supported bounded size.");
      const bookingIds = rows.map((row) => row.id);
      const sourceWasBlacklisted = Boolean(guest.isBlacklisted);
      await prisma.booking.updateMany({ where: { id: { in: bookingIds }, guestProfileId: id }, data: { guestProfileId: relatedId } });
      await prisma.guest.update({ where: { id }, data: { isBlacklisted: true } });
      after = { mergeId: idFor(key4), sourceGuestId: id, targetGuestId: relatedId, bookingIds, sourceWasBlacklisted, status: "merged", evidenceRef: data.evidenceRef };
      await evidence(prisma, { eventKey: `${key4}:merge`, actorId: context.session.itemId, aggregateType: "guest_merge", aggregateId: after.mergeId, action: "merged", request, afterSnapshot: after });
    } else if (command === "unmerge") {
      const mergeId = text14(data.mergeId, "Merge ID", 100);
      const records = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "guest_merge", aggregateId: mergeId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1 });
      const merge = records[0]?.afterSnapshot;
      if (!merge || merge.sourceGuestId !== id || merge.status !== "merged") throw new Error("Active merge does not belong to this source profile.");
      await lock(prisma, merge.targetGuestId);
      if (state.holds.length || guestGovernanceState(await guestEvents(prisma, merge.targetGuestId)).holds.length) throw new Error("Resolve legal holds before changing profile mappings.");
      const count = await prisma.booking.count({ where: { id: { in: merge.bookingIds }, guestProfileId: merge.targetGuestId } });
      if (count !== merge.bookingIds.length) throw new Error("A later profile operation changed the merge mapping; resolve that operation first.");
      await prisma.booking.updateMany({ where: { id: { in: merge.bookingIds }, guestProfileId: merge.targetGuestId }, data: { guestProfileId: id } });
      await prisma.guest.update({ where: { id }, data: { isBlacklisted: merge.sourceWasBlacklisted } });
      after = { ...merge, status: "unmerged", evidenceRef: text14(data.evidenceRef, "Unmerge reason") };
      await evidence(prisma, { eventKey: `${key4}:unmerge`, actorId: context.session.itemId, aggregateType: "guest_merge", aggregateId: mergeId, action: "unmerged", request, afterSnapshot: after });
    } else throw new Error("Unsupported guest governance command.");
    await evidence(prisma, { eventKey: key4, actorId: context.session.itemId, aggregateType: "guest_governance", aggregateId: id, action, request, beforeSnapshot: before, afterSnapshot: after });
    return JSON.stringify(await guestExport(prisma, id));
  });
}
function assertHotelApprovalEvidence(request, decision, input) {
  if (!request || !decision || request.action !== input.action || request.aggregateId !== input.aggregateId || request.amountMinor !== input.amountMinor || request.requestedBy !== input.actorId) throw new Error("Approval does not match the requested action, actor, target and amount.");
  if (decision.status !== "approved" || decision.approvedBy === request.requestedBy) throw new Error("An independent approval is required.");
  if (input.parameters !== void 0 && hashLifecycleRequest(request.parameters) !== hashLifecycleRequest(input.parameters)) throw new Error("Approval parameters do not match the requested change.");
}
async function requireHotelApproval(prisma, input) {
  const approvalId = text14(input.approvalId, "Independent approval ID", 100);
  await lock(prisma, `approval:${approvalId}`);
  const [request, decision, consumed] = await Promise.all([
    prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:request` } }),
    prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:decision` } }),
    prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:used` } })
  ]);
  assertHotelApprovalEvidence(request?.afterSnapshot, decision?.afterSnapshot, input);
  if (consumed) {
    if (consumed.afterSnapshot?.operationKey !== input.operationKey) throw new Error("Approval has already been used by another operation.");
    return;
  }
  await evidence(prisma, { eventKey: `hotel-approval:${approvalId}:used`, actorId: input.actorId, aggregateType: "hotel_approval", aggregateId: approvalId, action: "used", request: input, afterSnapshot: { operationKey: input.operationKey } });
}
async function hotelApprovalWorkspace(_root, { offset = 0 }, context) {
  if (!permissions.canApproveHotelExceptions({ session: context.session }) && !permissions.canManagePayments({ session: context.session }) && !permissions.canManageRooms({ session: context.session })) throw new Error("Not authorized for hotel approvals.");
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Approval history offset must be a nonnegative integer.");
  const requests = await context.prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "hotel_approval", action: "request" }, take: 101, skip: offset, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
  const page = requests.slice(0, 100);
  const rows = page.length ? await context.prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "hotel_approval", aggregateId: { in: page.map((row) => row.aggregateId) } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }) : [];
  return JSON.stringify({ rows: rows.map((row) => ({ approvalId: row.aggregateId, action: row.action, occurredAt: row.occurredAt, evidence: row.afterSnapshot })), nextOffset: requests.length > 100 ? offset + 100 : null });
}
async function updateHotelApproval(_root, { payload, idempotencyKey }, context) {
  if (payload.length > 1e4) throw new Error("Approval payload too large.");
  const data = JSON.parse(payload);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("A structured approval request is required.");
  const key4 = text14(idempotencyKey, "Idempotency key", 200);
  const decision = ["approved", "declined"].includes(data.status);
  if (decision) allow(context, "canApproveHotelExceptions");
  else if (!permissions.canManagePayments({ session: context.session }) && !permissions.canManageRooms({ session: context.session })) throw new Error("Not authorized to request hotel approval.");
  const approvalId = decision ? text14(data.approvalId, "Approval ID", 100) : idFor(key4);
  return runSerializableTransaction(context, async (tx) => {
    const prisma = tx.prisma;
    await lock(prisma, `approval:${approvalId}`);
    let after;
    if (decision) {
      const request2 = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:request` } });
      if (!request2 || request2.afterSnapshot.requestedBy === context.session.itemId) throw new Error("A different authorized staff member must approve this request.");
      after = { status: data.status, approvedBy: context.session.itemId, reason: text14(data.reason, "Approval reason") };
    } else {
      if (!["refund", "write_off", "rate_publish", "cash_variance", "security_capture", "payout_reconcile"].includes(data.action) || !Number.isSafeInteger(data.amountMinor) || data.amountMinor < 0) throw new Error("Valid approval action and amount are required.");
      if (data.action === "payout_reconcile" && (!/^[a-f0-9]{64}$/.test(String(data.parameters?.sourceHash || "")) || !String(data.parameters?.bankReference || "").trim() || String(data.parameters.bankReference).length > 200 || !Number.isSafeInteger(data.parameters?.bankAmountMinor))) throw new Error("Payout approval requires an exact statement source hash, bank reference and signed integer bank amount.");
      if (data.action === "rate_publish" && (!["active", "inactive", "draft"].includes(data.parameters?.status) || typeof data.parameters?.isPublic !== "boolean")) throw new Error("Rate approval must specify the publication status and public visibility.");
      let parameters = data.parameters || null;
      let economicReview = null;
      if (data.action === "rate_publish") {
        const economics = await loadRateEconomics(prisma, text14(data.aggregateId, "Target ID", 200));
        parameters = { ...parameters, economicsHash: economics.economicsHash };
        economicReview = { target: rateEconomicsReview(economics.plan, economics.derivedConfig) };
        if (parameters.derivedRate?.enabled) {
          const source = await loadRateEconomics(prisma, text14(parameters.derivedRate.sourcePlanId, "Source rate ID", 200));
          parameters.sourceEconomicsHash = source.economicsHash;
          economicReview.source = rateEconomicsReview(source.plan, source.derivedConfig);
        }
      }
      after = { action: data.action, aggregateId: text14(data.aggregateId, "Target ID", 200), amountMinor: data.amountMinor, requestedBy: context.session.itemId, reason: text14(data.reason, "Request reason"), parameters, ...economicReview ? { economicReview } : {} };
    }
    const eventKey = `hotel-approval:${approvalId}:${decision ? "decision" : "request"}`;
    const request = { ...after, idempotencyKey: key4 };
    const existing = await prisma.hotelAuditEvent.findUnique({ where: { eventKey } });
    if (existing) {
      if (existing.requestHash !== hashLifecycleRequest(request)) throw new Error("Approval identity already has a different request or decision.");
    } else await evidence(prisma, { eventKey, actorId: context.session.itemId, aggregateType: "hotel_approval", aggregateId: approvalId, action: decision ? "decision" : "request", request, afterSnapshot: after });
    return JSON.stringify({ approvalId, ...after });
  });
}
var import_node_crypto4, GUEST_EXPORT_FIELDS, hotelGuestGovernanceTypeDefs, hotelGuestGovernanceResolvers;
var init_hotelGuestGovernance = __esm({
  "features/keystone/lib/hotelGuestGovernance.ts"() {
    "use strict";
    import_node_crypto4 = require("node:crypto");
    init_access();
    init_hotelLifecycle();
    init_serializableTransaction();
    init_sensitiveData();
    init_rateEconomics();
    GUEST_EXPORT_FIELDS = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      nationality: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      company: true,
      preferences: true,
      communicationPreferences: true,
      specialNotes: true,
      createdAt: true
    };
    hotelGuestGovernanceTypeDefs = String.raw`
  extend type Query { hotelGuestGovernance(guestId: ID!): String!, hotelGovernanceGuestSearch(search: String!): String!, hotelApprovalWorkspace(offset: Int): String! }
  extend type Mutation {
    updateHotelGuestGovernance(guestId: ID!, command: String!, payload: String!, idempotencyKey: String!): String!
    updateHotelApproval(payload: String!, idempotencyKey: String!): String!
  }
`;
    hotelGuestGovernanceResolvers = { Query: { hotelGuestGovernance, hotelGovernanceGuestSearch, hotelApprovalWorkspace }, Mutation: { updateHotelGuestGovernance, updateHotelApproval } };
  }
});

// features/keystone/lib/channelCredentials.ts
function encryptChannelCredentials(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Channel credentials must be an object.");
  const object2 = value;
  if (typeof object2.encrypted === "string" && object2.encrypted.startsWith("enc:v1:")) return object2;
  return { encrypted: encryptSensitiveText(JSON.stringify(object2)) };
}
function readChannelCredentials(channel) {
  const stored = channel.credentials;
  if (!stored || typeof stored.encrypted !== "string" || !stored.encrypted.startsWith("enc:v1:")) {
    throw new Error("Channel credentials must be encrypted through property channel configuration before use.");
  }
  const parsed = JSON.parse(decryptSensitiveText(stored.encrypted));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid encrypted channel credentials.");
  return parsed;
}
var init_channelCredentials = __esm({
  "features/keystone/lib/channelCredentials.ts"() {
    "use strict";
    init_sensitiveData();
  }
});

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
  const currencies = new Set(entries.map((entry) => entry.currencyCode).filter(Boolean));
  if (currencies.size > 1) throw new Error("Mixed-currency folio balances cannot be settled without explicit reconciliation.");
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
var init_folioLedger = __esm({
  "features/keystone/lib/folioLedger.ts"() {
    "use strict";
  }
});

// features/keystone/lib/reservationSnapshots.ts
function toMinorUnits(amount3) {
  const value = Number(amount3 || 0);
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
  if (roomAmounts.reduce((sum, amount3) => sum + amount3, 0) !== source.roomTotalCents) {
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
    const key4 = dayKey(date);
    lines.push({
      ...common,
      type: "room",
      description: `${source.roomType.name} \xB7 ${key4}`,
      unitPrice: roomAmounts[index],
      totalPrice: roomAmounts[index],
      date: date.toISOString(),
      snapshotKey: `${snapshotRoot}:room:${key4}`,
      nightIndex: index + 1,
      taxRateBasisPoints: null
    });
    lines.push({
      ...common,
      type: "tax",
      description: `Tax \xB7 ${source.roomType.name} \xB7 ${key4}`,
      unitPrice: taxAmounts[index],
      totalPrice: taxAmounts[index],
      date: date.toISOString(),
      snapshotKey: `${snapshotRoot}:tax:${key4}`,
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
var DEFAULT_CURRENCY;
var init_reservationSnapshots = __esm({
  "features/keystone/lib/reservationSnapshots.ts"() {
    "use strict";
    DEFAULT_CURRENCY = "USD";
  }
});

// features/keystone/lib/hotelBusinessTime.ts
async function lockHotelBusinessDate(prisma) {
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", HOTEL_BUSINESS_DATE_LOCK);
}
function validatePropertyTimeZone(value) {
  const zone = String(value || "").trim();
  if (!zone || zone.length > 100) throw new Error("A property IANA time zone is required.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
  } catch {
    throw new Error("Property time zone is invalid.");
  }
  return zone;
}
function parts(instant, timeZone) {
  const fields = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  return Object.fromEntries(fields.map((field) => [field.type, field.value]));
}
function propertyCalendarDate(now, timeZone) {
  const p = parts(now, validatePropertyTimeZone(timeZone));
  return /* @__PURE__ */ new Date(`${p.year}-${p.month}-${p.day}T00:00:00.000Z`);
}
function propertyArrivalInstant(day2, time, zone) {
  const date = new Date(day2).toISOString().slice(0, 10);
  const match = String(time).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) throw new Error("Property arrival time is invalid.");
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) throw new Error("Property arrival time is invalid.");
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  const timeZone = validatePropertyTimeZone(zone);
  const wall = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${match[2]}:00.000Z`);
  const offsets = /* @__PURE__ */ new Set();
  for (const delta of [-864e5, 0, 864e5]) {
    const sample = new Date(wall + delta);
    const p = parts(sample, timeZone);
    offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`) - sample.getTime());
  }
  const candidates = [...offsets].map((offset) => new Date(wall - offset)).filter((candidate) => {
    const p = parts(candidate, timeZone);
    return `${p.year}-${p.month}-${p.day}` === date && Number(p.hour) === hour && Number(p.minute) === minute;
  }).sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length) throw new Error("Arrival time does not exist on this date in the property time zone.");
  return candidates[0];
}
async function currentPostingDate(prisma, requested) {
  await lockHotelBusinessDate(prisma);
  const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
  if (!clock) throw new Error("Property business date is not configured.");
  const current = new Date(clock.currentBusinessDate);
  const day2 = requested ? new Date(requested) : current;
  if (Number.isNaN(day2.getTime())) throw new Error("serviceDate must be a valid date.");
  day2.setUTCHours(0, 0, 0, 0);
  if (day2.getTime() !== current.getTime()) throw new Error("Post to the current business date; prior-period corrections require a current-day reasoned reversal.");
  return day2;
}
var HOTEL_BUSINESS_DATE_LOCK;
var init_hotelBusinessTime = __esm({
  "features/keystone/lib/hotelBusinessTime.ts"() {
    "use strict";
    init_hotelLifecycle();
    HOTEL_BUSINESS_DATE_LOCK = `hotel-business-date:${HOTEL_PROPERTY_KEY}`;
  }
});

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
  if (postings.length) {
    const businessDay = await currentPostingDate(prisma, options.serviceDate);
    for (const posting of postings) {
      if (posting.currencyCode !== folio.currencyCode) throw new Error("Snapshot posting currency does not match folio.");
      if (posting.serviceDate < businessDay) {
        const existing = await prisma.folioEntry.findUnique({ where: { postingKey: posting.postingKey } });
        if (!existing) throw new Error("A closed business date is missing a reservation posting; use an audited current-day adjustment.");
      } else if (posting.serviceDate > businessDay) {
        posting.metadataSnapshot = { ...posting.metadataSnapshot, originalServiceDate: posting.serviceDate.toISOString() };
        posting.serviceDate = businessDay;
      }
    }
  }
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
    currencyCode: folio.currencyCode,
    status: folio.status,
    created,
    existing: postings.length - created,
    total: postings.length
  };
}
async function ensurePaymentFolioPosting(context, paymentId, options = {}) {
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
  const recovery = options.allowRecoveryReopen === true && payment.status === "completed" && typeof providerEvidence.recoveryReason === "string" && Boolean(providerEvidence.recoveryReason);
  if (folio.status === "voided" && !recovery) {
    throw new Error("Voided folios cannot accept payment postings.");
  }
  if (folio.status === "closed" && isRefund || recovery && ["closed", "voided"].includes(folio.status)) {
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
      serviceDate: await currentPostingDate(prisma),
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
        recordedBy: providerEvidence.recordedBy || null,
        recoveryReason: recovery ? providerEvidence.recoveryReason : null
      }
    },
    update: {}
  }));
}
async function getBookingCollectibleBalance(context, bookingId) {
  const prisma = context.prisma;
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
  const ensured = await ensureBookingFolio(context, bookingId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { lineItems: true } });
  if (!booking) throw new Error("Booking not found.");
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-folio:${ensured.folioId}`);
  const members = booking.billingFolioId ? await prisma.booking.findMany({ where: { billingFolioId: ensured.folioId }, include: { lineItems: true } }) : [booking];
  if (!members.some((member) => member.id === booking.id)) throw new Error("Booking is not attached to its billing folio.");
  const [entries, intents] = await Promise.all([
    prisma.folioEntry.findMany({ where: { folioId: ensured.folioId }, select: { postingKey: true, direction: true, amountMinor: true, currencyCode: true } }),
    prisma.refundIntent.findMany({ where: { bookingId: { in: members.map((member) => member.id) }, status: { in: ["pending", "processing", "failed", "dead_letter"] } }, select: { amountMinor: true } })
  ]);
  return { ...calculateCollectibleBalance(entries, members, intents, ensured.currencyCode), folioId: ensured.folioId };
}
function calculateCollectibleBalance(entries, members, intents, currencyCode) {
  const posted = new Set(entries.map((entry) => entry.postingKey));
  let balanceMinor = 0;
  for (const entry of entries) {
    if (entry.currencyCode !== currencyCode || !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 || !["debit", "credit"].includes(entry.direction)) throw new Error("Invalid folio currency or amount requires reconciliation.");
    balanceMinor += entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor;
  }
  for (const member of members) {
    if (!["cancelled", "no_show", "cancellation_pending"].includes(member.status)) {
      for (const line of member.lineItems) {
        if (line.snapshotStatus === "superseded" || posted.has(`folio:snapshot:${line.snapshotKey}`)) continue;
        if (line.currencyCode !== currencyCode || !Number.isSafeInteger(line.totalPrice) || line.totalPrice < 0) throw new Error("Invalid reservation economics require reconciliation.");
        balanceMinor += line.totalPrice;
      }
    }
  }
  for (const intent of intents) {
    if (!Number.isSafeInteger(intent.amountMinor) || intent.amountMinor < 0) throw new Error("Invalid pending refund amount.");
    balanceMinor += intent.amountMinor;
  }
  if (!Number.isSafeInteger(balanceMinor)) throw new Error("Collectible balance exceeds safe integer bounds.");
  return { balanceMinor, balanceDueMinor: Math.max(0, balanceMinor), creditMinor: Math.max(0, -balanceMinor) };
}
var init_bookingFolio = __esm({
  "features/keystone/lib/bookingFolio.ts"() {
    "use strict";
    init_folioLedger();
    init_reservationSnapshots();
    init_hotelBusinessTime();
  }
});

// features/keystone/lib/integrationConfig.ts
function complete(value, minimum = 16) {
  const text46 = String(value || "").trim();
  return Boolean(text46 && text46.length >= minimum && !PLACEHOLDER.test(text46));
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function paymentProviderCredentials(provider) {
  const stored = object(provider.credentials);
  return Object.fromEntries(Object.entries(stored).map(([key4, value]) => [key4, decryptSensitiveText(value)]));
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
  let credentials;
  try {
    credentials = readChannelCredentials(channel);
  } catch {
    return "invalid";
  }
  const configured = String(credentials.mode || "").toLowerCase();
  if (configured === "disabled" || configured === "demo" || configured === "live") return configured;
  return "invalid";
}
function requireLiveChannelEndpoint(channel, operation) {
  const mode = channelIntegrationMode(channel);
  if (mode !== "live") throw new Error(`Channel outbound sync is ${mode}; live mode is required.`);
  const credentials = readChannelCredentials(channel);
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
var PLACEHOLDER;
var init_integrationConfig = __esm({
  "features/keystone/lib/integrationConfig.ts"() {
    "use strict";
    init_channelCredentials();
    init_sensitiveData();
    PLACEHOLDER = /placeholder|changeme|your_|xxx|dummy|example/i;
  }
});

// features/keystone/lib/paymentSecurity.ts
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
function validateRefundSettlement(result, expected) {
  const id = String(result?.data?.id || result?.data?.refund_id || "").trim();
  if (!id) throw new Error("Provider did not return durable refund evidence.");
  if (expected.providerRefundId && expected.providerRefundId !== id) throw new Error("Provider refund identity changed during reconciliation.");
  const amount3 = result?.amount;
  if (!Number.isSafeInteger(amount3) || amount3 !== expected.amountMinor) throw new Error("Provider refund amount does not match the durable intent.");
  const currency = String(result?.currencyCode || result?.data?.currency || result?.data?.amount?.currency_code || "").toUpperCase();
  if (currency !== expected.currencyCode.toUpperCase()) throw new Error("Provider refund currency does not match the durable intent.");
  const status = String(result?.status || "").toLowerCase();
  if (!["succeeded", "completed", "pending", "requires_action", "failed", "canceled", "cancelled"].includes(status)) throw new Error("Provider refund status is unrecognized.");
  return { id, status, settled: status === "succeeded" || status === "completed", failed: ["failed", "canceled", "cancelled"].includes(status) };
}
function captureRecoveryAmount(booking, capturedMinor, outstandingMinor, confirmationAvailable) {
  if (!Number.isSafeInteger(capturedMinor) || capturedMinor <= 0 || !Number.isSafeInteger(outstandingMinor) || outstandingMinor < 0) throw new Error("Invalid capture obligation.");
  if (!["pending", "confirmed"].includes(booking.status) || !confirmationAvailable) return capturedMinor;
  return Math.max(0, capturedMinor - outstandingMinor);
}
function bookingPaymentDueNow(booking, collectibleMinor) {
  if (!Number.isSafeInteger(collectibleMinor) || collectibleMinor < 0) throw new Error("Invalid collectible obligation.");
  const percent = Number(booking.pricingSnapshot?.depositPercent ?? 100);
  if (!Number.isSafeInteger(percent) || percent < 1 || percent > 100) throw new Error("Invalid frozen booking deposit policy.");
  if (booking.status !== "pending" || booking.billingFolioId || booking.billingFolio?.id) return collectibleMinor;
  const totalMinor = Number(booking.pricingSnapshot?.totalMinor ?? booking.totalAmountMinor);
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error("Invalid frozen booking total.");
  const requiredMinor = Math.ceil(totalMinor * percent / 100);
  const alreadySettledMinor = Math.max(0, totalMinor - collectibleMinor);
  return Math.min(collectibleMinor, Math.max(0, requiredMinor - alreadySettledMinor));
}
var ONLINE_PAYMENT_PROVIDER_CODES;
var init_paymentSecurity = __esm({
  "features/keystone/lib/paymentSecurity.ts"() {
    "use strict";
    init_integrationConfig();
    ONLINE_PAYMENT_PROVIDER_CODES = [
      "pp_stripe_stripe",
      "pp_paypal_paypal"
    ];
  }
});

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction,
  completePaymentFunction: () => completePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  getRefundStatusFunction: () => getRefundStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  normalizedSecurityAuthorization: () => normalizedSecurityAuthorization,
  refundPaymentFunction: () => refundPaymentFunction,
  securityAuthorizationFunction: () => securityAuthorizationFunction
});
function normalizeAmount(amount3) {
  if (!Number.isSafeInteger(amount3) || amount3 <= 0) {
    throw new Error("Invalid payment amount");
  }
  return amount3;
}
function settlementFromResource(resource) {
  const amount3 = resource?.amount_received ?? resource?.amount_total ?? resource?.amount;
  return {
    isSettled: resource?.status === "succeeded" || resource?.payment_status === "paid",
    amount: Number.isSafeInteger(amount3) ? amount3 : null,
    currencyCode: String(resource?.currency || "").toUpperCase(),
    providerPaymentId: String(resource?.payment_intent || resource?.id || ""),
    bookingId: String(resource?.metadata?.bookingId || ""),
    idempotencyKey: String(resource?.metadata?.idempotencyKey || "")
  };
}
async function createPaymentFunction({
  amount: amount3,
  currency,
  metadata = {},
  idempotencyKey,
  providerCredentials
}) {
  const paymentIntent = await getStripeClient(providerCredentials).paymentIntents.create(
    {
      amount: normalizeAmount(amount3),
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
async function refundPaymentFunction({ paymentId, amount: amount3, metadata = {}, idempotencyKey, providerCredentials }) {
  if (!idempotencyKey) throw new Error("Stripe refund idempotency key is required");
  const refund = await getStripeClient(providerCredentials).refunds.create({
    payment_intent: paymentId,
    amount: amount3 ? normalizeAmount(Math.abs(amount3)) : void 0,
    metadata
  }, { idempotencyKey });
  return { status: refund.status, amount: refund.amount, currencyCode: refund.currency.toUpperCase(), data: refund };
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
    securityAuthorization: event.data.object.object === "payment_intent" && event.data.object.metadata?.purpose === "hotel_security" ? normalizedSecurityAuthorization(event.data.object) : null,
    event,
    eventId: event.id,
    type: event.type,
    resource,
    settlement: settlementFromResource(resource),
    dispute: resource.object === "dispute" && event.type.startsWith("charge.dispute.") ? { id: resource.id, providerPaymentId: typeof resource.payment_intent === "string" ? resource.payment_intent : resource.payment_intent?.id, amountMinor: resource.amount, currencyCode: String(resource.currency || "").toUpperCase(), status: resource.status, reason: resource.reason, evidenceDueBy: resource.evidence_details?.due_by || null, eventCreated: event.created, balanceTransactions: resource.balance_transactions || [] } : null
  };
}
async function getRefundStatusFunction({ refundId, providerCredentials }) {
  const refund = await getStripeClient(providerCredentials).refunds.retrieve(refundId);
  return { status: refund.status, amount: refund.amount, currencyCode: refund.currency.toUpperCase(), data: refund };
}
async function cancelPaymentFunction({ paymentId, idempotencyKey, providerCredentials }) {
  const stripe = getStripeClient(providerCredentials);
  const current = await stripe.paymentIntents.retrieve(paymentId);
  if (current.status === "succeeded" || current.status === "canceled") return { status: current.status, settlement: settlementFromResource(current), data: current };
  const cancelled = await stripe.paymentIntents.cancel(paymentId, {}, { idempotencyKey });
  return { status: cancelled.status, settlement: settlementFromResource(cancelled), data: cancelled };
}
function normalizedSecurityAuthorization(intent) {
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  return {
    id: intent.id,
    authorizationId: intent.metadata?.securityAuthorizationId,
    bookingId: intent.metadata?.bookingId,
    amountMinor: intent.amount,
    amountReceivedMinor: intent.amount_received,
    amountCapturableMinor: intent.amount_capturable,
    currencyCode: String(intent.currency || "").toUpperCase(),
    status: intent.status,
    expiresAt: charge?.payment_method_details?.card?.capture_before ? new Date(charge.payment_method_details.card.capture_before * 1e3).toISOString() : null
  };
}
async function securityAuthorizationFunction({ action, paymentId, amountMinor, authorizationId, bookingId, idempotencyKey, providerCredentials }) {
  const stripe = getStripeClient(providerCredentials);
  let intent;
  if (action === "initiate") intent = await stripe.paymentIntents.create({
    amount: normalizeAmount(amountMinor),
    currency: "usd",
    capture_method: "manual",
    payment_method_types: ["card"],
    metadata: { bookingId, securityAuthorizationId: authorizationId, purpose: "hotel_security" }
  }, { idempotencyKey });
  else {
    intent = await stripe.paymentIntents.retrieve(paymentId, { expand: ["latest_charge"] });
    if (action === "capture" && intent.status === "requires_capture") intent = await stripe.paymentIntents.capture(paymentId, { amount_to_capture: normalizeAmount(amountMinor), final_capture: true }, { idempotencyKey });
    else if (action === "release" && !["succeeded", "canceled"].includes(intent.status)) intent = await stripe.paymentIntents.cancel(paymentId, {}, { idempotencyKey });
  }
  return { ...normalizedSecurityAuthorization(intent), clientSecret: intent.client_secret };
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    getStripeClient = (credentials) => {
      if (!credentials.secretKey) throw new Error("Stripe secret key is not configured.");
      return new import_stripe.default(credentials.secretKey, { apiVersion: "2025-11-17.clover", timeout: 2e4, maxNetworkRetries: 1 });
    };
  }
});

// features/integrations/payment/paypal.ts
var paypal_exports = {};
__export(paypal_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction2,
  completePaymentFunction: () => completePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  getRefundStatusFunction: () => getRefundStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2,
  settlementFromCapture: () => settlementFromCapture
});
function paypalFetch(input, init = {}) {
  return fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(2e4) });
}
async function getPayPalAccessToken(credentials) {
  const { clientId, clientSecret } = credentials;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured.");
  const response = await paypalFetch(`${getPayPalBaseUrl(credentials)}/v1/oauth2/token`, {
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
  const amount3 = capture?.amount;
  return {
    isSettled: capture?.status === "COMPLETED",
    amount: amount3?.value ? parsePayPalAmount(amount3.value, amount3.currency_code) : null,
    currencyCode: String(amount3?.currency_code || "").toUpperCase(),
    providerPaymentId: String(capture?.supplementary_data?.related_ids?.order_id || ""),
    providerCaptureId: String(capture?.id || ""),
    bookingId: String(capture?.custom_id || ""),
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
  const response = await paypalFetch(
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
  const settlement = settlementFromCapture(event.resource);
  if (settlement.providerPaymentId && !settlement.bookingId && String(event.event_type || "").startsWith("PAYMENT.CAPTURE.")) {
    const orderResponse = await paypalFetch(`${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(settlement.providerPaymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!orderResponse.ok) throw new Error("Verified PayPal capture order could not be resolved.");
    const order = await orderResponse.json();
    settlement.bookingId = String(order.purchase_units?.[0]?.custom_id || "");
  }
  return {
    isValid: true,
    event,
    eventId: event.id,
    type: event.event_type,
    resource: event.resource,
    settlement
  };
}
async function createPaymentFunction2({
  amount: amount3,
  currency,
  metadata = {},
  idempotencyKey,
  providerCredentials
}) {
  if (!metadata.returnUrl || !metadata.cancelUrl) {
    throw new Error("Verified PayPal return and cancellation URLs are required.");
  }
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(`${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders`, {
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
          value: formatPayPalAmount(amount3, currency || "USD")
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
  const response = await paypalFetch(
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
    if (order.details?.some((detail) => detail.issue === "ORDER_ALREADY_CAPTURED")) return getPaymentStatusFunction2({ paymentId, providerCredentials });
    throw new Error(`PayPal capture failed: ${order.error?.message || response.status}`);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const settlement = settlementFromCapture(capture);
  settlement.bookingId ||= String(order.purchase_units?.[0]?.custom_id || "");
  settlement.providerPaymentId ||= String(order.id || paymentId);
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
async function refundPaymentFunction2({ paymentId, amount: amount3, currency = "USD", idempotencyKey, providerCredentials }) {
  if (!idempotencyKey) throw new Error("PayPal refund idempotency key is required");
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": idempotencyKey
      },
      body: JSON.stringify({
        amount: amount3 ? {
          value: formatPayPalAmount(Math.abs(amount3), currency),
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
    currencyCode: String(refund.amount?.currency_code || "").toUpperCase(),
    amount: refund.amount ? parsePayPalAmount(refund.amount.value, refund.amount.currency_code) : void 0,
    data: refund
  };
}
async function getPaymentStatusFunction2({ paymentId, providerCredentials }) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const order = await response.json();
  if (!response.ok || order.error) {
    throw new Error(`PayPal status check failed: ${order.error?.message || response.status}`);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const settlement = settlementFromCapture(capture);
  settlement.providerPaymentId ||= String(order.id || paymentId);
  settlement.bookingId ||= String(order.purchase_units?.[0]?.custom_id || "");
  return { status: order.status, settlement, data: order };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return `https://www.paypal.com/activity/payment/${paymentId}`;
}
async function getRefundStatusFunction2({ refundId, providerCredentials }) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(`${getPayPalBaseUrl(providerCredentials)}/v2/payments/refunds/${encodeURIComponent(refundId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const refund = await response.json();
  if (!response.ok || refund.error) throw new Error(`PayPal refund status check failed: ${response.status}`);
  return {
    status: refund.status,
    currencyCode: String(refund.amount?.currency_code || "").toUpperCase(),
    amount: refund.amount ? parsePayPalAmount(refund.amount.value, refund.amount.currency_code) : void 0,
    data: refund
  };
}
async function cancelPaymentFunction2() {
  throw new Error("PayPal uncaptured order cancellation is unavailable; retire the local attempt and reconcile provider expiry or any late capture.");
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
    formatPayPalAmount = (amount3, currency) => NO_DIVISION_CURRENCIES.includes(currency.toUpperCase()) ? Math.round(amount3).toString() : (Math.round(amount3) / 100).toFixed(2);
    parsePayPalAmount = (value, currency) => NO_DIVISION_CURRENCIES.includes(currency.toUpperCase()) ? parseInt(value, 10) : Math.round(parseFloat(value) * 100);
  }
});

// features/keystone/utils/paymentProviderAdapter.ts
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
async function createPayment({ provider, amount: amount3, currency, metadata, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { amount: amount3, currency, metadata, idempotencyKey }
  });
}
async function completePayment({ provider, paymentId, amount: amount3 }) {
  return executeAdapterFunction({
    provider,
    functionName: "completePaymentFunction",
    args: { paymentId, amount: amount3 }
  });
}
async function refundPayment({ provider, paymentId, amount: amount3, currency, metadata, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount: amount3, currency, metadata, idempotencyKey }
  });
}
async function getPaymentStatus({ provider, paymentId }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
}
async function getRefundStatus({ provider, refundId }) {
  return executeAdapterFunction({ provider, functionName: "getRefundStatusFunction", args: { refundId } });
}
async function cancelPayment({ provider, paymentId, idempotencyKey }) {
  return executeAdapterFunction({ provider, functionName: "cancelPaymentFunction", args: { paymentId, idempotencyKey } });
}
async function securityAuthorization({ provider, ...args }) {
  if (provider?.code !== "pp_stripe_stripe") throw new Error("Security card authorizations currently require configured Stripe.");
  return executeAdapterFunction({ provider, functionName: "securityAuthorizationFunction", args });
}
var adapterLoaders;
var init_paymentProviderAdapter = __esm({
  "features/keystone/utils/paymentProviderAdapter.ts"() {
    "use strict";
    init_paymentSecurity();
    init_integrationConfig();
    adapterLoaders = {
      pp_stripe_stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
      pp_paypal_paypal: () => Promise.resolve().then(() => (init_paypal(), paypal_exports))
    };
  }
});

// features/keystone/lib/hotelLoyalty.ts
function loyaltyPolicy(settings) {
  const earnMinorPerPoint = Number(settings?.loyaltyEarnMinorPerPoint), redeemMinorPerPoint = Number(settings?.loyaltyRedeemMinorPerPoint), minimumRedemptionPoints = Number(settings?.loyaltyMinimumRedemptionPoints);
  if ([earnMinorPerPoint, redeemMinorPerPoint, minimumRedemptionPoints].some((value) => !Number.isSafeInteger(value) || value < 1 || value > 2147483647)) throw new Error("Loyalty earning and redemption rules are not configured.");
  return { earnMinorPerPoint, redeemMinorPerPoint, minimumRedemptionPoints };
}
function loyaltyBalance(entries) {
  const points = entries.reduce((sum, entry) => {
    if (!Number.isSafeInteger(entry.points)) throw new Error("Loyalty ledger contains invalid points.");
    return sum + entry.points;
  }, 0);
  if (!Number.isSafeInteger(points)) throw new Error("Loyalty ledger exceeds the supported accounting range.");
  return points;
}
function loyaltyRedemptionValue(points, balance, dueMinor, policy) {
  if (!Number.isSafeInteger(points) || points < policy.minimumRedemptionPoints) throw new Error(`Redeem at least ${policy.minimumRedemptionPoints} whole points.`);
  if (points > balance) throw new Error("Not enough available loyalty points.");
  const amountMinor = points * policy.redeemMinorPerPoint;
  if (!Number.isSafeInteger(amountMinor) || amountMinor > 2147483647 || amountMinor > dueMinor) throw new Error("Redemption cannot exceed the current posted folio balance.");
  return amountMinor;
}
async function bookingAccess(context, bookingId, redeem = false) {
  const booking = await context.prisma.booking.findUnique({ where: { id: bookingId } });
  const operator = redeem ? permissions.canManagePayments({ session: context.session }) : permissions.canManageGuests({ session: context.session }) || permissions.canManageBookings({ session: context.session }) || permissions.canManagePayments({ session: context.session });
  const token = getGuestBookingToken(context, bookingId);
  if (!booking || !operator && (!token || !guestAccessTokenMatches(booking.guestAccessTokenHash, token))) throw new Error("Reservation loyalty access could not be verified.");
  if (!booking.guestProfileId) throw new Error("Reservation has no verified guest profile.");
  return booking;
}
async function reconcileBookingLoyalty(prisma, bookingId, reasonKey, actorId) {
  const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
  const initialKey = `hotel-loyalty:earn:${bookingId}`;
  const initial = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: initialKey } });
  if (!settings?.loyaltyEnabled && !initial) return { pointsChanged: 0 };
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { folio: { include: { entries: true } }, groupBlock: true } });
  if (!booking || booking.status !== "checked_out" || !booking.guestProfileId || booking.billingFolioId || booking.groupBlock?.billingType === "master_folio") return { pointsChanged: 0 };
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-loyalty-guest:${booking.guestProfileId}`);
  const eventKey = initial ? `hotel-loyalty:adjust:${bookingId}:${(0, import_node_crypto6.createHash)("sha256").update(reasonKey).digest("hex").slice(0, 24)}` : initialKey;
  if (await prisma.hotelAuditEvent.findUnique({ where: { eventKey } })) return { pointsChanged: 0 };
  if (!initial && (!booking.folio || calculateFolioBalance(booking.folio.entries).balanceMinor !== 0)) return { pointsChanged: 0 };
  const policy = initial?.afterSnapshot?.policy || loyaltyPolicy(settings);
  const [payments, entries] = await Promise.all([
    prisma.bookingPayment.findMany({ where: { bookingId, status: { in: ["completed", "refunded"] } } }),
    prisma.loyaltyTransaction.findMany({ where: { guestId: booking.guestProfileId, bookingId, type: { in: ["earned", "adjusted"] } } })
  ]);
  if (payments.some((payment) => String(payment.currency || "USD").toUpperCase() !== "USD" || !Number.isSafeInteger(payment.amountMinor))) throw new Error("Loyalty requires reconciled USD payment evidence.");
  const netPaidMinor = Math.max(0, payments.reduce((sum, payment) => sum + (payment.paymentType === "refund" ? -Math.abs(payment.amountMinor) : Math.max(0, payment.amountMinor)), 0));
  const redeemedMinor = (booking.folio?.entries || []).filter((entry) => entry.metadataSnapshot?.loyaltyRedemption === true).reduce((sum, entry) => sum + entry.amountMinor, 0);
  const eligibleRoomMinor = initial ? Number(initial.afterSnapshot.eligibleRoomMinor) : Math.max(0, Number(booking.roomRateMinor || 0) - redeemedMinor);
  const targetPoints = Math.floor(Math.min(eligibleRoomMinor, netPaidMinor) / policy.earnMinorPerPoint), previousPoints = loyaltyBalance(entries), delta = targetPoints - previousPoints;
  if (!Number.isSafeInteger(targetPoints) || Math.abs(delta) > 2147483647) throw new Error("Loyalty award exceeds the supported ledger range.");
  if (delta) await prisma.loyaltyTransaction.create({ data: { guestId: booking.guestProfileId, bookingId, points: delta, type: initial ? "adjusted" : "earned", description: initial ? "Settled refund adjustment to completed stay points" : "Points earned on paid room charges at completed checkout", createdById: actorId || null } });
  await recordHotelLifecycleEvent({ prisma, eventKey, actorId, identity: { request: { bookingId, reasonKey }, aggregateType: "loyalty", aggregateId: booking.guestProfileId, action: initial ? "stay_adjusted" : "stay_earned" }, afterSnapshot: { bookingId, pointsChanged: delta, awardedPoints: targetPoints, eligibleRoomMinor, netPaidMinor, policy } });
  return { pointsChanged: delta };
}
async function hotelLoyaltyAccount(_root, { bookingId }, context) {
  const booking = await bookingAccess(context, bookingId);
  const [settings, entries] = await Promise.all([context.prisma.hotelSettings.findUnique({ where: { id: 1 } }), context.prisma.loyaltyTransaction.findMany({ where: { guestId: booking.guestProfileId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })]);
  const balance = loyaltyBalance(entries);
  const policy = settings?.loyaltyEnabled ? loyaltyPolicy(settings) : null;
  return JSON.stringify({ enabled: settings?.loyaltyEnabled === true, balance, policy, canRedeem: settings?.loyaltyEnabled === true && booking.status === "checked_in" && !booking.billingFolioId, entries: entries.slice(0, 50).map((entry) => ({ id: entry.id, points: entry.points, type: entry.type, description: entry.description, createdAt: entry.createdAt })) });
}
async function redeemHotelLoyalty(_root, { bookingId, points, idempotencyKey }, context) {
  await bookingAccess(context, bookingId, true);
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable bounded loyalty redemption key is required.");
  const eventKey = `hotel-loyalty:redeem:${(0, import_node_crypto6.createHash)("sha256").update(key4).digest("hex")}`;
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    await lockHotelLifecycle(p, eventKey);
    const booking = await bookingAccess({ ...context, prisma: p }, bookingId, true);
    const identity = { request: { bookingId, points }, aggregateType: "loyalty", aggregateId: booking.guestProfileId, action: "redeemed" };
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot);
    const settings = await p.hotelSettings.findUnique({ where: { id: 1 } });
    if (!settings?.loyaltyEnabled) throw new Error("Loyalty redemption is not enabled in property settings.");
    const policy = loyaltyPolicy(settings);
    if (booking.status !== "checked_in" || booking.billingFolioId) throw new Error("Redeem points against an in-house guest-paid folio. Group master billing is excluded.");
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-loyalty-guest:${booking.guestProfileId}`);
    const folio = await ensureBookingFolio(tx, bookingId);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-folio:${folio.folioId}`);
    if (folio.status !== "open") throw new Error("Loyalty redemption requires an open folio.");
    const [entries, ledger] = await Promise.all([p.loyaltyTransaction.findMany({ where: { guestId: booking.guestProfileId } }), p.folioEntry.findMany({ where: { folioId: folio.folioId } })]);
    const amountMinor = loyaltyRedemptionValue(points, loyaltyBalance(entries), calculateFolioBalance(ledger).balanceMinor, policy), serviceDate = await currentPostingDate(p);
    const posting = validateFolioPosting({ postingKey: eventKey, amountMinor, currencyCode: "USD", entryType: "adjustment", direction: "credit", description: `Loyalty redemption: ${points} points` });
    if (folio.currencyCode !== posting.currencyCode) throw new Error("Loyalty supports USD folios only.");
    await p.folioEntry.create({ data: { ...posting, folioId: folio.folioId, serviceDate, sourceType: "operator", sourceId: bookingId, postedById: permissions.canManagePayments({ session: context.session }) ? context.session.itemId : null, metadataSnapshot: { loyaltyRedemption: true, bookingId, guestId: booking.guestProfileId, points, policy } } });
    await p.loyaltyTransaction.create({ data: { guestId: booking.guestProfileId, bookingId, points: -points, type: "redeemed", description: `Redeemed ${points} points for USD ${(amountMinor / 100).toFixed(2)} in-house folio credit`, createdById: permissions.canManagePayments({ session: context.session }) ? context.session.itemId : null } });
    const collectible = await getBookingCollectibleBalance(tx, bookingId);
    await p.booking.update({ where: { id: bookingId }, data: { balanceDueMinor: collectible.balanceDueMinor, balanceDue: collectible.balanceDueMinor / 100, paymentStatus: collectible.balanceDueMinor <= 0 ? "paid" : "partial" } });
    const result = { bookingId, pointsRedeemed: points, amountMinor, balance: loyaltyBalance(entries) - points };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: permissions.canManagePayments({ session: context.session }) ? context.session.itemId : null, identity, afterSnapshot: result });
    return JSON.stringify(result);
  });
}
var import_node_crypto6;
var init_hotelLoyalty = __esm({
  "features/keystone/lib/hotelLoyalty.ts"() {
    "use strict";
    import_node_crypto6 = require("node:crypto");
    init_access();
    init_guestBookingAccess();
    init_bookingFolio();
    init_folioLedger();
    init_hotelBusinessTime();
    init_hotelLifecycle();
    init_serializableTransaction();
  }
});

// features/keystone/lib/boundedLaunch.ts
async function assertHotelGroupsEnabled(prisma) {
  const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
  if (settings?.groupsEnabled !== true) throw new Error(GROUP_OPERATIONS_DISABLED_MESSAGE);
  return settings;
}
var GROUP_OPERATIONS_DISABLED_MESSAGE;
var init_boundedLaunch = __esm({
  "features/keystone/lib/boundedLaunch.ts"() {
    "use strict";
    GROUP_OPERATIONS_DISABLED_MESSAGE = "Enable group operations in durable property settings before creating or changing group blocks.";
  }
});

// features/keystone/lib/guestProfiles.ts
function normalizeGuestEmail(value) {
  const email2 = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email2)) throw new Error("A valid guest email is required.");
  return email2;
}
function splitGuestName(value) {
  const parts2 = value.trim().split(/\s+/).filter(Boolean);
  if (!parts2.length) throw new Error("Guest name is required.");
  return {
    firstName: parts2[0],
    lastName: parts2.slice(1).join(" ") || "Guest"
  };
}
async function ensureGuestProfile(context, { name, email: email2, phone }) {
  const normalizedEmail = normalizeGuestEmail(email2);
  const existing = await context.prisma.guest.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (existing.isBlacklisted) throw new Error("This guest cannot be accepted; contact the property manager.");
    return existing;
  }
  const names = splitGuestName(name);
  return context.prisma.guest.create({
    data: {
      ...names,
      email: normalizedEmail,
      phone: phone?.trim() || ""
    }
  });
}
var init_guestProfiles = __esm({
  "features/keystone/lib/guestProfiles.ts"() {
    "use strict";
  }
});

// features/keystone/lib/inventoryLock.ts
function utcDay(date) {
  const day2 = new Date(date.getTime());
  day2.setUTCHours(0, 0, 0, 0);
  return day2;
}
function getInventoryLockKeys(roomTypeId, checkIn, checkOut) {
  if (!roomTypeId || Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    throw new Error("Invalid booking dates.");
  }
  const keys = [];
  const current = utcDay(checkIn);
  const end = utcDay(checkOut);
  if ((end.getTime() - current.getTime()) / 864e5 > 366) throw new Error("Inventory lock range cannot exceed 366 nights.");
  while (current < end) {
    keys.push(
      `hotel-inventory:${roomTypeId}:${current.toISOString().slice(0, 10)}`
    );
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys.sort();
}
async function lockRoomInventory(prisma, roomTypeId, checkIn, checkOut) {
  for (const key4 of getInventoryLockKeys(roomTypeId, checkIn, checkOut)) {
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      key4
    );
  }
}
var init_inventoryLock = __esm({
  "features/keystone/lib/inventoryLock.ts"() {
    "use strict";
  }
});

// features/keystone/lib/roomOutages.ts
async function loadRoomOutages(prisma) {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: "room_outage" }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  const latest2 = /* @__PURE__ */ new Map();
  for (const event of events) {
    const outage = event.afterSnapshot?.outage;
    if (outage && Number(outage.revision || 0) > Number(latest2.get(event.aggregateId)?.revision || 0)) latest2.set(event.aggregateId, outage);
  }
  return [...latest2.values()];
}
function roomOutageOverlaps(outage, roomId, start, end) {
  return outage.status === "scheduled" && outage.roomId === roomId && new Date(outage.startDate) < end && new Date(outage.endDate) > start;
}
async function assertRoomNotOutOfOrder(prisma, roomId, start, end) {
  if ((await loadRoomOutages(prisma)).some((outage) => roomOutageOverlaps(outage, roomId, start, end))) throw new Error("Physical room has a scheduled out-of-order interval during this stay.");
}
async function getHotelRoomOutages(_root, _args, context) {
  if (!permissions.canManageRooms({ session: context.session }) && !permissions.canManageHousekeeping({ session: context.session })) throw new Error("Not authorized to read room outages.");
  return JSON.stringify(await loadRoomOutages(context.prisma));
}
async function updateHotelRoomOutage(_root, input, context) {
  if (!permissions.canManageRooms({ session: context.session })) throw new Error("Only room managers may schedule or cancel room outages.");
  const reason = String(input.reason || "").trim();
  const eventKey = String(input.idempotencyKey || "").trim();
  if (!reason || reason.length > 1e3 || !eventKey || eventKey.length > 200) throw new Error("A reason and stable idempotency key are required.");
  if (!["schedule", "cancel"].includes(input.action)) throw new Error("Unsupported outage command.");
  const outageId = input.action === "schedule" ? `outage_${(0, import_node_crypto7.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24)}` : String(input.outageId || "");
  const identity = { request: input, aggregateType: "room_outage", aggregateId: outageId, action: input.action };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await lockHotelBusinessDate(p);
    if (await findHotelLifecycleReplay(p, eventKey, identity)) return JSON.stringify(await loadRoomOutages(p));
    const room = await p.room.findUnique({ where: { id: input.roomId } });
    if (!room?.roomTypeId) throw new Error("Physical room not found.");
    let outage;
    const existing = await loadRoomOutages(p);
    if (input.action === "schedule") {
      const start = new Date(String(input.startDate || "")), end = new Date(String(input.endDate || ""));
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || (end.getTime() - start.getTime()) / 864e5 > 366) throw new Error("Outage dates must be a valid range of at most 366 nights.");
      if (start.getUTCHours() || start.getUTCMinutes() || start.getUTCSeconds() || start.getUTCMilliseconds() || end.getUTCHours() || end.getUTCMinutes() || end.getUTCSeconds() || end.getUTCMilliseconds()) throw new Error("Outage dates must be property calendar dates at midnight UTC.");
      await lockRoomInventory(p, room.roomTypeId, start, end);
      await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${room.id}`);
      const conflicting = await p.roomAssignment.findFirst({ where: { roomId: room.id, booking: { OR: [{ status: { in: ["confirmed", "checked_in", "cancellation_pending"] } }, { status: "pending", holdExpiresAt: { gt: /* @__PURE__ */ new Date() } }], checkInDate: { lt: end }, checkOutDate: { gt: start } } } });
      if (conflicting) throw new Error("Move or amend reservations assigned to this room before scheduling an overlapping outage.");
      if (existing.some((item) => roomOutageOverlaps(item, room.id, start, end))) throw new Error("This room already has an overlapping outage.");
      const bookings = await p.booking.findMany({ where: { OR: [{ status: { in: ["confirmed", "checked_in", "cancellation_pending"] } }, { status: "pending", holdExpiresAt: { gt: /* @__PURE__ */ new Date() } }], checkInDate: { lt: end }, checkOutDate: { gt: start }, roomAssignments: { some: { roomTypeId: room.roomTypeId } } }, include: { roomAssignments: true } });
      const rooms = await p.room.findMany({ where: { roomTypeId: room.roomTypeId } });
      const repairs = await p.maintenanceRequest.findMany({ where: { room: { roomTypeId: room.roomTypeId }, status: { notIn: ["verified", "cancelled"] } }, select: { roomId: true } });
      const repairRoomIds = new Set(repairs.map((repair) => repair.roomId));
      const inventories = await p.roomInventory.findMany({ where: { roomTypeId: room.roomTypeId, date: { gte: start, lt: end } } });
      const allocations = await p.groupBlockAllocation.findMany({ where: { roomTypeId: room.roomTypeId, groupBlock: { status: { in: ["tentative", "definite"] }, arrivalDate: { lt: end }, departureDate: { gt: start }, OR: [{ releaseDate: null }, { releaseDate: { gt: /* @__PURE__ */ new Date() } }] } }, include: { groupBlock: true } });
      for (let day2 = new Date(start); day2 < end; day2 = new Date(day2.getTime() + 864e5)) {
        const next2 = new Date(day2.getTime() + 864e5);
        const capacity = rooms.filter((candidate) => candidate.id !== room.id && !repairRoomIds.has(candidate.id) && !["maintenance", "out_of_order"].includes(candidate.status) && !existing.some((item) => roomOutageOverlaps(item, candidate.id, day2, next2))).length;
        const sold = bookings.filter((booking) => booking.checkInDate < next2 && booking.checkOutDate > day2).reduce((sum, booking) => sum + booking.roomAssignments.filter((a) => a.roomTypeId === room.roomTypeId).length, 0);
        const inventory = inventories.find((item) => new Date(item.date).toISOString().slice(0, 10) === day2.toISOString().slice(0, 10));
        const contracted = allocations.filter((item) => item.groupBlock.arrivalDate < next2 && item.groupBlock.departureDate > day2).reduce((sum, item) => sum + Math.max(0, item.roomsHeld - item.roomsPickedUp), 0);
        const inventoryCapacity = inventory ? Math.max(0, Math.min(rooms.length, inventory.totalRooms) - Math.max(inventory.blockedRooms, rooms.length - capacity)) : capacity;
        if (Math.max(sold, Number(inventory?.bookedRooms || 0)) + contracted > inventoryCapacity) throw new Error(`Outage would remove sold room capacity on ${day2.toISOString().slice(0, 10)}.`);
      }
      outage = { revision: 1, id: outageId, roomId: room.id, roomTypeId: room.roomTypeId, startDate: start.toISOString(), endDate: end.toISOString(), reason, status: "scheduled" };
    } else {
      const found = existing.find((item) => item.id === outageId && item.roomId === room.id);
      if (!found || found.status !== "scheduled") throw new Error("Active outage does not belong to this room.");
      await lockRoomInventory(p, room.roomTypeId, new Date(found.startDate), new Date(found.endDate));
      await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${room.id}`);
      const [maintenance, tasks] = await Promise.all([p.maintenanceRequest.count({ where: { roomId: room.id, status: { notIn: ["verified", "cancelled"] } } }), p.housekeepingTask.count({ where: { roomId: room.id, status: { not: "completed" } } })]);
      if (maintenance || tasks) throw new Error("Resolve maintenance and housekeeping before returning outage capacity.");
      outage = { ...found, revision: found.revision + 1, status: "cancelled", reason };
    }
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: existing.find((item) => item.id === outageId) || null, afterSnapshot: { outage } });
    return JSON.stringify(await loadRoomOutages(p));
  });
}
var import_node_crypto7;
var init_roomOutages = __esm({
  "features/keystone/lib/roomOutages.ts"() {
    "use strict";
    import_node_crypto7 = require("node:crypto");
    init_access();
    init_hotelLifecycle();
    init_inventoryLock();
    init_serializableTransaction();
    init_hotelBusinessTime();
  }
});

// features/keystone/lib/hotelAvailability.ts
function hotelStayDates(checkInValue, checkOutValue) {
  const checkIn = new Date(checkInValue);
  const checkOut = new Date(checkOutValue);
  checkIn.setUTCHours(0, 0, 0, 0);
  checkOut.setUTCHours(0, 0, 0, 0);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    throw new Error("Invalid stay dates.");
  }
  if ((checkOut.getTime() - checkIn.getTime()) / 864e5 > MAX_PUBLIC_STAY_NIGHTS) throw new Error(`Stays may not exceed ${MAX_PUBLIC_STAY_NIGHTS} nights.`);
  const days = [];
  for (const day2 = new Date(checkIn); day2 < checkOut; day2.setUTCDate(day2.getUTCDate() + 1)) days.push(new Date(day2));
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
      select: { id: true, checkInDate: true, checkOutDate: true, roomAssignments: { select: { roomTypeId: true, roomId: true } } }
    }),
    context.prisma.roomInventory.findMany({
      where: { roomTypeId: { in: roomTypeIds }, date: { gte: checkIn, lt: checkOut } },
      take: roomTypeIds.length * days.length
    }),
    context.prisma.groupBlockAllocation.findMany({
      where: {
        roomTypeId: { in: roomTypeIds },
        groupBlock: { OR: [{ releaseDate: null }, { releaseDate: { gt: /* @__PURE__ */ new Date() } }], status: { in: ["tentative", "definite"] }, arrivalDate: { lt: checkOut }, departureDate: { gt: checkIn } }
      },
      include: { groupBlock: { select: { arrivalDate: true, departureDate: true, releaseDate: true } } }
    })
  ]);
  const outages = await loadRoomOutages(context.prisma);
  const repairs = await context.prisma.maintenanceRequest.findMany({ where: { status: { notIn: ["verified", "cancelled"] }, room: { roomTypeId: { in: roomTypeIds } } }, select: { roomId: true } });
  const repairRooms = new Set(repairs.map((repair) => repair.roomId));
  const inventoryMap = new Map(inventories.map((item) => [`${item.roomTypeId}:${key2(item.date)}`, item]));
  return roomTypes.map((roomType) => {
    const byDay = days.map((day2) => {
      const next2 = new Date(day2);
      next2.setUTCDate(next2.getUTCDate() + 1);
      const booked = bookings.reduce((count, booking) => count + (booking.checkInDate < next2 && booking.checkOutDate > day2 ? booking.roomAssignments.filter((assignment) => assignment.roomTypeId === roomType.id).length : 0), 0);
      const held = allocations.filter(
        (allocation) => (!allocation.groupBlock.releaseDate || new Date(allocation.groupBlock.releaseDate) > /* @__PURE__ */ new Date()) && allocation.roomTypeId === roomType.id && allocation.groupBlock.arrivalDate < next2 && allocation.groupBlock.departureDate > day2
      ).reduce((sum, allocation) => sum + Math.max(0, allocation.roomsHeld - allocation.roomsPickedUp), 0);
      const inventory = inventoryMap.get(`${roomType.id}:${key2(day2)}`);
      const occupiedPhysical = new Set(bookings.filter((booking) => booking.checkInDate < next2 && booking.checkOutDate > day2).flatMap((booking) => booking.roomAssignments.map((assignment) => assignment.roomId).filter(Boolean)));
      const unavailablePhysical = roomType.rooms.filter((room) => !occupiedPhysical.has(room.id) && (UNSAFE_SELL_STATUSES.has(room.status) || repairRooms.has(room.id) || outages.some((outage) => roomOutageOverlaps(outage, room.id, day2, next2)))).length;
      const total = Math.min(inventory?.totalRooms ?? roomType.rooms.length, roomType.rooms.length);
      const blocked = Math.max(inventory?.blockedRooms ?? 0, unavailablePhysical);
      const excludedInventory = options.excludeInventoryBooking;
      const selfInventory = excludedInventory && excludedInventory.roomTypeId === roomType.id && excludedInventory.checkInDate < next2 && excludedInventory.checkOutDate > day2 ? 1 : 0;
      const occupied = Math.max(Math.max(0, Number(inventory?.bookedRooms ?? 0) - selfInventory), booked);
      return { date: key2(day2), available: Math.max(0, total - blocked - occupied - held), booked: occupied, held, blocked, total };
    });
    return { ...roomType, availabilityByDay: byDay, availableCount: Math.min(...byDay.map((day2) => day2.available)) };
  });
}
async function assertHotelAvailability(context, options) {
  const result = (await getHotelAvailability(context, options))[0];
  if (!result || result.availableCount < 1) {
    const soldOut = result?.availabilityByDay.find((day2) => day2.available < 1);
    throw new Error(`Room type is sold out${soldOut ? ` on ${soldOut.date}` : ""}.`);
  }
  return result;
}
var UNSAFE_SELL_STATUSES, MAX_PUBLIC_STAY_NIGHTS;
var init_hotelAvailability = __esm({
  "features/keystone/lib/hotelAvailability.ts"() {
    "use strict";
    init_roomOutages();
    UNSAFE_SELL_STATUSES = /* @__PURE__ */ new Set(["maintenance", "out_of_order"]);
    MAX_PUBLIC_STAY_NIGHTS = 31;
  }
});

// features/keystone/lib/bookingConfirmation.ts
async function assertGuestEligible(prisma, guestId) {
  if (!guestId) throw new BookingConfirmationError("A guest profile is required.");
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-guest:${guestId}`);
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest || guest.isBlacklisted) throw new BookingConfirmationError("This guest cannot be accepted; contact the property manager.");
}
async function assertBookingConfirmationInventory(tx, booking, _now = /* @__PURE__ */ new Date()) {
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new BookingConfirmationError("Reservation can no longer be confirmed.");
  }
  const today = propertyCalendarDate(_now, booking.pricingSnapshot?.propertyTimeZone || "UTC");
  if (new Date(booking.checkInDate) < today || new Date(booking.checkOutDate) <= today) throw new BookingConfirmationError("The arrival date has passed; arrange a current reservation with the property.");
  await assertGuestEligible(tx.prisma, booking.guestProfileId);
  const assignments = booking.roomAssignments ?? await tx.prisma.roomAssignment.findMany({ where: { bookingId: booking.id } });
  const quantities = /* @__PURE__ */ new Map();
  for (const assignment of assignments) {
    if (!assignment.roomTypeId) throw new BookingConfirmationError("Reservation has no valid room type.");
    quantities.set(assignment.roomTypeId, (quantities.get(assignment.roomTypeId) || 0) + 1);
  }
  if (!quantities.size) throw new BookingConfirmationError("Reservation has no room allocation.");
  for (const roomTypeId of [...quantities.keys()].sort()) {
    await lockRoomInventory(tx.prisma, roomTypeId, booking.checkInDate, booking.checkOutDate);
    const [available] = await getHotelAvailability(tx, {
      roomTypeId,
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      excludeBookingId: booking.id
    });
    if (!available || available.availableCount < quantities.get(roomTypeId)) {
      throw new BookingConfirmationError("The room nights are no longer available. The reservation was not confirmed.");
    }
  }
}
var BookingConfirmationError;
var init_bookingConfirmation = __esm({
  "features/keystone/lib/bookingConfirmation.ts"() {
    "use strict";
    init_hotelBusinessTime();
    init_hotelAvailability();
    init_inventoryLock();
    BookingConfirmationError = class extends Error {
      constructor() {
        super(...arguments);
        this.code = "HOTEL_CONFIRMATION_UNAVAILABLE";
      }
    };
  }
});

// features/keystone/lib/hotelCommunications.ts
function requirePrismaResult2(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
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
  const key4 = `hotel-communication:${eventKey}`;
  const requestHash = hashLifecycleRequest(payload);
  const existing = requirePrismaResult2(await prisma.hotelOutboxEvent.findUnique({ where: { eventKey: key4 } }));
  if (existing) {
    if (existing.requestHash !== requestHash || existing.topic !== topicFor(payload.kind) || existing.aggregateType !== aggregateType || existing.aggregateId !== aggregateId) {
      throw new Error("Communication idempotency key is already bound to different evidence.");
    }
    return { event: existing, replayed: true };
  }
  const event = requirePrismaResult2(await prisma.hotelOutboxEvent.create({
    data: {
      eventKey: key4,
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
  }));
  return { event, replayed: false };
}
async function queueBookingCommunication(prisma, {
  bookingId,
  kind,
  eventKey,
  cancellation,
  modification
}) {
  const [bookingResult, settingsResult] = await Promise.all([
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
  const booking = requirePrismaResult2(bookingResult);
  const settings = requirePrismaResult2(settingsResult);
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
  const settings = requirePrismaResult2(await prisma.hotelSettings.findUnique({ where: { id: 1 } }));
  if (!settings) throw new Error("Hotel contact settings are not configured.");
  const reference = String(input.idempotencyKey || (0, import_node_crypto8.randomUUID)()).trim();
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
  const latest2 = /* @__PURE__ */ new Map();
  for (const event of events) if (!latest2.has(event.topic)) latest2.set(event.topic, event);
  return {
    prearrival: latest2.get("hotel.communication.booking_prearrival") || null,
    confirmation: latest2.get("hotel.communication.booking_confirmation") || null,
    update: latest2.get("hotel.communication.booking_updated") || null,
    cancellation: latest2.get("hotel.communication.booking_cancelled") || null,
    modification: latest2.get("hotel.communication.booking_modification_response") || null
  };
}
var import_node_crypto8, HOTEL_COMMUNICATION_TOPICS;
var init_hotelCommunications = __esm({
  "features/keystone/lib/hotelCommunications.ts"() {
    "use strict";
    import_node_crypto8 = require("node:crypto");
    init_hotelLifecycle();
    HOTEL_COMMUNICATION_TOPICS = [
      "hotel.communication.booking_confirmation",
      "hotel.communication.booking_prearrival",
      "hotel.communication.booking_updated",
      "hotel.communication.booking_cancelled",
      "hotel.communication.booking_no_show",
      "hotel.communication.booking_refund",
      "hotel.communication.booking_modification_response",
      "hotel.communication.contact_received"
    ];
  }
});

// features/keystone/lib/hotelDerivedRates.ts
function validateDerivedRateConfiguration(input) {
  if (!input || typeof input.enabled !== "boolean" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Derived rate requires enabled and current revision.");
  const targetPlanId = String(input.targetPlanId || "").trim(), sourcePlanId = String(input.sourcePlanId || "").trim();
  if (!targetPlanId || targetPlanId.length > 200 || input.enabled && (!sourcePlanId || sourcePlanId.length > 200 || sourcePlanId === targetPlanId)) throw new Error("Choose distinct bounded target and parent rate plans.");
  if (!Number.isSafeInteger(input.multiplierBasisPoints) || input.multiplierBasisPoints < 1 || input.multiplierBasisPoints > 1e5) throw new Error("Derived multiplier must be 1\u2013100000 basis points (10000 = 100%).");
  if (!Number.isSafeInteger(input.adjustmentMinor) || Math.abs(input.adjustmentMinor) > 2147483647) throw new Error("Derived adjustment must be a supported signed minor-unit amount.");
  return { targetPlanId, sourcePlanId, enabled: input.enabled, expectedRevision: input.expectedRevision, multiplierBasisPoints: input.multiplierBasisPoints, adjustmentMinor: input.adjustmentMinor };
}
function resolveDerivedRateAmount(targetPlanId, plans, configs, calculateLeaf, visited = []) {
  if (visited.includes(targetPlanId) || visited.length >= 8) throw new Error("Derived rate cycle or depth greater than eight plans.");
  const plan = plans.get(targetPlanId);
  if (!plan || plan.status !== "active") throw new Error("Derived pricing requires every rate plan to be published.");
  const config2 = configs.get(targetPlanId);
  if (!config2?.enabled) return calculateLeaf(plan);
  const parent = plans.get(config2.sourcePlanId);
  if (!parent || parent.roomTypeId !== plan.roomTypeId || parent.currencyCode !== plan.currencyCode || !parent.isPublic) throw new Error("Derived parent must be a public rate for the same room type and currency.");
  const inherited = resolveDerivedRateAmount(parent.id, plans, configs, calculateLeaf, [...visited, targetPlanId]);
  const amount3 = Math.round(inherited * config2.multiplierBasisPoints / 1e4) + config2.adjustmentMinor;
  if (!Number.isSafeInteger(amount3) || amount3 < 0 || amount3 > 2147483647) throw new Error("Derived pricing produced an invalid nightly amount.");
  return amount3;
}
async function loadHotelDerivedRateGraph(prisma) {
  const [plans, events] = await Promise.all([prisma.ratePlan.findMany({}), prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "derived_rate" } })]);
  const configs = /* @__PURE__ */ new Map();
  for (const event of events) {
    const config2 = event.afterSnapshot?.derivedRate;
    if (config2 && Number(config2.revision) > Number(configs.get(config2.targetPlanId)?.revision || 0)) configs.set(config2.targetPlanId, config2);
  }
  return { plans: new Map(plans.map((plan) => [plan.id, plan])), configs };
}
function authorize3(context) {
  if (!permissions.canManageRooms({ session: context.session })) throw new Error("Room management permission is required for derived rates.");
}
async function hotelDerivedRateWorkspace(_root, _args, context) {
  authorize3(context);
  const graph = await loadHotelDerivedRateGraph(context.prisma);
  return JSON.stringify({ plans: [...graph.plans.values()].map((plan) => ({ id: plan.id, name: plan.name, status: plan.status, isPublic: plan.isPublic, roomTypeId: plan.roomTypeId, currencyCode: plan.currencyCode })), configs: [...graph.configs.values()] });
}
async function updateHotelDerivedRate(_root, { payload, approvalId, idempotencyKey }, context) {
  authorize3(context);
  if (payload.length > 1e4) throw new Error("Derived rate request too large.");
  const data = validateDerivedRateConfiguration(JSON.parse(payload));
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 150) throw new Error("A bounded idempotency key is required.");
  const eventKey = `derived-rate:${key4}`;
  const requestHash = hashLifecycleRequest({ data, actorId: context.session.itemId, approvalId: approvalId || null });
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "hotel-derived-rate-graph");
    const replay = await p.hotelAuditEvent.findUnique({ where: { eventKey } });
    if (replay) {
      if (replay.requestHash !== requestHash) throw new Error("Derived rate idempotency key was reused with different evidence.");
      return JSON.stringify(replay.afterSnapshot.derivedRate);
    }
    const graph = await loadHotelDerivedRateGraph(p);
    const target = graph.plans.get(data.targetPlanId);
    if (!target) throw new Error("Target rate plan not found.");
    const previous = graph.configs.get(data.targetPlanId);
    if ((previous?.revision || 0) !== data.expectedRevision) throw new Error("Derived rate configuration changed. Refresh before applying.");
    const { expectedRevision, ...config2 } = data;
    const next2 = { ...config2, revision: expectedRevision + 1 };
    graph.configs.set(data.targetPlanId, next2);
    if (data.enabled) {
      const validationPlans = new Map(graph.plans);
      validationPlans.set(target.id, { ...target, status: "active" });
      resolveDerivedRateAmount(target.id, validationPlans, graph.configs, (plan) => Number(plan.baseRateMinor));
    }
    const settings = await p.hotelSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new Error("Property configuration is required.");
    if (settings.ratePublicationRequiresApproval !== false) {
      const { targetPlanId: _, ...derivedRate } = data;
      const parameters = { status: target.status, isPublic: Boolean(target.isPublic), derivedRate, economicsHash: (await loadRateEconomics(p, target.id)).economicsHash };
      if (data.enabled) parameters.sourceEconomicsHash = (await loadRateEconomics(p, data.sourcePlanId)).economicsHash;
      await requireHotelApproval(p, { approvalId, action: "rate_publish", aggregateId: target.id, amountMinor: 0, actorId: context.session.itemId, operationKey: eventKey, parameters });
    }
    await p.hotelAuditEvent.create({ data: { eventKey, requestHash, propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "derived_rate", aggregateId: target.id, action: data.enabled ? "configured" : "disabled", actorId: context.session.itemId, beforeSnapshot: { derivedRate: previous || null }, afterSnapshot: { derivedRate: next2 }, metadataSnapshot: { approvalId: approvalId || null }, occurredAt: /* @__PURE__ */ new Date() } });
    return JSON.stringify(next2);
  });
}
var hotelDerivedRateTypeDefs, hotelDerivedRateResolvers;
var init_hotelDerivedRates = __esm({
  "features/keystone/lib/hotelDerivedRates.ts"() {
    "use strict";
    init_access();
    init_serializableTransaction();
    init_hotelLifecycle();
    init_hotelGuestGovernance();
    init_rateEconomics();
    hotelDerivedRateTypeDefs = String.raw`
  extend type Query { hotelDerivedRateWorkspace:String! }
  extend type Mutation { updateHotelDerivedRate(payload:String!,approvalId:ID,idempotencyKey:String!):String! }
`;
    hotelDerivedRateResolvers = { Query: { hotelDerivedRateWorkspace }, Mutation: { updateHotelDerivedRate } };
  }
});

// features/keystone/lib/hotelPricing.ts
var hotelPricing_exports = {};
__export(hotelPricing_exports, {
  calculateHotelPrice: () => calculateHotelPrice,
  hotelQuoteCommercialTermsHash: () => hotelQuoteCommercialTermsHash,
  issueHotelQuoteToken: () => issueHotelQuoteToken,
  verifyHotelQuoteToken: () => verifyHotelQuoteToken
});
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
  return (0, import_node_crypto9.createHmac)("sha256", quoteSecret()).update(payload).digest("base64url");
}
function safeEqual2(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && (0, import_node_crypto9.timingSafeEqual)(a, b);
}
async function calculateHotelPrice(context, input, options = {}) {
  const ancestors = options.derivedParents || [];
  if (ancestors.includes(input.ratePlanId) || ancestors.length >= 8) throw new Error("Derived rate cycle or depth greater than eight plans.");
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
      orderBy: [{ priority: "desc" }, { id: "asc" }]
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
  const advanceDays = Math.floor((checkIn.getTime() - propertyCalendarDate(now, settings.timeZone || "UTC").getTime()) / 864e5);
  if (!options.existingStay && (advanceDays < Number(ratePlan.advanceBookingMin || 0) || ratePlan.advanceBookingMax && advanceDays > ratePlan.advanceBookingMax)) {
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
  if (days.some((day2) => applicableDays[weekdays[day2.getUTCDay()]] === false)) throw new Error("Selected rate plan is unavailable on one or more stay nights.");
  const { derivedConfig, economicsHash: ratePlanEconomicsHash } = await loadRateEconomics(context.prisma, ratePlan.id);
  const parentQuote = derivedConfig?.enabled ? await calculateHotelPrice(context, { ...input, ratePlanId: derivedConfig.sourcePlanId }, { ...options, derivedParents: [...ancestors, input.ratePlanId] }) : null;
  const baseRateMinor = minor(ratePlan.baseRateMinor, ratePlan.baseRate);
  const nightlyRates = days.map((day2) => {
    const season = seasonalRates.find((candidate) => candidate.startDate <= day2 && candidate.endDate >= day2);
    let amount3 = baseRateMinor;
    if (season) {
      if (season.priceMultiplier !== null && season.priceMultiplier !== void 0) amount3 = Math.round(amount3 * Number(season.priceMultiplier));
      amount3 += Number(season.priceAdjustment || 0);
      if (days.length < Number(season.minimumStay || 1)) throw new Error(`Stay does not satisfy seasonal rule ${season.name}.`);
    }
    if (parentQuote) amount3 = resolveDerivedRateAmount(ratePlan.id, /* @__PURE__ */ new Map([[ratePlan.id, ratePlan], [parentQuote.ratePlan.id, parentQuote.ratePlan]]), /* @__PURE__ */ new Map([[ratePlan.id, derivedConfig]]), () => parentQuote.nightlyRates.find((night) => night.date === day2.toISOString().slice(0, 10)).amountMinor);
    if (!Number.isSafeInteger(amount3) || amount3 < 0) throw new Error("Seasonal pricing produced an invalid amount.");
    return { date: day2.toISOString().slice(0, 10), amountMinor: amount3, seasonalRateId: season?.id || null, seasonalRateName: season?.name || null };
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
  const economicsHash = hashLifecycleRequest({
    ratePlanEconomicsHash,
    ratePlan: { id: ratePlan.id, name: ratePlan.name, status: ratePlan.status, isPublic: ratePlan.isPublic },
    parentEconomicsHash: parentQuote?.economicsHash || null,
    roomType: { id: roomType.id, name: roomType.name, maxOccupancy: roomType.maxOccupancy, currencyCode: roomType.currencyCode },
    seasonalRates: seasonalRates.map((season) => ({
      id: season.id,
      roomTypeId: season.roomTypeId,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      priority: season.priority,
      priceMultiplier: season.priceMultiplier,
      priceAdjustment: season.priceAdjustment,
      minimumStay: season.minimumStay,
      isActive: season.isActive
    })),
    property: {
      currencyCode: settings.currencyCode,
      taxRateBasisPoints: settings.taxRateBasisPoints,
      serviceFeeMinor: settings.serviceFeeMinor,
      securityDepositMinor: settings.securityDepositMinor,
      depositPercent: settings.depositPercent,
      checkInTime: settings.checkInTime,
      timeZone: settings.timeZone,
      pricingVersion: settings.pricingVersion
    }
  });
  return {
    roomType,
    ratePlan,
    settings,
    checkIn,
    checkOut,
    adults,
    children,
    numberOfGuests: adults + children,
    arrivalInstant: propertyArrivalInstant(checkIn, settings.checkInTime || "15:00", settings.timeZone || "UTC").toISOString(),
    securityDepositMinor: Number(settings.securityDepositMinor ?? 0),
    depositPercent: Number(settings.depositPercent ?? 100),
    propertyTimeZone: settings.timeZone || "UTC",
    nightlyRates,
    roomSubtotalMinor,
    taxMinor,
    feesMinor,
    totalMinor,
    currencyCode,
    taxRateBasisPoints,
    pricingVersion: settings.pricingVersion || "hotel-pricing-v2",
    economicsHash
  };
}
function hotelQuoteCommercialTermsHash(quote) {
  return (0, import_node_crypto9.createHash)("sha256").update(JSON.stringify({
    economicsHash: quote.economicsHash || null,
    roomTypeId: quote.roomType?.id || null,
    roomTypeName: quote.roomType?.name || null,
    ratePlanId: quote.ratePlan?.id || null,
    ratePlanName: quote.ratePlan?.name || null,
    cancellationPolicy: quote.ratePlan?.cancellationPolicy || "",
    mealPlan: quote.ratePlan?.mealPlan || "room_only",
    checkInDate: quote.checkIn?.toISOString?.() || null,
    checkOutDate: quote.checkOut?.toISOString?.() || null,
    adults: quote.adults ?? null,
    children: quote.children ?? null,
    pricingVersion: quote.pricingVersion || null,
    taxRateBasisPoints: quote.taxRateBasisPoints ?? 0,
    nightlyRates: (quote.nightlyRates || []).map((night) => ({
      date: night.date,
      amountMinor: night.amountMinor,
      seasonalRateId: night.seasonalRateId || null,
      seasonalRateName: night.seasonalRateName || null
    })),
    roomSubtotalMinor: quote.roomSubtotalMinor ?? null,
    taxMinor: quote.taxMinor ?? null,
    feesMinor: quote.feesMinor ?? null,
    totalMinor: quote.totalMinor ?? null,
    currencyCode: quote.currencyCode || null,
    securityDepositMinor: quote.securityDepositMinor ?? null,
    depositPercent: quote.depositPercent ?? null,
    arrivalInstant: quote.arrivalInstant || null,
    propertyTimeZone: quote.propertyTimeZone || null
  })).digest("hex");
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
    commercialTermsHash: hotelQuoteCommercialTermsHash(quote),
    securityDepositMinor: quote.securityDepositMinor,
    depositPercent: quote.depositPercent,
    arrivalInstant: quote.arrivalInstant,
    propertyTimeZone: quote.propertyTimeZone,
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
    pricingVersion: quote.pricingVersion,
    commercialTermsHash: hotelQuoteCommercialTermsHash(quote),
    securityDepositMinor: quote.securityDepositMinor,
    depositPercent: quote.depositPercent,
    arrivalInstant: quote.arrivalInstant,
    propertyTimeZone: quote.propertyTimeZone
  };
  if (claims.expiresAt < Date.now() || Object.entries(expected).some(([key4, value]) => claims[key4] !== value)) {
    throw new Error("Quote is stale; request a current price before booking.");
  }
  return claims;
}
var import_node_crypto9, QUOTE_TTL_MS;
var init_hotelPricing = __esm({
  "features/keystone/lib/hotelPricing.ts"() {
    "use strict";
    init_rateEconomics();
    init_hotelDerivedRates();
    import_node_crypto9 = require("node:crypto");
    init_hotelAvailability();
    init_hotelBusinessTime();
    init_hotelLifecycle();
    QUOTE_TTL_MS = 15 * 6e4;
  }
});

// features/keystone/lib/bookingAmendment.ts
var bookingAmendment_exports = {};
__export(bookingAmendment_exports, {
  amendUnpaidBooking: () => amendUnpaidBooking
});
function must2(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function inventoryDayKeys(roomTypeId, start, end, delta, deltas) {
  for (const day2 = new Date(start); day2 < end; day2.setUTCDate(day2.getUTCDate() + 1)) {
    const date = new Date(Date.UTC(day2.getUTCFullYear(), day2.getUTCMonth(), day2.getUTCDate()));
    const key4 = `${roomTypeId}:${date.toISOString().slice(0, 10)}`;
    const existing = deltas.get(key4);
    deltas.set(key4, { roomTypeId, date, delta: (existing?.delta || 0) + delta });
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
    await lockHotelBusinessDate(prisma);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return prisma.booking.findUnique({ where: { id: bookingId } });
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: true, lineItems: { where: { snapshotStatus: "active" } }, folio: { include: { entries: { include: { reversedBy: true } } } }, payments: true }
    });
    if (!booking || !["pending", "confirmed"].includes(booking.status)) throw new Error("Only open, pre-arrival bookings can be amended.");
    if (booking.groupBlockId || booking.billingFolioId) throw new Error("Picked-up group commercial terms must remain attached to their contract; cancel/rebook through group operations for a different contract.");
    const netPaidMinor = Math.max(0, booking.payments.filter((payment) => ["completed", "refunded"].includes(payment.status)).reduce((sum, payment) => sum + (payment.paymentType === "refund" ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
    if (totalAmountMinor < netPaidMinor) {
      throw new Error(`Refund ${netPaidMinor - totalAmountMinor} minor units through the payment workflow before applying this lower-priced amendment.`);
    }
    const currentRoomTypeId = booking.roomAssignments[0]?.roomTypeId;
    if (!currentRoomTypeId) throw new Error("Booking room type is missing.");
    await lockRoomInventory(prisma, currentRoomTypeId, booking.checkInDate, booking.checkOutDate);
    await lockRoomInventory(prisma, roomTypeId, checkIn, checkOut);
    for (const assignment2 of booking.roomAssignments.filter((item) => item.roomId && item.roomTypeId === roomTypeId).sort((a, b) => a.roomId.localeCompare(b.roomId))) {
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
    const ensured = await ensureBookingFolio(tx, bookingId);
    const openDay = await currentPostingDate(prisma);
    const folio = await prisma.folio.findUniqueOrThrow({ where: { id: ensured.folioId }, include: { entries: { include: { reversedBy: true } } } });
    const activeLineIds = new Set(booking.lineItems.map((line) => line.id));
    const posted = folio.entries.filter((entry) => entry.sourceType === "reservation_snapshot" && activeLineIds.has(entry.sourceId) && !entry.reversedBy);
    const now = /* @__PURE__ */ new Date();
    for (const entry of posted) {
      const reversal = buildFolioReversalPosting(entry, { postingKey: `${eventKey}:reverse:${entry.id}`, reason: `${source} commercial amendment` });
      await prisma.folioEntry.create({ data: { folioId: folio.id, ...reversal, serviceDate: openDay, postedAt: now, metadataSnapshot: { ...reversal.metadataSnapshot, source, amendmentEventKey: eventKey } } });
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
    const depositPercent = Number(commercialPricing?.depositPercent ?? booking.pricingSnapshot?.depositPercent ?? (booking.totalAmountMinor > 0 ? Number(booking.depositAmountMinor || 0) / booking.totalAmountMinor * 100 : 0));
    if (!Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100) throw new Error("Booked deposit policy is invalid.");
    const depositAmountMinor = Math.round(totalAmountMinor * depositPercent / 100);
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
      depositAmountMinor,
      depositAmount: depositAmountMinor / 100,
      roomRate: roomSubtotalMinor / 100,
      taxAmount: taxMinor / 100,
      feesAmount: feesMinor / 100,
      totalAmount: totalAmountMinor / 100,
      balanceDue: balanceDueMinor / 100,
      ratePlanId: commercialPricing?.ratePlanId ?? booking.ratePlanId,
      pricingVersion: commercialPricing?.pricingVersion ?? `${source}-amendment-v1`,
      pricingRevision: revision,
      pricingSnapshot: { depositPercent: commercialPricing?.depositPercent ?? booking.pricingSnapshot?.depositPercent, securityDepositMinor: commercialPricing?.securityDepositMinor ?? booking.pricingSnapshot?.securityDepositMinor, arrivalInstant: commercialPricing?.arrivalInstant || booking.pricingSnapshot?.arrivalInstant, propertyTimeZone: commercialPricing?.propertyTimeZone || booking.pricingSnapshot?.propertyTimeZone, cancellationPolicy: commercialPricing?.cancellationPolicy || booking.pricingSnapshot?.cancellationPolicy, snapshotKeyPrefix: `v${revision}`, source, nightlyRates, roomSubtotalMinor, taxMinor, feesMinor, totalMinor: totalAmountMinor, currencyCode, taxRateBasisPoints: commercialPricing?.taxRateBasisPoints ?? 0 }
    } });
    testFailure("booking");
    const assignment = booking.roomAssignments[0];
    await prisma.roomAssignment.update({ where: { id: assignment.id }, data: { roomTypeId, ...currentRoomTypeId !== roomTypeId ? { roomId: null } : {}, guestName, ratePerNightMinor: Math.round(roomSubtotalMinor / nights), ratePerNight: roomSubtotalMinor / nights / 100 } });
    await ensureReservationSnapshots(tx, bookingId);
    await ensureBookingFolio(tx, bookingId, { postSnapshotEntries: true, serviceDate: openDay });
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
  return runSerializableTransaction(context, execute);
}
var init_bookingAmendment = __esm({
  "features/keystone/lib/bookingAmendment.ts"() {
    "use strict";
    init_folioLedger();
    init_bookingFolio();
    init_reservationSnapshots();
    init_inventoryLock();
    init_hotelAvailability();
    init_hotelLifecycle();
    init_hotelCommunications();
    init_hotelBusinessTime();
    init_serializableTransaction();
  }
});

// features/keystone/lib/hotelGroupLifecycle.ts
function authorize4(context) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error("Not authorized to operate group reservations.");
}
function key3(value) {
  const result = String(value || "").trim();
  if (!result || result.length > 200) throw new Error("A stable bounded idempotency key is required.");
  return result;
}
function validateRoomingList(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error("Provide 1\u201350 rooming-list rows.");
  const errors = [], ids = /* @__PURE__ */ new Set();
  const rows = value.map((item, index) => {
    const rowId = String(item?.rowId || "").trim(), guestName = String(item?.guestName || "").trim(), guestEmail = String(item?.guestEmail || "").trim().toLowerCase(), numberOfGuests = Number(item?.numberOfGuests);
    if (!rowId || rowId.length > 80 || ids.has(rowId)) errors.push(`Row ${index + 1}: unique row reference is required.`);
    ids.add(rowId);
    if (!guestName || guestName.length > 200) errors.push(`Row ${index + 1}: guest name must contain 1\u2013200 characters.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) || guestEmail.length > 320) errors.push(`Row ${index + 1}: valid guest email is required.`);
    if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1 || numberOfGuests > 20) errors.push(`Row ${index + 1}: guest count must be 1\u201320.`);
    const guestPhone = String(item?.guestPhone || "").trim(), specialRequests = String(item?.specialRequests || "").trim();
    if (guestPhone.length > 80 || specialRequests.length > 1e3) errors.push(`Row ${index + 1}: phone or requests exceed the supported length.`);
    return { rowId, guestName, guestEmail, numberOfGuests, guestPhone, specialRequests };
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return rows;
}
function assertGroupPickupAllowed(block, allocation, count, now = /* @__PURE__ */ new Date()) {
  if (!block || !allocation || allocation.groupBlockId !== block.id) throw new Error("Allocation does not belong to this group block.");
  if (!["tentative", "definite"].includes(block.status)) throw new Error("Group block is no longer open for pickup.");
  if (block.releaseDate && new Date(block.releaseDate) <= now) throw new Error("Group pickup cutoff has passed.");
  if (!Number.isInteger(count) || count < 1 || allocation.roomsPickedUp + count > allocation.roomsHeld) throw new Error("Rooming list exceeds the remaining group allotment.");
  if (!["guest_pays", "master_folio"].includes(block.billingType)) throw new Error("Split payer windows are not enabled; choose guest-paid or whole-stay master billing.");
  if (block.billingType === "master_folio" && block.masterFolio?.status !== "open") throw new Error("An open master folio is required.");
}
async function groupCommercialContract(prisma, groupBlockId) {
  const event = await prisma.hotelAuditEvent.findFirst({ where: { aggregateType: "group_block", aggregateId: groupBlockId, action: "created" } });
  const contract = event?.afterSnapshot?.contract;
  if (!contract?.ratePlanId || !Number.isSafeInteger(contract.taxRateBasisPoints) || !Number.isSafeInteger(contract.feesMinor)) throw new Error("Group commercial contract is missing; do not pick up legacy experimental records.");
  return contract;
}
async function createHotelGroupRoomingList(_root, { groupBlockId, allocationId, rows: rawRows, idempotencyKey }, context) {
  authorize4(context);
  if (rawRows.length > 1e5) throw new Error("Rooming-list payload exceeds 100 KB.");
  const rows = validateRoomingList(JSON.parse(rawRows));
  const eventKey = `group-rooming:${key3(idempotencyKey)}`;
  const identity = { request: { groupBlockId, allocationId, rows }, aggregateType: "group_block", aggregateId: groupBlockId, action: "rooming_list_created" };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await assertHotelGroupsEnabled(p);
    await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${groupBlockId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot);
    const block = await p.groupBlock.findUnique({ where: { id: groupBlockId }, include: { masterFolio: true } });
    const allocation = await p.groupBlockAllocation.findUnique({ where: { id: allocationId } });
    assertGroupPickupAllowed(block, allocation, rows.length);
    await lockHotelBusinessDate(p);
    const clock = await p.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || block.arrivalDate < clock.currentBusinessDate) throw new Error("A rooming list cannot create stays in a closed business date.");
    const contract = await groupCommercialContract(p, groupBlockId);
    if (rows.some((row) => row.numberOfGuests > contract.maxOccupancy)) throw new Error(`Each room supports at most ${contract.maxOccupancy} occupants.`);
    await lockRoomInventory(p, allocation.roomTypeId, block.arrivalDate, block.departureDate);
    const [availability] = await getHotelAvailability(tx, { roomTypeId: allocation.roomTypeId, checkInDate: block.arrivalDate, checkOutDate: block.departureDate });
    if (availability && rows.some((row) => row.numberOfGuests > availability.maxOccupancy)) throw new Error("Guest count exceeds current room-type safety capacity.");
    const remaining = allocation.roomsHeld - allocation.roomsPickedUp;
    if (!availability || availability.availabilityByDay.some((day2) => day2.total - day2.blocked - day2.booked - day2.held + remaining < rows.length)) throw new Error("Physical inventory no longer supports the group commitment; resolve room outages or relocation first.");
    const nights = Math.round((block.departureDate.getTime() - block.arrivalDate.getTime()) / 864e5);
    const roomMinor = allocation.rateMinor * nights, taxMinor = Math.round(roomMinor * contract.taxRateBasisPoints / 1e4), feesMinor = contract.feesMinor, totalMinor = roomMinor + taxMinor + feesMinor;
    if (!Number.isSafeInteger(totalMinor) || totalMinor > 2147483647) throw new Error("Group reservation total exceeds the supported accounting range.");
    const created = [];
    for (const row of rows) {
      const rowKey = `group-rooming-row:${groupBlockId}:${row.rowId}`;
      const existing = await p.hotelAuditEvent.findUnique({ where: { eventKey: rowKey } });
      if (existing) throw new Error(`Rooming-list row ${row.rowId} already has a reservation; use its existing record.`);
      const guest = await ensureGuestProfile(tx, { name: row.guestName, email: row.guestEmail, phone: row.guestPhone });
      await assertGuestEligible(p, guest.id);
      const id = `gbk_${(0, import_node_crypto10.createHash)("sha256").update(rowKey).digest("hex").slice(0, 24)}`, now = /* @__PURE__ */ new Date();
      const booking = await p.booking.create({ data: {
        id,
        confirmationNumber: `GB-${(0, import_node_crypto10.createHash)("sha256").update(rowKey).digest("hex").slice(0, 12).toUpperCase()}`,
        guestName: row.guestName,
        guestEmail: row.guestEmail,
        guestPhone: row.guestPhone,
        guestProfileId: guest.id,
        checkInDate: block.arrivalDate,
        checkOutDate: block.departureDate,
        numberOfGuests: row.numberOfGuests,
        numberOfAdults: row.numberOfGuests,
        numberOfChildren: 0,
        roomRateMinor: roomMinor,
        roomRate: roomMinor / 100,
        taxAmountMinor: taxMinor,
        taxAmount: taxMinor / 100,
        feesAmountMinor: feesMinor,
        feesAmount: feesMinor / 100,
        totalAmountMinor: totalMinor,
        totalAmount: totalMinor / 100,
        depositAmountMinor: Math.round(totalMinor * Number(contract.depositPercent ?? 100) / 100),
        depositAmount: Math.round(totalMinor * Number(contract.depositPercent ?? 100) / 100) / 100,
        balanceDueMinor: totalMinor,
        balanceDue: totalMinor / 100,
        currencyCode: allocation.currencyCode,
        ratePlanId: contract.ratePlanId,
        pricingVersion: "group-contract-v1",
        pricingRevision: 1,
        pricingSnapshot: { ...contract, snapshotKeyPrefix: "v1", source: "group", groupBlockId, allocationId, rowId: row.rowId, nightlyRates: Array.from({ length: nights }, (_, index) => ({ date: new Date(block.arrivalDate.getTime() + index * 864e5).toISOString().slice(0, 10), amountMinor: allocation.rateMinor })), roomSubtotalMinor: roomMinor, taxMinor, feesMinor, totalMinor },
        status: "confirmed",
        confirmedAt: now,
        paymentStatus: "unpaid",
        source: "group",
        holdExpiresAt: null,
        specialRequests: row.specialRequests,
        groupBlockId,
        groupBlockAllocationId: allocationId,
        ...block.billingType === "master_folio" ? { billingFolioId: block.masterFolio.id } : {},
        guestAccessTokenHash: hashGuestAccessToken(createGuestAccessToken()),
        guestAccessTokenIssuedAt: now
      } });
      await p.roomAssignment.create({ data: { bookingId: id, roomTypeId: allocation.roomTypeId, guestName: row.guestName, ratePerNightMinor: allocation.rateMinor, ratePerNight: allocation.rateMinor / 100, specialRequests: row.specialRequests } });
      const snapshots = buildReservationSnapshotLines({ bookingId: id, checkInDate: block.arrivalDate, checkOutDate: block.departureDate, roomTotalCents: roomMinor, taxTotalCents: taxMinor, feesTotalCents: feesMinor, currencyCode: allocation.currencyCode, roomType: { id: allocation.roomTypeId, name: contract.roomTypeName }, ratePlan: { id: contract.ratePlanId, name: contract.ratePlanName, cancellationPolicy: contract.cancellationPolicy, mealPlan: contract.mealPlan }, taxRateBasisPoints: contract.taxRateBasisPoints, nightlyRoomAmounts: Array(nights).fill(allocation.rateMinor), snapshotKeyPrefix: "v1", pricingSource: "group-contract" });
      for (const { reservation: _, ...line } of snapshots) await p.reservationLineItem.create({ data: { ...line, date: new Date(line.date), reservationId: id, snapshotStatus: "active" } });
      await ensureBookingFolio(tx, id);
      await recordHotelLifecycleEvent({ prisma: p, eventKey: rowKey, actorId: context.session.itemId, identity: { request: { groupBlockId, allocationId, row }, aggregateType: "booking", aggregateId: id, action: "group_created" }, afterSnapshot: { bookingId: id, rowId: row.rowId, groupBlockId, allocationId, totalAmountMinor: totalMinor, billingType: block.billingType } });
      await queueBookingCommunication(p, { bookingId: id, kind: "booking_confirmation", eventKey: `booking:${id}:confirmation:v1` });
      created.push({ rowId: row.rowId, bookingId: id, confirmationNumber: booking.confirmationNumber, totalAmountMinor: totalMinor });
    }
    await p.groupBlockAllocation.update({ where: { id: allocationId }, data: { roomsPickedUp: { increment: rows.length } } });
    const result = { groupBlockId, allocationId, created };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, afterSnapshot: result });
    return JSON.stringify(result);
  });
}
async function releaseCancelledGroupPickup(prisma, bookingId, cancellationKey) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking?.groupBlockId || !booking.groupBlockAllocationId || !["cancelled", "no_show"].includes(booking.status)) return;
  const eventKey = `group-pickup-return:${bookingId}`;
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${booking.groupBlockId}`);
  if (await prisma.hotelAuditEvent.findUnique({ where: { eventKey } })) return;
  const allocation = await prisma.groupBlockAllocation.findUnique({ where: { id: booking.groupBlockAllocationId } });
  if (!allocation || allocation.groupBlockId !== booking.groupBlockId || allocation.roomsPickedUp < 1) throw new Error("Cancelled group pickup has inconsistent allocation evidence.");
  await prisma.groupBlockAllocation.update({ where: { id: allocation.id }, data: { roomsPickedUp: { decrement: 1 } } });
  await recordHotelLifecycleEvent({ prisma, eventKey, identity: { request: { bookingId, cancellationKey }, aggregateType: "group_block", aggregateId: booking.groupBlockId, action: "pickup_returned" }, afterSnapshot: { bookingId, allocationId: allocation.id, roomsPickedUp: allocation.roomsPickedUp - 1 } });
}
async function releaseDueHotelGroupBlocks(context) {
  const due = await context.prisma.groupBlock.findMany({ where: { status: { in: ["tentative", "definite"] }, releaseDate: { lte: /* @__PURE__ */ new Date() } }, take: 50, orderBy: { releaseDate: "asc" } });
  let released = 0;
  for (const item of due) await runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${item.id}`);
    const block = await p.groupBlock.findUnique({ where: { id: item.id } });
    if (!block || !["tentative", "definite"].includes(block.status) || !block.releaseDate || new Date(block.releaseDate) > /* @__PURE__ */ new Date()) return;
    await p.groupBlock.update({ where: { id: block.id }, data: { status: "released" } });
    await recordHotelLifecycleEvent({ prisma: p, eventKey: `group-cutoff:${block.id}`, identity: { request: { groupBlockId: block.id, releaseDate: block.releaseDate }, aggregateType: "group_block", aggregateId: block.id, action: "cutoff_released" }, beforeSnapshot: { status: block.status }, afterSnapshot: { status: "released", pickedReservationsPreserved: true } });
    released++;
  });
  return { released };
}
async function closeHotelGroupMasterFolio(_root, { groupBlockId, idempotencyKey }, context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Payment permission is required to close a group master folio.");
  const eventKey = `group-master-close:${key3(idempotencyKey)}`;
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await assertHotelGroupsEnabled(p);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${groupBlockId}`);
    const identity = { request: { groupBlockId }, aggregateType: "group_block", aggregateId: groupBlockId, action: "master_folio_closed" };
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot);
    const block = await p.groupBlock.findUnique({ where: { id: groupBlockId }, include: { masterFolio: { include: { entries: true } }, bookings: true } });
    if (!block?.masterFolio || block.masterFolio.status !== "open") throw new Error("Open group master folio not found.");
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-folio:${block.masterFolio.id}`);
    const pendingPayments = await p.bookingPayment.count({ where: { bookingId: { in: block.bookings.map((booking) => booking.id) }, status: { in: ["pending", "processing"] } } });
    if (pendingPayments) throw new Error("Resolve pending group payment attempts before master-folio close.");
    if (block.bookings.some((booking) => !["checked_out", "cancelled", "no_show"].includes(booking.status))) throw new Error("All group stays must depart or be cancelled before master-folio close.");
    const pendingRefunds = await p.refundIntent.count({ where: { bookingId: { in: block.bookings.map((booking) => booking.id) }, status: { in: ["pending", "processing", "failed", "dead_letter"] } } });
    if (pendingRefunds) throw new Error("Resolve pending group refunds before master-folio close.");
    assertFolioCanClose(block.masterFolio.entries);
    await p.folio.update({ where: { id: block.masterFolio.id }, data: { status: "closed", closedAt: /* @__PURE__ */ new Date() } });
    const result = { groupBlockId, folioId: block.masterFolio.id, status: "closed" };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, afterSnapshot: result });
    return JSON.stringify(result);
  });
}
async function hotelGroupWorkspace(_root, { after }, context) {
  authorize4(context);
  const [settings, groups, roomTypes] = await Promise.all([context.prisma.hotelSettings.findUnique({ where: { id: 1 } }), context.prisma.groupBlock.findMany({ ...after ? { cursor: { id: after }, skip: 1 } : {}, orderBy: [{ arrivalDate: "desc" }, { id: "asc" }], take: 101, include: { allocations: { include: { roomType: true } }, bookings: { select: { id: true, confirmationNumber: true, guestName: true, status: true } }, masterFolio: { include: { entries: { select: { amountMinor: true, direction: true, currencyCode: true } } } } } }), context.prisma.roomType.findMany({ include: { ratePlans: { where: { status: "active" } } } })]);
  const page = groups.slice(0, 100);
  return JSON.stringify({ groupsEnabled: settings?.groupsEnabled === true, groups: page, roomTypes, hasMore: groups.length > 100, nextCursor: page.at(-1)?.id || null });
}
async function detachHotelGroupBooking(_root, args, context) {
  authorize4(context);
  const reason = String(args.reason || "").trim();
  if (!reason || reason.length > 500) throw new Error("Record a bounded reason and guest agreement for leaving the group contract.");
  const eventKey = `group-detach:${key3(args.idempotencyKey)}`, identity = { request: { ...args, reason }, aggregateType: "booking", aggregateId: args.bookingId, action: "group_detached" };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await lockHotelBusinessDate(p);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${args.bookingId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot);
    await assertHotelGroupsEnabled(p);
    const booking = await p.booking.findUnique({ where: { id: args.bookingId }, include: { groupBlock: true } });
    if (!booking?.groupBlockId || !booking.groupBlockAllocationId || booking.groupBlock?.billingType !== "guest_pays" || booking.billingFolioId) throw new Error("Only a guest-paid group pickup may detach; master billing requires a revised group agreement.");
    if (!["pending", "confirmed"].includes(booking.status) || booking.status === "pending" && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= /* @__PURE__ */ new Date())) throw new Error("Only an unexpired pre-arrival group pickup may detach.");
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${booking.groupBlockId}`);
    const allocation = await p.groupBlockAllocation.findUnique({ where: { id: booking.groupBlockAllocationId } });
    if (!allocation || allocation.groupBlockId !== booking.groupBlockId || allocation.roomsPickedUp < 1) throw new Error("Group pickup allocation is inconsistent.");
    await lockRoomInventory(p, allocation.roomTypeId, booking.groupBlock.arrivalDate, booking.groupBlock.departureDate);
    const { calculateHotelPrice: calculateHotelPrice2 } = await Promise.resolve().then(() => (init_hotelPricing(), hotelPricing_exports));
    const quote = await calculateHotelPrice2(tx, { roomTypeId: args.roomTypeId, ratePlanId: args.ratePlanId, checkInDate: args.checkInDate, checkOutDate: args.checkOutDate, numberOfAdults: booking.numberOfAdults || booking.numberOfGuests, numberOfChildren: booking.numberOfChildren || 0 });
    await p.groupBlockAllocation.update({ where: { id: allocation.id }, data: { roomsPickedUp: { decrement: 1 } } });
    await p.booking.update({ where: { id: booking.id }, data: { groupBlockId: null, groupBlockAllocationId: null, source: "staff" } });
    const { amendUnpaidBooking: amendUnpaidBooking2 } = await Promise.resolve().then(() => (init_bookingAmendment(), bookingAmendment_exports));
    const changed = await amendUnpaidBooking2({ context: tx, withinTransaction: true, bookingId: booking.id, checkInDate: quote.checkIn.toISOString(), checkOutDate: quote.checkOut.toISOString(), roomTypeId: args.roomTypeId, guestName: booking.guestName, guestEmail: booking.guestEmail, guestProfileId: booking.guestProfileId, numberOfGuests: quote.numberOfGuests, totalAmountMinor: quote.totalMinor, currencyCode: quote.currencyCode, idempotencyKey: `${eventKey}:reprice`, source: "group-recontract", actorId: context.session.itemId, commercialPricing: { depositPercent: quote.depositPercent, securityDepositMinor: Number(quote.settings.securityDepositMinor ?? 0), arrivalInstant: quote.arrivalInstant, propertyTimeZone: quote.propertyTimeZone, cancellationPolicy: quote.ratePlan.cancellationPolicy, ratePlanId: quote.ratePlan.id, pricingVersion: quote.pricingVersion, roomSubtotalMinor: quote.roomSubtotalMinor, taxMinor: quote.taxMinor, feesMinor: quote.feesMinor, totalMinor: quote.totalMinor, taxRateBasisPoints: quote.taxRateBasisPoints, nightlyRates: quote.nightlyRates } });
    const result = { bookingId: booking.id, formerGroupBlockId: booking.groupBlockId, formerAllocationId: allocation.id, reason, checkInDate: changed.checkInDate, checkOutDate: changed.checkOutDate, totalAmountMinor: changed.totalAmountMinor };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { groupBlockId: booking.groupBlockId, allocationId: allocation.id, totalAmountMinor: booking.totalAmountMinor }, afterSnapshot: result });
    return JSON.stringify(result);
  });
}
var import_node_crypto10;
var init_hotelGroupLifecycle = __esm({
  "features/keystone/lib/hotelGroupLifecycle.ts"() {
    "use strict";
    import_node_crypto10 = require("node:crypto");
    init_access();
    init_boundedLaunch();
    init_guestProfiles();
    init_bookingConfirmation();
    init_guestBookingAccess();
    init_reservationSnapshots();
    init_bookingFolio();
    init_folioLedger();
    init_hotelAvailability();
    init_inventoryLock();
    init_hotelBusinessTime();
    init_hotelLifecycle();
    init_serializableTransaction();
    init_hotelCommunications();
  }
});

// features/keystone/lib/hotelReceivables.ts
function authorize5(context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Receivables payment permission is required.");
  return context.session.itemId;
}
function text42(value, label, max = 200) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new Error(`${label} is required and bounded.`);
  return result;
}
function minor2(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error("Enter a valid integer minor-unit amount.");
  return Number(value);
}
async function latest(prisma, type) {
  const rows = await prisma.$queryRaw(import_client2.Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent"
    WHERE "aggregateType"=${type} AND "propertyKey"=${HOTEL_PROPERTY_KEY}
    ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row) => row.state);
}
function receivableAging(invoices, on) {
  const day2 = new Date(on);
  day2.setUTCHours(0, 0, 0, 0);
  return invoices.map((invoice) => {
    const overdueDays = Math.max(0, Math.floor((day2.getTime() - new Date(invoice.dueOn).getTime()) / 864e5));
    return { ...invoice, overdueDays, agingBucket: invoice.balanceMinor < 0 ? "credit due to company" : !invoice.balanceMinor ? "settled" : overdueDays === 0 ? "current" : overdueDays <= 30 ? "1\u201330 days" : overdueDays <= 60 ? "31\u201360 days" : "61+ days" };
  });
}
async function hotelReceivableOperations(_root, _args, context) {
  authorize5(context);
  const [accounts, invoices, clock] = await Promise.all([latest(context.prisma, "receivable_account"), latest(context.prisma, "receivable_invoice"), context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } })]);
  if (!clock) throw new Error("Property business date is required.");
  return { accounts: accounts.map((account) => ({ ...account, outstandingMinor: invoices.filter((i) => i.accountId === account.id).reduce((sum, i) => sum + i.balanceMinor, 0) })), invoices: receivableAging(invoices, clock.currentBusinessDate) };
}
async function manageHotelReceivable(_root, { input }, context) {
  const actorId = authorize5(context);
  const action = text42(input?.action, "Action");
  if (!["account", "invoice", "route_charges", "collect", "write_off", "refund_credit"].includes(action)) throw new Error("Unknown receivables action.");
  const id = text42(input.id, "Record ID");
  const idempotencyKey = text42(input.idempotencyKey, "Idempotency key");
  const payerAllocations = action === "route_charges" ? normalizePayerAllocations(input.payerAllocations) : [];
  const amountMinor = action === "route_charges" ? minor2(payerAllocations.reduce((sum, row) => sum + row.amountMinor, 0)) : minor2(input.amountMinor, action === "account" ? 0 : 1);
  const createsInvoice = action === "invoice" || action === "route_charges";
  const reference = text42(input.reference, "Billing or payment reference");
  const normalized = {
    action,
    id,
    amountMinor,
    payerAllocations,
    reference,
    accountId: String(input.accountId || ""),
    folioId: String(input.folioId || ""),
    bookingId: String(input.bookingId || ""),
    billingEmail: String(input.billingEmail || ""),
    termsDays: Number(input.termsDays || 0),
    method: String(input.method || ""),
    approvalId: String(input.approvalId || ""),
    actorId
  };
  const aggregateType = action === "account" ? "receivable_account" : "receivable_invoice";
  const eventKey = `receivable:${idempotencyKey}`;
  const identity = { request: normalized, aggregateType, aggregateId: id, action };
  return runSerializableTransaction(context, async (tx) => {
    const parentFolio = createsInvoice ? await tx.prisma.folio.findUnique({ where: { id: text42(input.folioId, "Folio ID") }, select: { bookingId: true } }) : null;
    const settlementBookingId = parentFolio?.bookingId || (action === "route_charges" ? normalized.bookingId : "");
    if (settlementBookingId) await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${settlementBookingId}`);
    if (createsInvoice) await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-folio:${normalized.folioId}`);
    await lockHotelLifecycle(tx.prisma, "receivables");
    const folio = createsInvoice ? await tx.prisma.folio.findUnique({ where: { id: input.folioId }, include: { entries: true } }) : null;
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    const accounts = await latest(tx.prisma, "receivable_account");
    const invoices = await latest(tx.prisma, "receivable_invoice");
    let before = null;
    let next2;
    if (action === "account") {
      if (accounts.some((a) => a.id === id)) throw new Error("This credit account already exists.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.billingEmail) || normalized.billingEmail.length > 320) throw new Error("A valid billing email is required.");
      if (!Number.isInteger(normalized.termsDays) || normalized.termsDays < 0 || normalized.termsDays > 365) throw new Error("Credit terms must be 0\u2013365 days.");
      next2 = { id, sequence: 1, name: reference, billingEmail: normalized.billingEmail, creditLimitMinor: amountMinor, termsDays: normalized.termsDays, currencyCode: "USD" };
    } else if (createsInvoice) {
      if (!folio || folio.status !== "open" || folio.currencyCode !== "USD") throw new Error("An open USD folio is required for direct billing.");
      if (action === "route_charges") {
        const member = await payerWindowMember(tx.prisma, folio, normalized.bookingId);
        validatePayerAllocations(folio, invoices, payerAllocations, member);
      }
      if (invoices.some((i) => i.id === id)) throw new Error("This invoice already exists.");
      const account = accounts.find((a) => a.id === input.accountId);
      if (!account) throw new Error("Approved credit account not found.");
      const balance = settlementBookingId ? (await getBookingCollectibleBalance(tx, settlementBookingId)).balanceDueMinor : calculateFolioBalance(folio.entries).balanceMinor;
      if (amountMinor > balance) throw new Error("Invoice allocation exceeds the remaining folio balance.");
      const outstanding = invoices.filter((i) => i.accountId === account.id).reduce((sum, i) => sum + i.balanceMinor, 0);
      if (outstanding + amountMinor > account.creditLimitMinor) throw new Error("Account credit limit would be exceeded.");
      const day2 = await currentPostingDate(tx.prisma);
      const due = new Date(day2);
      due.setUTCDate(due.getUTCDate() + account.termsDays);
      next2 = {
        id,
        sequence: 1,
        accountId: account.id,
        folioId: folio.id,
        bookingId: settlementBookingId || null,
        currencyCode: "USD",
        amountMinor,
        balanceMinor: amountMinor,
        issuedOn: day2.toISOString().slice(0, 10),
        dueOn: due.toISOString().slice(0, 10),
        status: "open",
        reference,
        ...payerAllocations.length ? { payerAllocations } : {}
      };
      await tx.prisma.folioEntry.create({ data: {
        folioId: folio.id,
        postingKey: `ar-transfer:${id}`,
        entryType: "transfer",
        direction: "credit",
        amountMinor,
        currencyCode: "USD",
        description: `Direct bill to ${account.name}: ${reference}`,
        serviceDate: day2,
        postedAt: /* @__PURE__ */ new Date(),
        sourceType: "system",
        sourceId: id,
        metadataSnapshot: { receivableInvoiceId: id, accountId: account.id, sourceEntryIds: payerAllocations.length ? payerAllocations.map((row) => row.entryId) : folio.entries.map((entry) => entry.id), payerAllocations, actorId }
      } });
    } else {
      const invoice = invoices.find((i) => i.id === id);
      if (!invoice || (action === "refund_credit" ? invoice.status !== "credit_due" || amountMinor > -invoice.balanceMinor : invoice.status !== "open" || amountMinor > invoice.balanceMinor)) throw new Error("Collection or payout exceeds the eligible invoice balance.");
      before = invoice;
      const remaining = invoice.balanceMinor + (action === "refund_credit" ? amountMinor : -amountMinor);
      if (action === "write_off") {
        await requireHotelApproval(tx.prisma, { approvalId: input.approvalId, action: "write_off", aggregateId: id, amountMinor, actorId, operationKey: eventKey });
      } else if (action === "refund_credit") {
        await requireHotelApproval(tx.prisma, { approvalId: input.approvalId, action: "refund", aggregateId: id, amountMinor, actorId, operationKey: eventKey });
      }
      if (action !== "write_off" && !["cash", "bank_transfer", "check"].includes(normalized.method)) throw new Error("Record a cash, bank transfer or check collection with its receipt reference.");
      const cashierShiftId = action !== "write_off" && normalized.method === "cash" ? await assertActiveCashierShift(tx.prisma, actorId, "USD") : null;
      const day2 = await currentPostingDate(tx.prisma);
      next2 = { ...invoice, sequence: invoice.sequence + 1, writtenOffMinor: (invoice.writtenOffMinor || 0) + (action === "write_off" ? amountMinor : 0), balanceMinor: remaining, status: remaining < 0 ? "credit_due" : remaining > 0 ? "open" : action === "write_off" ? "written_off" : action === "refund_credit" ? "refunded" : "paid" };
      await recordHotelLifecycleEvent({
        prisma: tx.prisma,
        actorId,
        eventKey: `${eventKey}:collection`,
        identity: { request: normalized, aggregateType: "receivable_payment", aggregateId: id, action },
        afterSnapshot: { invoiceId: id, amountMinor: action === "refund_credit" ? -amountMinor : amountMinor, currencyCode: "USD", method: normalized.method, cashierShiftId, reference, serviceDate: day2.toISOString().slice(0, 10), kind: action }
      });
    }
    if (createsInvoice && settlementBookingId) {
      const obligation = await getBookingCollectibleBalance(tx, settlementBookingId);
      await tx.prisma.booking.update({ where: { id: settlementBookingId }, data: { balanceDueMinor: obligation.balanceDueMinor, balanceDue: obligation.balanceDueMinor / 100, paymentStatus: obligation.balanceDueMinor ? "partial" : "paid" } });
    }
    await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId, eventKey, identity, beforeSnapshot: before, afterSnapshot: next2 });
    return next2;
  });
}
async function creditDirectBillingForCancellation(tx, bookingId, folioId, cancellationKey) {
  await lockHotelLifecycle(tx.prisma, "receivables");
  const invoices = (await latest(tx.prisma, "receivable_invoice")).filter((invoice) => (invoice.bookingId === bookingId || invoice.bookingId === null) && invoice.folioId === folioId);
  const entries = await tx.prisma.folioEntry.findMany({ where: { folioId }, select: { id: true, reversesId: true, amountMinor: true, direction: true, currencyCode: true } });
  const reversed = new Set(entries.filter((entry) => entry.reversesId).map((entry) => entry.reversesId));
  let available = Math.max(0, -calculateFolioBalance(entries).balanceMinor);
  for (const invoice of invoices.sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.id.localeCompare(b.id))) {
    const eventKey = `${cancellationKey}:ar-credit:${invoice.id}`;
    if (await tx.prisma.hotelAuditEvent.findUnique({ where: { eventKey } })) continue;
    const routedCancelledMinor = invoice.payerAllocations?.reduce((sum, row) => sum + (reversed.has(row.entryId) ? row.amountMinor : 0), 0);
    const creditMinor = Math.min(available, Math.max(0, invoice.amountMinor - (invoice.creditedMinor || 0)), routedCancelledMinor ?? Infinity);
    if (!creditMinor) continue;
    available -= creditMinor;
    const writtenOffReversed = Math.min(invoice.writtenOffMinor || 0, Math.max(0, creditMinor - Math.max(0, invoice.balanceMinor)));
    const balanceMinor = invoice.balanceMinor - creditMinor + writtenOffReversed;
    let allocationCredit = creditMinor;
    const payerAllocations = invoice.payerAllocations?.map((row) => {
      const release = reversed.has(row.entryId) ? Math.min(allocationCredit, row.amountMinor) : 0;
      allocationCredit -= release;
      return { ...row, amountMinor: row.amountMinor - release };
    }).filter((row) => row.amountMinor > 0);
    const next2 = {
      ...invoice,
      ...payerAllocations ? { payerAllocations } : {},
      sequence: invoice.sequence + 1,
      writtenOffMinor: (invoice.writtenOffMinor || 0) - writtenOffReversed,
      creditedMinor: (invoice.creditedMinor || 0) + creditMinor,
      balanceMinor,
      status: balanceMinor < 0 ? "credit_due" : balanceMinor > 0 ? "open" : "paid"
    };
    const day2 = await currentPostingDate(tx.prisma);
    await tx.prisma.folioEntry.create({ data: {
      folioId,
      postingKey: eventKey,
      entryType: "transfer",
      direction: "debit",
      amountMinor: creditMinor,
      currencyCode: "USD",
      description: `Cancellation credit memo for company invoice ${invoice.reference}`,
      serviceDate: day2,
      postedAt: /* @__PURE__ */ new Date(),
      sourceType: "system",
      sourceId: invoice.id,
      metadataSnapshot: { receivableInvoiceId: invoice.id, cancellationKey, creditMemo: true }
    } });
    await recordHotelLifecycleEvent({
      prisma: tx.prisma,
      eventKey,
      identity: { request: { bookingId, invoiceId: invoice.id, creditMinor, cancellationKey }, aggregateType: "receivable_invoice", aggregateId: invoice.id, action: "cancellation_credited" },
      beforeSnapshot: invoice,
      afterSnapshot: next2
    });
  }
}
function normalizePayerAllocations(input) {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error("Choose 1\u2013200 posted charge allocations.");
  const rows = input.map((row) => ({ entryId: text42(row?.entryId, "Charge entry ID"), amountMinor: minor2(row?.amountMinor) }));
  if (new Set(rows.map((row) => row.entryId)).size !== rows.length) throw new Error("A charge may appear only once per routing request.");
  return rows.sort((a, b) => a.entryId.localeCompare(b.entryId));
}
function validatePayerAllocations(folio, invoices, allocations, member) {
  const sameFolio = invoices.filter((invoice) => invoice.folioId === folio.id);
  if (sameFolio.some((invoice) => !invoice.payerAllocations && invoice.amountMinor > (invoice.creditedMinor || 0))) throw new Error("Existing amount-only company allocations require reviewed charge attribution before adding charge-level windows.");
  const reversed = new Set(folio.entries.filter((entry) => entry.reversesId).map((entry) => entry.reversesId));
  for (const row of allocations) {
    const charge = folio.entries.find((entry) => entry.id === row.entryId);
    if (member && (!charge || charge.sourceType !== "reservation_snapshot" || !member.lineItems.some((line) => line.id === charge.sourceId))) throw new Error("A group member window can route only that member\u2019s attributable posted reservation charges.");
    if (!charge || charge.direction !== "debit" || charge.currencyCode !== folio.currencyCode || !["room_charge", "tax", "fee", "addon"].includes(charge.entryType) || reversed.has(charge.id) || charge.reversedById) throw new Error("Every allocation must reference an unreversed posted charge belonging to this folio.");
    const assigned = sameFolio.flatMap((invoice) => invoice.payerAllocations || []).filter((item) => item.entryId === row.entryId).reduce((sum, item) => sum + item.amountMinor, 0);
    if (assigned + row.amountMinor > charge.amountMinor) throw new Error("Company windows cannot allocate a charge more than once or exceed its remaining guest portion.");
  }
}
async function hotelPayerWindows(_root, { folioId, bookingId }, context) {
  authorize5(context);
  const folio = await context.prisma.folio.findUnique({ where: { id: text42(folioId, "Folio ID") }, include: { entries: { orderBy: [{ serviceDate: "asc" }, { id: "asc" }] } } });
  if (!folio) throw new Error("Source folio not found.");
  const member = await payerWindowMember(context.prisma, folio, String(bookingId || ""));
  const invoices = (await latest(context.prisma, "receivable_invoice")).filter((invoice) => invoice.folioId === folio.id && (!member || invoice.bookingId === member.id || invoice.bookingId === null));
  const reversed = new Set(folio.entries.filter((entry) => entry.reversesId).map((entry) => entry.reversesId));
  const charges = folio.entries.filter((entry) => (!member || entry.sourceType === "reservation_snapshot" && member.lineItems.some((line) => line.id === entry.sourceId)) && entry.direction === "debit" && ["room_charge", "tax", "fee", "addon"].includes(entry.entryType)).map((entry) => {
    const companyMinor = invoices.flatMap((invoice) => invoice.payerAllocations || []).filter((row) => row.entryId === entry.id).reduce((sum, row) => sum + row.amountMinor, 0);
    const isReversed = reversed.has(entry.id);
    return { entryId: entry.id, description: entry.description, amountMinor: entry.amountMinor, companyMinor, guestMinor: isReversed ? 0 : Math.max(0, entry.amountMinor - companyMinor), reversed: isReversed };
  });
  return {
    folioId: folio.id,
    bookingId: member?.id || folio.bookingId,
    remainingPayer: member ? "group_master" : "guest",
    currencyCode: folio.currencyCode,
    guestLedgerBalanceMinor: calculateFolioBalance(folio.entries).balanceMinor,
    charges,
    companyWindows: invoices.map((invoice) => ({ invoiceId: invoice.id, accountId: invoice.accountId, reference: invoice.reference, balanceMinor: invoice.balanceMinor, status: invoice.status, payerAllocations: invoice.payerAllocations || [], unassignedMinor: invoice.payerAllocations ? 0 : Math.max(0, invoice.amountMinor - (invoice.creditedMinor || 0)) }))
  };
}
async function payerWindowMember(prisma, folio, bookingId) {
  if (folio.bookingId) {
    if (bookingId && folio.bookingId !== bookingId) throw new Error("Selected booking does not own this folio.");
    return null;
  }
  if (!folio.groupBlockId || !bookingId) throw new Error("Select the group member booking ID for a shared master folio window.");
  const member = await prisma.booking.findUnique({ where: { id: bookingId }, include: { lineItems: true } });
  if (!member || member.id !== bookingId || member.billingFolioId !== folio.id || member.groupBlockId !== folio.groupBlockId) throw new Error("Selected group member does not belong to this master folio.");
  return member;
}
var import_client2;
var init_hotelReceivables = __esm({
  "features/keystone/lib/hotelReceivables.ts"() {
    "use strict";
    import_client2 = require("@prisma/client");
    init_access();
    init_bookingFolio();
    init_folioLedger();
    init_hotelBusinessTime();
    init_hotelCashier();
    init_hotelGuestGovernance();
    init_hotelLifecycle();
    init_serializableTransaction();
  }
});

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
var init_cancellationPolicy = __esm({
  "features/keystone/lib/cancellationPolicy.ts"() {
    "use strict";
  }
});

// features/keystone/lib/cancellationSettlement.ts
function cancellationSettlementStatus(cancellationAudit) {
  const metadata = cancellationAudit?.metadataSnapshot;
  return metadata && typeof metadata === "object" && metadata.source === "no_show" ? "no_show" : "cancelled";
}
var init_cancellationSettlement = __esm({
  "features/keystone/lib/cancellationSettlement.ts"() {
    "use strict";
  }
});

// features/keystone/lib/bookingCancellation.ts
var bookingCancellation_exports = {};
__export(bookingCancellation_exports, {
  claimRefundIntents: () => claimRefundIntents,
  confirmManualRefundPayout: () => confirmManualRefundPayout,
  dispatchRefundIntentBatch: () => dispatchRefundIntentBatch,
  requestBookingCancellation: () => requestBookingCancellation,
  settleRefundIntent: () => settleRefundIntent
});
function requirePrismaResult3(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function retryableTransactionError(error) {
  const code = error?.code || error?.extensions?.prisma?.code;
  return code === "P2002" || code === "P2034";
}
function paymentMinor(payment) {
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
  const serviceDay = await currentPostingDate(tx.prisma);
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
        serviceDate: serviceDay,
        postedAt: now,
        metadataSnapshot: { ...reversal.metadataSnapshot, cancellationEventKey: eventKey, originalServiceDate: entry.serviceDate }
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
        serviceDate: serviceDay,
        postedAt: now,
        sourceType: "system",
        sourceId: booking.id,
        metadataSnapshot: { cancellationEventKey: eventKey }
      },
      update: {}
    });
  }
  await creditDirectBillingForCancellation(tx, booking.id, ensured.folioId, eventKey);
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
    if (source === "no_show") {
      if (booking.status !== "confirmed") throw new Error("Only a confirmed reservation can be marked no-show.");
      const settings = booking.pricingSnapshot?.arrivalInstant ? null : await prisma.hotelSettings.findUnique({ where: { id: 1 } });
      const arrival = booking.pricingSnapshot?.arrivalInstant ? new Date(booking.pricingSnapshot.arrivalInstant) : new Date(propertyArrivalInstant(booking.checkInDate, settings?.checkInTime || "15:00", settings?.timeZone || "UTC"));
      if (!Number.isFinite(arrival.getTime()) || arrival > /* @__PURE__ */ new Date()) throw new Error("A reservation cannot be marked no-show before its arrival time.");
    }
    const abandoned = source === "hold_expiry" || source === "payment_recovery";
    if (abandoned && booking.status !== "pending") throw new Error("Only an unconfirmed reservation can use hold recovery.");
    if (source === "hold_expiry" && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) > /* @__PURE__ */ new Date())) {
      throw new Error("The reservation hold has not expired.");
    }
    const captures = booking.payments.filter(
      (payment) => payment.status === "completed" && payment.paymentType !== "refund" && paymentMinor(payment) > 0
    );
    const refunds = booking.payments.filter(
      (payment) => payment.paymentType === "refund" && payment.status === "refunded"
    );
    const availableByPayment = /* @__PURE__ */ new Map();
    let availableCapturedMinor = 0;
    for (const payment of captures) {
      const settledRefundMinor = refunds.filter((refund) => refund.providerData?.sourcePaymentId === payment.id).reduce((sum, refund) => sum + paymentMinor(refund), 0);
      const reservedRefundMinor = booking.refundIntents.filter((intent) => intent.sourcePaymentId === payment.id && ACTIVE_REFUND_INTENT_STATUSES.includes(intent.status)).reduce((sum, intent) => sum + intent.amountMinor, 0);
      const available = paymentMinor(payment) - settledRefundMinor - reservedRefundMinor;
      if (available < 0) throw new Error("Recorded refunds exceed the captured payment.");
      availableByPayment.set(payment.id, available);
      availableCapturedMinor += available;
    }
    const firstRoomNight = booking.lineItems.find((line) => line.type === "room");
    const policy = firstRoomNight?.cancellationPolicySnapshot || booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy;
    const stayNights = Math.max(1, Math.round((booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 864e5));
    const bookingTotalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
    const firstNightMinor = Number(firstRoomNight?.totalPrice || 0) || Math.ceil(bookingTotalMinor / stayNights);
    const cancellationTerms = abandoned ? { policy: "flexible", refundableMinor: availableCapturedMinor, cancellationFeeMinor: 0, capturedMinor: availableCapturedMinor, summary: "Unconfirmed reservation released without a cancellation fee. Any received payment is being returned.", fullRefundDeadline: null } : calculateCancellationTerms({
      policy,
      checkInDate: booking.pricingSnapshot?.arrivalInstant || booking.checkInDate,
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
      const isManual = payment.paymentProvider?.code === "pp_manual_manual";
      if (!payment.paymentProvider || !isManual && !isOnlinePaymentProviderCode(payment.paymentProvider.code)) {
        throw new Error("The captured payment provider does not support a durable refund workflow.");
      }
      const providerPaymentId = payment.providerCaptureId || payment.providerPaymentId || payment.stripePaymentIntentId;
      if (!isManual && !providerPaymentId) throw new Error("A completed payment is missing its provider identifier.");
      const intentKey = `${eventKey}:${payment.id}`;
      const refundRequest = { bookingId, sourcePaymentId: payment.id, amountMinor: refundMinor, reason: normalized.reason };
      const intent = requirePrismaResult3(await prisma.refundIntent.create({
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
    const updated = requirePrismaResult3(await prisma.booking.update({
      where: { id: bookingId },
      data: hasOutstandingRefunds && !abandoned ? { status: "cancellation_pending", balanceDueMinor: outstandingFeeMinor, balanceDue: outstandingFeeMinor / 100 } : {
        status: source === "no_show" ? "no_show" : "cancelled",
        paymentStatus: finalPaymentStatus,
        balanceDueMinor: outstandingFeeMinor,
        balanceDue: outstandingFeeMinor / 100,
        cancelledAt: now,
        holdExpiresAt: null
      }
    }));
    await recomputeBookingPaymentState(prisma, bookingId);
    if (["cancelled", "no_show"].includes(updated.status)) await releaseCancelledGroupPickup(prisma, bookingId, eventKey);
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
  const leaseToken = `${workerId}:${(0, import_node_crypto11.randomUUID)()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return requirePrismaResult3(await prisma.$queryRaw(import_client3.Prisma.sql`
    WITH candidates AS (
      SELECT "id" FROM "RefundIntent"
      WHERE "propertyKey" = ${HOTEL_PROPERTY_KEY}
        AND "paymentProvider" IN (SELECT "id" FROM "PaymentProvider" WHERE "code" IN ('pp_stripe_stripe','pp_paypal_paypal'))
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
      intent."leaseToken", intent."providerRefundId"
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
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${intent.bookingId}`);
    const current = await prisma.refundIntent.findUnique({
      where: { id: intent.id },
      include: { sourcePayment: true, paymentProvider: true, booking: true }
    });
    if (current?.status === "succeeded") return { settled: true, failed: false };
    if (!current || current.status !== "processing" || current.leaseToken !== intent.leaseToken) {
      throw new Error("Refund intent lease was lost.");
    }
    const evidence2 = validateRefundSettlement(providerResult, current);
    const providerRefundId = evidence2.id;
    if (!evidence2.settled) {
      await prisma.refundIntent.update({
        where: { id: current.id },
        data: {
          status: evidence2.failed ? "dead_letter" : "pending",
          providerRefundId,
          providerResultSnapshot: providerResult.data || {},
          lastError: evidence2.failed ? `Provider refund ${evidence2.status}; operator reconciliation required.` : `Provider refund ${evidence2.status}; awaiting settlement.`,
          availableAt: new Date(Date.now() + retryDelay(current.attempts)),
          deadLetteredAt: evidence2.failed ? /* @__PURE__ */ new Date() : null,
          leaseToken: "",
          leaseExpiresAt: null
        }
      });
      return { settled: false, failed: evidence2.failed };
    }
    const manual = current.paymentProvider?.code === "pp_manual_manual";
    let cashierShiftId = null;
    if (manual) {
      if (!permissions.canManagePayments({ session: context.session })) throw new Error("Only payment staff may confirm a physical refund payout.");
      if (current.sourcePayment.paymentMethod === "cash") cashierShiftId = await assertActiveCashierShift(prisma, context.session.itemId, current.currencyCode);
    }
    const refundId = `refund_${(0, import_node_crypto11.createHash)("sha256").update(current.intentKey).digest("hex").slice(0, 24)}`;
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
          providerData: { providerResult: providerResult.data || {}, sourcePaymentId: current.sourcePaymentId, refundIntentKey: current.intentKey, ...cashierShiftId ? { cashierShiftId } : {} },
          processedById: manual ? context.session.itemId : null,
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
    await reconcileBookingLoyalty(prisma, current.bookingId, `refund:${current.intentKey}`, context.session?.itemId);
    const isCancellation = String(current.cancellationEventKey || "").startsWith("booking:cancel:");
    if (!isCancellation) {
      await recomputeBookingPaymentState(prisma, current.bookingId);
      await queueBookingCommunication(prisma, {
        bookingId: current.bookingId,
        kind: "booking_refund",
        eventKey: current.intentKey,
        cancellation: { summary: current.reason, refundableMinor: current.amountMinor, cancellationFeeMinor: 0 }
      });
      return { settled: true, failed: false };
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
        await recomputeBookingPaymentState(prisma, current.bookingId);
        await releaseCancelledGroupPickup(prisma, current.bookingId, eventKey);
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
    return { settled: true, failed: false };
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
      const providerResult = intent.providerRefundId ? await getRefundStatus({ provider, refundId: intent.providerRefundId }) : await refundPayment({
        provider,
        paymentId,
        amount: intent.amountMinor,
        currency: intent.currencyCode,
        idempotencyKey: intent.intentKey,
        metadata: { bookingId: intent.bookingId, sourcePaymentId: intent.sourcePaymentId, refundIntentKey: intent.intentKey }
      });
      const outcome = await settleRefundIntent(context, intent, providerResult);
      if (outcome.settled) result.succeeded += 1;
      else if (outcome.failed) result.deadLettered += 1;
      else result.retried += 1;
    } catch (error) {
      const dead = await failRefundIntent(context.prisma, intent, error);
      if (dead) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}
async function confirmManualRefundPayout(context, intentId, approvalId) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Payment permission is required.");
  return context.transaction(async (tx) => {
    const intent = await tx.prisma.refundIntent.findUnique({ where: { id: intentId }, include: { paymentProvider: true } });
    if (!intent || intent.paymentProvider?.code !== "pp_manual_manual") throw new Error("Manual refund intent not found.");
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${intent.bookingId}`);
    const current = await tx.prisma.refundIntent.findUnique({ where: { id: intent.id } });
    if (current.status === "succeeded") return { status: "recorded", intentId };
    const settings = await tx.prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (current.amountMinor >= Number(settings?.refundApprovalThresholdMinor ?? 0)) await requireHotelApproval(tx.prisma, { approvalId, action: "refund", aggregateId: current.sourcePaymentId, amountMinor: current.amountMinor, actorId: context.session.itemId, operationKey: `manual-payout:${intent.id}` });
    const leaseToken = `staff:${context.session.itemId}:${intent.id}`;
    await tx.prisma.refundIntent.update({ where: { id: intent.id }, data: { status: "processing", leaseToken, actorId: context.session.itemId } });
    await settleRefundIntent({ ...tx, session: context.session, transaction: (fn) => fn(tx) }, { ...current, leaseToken }, {
      status: "completed",
      amount: current.amountMinor,
      currencyCode: current.currencyCode,
      data: { id: `manual:${intent.id}`, acknowledgedBy: context.session.itemId }
    });
    return { status: "recorded", intentId };
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "Serializable" });
}
var import_node_crypto11, import_client3, CANCELLABLE_BOOKING_STATUSES, ACTIVE_REFUND_INTENT_STATUSES, REFUND_MAX_ATTEMPTS, TRANSACTION_RETRY_LIMIT;
var init_bookingCancellation = __esm({
  "features/keystone/lib/bookingCancellation.ts"() {
    "use strict";
    import_node_crypto11 = require("node:crypto");
    import_client3 = require("@prisma/client");
    init_access();
    init_hotelGuestGovernance();
    init_hotelCashier();
    init_hotelLoyalty();
    init_hotelGroupLifecycle();
    init_hotelReceivables();
    init_hotelBusinessTime();
    init_paymentProviderAdapter();
    init_bookingFolio();
    init_bookingRefund();
    init_cancellationPolicy();
    init_cancellationSettlement();
    init_folioLedger();
    init_hotelCommunications();
    init_paymentSecurity();
    init_hotelLifecycle();
    CANCELLABLE_BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed"]);
    ACTIVE_REFUND_INTENT_STATUSES = ["pending", "processing", "failed", "dead_letter"];
    REFUND_MAX_ATTEMPTS = 8;
    TRANSACTION_RETRY_LIMIT = 5;
  }
});

// features/keystone/lib/hotelCashier.ts
function amount2(value) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("Cash amount must be non-negative integer minor units.");
  return Number(value);
}
function text43(value, label, max = 200) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new Error(`${label} is required and bounded.`);
  return result;
}
function authorize6(context) {
  if (!context.session?.itemId || !permissions.canManagePayments({ session: context.session })) throw new Error("Cashier payment permission is required.");
  return context.session.itemId;
}
async function shifts(prisma) {
  const rows = await prisma.$queryRaw(import_client4.Prisma.sql`
    SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state
    FROM "HotelAuditEvent" WHERE "aggregateType"='cashier_shift' AND "propertyKey"=${HOTEL_PROPERTY_KEY}
    ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC
  `);
  return rows.map((row) => row.state);
}
async function lock2(prisma) {
  await lockHotelLifecycle(prisma, "cashier-shifts");
}
async function assertActiveCashierShift(prisma, actorId, currencyCode = "USD") {
  await lock2(prisma);
  const active = (await shifts(prisma)).filter((s) => s.actorId === actorId && s.status === "open" && s.currencyCode === currencyCode);
  if (active.length !== 1) throw new Error("Open a cashier shift before recording cash payment or cash refund.");
  return active[0].id;
}
async function cashLedger(prisma, shiftId) {
  const [bookingPayments, receivablePayments] = await Promise.all([
    prisma.bookingPayment.findMany({ where: {
      paymentMethod: "cash",
      status: { in: ["completed", "refunded"] },
      providerData: { path: ["cashierShiftId"], equals: shiftId }
    }, select: { id: true, amountMinor: true, currency: true } }),
    prisma.hotelAuditEvent.findMany({ where: { aggregateType: "receivable_payment", action: { in: ["collect", "refund_credit"] }, afterSnapshot: { path: ["cashierShiftId"], equals: shiftId } }, select: { afterSnapshot: true } })
  ]);
  return [...bookingPayments, ...receivablePayments.map((event) => ({ amountMinor: event.afterSnapshot.amountMinor, currency: event.afterSnapshot.currencyCode }))];
}
function expectedCash(shift, ledger) {
  if (ledger.some((p) => !Number.isSafeInteger(p.amountMinor) || p.currency !== "USD")) throw new Error("Cashier ledger currency or amount is invalid.");
  const result = shift.floatMinor - shift.dropsMinor + ledger.reduce((sum, p) => sum + p.amountMinor, 0);
  if (!Number.isSafeInteger(result)) throw new Error("Cashier balance exceeds safe accounting bounds.");
  return result;
}
async function hotelCashierOperations(_root, _args, context) {
  authorize6(context);
  const states3 = await shifts(context.prisma);
  const result = await Promise.all(states3.filter((s) => s.status !== "closed").map(async (shift) => ({ ...shift, expectedMinor: expectedCash(shift, await cashLedger(context.prisma, shift.id)) })));
  const manualRefunds = await context.prisma.refundIntent.findMany({ where: { paymentProvider: { code: "pp_manual_manual" }, status: { in: ["pending", "failed", "dead_letter"] } }, include: { booking: { select: { confirmationNumber: true } } }, take: 100 });
  return { manualRefunds: manualRefunds.map((intent) => ({ id: intent.id, amountMinor: intent.amountMinor, currencyCode: intent.currencyCode, confirmationNumber: intent.booking?.confirmationNumber, reason: intent.reason })), shifts: [...result, ...states3.filter((s) => s.status === "closed").sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || "")).slice(0, 100)] };
}
async function manageHotelCashier(_root, { input }, context) {
  const actorId = authorize6(context);
  const action = text43(input?.action, "Action");
  if (action === "pay_refund") {
    const { confirmManualRefundPayout: confirmManualRefundPayout2 } = await Promise.resolve().then(() => (init_bookingCancellation(), bookingCancellation_exports));
    return confirmManualRefundPayout2(context, text43(input.shiftId, "Refund intent ID"), input.approvalId);
  }
  if (!["open", "drop", "close", "approve"].includes(action)) throw new Error("Unknown cashier action.");
  const shiftId = text43(input.shiftId, "Shift ID");
  const key4 = text43(input.idempotencyKey, "Idempotency key");
  const reason = String(input.reason || "").trim();
  if (reason.length > 500) throw new Error("Reason is too long.");
  const normalized = {
    action,
    shiftId,
    actorId,
    amountMinor: action === "approve" ? 0 : amount2(input.amountMinor),
    drawerId: action === "open" ? text43(input.drawerId, "Drawer", 80) : "",
    reason,
    approvalId: String(input.approvalId || "")
  };
  const eventKey = `cashier:${key4}`;
  const identity = { request: normalized, aggregateType: "cashier_shift", aggregateId: shiftId, action };
  return runSerializableTransaction(context, async (tx) => {
    await lock2(tx.prisma);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    const current = await shifts(tx.prisma);
    const prior = current.find((s) => s.id === shiftId);
    let next2;
    if (action === "open") {
      if (prior || current.some((s) => s.status === "open" && (s.actorId === actorId || s.drawerId === normalized.drawerId))) throw new Error("This cashier or drawer already has an open shift.");
      next2 = {
        id: shiftId,
        drawerId: normalized.drawerId,
        actorId,
        currencyCode: "USD",
        status: "open",
        sequence: 1,
        openedAt: (/* @__PURE__ */ new Date()).toISOString(),
        floatMinor: normalized.amountMinor,
        dropsMinor: 0
      };
    } else {
      if (!prior) throw new Error("Cashier shift not found.");
      next2 = { ...prior, sequence: prior.sequence + 1 };
      if (action === "approve") {
        if (prior.status !== "awaiting_review" || prior.actorId === actorId) throw new Error("A different payment manager must review a counted shift variance.");
        if (!reason) throw new Error("Variance approval requires a reason.");
        const settings = await tx.prisma.hotelSettings.findUnique({ where: { id: 1 } });
        if (Math.abs(prior.varianceMinor || 0) >= Number(settings?.cashVarianceApprovalThresholdMinor ?? 0)) await requireHotelApproval(tx.prisma, { approvalId: input.approvalId, action: "cash_variance", aggregateId: shiftId, amountMinor: Math.abs(prior.varianceMinor || 0), actorId: prior.actorId, operationKey: eventKey });
        next2.status = "closed";
        next2.reviewedBy = actorId;
      } else {
        if (prior.status !== "open" || prior.actorId !== actorId) throw new Error("Only the assigned cashier can operate their open shift.");
        const expectedMinor = expectedCash(prior, await cashLedger(tx.prisma, shiftId));
        if (action === "drop") {
          if (!reason || normalized.amountMinor <= 0 || normalized.amountMinor > expectedMinor) throw new Error("Cash drop requires a reason and cannot exceed expected cash.");
          next2.dropsMinor += normalized.amountMinor;
        } else {
          const varianceMinor = normalized.amountMinor - expectedMinor;
          if (varianceMinor && !reason) throw new Error("Cash variance requires an explanation.");
          next2 = { ...next2, expectedMinor, countedMinor: normalized.amountMinor, varianceMinor, closedAt: (/* @__PURE__ */ new Date()).toISOString(), status: varianceMinor ? "awaiting_review" : "closed" };
        }
      }
    }
    await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId, eventKey, identity, beforeSnapshot: prior || null, afterSnapshot: next2, metadata: { reason } });
    return next2;
  });
}
var import_client4;
var init_hotelCashier = __esm({
  "features/keystone/lib/hotelCashier.ts"() {
    "use strict";
    import_client4 = require("@prisma/client");
    init_hotelGuestGovernance();
    init_access();
    init_hotelLifecycle();
    init_serializableTransaction();
  }
});

// features/keystone/lib/bookingRefund.ts
function paymentMinor2(payment) {
  if (Number.isSafeInteger(payment.amountMinor)) return Math.abs(payment.amountMinor);
  const amount3 = Math.round(Math.abs(Number(payment.amount || 0)) * 100);
  if (!Number.isSafeInteger(amount3)) throw new Error("Payment amount cannot be represented in minor units.");
  return amount3;
}
async function recomputeBookingPaymentState(prisma, bookingId) {
  const [booking, ledger, pendingRefunds] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: { billingFolio: { include: { entries: { select: { direction: true, amountMinor: true, currencyCode: true } } } } } }),
    prisma.bookingPayment.findMany({
      where: { bookingId, status: { in: ["completed", "refunded"] } },
      select: { paymentType: true, amountMinor: true }
    }),
    prisma.refundIntent.findMany({ where: { bookingId, status: { in: ACTIVE_INTENT_STATUSES } }, select: { amountMinor: true } })
  ]);
  if (!booking) throw new Error("Booking not found while reconciling payments.");
  const netPaidMinor = Math.max(0, ledger.reduce((sum, payment) => sum + (payment.paymentType === "refund" ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
  const reservedMinor = pendingRefunds.reduce((sum, intent) => sum + Number(intent.amountMinor || 0), 0);
  const effectivePaidMinor = Math.max(0, netPaidMinor - reservedMinor);
  const terminal = ["cancelled", "no_show", "cancellation_pending"].includes(booking.status);
  const remainingMinor = (await getBookingCollectibleBalance({ prisma }, bookingId)).balanceDueMinor;
  const hadCapture = ledger.some((payment) => payment.paymentType !== "refund" && Number(payment.amountMinor) > 0);
  const paymentStatus = terminal ? remainingMinor > 0 ? netPaidMinor > 0 ? "partial" : "unpaid" : netPaidMinor <= 0 ? hadCapture ? "refunded" : "unpaid" : "paid" : remainingMinor <= 0 ? "paid" : effectivePaidMinor <= 0 ? "unpaid" : "partial";
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
  const settled = refunds.filter((refund) => refund.providerData?.sourcePaymentId === payment.id).reduce((sum, refund) => sum + paymentMinor2(refund), 0);
  const reserved = intents.reduce((sum, intent) => sum + Number(intent.amountMinor || 0), 0);
  return Math.max(0, paymentMinor2(payment) - settled - reserved);
}
async function createManualRefundInTransaction({
  tx,
  sourcePayment,
  amountMinor,
  reason,
  eventKey,
  actorId
}) {
  const id = `manual_refund_${(0, import_node_crypto12.createHash)("sha256").update(`${sourcePayment.id}:${eventKey}`).digest("hex").slice(0, 24)}`;
  const existing = await tx.prisma.bookingPayment.findUnique({ where: { id } });
  if (existing) {
    if (existing.bookingId !== sourcePayment.bookingId || existing.amountMinor !== -amountMinor || existing.providerData?.sourcePaymentId !== sourcePayment.id) {
      throw new Error("Manual refund replay evidence does not match.");
    }
    await ensurePaymentFolioPosting(tx, existing.id);
    return existing;
  }
  const cashierShiftId = sourcePayment.paymentMethod === "cash" ? await assertActiveCashierShift(tx.prisma, actorId, String(sourcePayment.currency || "USD")) : null;
  const now = /* @__PURE__ */ new Date();
  const refund = await tx.prisma.bookingPayment.create({
    data: {
      id,
      paymentReference: `REF-${(0, import_node_crypto12.createHash)("sha256").update(eventKey).digest("hex").slice(0, 14).toUpperCase()}`,
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
        recordedBy: actorId,
        ...cashierShiftId ? { cashierShiftId } : {}
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
  actorId,
  approvalId
}) {
  const key4 = String(idempotencyKey || "").trim();
  const normalizedReason = String(reason || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A bounded refund idempotency key is required.");
  if (!normalizedReason || normalizedReason.length > 500) throw new Error("A bounded refund reason is required.");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Refund amount must be a positive integer amount.");
  const eventKey = `booking:refund:${key4}`;
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
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${payment.bookingId}`);
    const availableMinor = await refundablePaymentMinor(prisma, payment);
    if (amountMinor > availableMinor) throw new Error(`Refund exceeds the available amount of ${availableMinor} minor units.`);
    const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (amountMinor >= Number(settings?.refundApprovalThresholdMinor ?? 0)) await requireHotelApproval(prisma, { approvalId, action: "refund", aggregateId: paymentId, amountMinor, actorId, operationKey: eventKey });
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
async function queueCaptureRecoveryRefund(prisma, payment, amountMinor, reason) {
  const intentKey = `capture-recovery:${payment.id}`;
  return prisma.refundIntent.upsert({
    where: { intentKey },
    create: {
      intentKey,
      requestHash: hashLifecycleRequest({ paymentId: payment.id, amountMinor, reason }),
      cancellationEventKey: "",
      propertyKey: HOTEL_PROPERTY_KEY,
      bookingId: payment.bookingId,
      sourcePaymentId: payment.id,
      paymentProviderId: payment.paymentProviderId,
      amountMinor,
      currencyCode: payment.currency,
      reason,
      actorId: null,
      status: "pending",
      attempts: 0,
      maxAttempts: 8,
      availableAt: /* @__PURE__ */ new Date()
    },
    update: {}
  });
}
var import_node_crypto12, ACTIVE_INTENT_STATUSES;
var init_bookingRefund = __esm({
  "features/keystone/lib/bookingRefund.ts"() {
    "use strict";
    import_node_crypto12 = require("node:crypto");
    init_hotelGuestGovernance();
    init_hotelCashier();
    init_bookingFolio();
    init_hotelLifecycle();
    init_hotelCommunications();
    init_paymentSecurity();
    init_serializableTransaction();
    ACTIVE_INTENT_STATUSES = ["pending", "processing", "failed", "dead_letter"];
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
init_access();

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
    mfaEnabled: (0, import_fields2.checkbox)({ defaultValue: false, access: { read: () => false, create: () => false, update: () => false } }),
    mfaSecret: (0, import_fields2.text)({ access: { read: () => false, create: () => false, update: () => false } }),
    mfaPendingSecret: (0, import_fields2.text)({ access: { read: () => false, create: () => false, update: () => false } }),
    mfaPendingExpiresAt: (0, import_fields2.timestamp)({ access: { read: () => false, create: () => false, update: () => false } }),
    mfaLastCounter: (0, import_fields2.integer)({ defaultValue: -1, access: { read: () => false, create: () => false, update: () => false } }),
    mfaRecoveryHashes: (0, import_fields2.json)({ defaultValue: [], access: { read: () => false, create: () => false, update: () => false } }),
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
init_access();

// features/keystone/models/fields.ts
var import_fields3 = require("@keystone-6/core/fields");
var permissionFields = {
  canManageGuestPrivacy: (0, import_fields3.checkbox)({ defaultValue: false, label: "User can manage guest privacy requests and identity evidence" }),
  canApproveHotelExceptions: (0, import_fields3.checkbox)({ defaultValue: false, label: "User can independently approve hotel financial and revenue exceptions" }),
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
init_access();
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
      access: { create: () => false, update: () => false },
      ref: "Room.roomType",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Rooms"
    }),
    roomAssignments: (0, import_fields6.relationship)({
      access: { create: () => false, update: () => false },
      ref: "RoomAssignment.roomType",
      many: true,
      ui: {
        displayMode: "count"
      },
      label: "Room Assignments"
    }),
    ratePlans: (0, import_fields6.relationship)({
      access: { create: () => false, update: () => false },
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
init_access();

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
init_access();
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
      access: { create: () => false, update: () => false },
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
      access: { create: () => false, update: () => false },
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
    beforeOperation: async ({ operation, item, context, resolvedData }) => {
      if (operation === "update" && item?.id && resolvedData.roomType !== void 0) {
        const assignments2 = await context.prisma.roomAssignment.count({ where: { roomId: String(item.id) } });
        if (assignments2) throw new Error("A room with assignment history cannot change room type; create a new physical-room record when reclassifying retired inventory.");
      }
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
init_access();
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
init_access();
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
init_access();
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
init_access();
init_guestBookingAccess();
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
init_access();
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
init_access();
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
          const amount3 = Number(item.amount || 0) / 100;
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
          }).format(amount3);
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
init_access();
init_sensitiveData();
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
          return Object.fromEntries(Object.entries(credentials).map(([key4, value]) => [
            key4,
            key4 === "sandbox" ? Boolean(value) : encryptSensitiveText(value)
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
init_access();
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
var import_access16 = require("@keystone-6/core/access");
var import_fields17 = require("@keystone-6/core/fields");
init_access();
init_hotelGuestGovernance();
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
      access: { create: () => false, update: () => false },
      isIndexed: "unique",
      db: { isNullable: true },
      label: "Loyalty Number",
      ui: {
        description: "Guest loyalty program number"
      }
    }),
    loyaltyTier: (0, import_fields17.select)({
      access: { create: () => false, update: () => false },
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
      access: { create: () => false, update: () => false },
      label: "Loyalty Points",
      ui: {
        description: "Current accumulated loyalty points"
      }
    }),
    // Communication preferences
    communicationPreferences: (0, import_fields17.json)({
      access: { create: () => false, update: () => false },
      label: "Communication Preferences",
      ui: {
        description: "How the guest prefers to be contacted",
        views: "./features/keystone/models/fields",
        createView: { fieldMode: "edit" },
        itemView: { fieldMode: "edit" }
      },
      defaultValue: {
        emailMarketing: false,
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
      access: { read: import_access16.denyAll, create: permissions.canManageGuests, update: permissions.canManageGuests },
      hooks: { resolveInput: ({ resolvedData }) => resolveGuestIdentityInput(resolvedData) },
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
      access: { create: () => false, update: () => false },
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
    resolveInput: async ({ resolvedData, operation, item, context }) => {
      if (operation === "update" && item?.id) await assertGuestProfileEditable(context.prisma, String(item.id));
      return {
        ...resolvedData,
        ...typeof resolvedData.email === "string" ? { email: resolvedData.email.trim().toLowerCase() } : {},
        ...typeof resolvedData.firstName === "string" ? { firstName: resolvedData.firstName.trim() } : {},
        ...typeof resolvedData.lastName === "string" ? { lastName: resolvedData.lastName.trim() } : {},
        ...typeof resolvedData.phone === "string" ? { phone: resolvedData.phone.trim() } : {}
      };
    },
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
var import_access18 = require("@keystone-6/core/access");
var import_fields18 = require("@keystone-6/core/fields");
init_access();
var GuestDocument = (0, import_core16.list)({
  access: {
    operation: {
      query: permissions.canManageGuestPrivacy,
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
      access: { read: import_access18.denyAll },
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
      access: { read: import_access18.denyAll },
      label: "Front Image URL",
      ui: {
        description: "S3 URL to front image of document"
      }
    }),
    backImage: (0, import_fields18.text)({
      access: { read: import_access18.denyAll },
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
init_access();
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
init_access();
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
    bookings: (0, import_fields20.relationship)({ access: { create: () => false, update: () => false }, ref: "Booking.ratePlan", many: true, ui: { displayMode: "count" } }),
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
      if (!item && resolvedData.status === "active") addValidationError("Create a draft, then publish it through the approved rate lifecycle.");
      const economic = ["baseRateMinor", "roomType", "currencyCode", "seasonalAdjustments", "minimumStay", "maximumStay", "advanceBookingMin", "advanceBookingMax", "cancellationPolicy", "mealPlan", "validFrom", "validTo", "applicableDays", "isPromotional", "promoCode"];
      if (item?.status === "active" && economic.some((field) => resolvedData[field] !== void 0 && JSON.stringify(resolvedData[field]) !== JSON.stringify(item[field]))) addValidationError("Unpublish the rate through the approved lifecycle before editing its economics, then publish the reviewed terms.");
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
init_access();
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
init_access();
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
init_channelCredentials();
var import_core21 = require("@keystone-6/core");
var import_access24 = require("@keystone-6/core/access");
var import_fields23 = require("@keystone-6/core/fields");
init_access();
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
    // Experimental bridge credentials are encrypted at rest and never publicly projected.
    credentials: (0, import_fields23.json)({
      hooks: { resolveInput: ({ resolvedData }) => resolvedData.credentials === void 0 ? void 0 : encryptChannelCredentials(resolvedData.credentials) },
      access: {
        read: import_access24.denyAll,
        create: canManageChannels,
        update: canManageChannels
      },
      label: "Credentials",
      ui: {
        description: "Encrypted bridge configuration; raw API reads are denied.",
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
      const stored = resolvedData.credentials ?? item?.credentials;
      const credentials = stored ? readChannelCredentials({ credentials: stored }) : {};
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
init_access();
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
init_access();
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
init_access();
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
init_access();
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
    refundApprovalThresholdMinor: (0, import_fields27.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    writeOffApprovalThresholdMinor: (0, import_fields27.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    cashVarianceApprovalThresholdMinor: (0, import_fields27.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    prearrivalEmailEnabled: (0, import_fields27.checkbox)({ defaultValue: false }),
    prearrivalDays: (0, import_fields27.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 14 } }),
    loyaltyEnabled: (0, import_fields27.checkbox)({ defaultValue: false }),
    loyaltyEarnMinorPerPoint: (0, import_fields27.integer)({ defaultValue: 100, validation: { isRequired: true, min: 1, max: 1e6 } }),
    loyaltyRedeemMinorPerPoint: (0, import_fields27.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 1e6 } }),
    loyaltyMinimumRedemptionPoints: (0, import_fields27.integer)({ defaultValue: 100, validation: { isRequired: true, min: 1, max: 1e6 } }),
    securityDepositMinor: (0, import_fields27.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 2147483647 } }),
    depositPercent: (0, import_fields27.integer)({ defaultValue: 100, validation: { isRequired: true, min: 1, max: 100 } }),
    groupsEnabled: (0, import_fields27.checkbox)({ defaultValue: false }),
    ratePublicationRequiresApproval: (0, import_fields27.checkbox)({ defaultValue: true }),
    timeZone: (0, import_fields27.text)({ validation: { isRequired: true }, defaultValue: "UTC" }),
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
var import_access30 = require("@keystone-6/core/access");
var import_fields28 = require("@keystone-6/core/fields");
init_access();
var PaymentEvent = (0, import_core26.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access30.denyAll,
      update: import_access30.denyAll,
      delete: import_access30.denyAll
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
init_access();
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
init_access();
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
init_access();
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
init_access();
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
var import_access36 = require("@keystone-6/core/access");
var import_fields33 = require("@keystone-6/core/fields");
init_access();
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
      create: import_access36.denyAll,
      update: import_access36.denyAll,
      delete: import_access36.denyAll
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
var import_access38 = require("@keystone-6/core/access");
var import_fields34 = require("@keystone-6/core/fields");
init_access();
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
      create: import_access38.denyAll,
      update: import_access38.denyAll,
      delete: import_access38.denyAll
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
var import_access40 = require("@keystone-6/core/access");
var import_fields35 = require("@keystone-6/core/fields");
init_access();
var HotelBusinessDate = (0, import_core33.list)({
  isSingleton: true,
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access40.denyAll,
      update: import_access40.denyAll,
      delete: import_access40.denyAll
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
var import_access42 = require("@keystone-6/core/access");
var import_fields36 = require("@keystone-6/core/fields");
init_access();
var NightAuditRun = (0, import_core34.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: import_access42.denyAll,
      update: import_access42.denyAll,
      delete: import_access42.denyAll
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
var import_access44 = require("@keystone-6/core/access");
var import_fields37 = require("@keystone-6/core/fields");
init_access();
var GroupBlock = (0, import_core35.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: import_access44.denyAll,
      update: import_access44.denyAll,
      delete: import_access44.denyAll
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
var import_access46 = require("@keystone-6/core/access");
var import_fields38 = require("@keystone-6/core/fields");
init_access();
var GroupBlockAllocation = (0, import_core36.list)({
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: import_access46.denyAll,
      update: import_access46.denyAll,
      delete: import_access46.denyAll
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
var import_access48 = require("@keystone-6/core/access");
var import_fields39 = require("@keystone-6/core/fields");
init_access();
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
      create: import_access48.denyAll,
      update: import_access48.denyAll,
      delete: import_access48.denyAll
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
var import_access50 = require("@keystone-6/core/access");
var import_fields40 = require("@keystone-6/core/fields");
init_access();
var HotelSeedRecord = (0, import_core38.list)({
  db: { extendPrismaSchema: (model) => model.replace("\n}", '\n  @@index([section, entityId], map: "HotelSeedRecord_entity_idx")\n}') },
  access: {
    operation: { query: permissions.canManageOnboarding, create: import_access50.denyAll, update: import_access50.denyAll, delete: import_access50.denyAll }
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
var import_access52 = require("@keystone-6/core/access");
var import_fields41 = require("@keystone-6/core/fields");
var HotelAbuseBucket = (0, import_core39.list)({
  db: { extendPrismaSchema: (model) => model.replace("\n}", '\n  @@index([expiresAt], map: "HotelAbuseBucket_expiry_idx")\n}') },
  access: { operation: { query: import_access52.denyAll, create: import_access52.denyAll, update: import_access52.denyAll, delete: import_access52.denyAll } },
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
var import_access53 = require("@keystone-6/core/access");
var import_fields42 = require("@keystone-6/core/fields");
var HotelWorkerLease = (0, import_core40.list)({
  access: { operation: { query: import_access53.denyAll, create: import_access53.denyAll, update: import_access53.denyAll, delete: import_access53.denyAll } },
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
init_access();
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

// features/keystone/lib/hotelHousekeepingSkills.ts
init_access();
init_hotelLifecycle();
init_serializableTransaction();
var HOUSEKEEPING_TASK_TYPES = ["checkout_clean", "stayover_clean", "deep_clean", "maintenance", "inspection", "turn_down"];
function validateHousekeepingCapability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key4) => !["configured", "allowedFloors", "allowedRoomIds", "taskTypes", "sectionName"].includes(key4))) throw new Error("Unsupported housekeeping capability fields.");
  if (typeof value.configured !== "boolean") throw new Error("Specify whether custom dispatch restrictions apply.");
  const allowedFloors = value.allowedFloors;
  if (allowedFloors !== null && (!Array.isArray(allowedFloors) || allowedFloors.length > 500 || allowedFloors.some((floor) => !Number.isSafeInteger(floor) || floor < -20 || floor > 500))) throw new Error("Allowed floors must be null or a bounded list of integer floors.");
  const allowedRoomIds = value.allowedRoomIds;
  if (allowedRoomIds !== null && (!Array.isArray(allowedRoomIds) || allowedRoomIds.length > 1e3 || allowedRoomIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 100))) throw new Error("Section rooms must be null or a bounded list of physical room IDs.");
  if (!Array.isArray(value.taskTypes) || value.taskTypes.some((type) => !HOUSEKEEPING_TASK_TYPES.includes(type))) throw new Error("Select supported housekeeping task skills.");
  const sectionName = String(value.sectionName || "").trim();
  if (sectionName.length > 100 || sectionName && allowedRoomIds === null) throw new Error("A named section requires an explicit room selection.");
  return { configured: value.configured, allowedFloors: allowedFloors === null ? null : [...new Set(allowedFloors)], allowedRoomIds: allowedRoomIds === null ? null : [...new Set(allowedRoomIds)], taskTypes: [...new Set(value.taskTypes)], sectionName };
}
async function loadHousekeepingCapability(prisma, staffId) {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: "housekeeping_staff", aggregateId: staffId } });
  return events.reduce((latest2, event) => Number(event.afterSnapshot?.capability?.revision || 0) > Number(latest2?.revision || 0) ? event.afterSnapshot.capability : latest2, null);
}
function assertHousekeepingEligibility(staff, capability, task) {
  if (!staff?.isActive || !(task.taskType === "maintenance" ? staff.role?.canManageRooms : staff.role?.canManageHousekeeping)) throw new Error("Assign housekeeping only to active staff with the required housekeeping or room-maintenance role.");
  if (!capability?.configured) return;
  if (!capability.taskTypes.includes(task.taskType)) throw new Error("Selected staff member is not qualified for this task type.");
  if (capability.allowedFloors !== null && !capability.allowedFloors.includes(Number(task.room.floor))) throw new Error("Selected staff member is not assigned to this floor.");
  if (capability.allowedRoomIds !== null && !capability.allowedRoomIds.includes(task.roomId)) throw new Error("Selected staff member is not assigned to this room section.");
}
async function assertHousekeepingStaffEligible(prisma, staffId, task) {
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-housekeeping-staff:${staffId}`);
  const staff = await prisma.user.findUnique({ where: { id: staffId }, include: { role: true } });
  assertHousekeepingEligibility(staff, await loadHousekeepingCapability(prisma, staffId), task);
}
var mayConfigure = (context) => permissions.canManagePeople({ session: context.session }) || permissions.canManageRoles({ session: context.session });
async function hotelHousekeepingStaffCapabilities(_root, _args, context) {
  if (!mayConfigure(context) && !permissions.canManageHousekeeping({ session: context.session })) throw new Error("Not authorized to view housekeeping dispatch capabilities.");
  const staff = await context.prisma.user.findMany({ where: { isActive: true, role: { OR: [{ canManageHousekeeping: true }, { canManageRooms: true }] } }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } });
  const rooms = await context.prisma.room.findMany({ orderBy: [{ floor: "asc" }, { roomNumber: "asc" }], take: 1e3, select: { id: true, roomNumber: true, floor: true } });
  const events = await context.prisma.hotelAuditEvent.findMany({ where: { aggregateType: "housekeeping_staff", aggregateId: { in: staff.map((person) => person.id) } } });
  const latest2 = /* @__PURE__ */ new Map();
  for (const event of events) {
    const capability = event.afterSnapshot?.capability;
    if (Number(capability?.revision || 0) > Number(latest2.get(event.aggregateId)?.revision || 0)) latest2.set(event.aggregateId, capability);
  }
  return JSON.stringify({ canConfigure: mayConfigure(context), staff: staff.map((person) => ({ ...person, capability: latest2.get(person.id) || null })), rooms, taskTypes: HOUSEKEEPING_TASK_TYPES });
}
async function updateHotelHousekeepingStaffCapability(_root, { staffId, configuration, expectedRevision, idempotencyKey }, context) {
  if (!mayConfigure(context)) throw new Error("People or role management permission is required to configure staff skills and sections.");
  if (configuration.length > 1e5) throw new Error("Staff capability configuration exceeds 100 KB.");
  const value = validateHousekeepingCapability(JSON.parse(configuration));
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable staff capability idempotency key is required.");
  const eventKey = `housekeeping-staff:${key4}`, identity = { request: { staffId, value, expectedRevision }, aggregateType: "housekeeping_staff", aggregateId: staffId, action: "configured" };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-housekeeping-staff:${staffId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot.capability);
    const staff = await p.user.findUnique({ where: { id: staffId }, include: { role: true } });
    if (!staff?.isActive || !staff.role?.canManageHousekeeping && !staff.role?.canManageRooms) throw new Error("Select active housekeeping or room-maintenance staff.");
    const previous = await loadHousekeepingCapability(p, staffId);
    if (expectedRevision !== (previous?.revision || 0)) throw new Error("Staff capability changed; refresh before editing.");
    if (value.allowedRoomIds && await p.room.count({ where: { id: { in: value.allowedRoomIds } } }) !== value.allowedRoomIds.length) throw new Error("A section contains an unknown physical room.");
    const capability = { ...value, staffId, revision: (previous?.revision || 0) + 1 };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: previous ? { capability: previous } : null, afterSnapshot: { capability } });
    return JSON.stringify(capability);
  });
}

// features/keystone/queries/guestFolio.ts
init_guestBookingAccess();
init_bookingFolio();
init_folioLedger();
init_serializableTransaction();
async function guestFolio(_root, { bookingId }, context) {
  await assertGuestBookingAccess(context, bookingId);
  return runSerializableTransaction(context, async (tx) => {
    await assertGuestBookingAccess({ ...context, prisma: tx.prisma }, bookingId);
    const booking = await tx.prisma.booking.findUnique({ where: { id: bookingId }, include: { lineItems: true, folio: { include: { entries: { orderBy: [{ serviceDate: "asc" }, { postedAt: "asc" }, { id: "asc" }] } } } } });
    if (!booking) throw new Error("Reservation not found.");
    if (booking.billingFolioId) return { managedByProperty: true, message: "The property manages the shared group account. Contact the front desk for your individual charges." };
    if (!booking.folio) throw new Error("The reservation statement is not available yet.");
    const entries = booking.folio.entries;
    const intents = await tx.prisma.refundIntent.findMany({ where: { bookingId, status: { in: ["pending", "processing", "failed", "dead_letter"] } }, select: { amountMinor: true } });
    const collectible = calculateCollectibleBalance(entries, [booking], intents, booking.folio.currencyCode);
    const ledger = calculateFolioBalance(entries);
    const directBilled = entries.some((entry) => entry.entryType === "transfer" && entry.direction === "credit");
    return {
      managedByProperty: false,
      folioNumber: booking.folio.folioNumber,
      currencyCode: booking.folio.currencyCode,
      status: booking.folio.status,
      documentKind: booking.folio.status === "closed" && ledger.balanceMinor === 0 && collectible.balanceDueMinor === 0 && intents.length === 0 ? directBilled ? "Final statement \u2014 direct billed" : "Final receipt" : "Reservation statement",
      confirmationNumber: booking.confirmationNumber,
      ...collectible,
      pendingRefundMinor: intents.reduce((sum, intent) => sum + intent.amountMinor, 0),
      unpostedContractMinor: collectible.balanceMinor - ledger.balanceMinor - intents.reduce((sum, intent) => sum + intent.amountMinor, 0),
      entries: entries.map((entry) => ({ date: entry.serviceDate.toISOString().slice(0, 10), type: entry.entryType, direction: entry.direction, amountMinor: entry.amountMinor, description: entry.description }))
    };
  });
}

// features/keystone/lib/hotelPayoutReconciliation.ts
var import_node_crypto5 = require("node:crypto");
var import_client = require("@prisma/client");
init_access();
init_hotelGuestGovernance();
init_hotelLifecycle();
init_serializableTransaction();
function text41(value, label, max = 200) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new Error(`${label} is required and bounded.`);
  return result;
}
function amount(value, signed = false) {
  if (!Number.isSafeInteger(value) || !signed && value < 0 || Math.abs(value) > 2147483647) throw new Error("Statement amounts must be bounded integer minor units.");
  return value;
}
function parseHotelPayoutCsv(csv) {
  if (typeof csv !== "string" || csv.length > 3e5) throw new Error("Statement CSV exceeds the bounded import size.");
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift() !== "providerCaptureId,grossMinor,refundMinor,feeMinor,netMinor" || !lines.length || lines.length > 1e3) throw new Error("Use the exact statement header and 1\u20131000 rows.");
  const ids = /* @__PURE__ */ new Set();
  return lines.map((line) => {
    const cells = line.split(",");
    if (cells.length !== 5 || !/^[A-Za-z0-9_-]{1,200}$/.test(cells[0]) || cells.slice(1).some((value) => !/^-?\d+$/.test(value))) throw new Error("Statement rows require a provider capture ID and four integer amounts, without embedded delimiters.");
    if (ids.has(cells[0])) throw new Error("Duplicate capture IDs within one statement are not allowed.");
    ids.add(cells[0]);
    const row = { providerCaptureId: cells[0], grossMinor: amount(Number(cells[1])), refundMinor: amount(Number(cells[2])), feeMinor: amount(Number(cells[3])), netMinor: amount(Number(cells[4]), true) };
    if (row.grossMinor - row.refundMinor - row.feeMinor !== row.netMinor || !row.grossMinor && !row.refundMinor && !row.feeMinor) throw new Error("Every row must reconcile gross less refunds and fees to net.");
    return row;
  });
}
async function statements(prisma) {
  const rows = await prisma.$queryRaw(import_client.Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent" WHERE "propertyKey"=${HOTEL_PROPERTY_KEY} AND "aggregateType"='payout_statement' ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row) => row.state);
}
async function validateSource(prisma, statement, all) {
  const exceptions = [];
  const earlier = all.filter((item) => item.id !== statement.id && item.status === "matched" && item.providerId === statement.providerId);
  for (const row of statement.rows) {
    const captures = await prisma.bookingPayment.findMany({ where: { paymentProviderId: statement.providerId, providerCaptureId: row.providerCaptureId, paymentType: { not: "refund" }, status: "completed" }, take: 2 });
    if (captures.length !== 1) {
      exceptions.push(`${row.providerCaptureId}: expected one completed capture.`);
      continue;
    }
    const payment = captures[0];
    if (payment.currency !== statement.currencyCode || !Number.isSafeInteger(payment.amountMinor)) {
      exceptions.push(`${row.providerCaptureId}: capture currency or amount requires reconciliation.`);
      continue;
    }
    const refunds = await prisma.bookingPayment.findMany({ where: { paymentProviderId: statement.providerId, bookingId: payment.bookingId, paymentType: "refund", status: "refunded", OR: [{ providerData: { path: ["sourcePaymentId"], equals: payment.id } }, { providerPaymentId: row.providerCaptureId }] } });
    if (refunds.some((refund) => refund.currency !== statement.currencyCode || !Number.isSafeInteger(refund.amountMinor))) {
      exceptions.push(`${row.providerCaptureId}: refund currency or amount requires reconciliation.`);
      continue;
    }
    const prior = earlier.flatMap((item) => item.rows).filter((item) => item.providerCaptureId === row.providerCaptureId);
    const priorGross = prior.reduce((sum, item) => sum + item.grossMinor, 0), priorRefund = prior.reduce((sum, item) => sum + item.refundMinor, 0);
    const refundable = refunds.reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
    if (priorGross + row.grossMinor > payment.amountMinor || row.grossMinor > 0 && priorGross + row.grossMinor !== payment.amountMinor) exceptions.push(`${row.providerCaptureId}: gross capture is duplicated, incomplete, or differs from payment evidence.`);
    if (priorRefund + row.refundMinor > refundable) exceptions.push(`${row.providerCaptureId}: statement refund is not backed by settled refunds or was already allocated.`);
    if (row.grossMinor === 0 && priorGross !== payment.amountMinor) exceptions.push(`${row.providerCaptureId}: refund/fee-only rows require the original capture in an earlier matched statement.`);
  }
  return exceptions;
}
function authorize(context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Payout reconciliation requires payment permission.");
  return context.session.itemId;
}
async function hotelPayoutOperations(_root, _args, context) {
  authorize(context);
  return { statements: await statements(context.prisma) };
}
async function manageHotelPayout(_root, { input }, context) {
  const actorId = authorize(context);
  const action = text41(input?.action, "Action");
  const key4 = text41(input?.idempotencyKey, "Attempt key", 150);
  if (!["import", "refresh", "confirm"].includes(action)) throw new Error("Unsupported statement action.");
  let candidate;
  if (action === "import") {
    const providerCode = text41(input.providerCode, "Provider");
    if (!["pp_stripe_stripe", "pp_paypal_paypal"].includes(providerCode)) throw new Error("Unsupported statement provider.");
    const payoutId = text41(input.payoutId, "Payout ID", 150), payoutDate = text41(input.payoutDate, "Payout date", 10), currencyCode = text41(input.currencyCode, "Currency", 3).toUpperCase();
    if (currencyCode !== "USD" || !/^\d{4}-\d{2}-\d{2}$/.test(payoutDate) || Number.isNaN(Date.parse(payoutDate)) || new Date(payoutDate).toISOString().slice(0, 10) !== payoutDate) throw new Error("A valid payout date and USD statement are required.");
    const rows = parseHotelPayoutCsv(input.csv);
    const totals = rows.reduce((sum, row) => ({ grossMinor: sum.grossMinor + row.grossMinor, refundMinor: sum.refundMinor + row.refundMinor, feeMinor: sum.feeMinor + row.feeMinor, netMinor: sum.netMinor + row.netMinor }), { grossMinor: 0, refundMinor: 0, feeMinor: 0, netMinor: 0 });
    Object.values(totals).forEach((value) => amount(value, true));
    const sourceHash = (0, import_node_crypto5.createHash)("sha256").update(JSON.stringify({ providerCode, payoutId, payoutDate, currencyCode, rows })).digest("hex");
    candidate = { id: (0, import_node_crypto5.createHash)("sha256").update(`${providerCode}:${payoutId}`).digest("hex").slice(0, 24), providerCode, payoutId, payoutDate, currencyCode, rows, totals, sourceHash };
  }
  const id = candidate?.id || text41(input.id, "Statement ID");
  const bankReference = action === "confirm" ? text41(input.bankReference, "Bank deposit/debit reference", 200) : "";
  const bankAmountMinor = action === "confirm" ? amount(input.bankAmountMinor, true) : 0;
  const eventKey = `payout:${key4}`;
  const identity = { request: { action, id, candidate: candidate || null, bankReference, bankAmountMinor, actorId }, aggregateType: "payout_statement", aggregateId: id, action };
  return runSerializableTransaction(context, async (tx) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, "payout-statements");
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    const all = await statements(prisma), prior = all.find((item) => item.id === id);
    if (prior?.status === "matched") throw new Error("Matched statements are immutable; corrections require a separately reviewed adjustment statement.");
    let next2 = candidate ? { ...candidate, sequence: (prior?.sequence || 0) + 1, importedBy: actorId } : { ...prior, sequence: (prior?.sequence || 0) + 1 };
    if (!candidate && !prior) throw new Error("Statement not found.");
    if (candidate) {
      const provider = await prisma.paymentProvider.findUnique({ where: { code: candidate.providerCode } });
      if (!provider) throw new Error("Statement provider is not registered.");
      next2.providerId = provider.id;
    }
    const exceptions = await validateSource(prisma, next2, all);
    next2 = { ...next2, exceptions, status: exceptions.length ? "exceptions" : "awaiting_independent_review" };
    if (action === "confirm") {
      if (exceptions.length) throw new Error("Resolve every source reconciliation exception before confirming a statement.");
      if (bankAmountMinor !== next2.totals.netMinor) throw new Error("Bank statement amount must equal the exact signed payout net.");
      if (all.some((item) => item.id !== id && item.status === "matched" && item.bankReference === bankReference)) throw new Error("Bank settlement reference is already allocated to another statement.");
      await requireHotelApproval(prisma, { approvalId: input.approvalId, action: "payout_reconcile", aggregateId: id, amountMinor: Math.abs(bankAmountMinor), actorId, operationKey: eventKey, parameters: { sourceHash: next2.sourceHash, bankReference, bankAmountMinor } });
      next2 = { ...next2, status: "matched", bankReference, bankAmountMinor, reviewedBy: actorId, matchedAt: (/* @__PURE__ */ new Date()).toISOString(), evidenceOrigin: "operator_imported_provider_statement_and_bank_reference" };
    }
    await recordHotelLifecycleEvent({ prisma, actorId, eventKey, identity, beforeSnapshot: prior || null, afterSnapshot: next2 });
    return next2;
  });
}

// features/keystone/lib/hotelRelocation.ts
init_access();
init_folioLedger();
init_hotelLifecycle();
init_serializableTransaction();
var next = { requested: ["requested", "arranged"], arranged: ["arranged", "transferred"], transferred: ["transferred", "completed"], completed: [] };
function transitionRelocation(existing, input) {
  if (input.expectedRevision !== (existing?.revision || 0)) throw new Error("Relocation changed; refresh before recording the next step.");
  if (!existing && input.status !== "requested") throw new Error("Start a relocation request before recording arrangements.");
  if (existing && !next[existing.status]?.includes(input.status)) throw new Error("Unsupported relocation transition; completed evidence is immutable.");
  const value = { ...existing || { bookingId: input.bookingId, propertyName: "", contact: "", confirmation: "", costMinor: 0, guestAgreement: "", followUp: "", costEvidence: "" }, revision: (existing?.revision || 0) + 1, status: input.status, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  for (const field of ["propertyName", "contact", "confirmation", "guestAgreement", "followUp", "costEvidence"]) {
    if (input[field] !== void 0 && input[field] !== null) value[field] = String(input[field]).trim();
    if (value[field].length > 1e3) throw new Error("Relocation evidence fields are limited to 1000 characters.");
  }
  if (input.costMinor !== void 0 && input.costMinor !== null) value.costMinor = input.costMinor;
  if (!Number.isSafeInteger(value.costMinor) || value.costMinor < 0 || value.costMinor > 2147483647) throw new Error("Relocation cost must be a nonnegative USD minor-unit integer.");
  if (input.status !== "requested" && ["propertyName", "contact", "confirmation", "guestAgreement"].some((field) => !value[field])) throw new Error("Record receiving property, contact, confirmation and guest agreement before arranging the transfer.");
  if (input.status === "completed" && (!value.followUp || !value.costEvidence)) throw new Error("Record guest follow-up and the cost settlement reference (or no-cost explanation) before completion.");
  return value;
}
async function loadHotelRelocation(prisma, bookingId) {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: "relocation", aggregateId: bookingId } });
  return events.reduce((value, event) => Number(event.afterSnapshot?.relocation?.revision || 0) > Number(value?.revision || 0) ? event.afterSnapshot.relocation : value, null);
}
function authorize2(context) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error("Only reservation managers may operate guest relocation.");
}
async function hotelRelocation(_root, { bookingId }, context) {
  authorize2(context);
  if (!await context.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } })) throw new Error("Reservation not found.");
  return JSON.stringify(await loadHotelRelocation(context.prisma, bookingId));
}
async function updateHotelRelocation(_root, input, context) {
  authorize2(context);
  const key4 = String(input.idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable relocation idempotency key is required.");
  const eventKey = `hotel-relocation:${key4}`, identity = { request: input, aggregateType: "relocation", aggregateId: input.bookingId, action: input.status };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${input.bookingId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot.relocation);
    const booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { folio: { include: { entries: true } } } });
    if (!booking) throw new Error("Reservation not found.");
    const previous = await loadHotelRelocation(p, input.bookingId);
    if (!previous && !["confirmed", "checked_in"].includes(booking.status)) throw new Error("Start relocation for a confirmed or in-house guest.");
    const relocation = transitionRelocation(previous, input);
    if (relocation.status === "completed") {
      if (!["cancelled", "checked_out"].includes(booking.status)) throw new Error("Complete local cancellation or departure through its normal workflow before closing relocation.");
      if (await p.refundIntent.count({ where: { bookingId: booking.id, status: { in: ["pending", "processing", "failed", "dead_letter"] } } })) throw new Error("Resolve local guest refund obligations before closing relocation.");
      if (!booking.billingFolioId && (!booking.folio || calculateFolioBalance(booking.folio.entries).balanceMinor !== 0)) throw new Error("Settle the local guest folio before closing relocation.");
    }
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: previous ? { relocation: previous } : null, afterSnapshot: { relocation }, metadata: { mode: "operator_external_arrangement", externalCostIsStaffAttestation: true, localInventoryUsesNormalBookingLifecycle: true } });
    return JSON.stringify(relocation);
  });
}

// features/keystone/lib/hotelSecurityAuthorization.ts
var import_node_crypto14 = require("node:crypto");
var import_client5 = require("@prisma/client");
init_access();
init_guestBookingAccess();
init_paymentProviderAdapter();
init_paymentSecurity();
init_serializableTransaction();
init_hotelLifecycle();
init_hotelGuestGovernance();
init_bookingFolio();
init_bookingRefund();

// features/keystone/lib/bookingPaymentSettlement.ts
var import_node_crypto13 = require("node:crypto");
init_bookingFolio();
init_hotelLifecycle();
init_hotelCommunications();
init_bookingConfirmation();
init_paymentSecurity();
init_bookingRefund();
init_bookingCancellation();
init_paymentProviderAdapter();
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
    `hotel-booking:${bookingId}`
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
  amount: amount3,
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
    const storedProviderId = String(session.data?.paymentIntentId || session.data?.orderId || session.data?.id || "");
    if (!storedProviderId || storedProviderId !== providerPaymentId) throw new Error("Settlement identifier does not match the stored payment session.");
    if (session.payment) {
      if (session.payment.amountMinor !== amount3 || session.payment.currency !== currencyCode.trim().toUpperCase() || session.payment.providerPaymentId !== providerPaymentId && session.payment.providerPaymentId !== providerCaptureId || session.payment.providerCaptureId !== (providerCaptureId || providerPaymentId)) {
        throw new Error("Payment session is already bound to different settlement evidence.");
      }
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
      await ensurePaymentFolioPosting(transactionContext, session.payment.id, session.payment.providerData?.recoveryReason ? { allowRecoveryReopen: true } : {});
      return { paymentId: session.payment.id, replayed: true };
    }
    if (!Number.isSafeInteger(amount3) || amount3 !== session.amount) {
      throw new Error("Settlement amount does not match the payment session.");
    }
    if (currencyCode.trim().toUpperCase() !== "USD") {
      throw new Error("Settlement currency does not match the booking currency.");
    }
    if (!providerPaymentId) {
      throw new Error("Provider payment identifier is required.");
    }
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-provider-capture:${providerCode}:${providerCaptureId || providerPaymentId}`);
    const otherCapture = await prisma.bookingPayment.findFirst({ where: {
      paymentProviderId: session.paymentProviderId,
      providerCaptureId: providerCaptureId || providerPaymentId,
      paymentType: { not: "refund" }
    } });
    if (otherCapture) throw new Error("Provider capture is already bound to another payment session.");
    const now = /* @__PURE__ */ new Date();
    let confirmationAvailable = ["pending", "confirmed"].includes(session.booking.status);
    let recoveryReason = confirmationAvailable ? "" : `Late capture for ${session.booking.status} reservation`;
    if (confirmationAvailable) {
      try {
        await assertBookingConfirmationInventory(transactionContext, session.booking, now);
      } catch (error) {
        if (!(error instanceof BookingConfirmationError)) throw error;
        confirmationAvailable = false;
        recoveryReason = error.message;
      }
    }
    const beforeCapture = await getBookingCollectibleBalance(transactionContext, bookingId);
    const reservedRefunds = await prisma.refundIntent.findMany({ where: { bookingId, status: { in: ["pending", "processing", "failed", "dead_letter"] } }, select: { amountMinor: true } });
    const reservedMinor = reservedRefunds.reduce((sum, intent) => sum + intent.amountMinor, 0);
    const staleObligation = Boolean(session.data?.retiredAt) || session.data?.obligation && session.data.obligation.pricingRevision !== (session.booking.pricingRevision || 1);
    const recoveryMinor = staleObligation ? amount3 : captureRecoveryAmount(session.booking, amount3, beforeCapture.balanceDueMinor, confirmationAvailable);
    if (staleObligation) recoveryReason = "Capture belongs to an earlier reservation pricing revision";
    if (recoveryMinor && !recoveryReason) recoveryReason = "Capture exceeds the current reservation obligation";
    const payment = await prisma.bookingPayment.create({
      data: {
        paymentReference: `PAY-${(0, import_node_crypto13.randomUUID)().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        paymentType: session.booking.status === "pending" && Number(session.booking.pricingSnapshot?.depositPercent ?? 100) < 100 ? "deposit" : "full_payment",
        amountMinor: amount3,
        amount: amount3 / 100,
        currency: "USD",
        paymentMethod: providerCode === "pp_paypal_paypal" ? "paypal" : "credit_card",
        status: "completed",
        providerPaymentId,
        providerCaptureId: providerCaptureId || providerPaymentId,
        providerData: { ...providerData || {}, ...recoveryReason ? { recoveryReason, recoveryMinor } : {} },
        stripePaymentIntentId: providerCode === "pp_stripe_stripe" ? providerPaymentId : "",
        description: `Payment for booking ${session.booking.confirmationNumber}`,
        receiptEmail: session.booking.guestEmail,
        processedAt: now,
        bookingId,
        paymentProviderId: session.paymentProviderId,
        paymentSessionId: session.id
      }
    });
    await ensurePaymentFolioPosting(transactionContext, payment.id, recoveryReason ? { allowRecoveryReopen: true } : {});
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
    const paidMinor = Math.max(0, ledger.reduce((sum, item) => sum + (item.paymentType === "refund" ? -Math.abs(Number(item.amountMinor || 0)) : Math.max(0, Number(item.amountMinor || 0))), 0) - reservedMinor - recoveryMinor);
    if (!confirmationAvailable && session.booking.status === "pending") {
      await requestBookingCancellation({
        context: transactionContext,
        bookingId,
        source: "payment_recovery",
        refundReason: recoveryReason,
        idempotencyKey: `capture-recovery:${payment.id}`,
        withinTransaction: true
      });
    } else if (recoveryMinor > 0) {
      await queueCaptureRecoveryRefund(prisma, payment, recoveryMinor, recoveryReason);
    }
    const remainingMinor = (await getBookingCollectibleBalance(transactionContext, bookingId)).balanceDueMinor;
    const depositSatisfied = remainingMinor <= 0 || !recoveryMinor && session.booking.status === "pending" && bookingPaymentDueNow(session.booking, remainingMinor) === 0;
    if (confirmationAvailable) await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: remainingMinor <= 0 ? "paid" : paidMinor > 0 ? "partial" : "unpaid",
        balanceDueMinor: remainingMinor,
        balanceDue: remainingMinor / 100,
        ...payment.paymentType === "deposit" ? { depositAmountMinor: paidMinor, depositAmount: paidMinor / 100 } : {},
        ...depositSatisfied ? {
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
          amount: amount3,
          currencyCode: "USD"
        },
        aggregateType: "booking_payment",
        aggregateId: payment.id,
        action: "settled"
      },
      afterSnapshot: {
        status: payment.status,
        amountMinor: amount3,
        currencyCode: "USD",
        bookingId
      },
      metadata: { providerCode, paymentSessionId: session.id }
    });
    if (confirmationAvailable && depositSatisfied) {
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
          evidence: { amount: amount3, currencyCode: "USD", providerPaymentId },
          bookingId,
          paymentId: payment.id
        }
      });
    }
    return { paymentId: payment.id, replayed: false, recoveryMinor, confirmationAvailable };
  });
}
async function retireBookingPaymentSession(context, sessionId, bookingId, cancel = cancelPayment) {
  const session = await serializableTransaction(context, async (tx) => {
    await lockBookingPayment(tx.prisma, bookingId);
    const current = await tx.prisma.bookingPaymentSession.findUnique({ where: { id: sessionId }, include: { paymentProvider: true, payment: true } });
    if (!current || current.bookingId !== bookingId) throw new Error("Retired payment session does not belong to booking.");
    if (current.payment) {
      await tx.prisma.bookingPaymentSession.update({ where: { id: current.id }, data: { isSelected: false, data: { ...current.data || {}, retirement: { status: "captured" } } } });
      return null;
    }
    const data = {
      ...current.data || {},
      retiredAt: current.data?.retiredAt || (/* @__PURE__ */ new Date()).toISOString(),
      retirement: current.data?.retirement || { status: current.paymentProvider?.code === "pp_stripe_stripe" ? "pending" : "provider_expiry_required", attempts: 0 }
    };
    await tx.prisma.bookingPaymentSession.update({ where: { id: current.id }, data: { isSelected: false, data } });
    return { ...current, data };
  });
  if (!session || session.paymentProvider?.code !== "pp_stripe_stripe" || ["cancelled", "captured"].includes(session.data?.retirement?.status)) return;
  const attempts = Number(session.data?.retirement?.attempts || 0) + 1;
  let retirement;
  try {
    const result = await cancel({
      provider: session.paymentProvider,
      paymentId: session.data.paymentIntentId,
      idempotencyKey: `retire:${session.id}`
    });
    if (result.settlement?.isSettled) {
      await finalizeBookingPayment({
        context,
        bookingId,
        paymentSessionId: session.id,
        providerCode: session.paymentProvider.code,
        providerPaymentId: session.data.paymentIntentId,
        providerCaptureId: session.data.paymentIntentId,
        amount: result.settlement.amount,
        currencyCode: result.settlement.currencyCode,
        providerData: result.data
      });
      retirement = { status: "captured", attempts };
    } else if (result.status === "canceled") retirement = { status: "cancelled", attempts };
    else throw new Error("Provider cancellation is not terminal.");
  } catch {
    retirement = {
      status: "failed",
      attempts,
      nextAttemptAt: new Date(Date.now() + Math.min(36e5, 5e3 * 2 ** Math.min(attempts, 10))).toISOString(),
      message: "Provider cancellation could not be confirmed; late settlement remains recoverable."
    };
  }
  await serializableTransaction(context, async (tx) => {
    await lockBookingPayment(tx.prisma, bookingId);
    const current = await tx.prisma.bookingPaymentSession.findUnique({ where: { id: sessionId } });
    await tx.prisma.bookingPaymentSession.update({ where: { id: sessionId }, data: { data: { ...current.data || {}, retirement } } });
  });
  return retirement.status;
}
async function dispatchPaymentSessionRetirements(context) {
  const sessions = await context.prisma.bookingPaymentSession.findMany({
    where: { OR: [{ data: { path: ["retirement", "status"], equals: "pending" } }, { data: { path: ["retirement", "status"], equals: "failed" } }] },
    orderBy: { updatedAt: "asc" },
    take: 20
  });
  let unresolved = 0;
  for (const session of sessions) {
    if (session.data?.retirement?.nextAttemptAt && new Date(session.data.retirement.nextAttemptAt) > /* @__PURE__ */ new Date()) {
      unresolved += 1;
      continue;
    }
    const status = await retireBookingPaymentSession(context, session.id, session.bookingId);
    if (status === "failed") unresolved += 1;
  }
  return { unresolved };
}

// features/keystone/lib/hotelSecurityAuthorization.ts
async function states(prisma, bookingId) {
  const rows = await prisma.$queryRaw(import_client5.Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent" WHERE "propertyKey"=${HOTEL_PROPERTY_KEY} AND "aggregateType"='security_authorization' ${bookingId ? import_client5.Prisma.sql`AND "aggregateId"=${bookingId}` : import_client5.Prisma.empty} ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row) => row.state);
}
async function persist(prisma, before, after, key4, request) {
  await recordHotelLifecycleEvent({
    prisma,
    actorId: after.pending?.actorId || void 0,
    eventKey: key4,
    identity: { request, aggregateType: "security_authorization", aggregateId: after.bookingId, action: request.action },
    beforeSnapshot: before || null,
    afterSnapshot: after
  });
}
function projection(state) {
  if (!state) return null;
  return { id: state.id, bookingId: state.bookingId, amountMinor: state.amountMinor, status: state.status, expiresAt: state.expiresAt || null, paymentId: state.paymentId || null, pending: Boolean(state.pending), lastError: state.lastError || "" };
}
async function hotelSecurityAuthorization(_root, { bookingId }, context) {
  await assertGuestBookingAccess(context, bookingId);
  const [state] = await states(context.prisma, bookingId);
  const booking = await context.prisma.booking.findUnique({ where: { id: bookingId }, select: { pricingSnapshot: true } });
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: "pp_stripe_stripe" } });
  return { authorization: projection(state), configuredAmountMinor: Number(booking?.pricingSnapshot?.securityDepositMinor || 0), available: Boolean(isPaymentProviderConfigured(provider)), operator: permissions.canManagePayments({ session: context.session }) };
}
function validateSecurityEvidence(state, evidence2) {
  if (evidence2.authorizationId !== state.id || evidence2.bookingId !== state.bookingId || state.providerPaymentId && evidence2.id !== state.providerPaymentId || !String(evidence2.id || "").startsWith("pi_")) throw new Error("Security authorization identity mismatch.");
  if (evidence2.currencyCode !== "USD" || evidence2.amountMinor !== state.amountMinor || !Number.isSafeInteger(evidence2.amountReceivedMinor) || evidence2.amountReceivedMinor < 0 || evidence2.amountReceivedMinor > state.amountMinor || !Number.isSafeInteger(evidence2.amountCapturableMinor) || evidence2.amountCapturableMinor < 0 || evidence2.amountCapturableMinor > state.amountMinor) throw new Error("Security authorization amount or currency mismatch.");
  if (!["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "succeeded", "canceled"].includes(evidence2.status)) throw new Error("Unrecognized security authorization status.");
  if (state.capturedMinor !== void 0 && evidence2.status === "succeeded" && evidence2.amountReceivedMinor !== state.capturedMinor) throw new Error("Captured security evidence changed its settled amount.");
  if (evidence2.status === "succeeded" && evidence2.amountReceivedMinor <= 0) throw new Error("Captured security authorization has no settlement amount.");
}
async function applyEvidence(tx, state, evidence2, eventKey) {
  validateSecurityEvidence(state, evidence2);
  const prisma = tx.prisma;
  let paymentId = state.paymentId;
  if (evidence2.status === "succeeded" && !paymentId) {
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-provider-capture:pp_stripe_stripe:${evidence2.id}`);
    const existing = await prisma.bookingPayment.findFirst({ where: { paymentProviderId: state.providerId, providerCaptureId: evidence2.id, paymentType: { not: "refund" } } });
    if (existing) {
      if (existing.bookingId !== state.bookingId || existing.amountMinor !== evidence2.amountReceivedMinor) throw new Error("Security capture already belongs to different payment evidence.");
      paymentId = existing.id;
    } else {
      const booking = await prisma.booking.findUnique({ where: { id: state.bookingId } });
      const collectible = await getBookingCollectibleBalance(tx, state.bookingId);
      const authorizedCapture = state.pending?.action === "capture" && state.pending.amountMinor === evidence2.amountReceivedMinor;
      const recoveryMinor = !authorizedCapture || !["confirmed", "checked_in"].includes(booking.status) ? evidence2.amountReceivedMinor : Math.max(0, evidence2.amountReceivedMinor - collectible.balanceDueMinor);
      const payment = await prisma.bookingPayment.create({ data: {
        paymentReference: `SEC-${(0, import_node_crypto14.randomUUID)().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        bookingId: state.bookingId,
        paymentProviderId: state.providerId,
        paymentType: "full_payment",
        amountMinor: evidence2.amountReceivedMinor,
        amount: evidence2.amountReceivedMinor / 100,
        currency: "USD",
        paymentMethod: "credit_card",
        status: "completed",
        providerPaymentId: evidence2.id,
        providerCaptureId: evidence2.id,
        providerData: { securityAuthorizationId: state.id, ...recoveryMinor ? { recoveryReason: "Security capture exceeds its authorized current obligation", recoveryMinor } : {} },
        description: "Approved security authorization capture against folio charges",
        processedAt: /* @__PURE__ */ new Date(),
        processedById: state.pending?.actorId || null
      } });
      paymentId = payment.id;
      await ensurePaymentFolioPosting(tx, payment.id, recoveryMinor ? { allowRecoveryReopen: true } : {});
      if (recoveryMinor) await queueCaptureRecoveryRefund(prisma, payment, recoveryMinor, "Security capture exceeds its authorized current obligation");
      await recomputeBookingPaymentState(prisma, state.bookingId);
    }
  }
  const pending = !["succeeded", "canceled"].includes(evidence2.status) && ["capture", "release"].includes(state.pending?.action || "") ? state.pending : null;
  const status = state.status === "requires_capture" && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(evidence2.status) ? state.status : evidence2.status;
  const next2 = { ...state, sequence: state.sequence + 1, providerPaymentId: evidence2.id, status, expiresAt: evidence2.expiresAt || state.expiresAt || null, paymentId, ...evidence2.status === "succeeded" ? { capturedMinor: evidence2.amountReceivedMinor } : {}, pending, lastError: "", nextReconcileAt: new Date(Date.now() + 6e4).toISOString() };
  await persist(prisma, state, next2, eventKey, { action: "provider_evidence", evidence: evidence2 });
  return next2;
}
async function executePending(context, state, adapter = securityAuthorization) {
  const operation = state.pending;
  const provider = await context.prisma.paymentProvider.findUnique({ where: { id: state.providerId } });
  if (!provider || provider.code !== "pp_stripe_stripe") throw new Error("Stripe authorization provider not found.");
  let evidence2;
  try {
    evidence2 = await adapter({
      provider,
      action: operation?.action || "sync",
      paymentId: state.providerPaymentId,
      amountMinor: operation?.amountMinor ?? state.amountMinor,
      authorizationId: state.id,
      bookingId: state.bookingId,
      idempotencyKey: operation?.key || `security-sync:${state.id}`
    });
  } catch {
    await runSerializableTransaction(context, async (tx) => {
      await lockHotelLifecycle(tx.prisma, `security:${state.bookingId}`);
      const [current] = await states(tx.prisma, state.bookingId);
      if (current?.id === state.id && current.pending?.key === operation?.key) await persist(tx.prisma, current, { ...current, sequence: current.sequence + 1, lastError: "Provider reconciliation failed; retry the same operation.", nextReconcileAt: new Date(Date.now() + 6e4).toISOString() }, `security-error:${(0, import_node_crypto14.randomUUID)()}`, { action: "provider_failed", operationKey: operation?.key });
    });
    throw new Error("Security authorization is awaiting provider reconciliation. Retry the same operation.");
  }
  const next2 = await runSerializableTransaction(context, async (tx) => {
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${state.bookingId}`);
    await lockHotelLifecycle(tx.prisma, `security:${state.bookingId}`);
    const [current] = await states(tx.prisma, state.bookingId);
    if (current?.id !== state.id) throw new Error("Security authorization changed during provider reconciliation.");
    if (["succeeded", "canceled"].includes(current.status) && evidence2.status !== current.status && evidence2.status !== "succeeded") return current;
    return applyEvidence(tx, current, evidence2, `security-result:${(0, import_node_crypto14.randomUUID)()}`);
  });
  return { authorization: projection(next2), clientSecret: ["requires_payment_method", "requires_confirmation", "requires_action"].includes(next2.status) ? evidence2.clientSecret : null };
}
async function manageHotelSecurityAuthorization(_root, { input }, context, adapter = securityAuthorization) {
  const bookingId = String(input?.bookingId || "");
  const action = String(input?.action || "");
  const key4 = String(input?.idempotencyKey || "");
  if (!bookingId || bookingId.length > 200 || !["initiate", "sync", "release", "capture"].includes(action) || !key4 || key4.length > 150) throw new Error("A bounded booking ID, operation and attempt key are required.");
  await assertGuestBookingAccess(context, bookingId);
  if (["capture", "release"].includes(action) && !permissions.canManagePayments({ session: context.session })) throw new Error("Security capture or release requires payment permission.");
  const actorId = context.session?.itemId || null;
  const amountMinor = action === "capture" ? Number(input.amountMinor) : 0;
  if (action === "capture" && (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)) throw new Error("A positive integer capture amount is required.");
  const eventKey = `security-operation:${key4}`;
  const identity = { request: { bookingId, action, amountMinor, actorId }, aggregateType: "security_authorization", aggregateId: bookingId, action };
  const state = await runSerializableTransaction(context, async (tx) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    await lockHotelLifecycle(prisma, `security:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    const [current] = await states(prisma, bookingId);
    if (replay) {
      if (current?.id !== replay.afterSnapshot.id) throw new Error("This operation belongs to a retired authorization.");
      return current;
    }
    if (current?.pending) {
      if (action === "sync") return current;
      throw new Error("Reconcile the existing pending authorization operation first.");
    }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error("Booking not found.");
    if (booking.billingFolioId && !canManageBookingRecords(context)) throw new Error("The property manages group security authorizations.");
    if (action === "sync") {
      if (!current) throw new Error("No security authorization exists.");
      return current;
    }
    let next2;
    if (action === "initiate") {
      if (!["confirmed", "checked_in"].includes(booking.status)) throw new Error("Security authorization requires a confirmed or checked-in stay.");
      if (current && !["canceled", "succeeded"].includes(current.status)) return current;
      const required3 = Number(booking.pricingSnapshot?.securityDepositMinor || 0);
      if (!Number.isSafeInteger(required3) || required3 <= 0) throw new Error("This reservation has no contracted security authorization amount.");
      const provider = await prisma.paymentProvider.findUnique({ where: { code: "pp_stripe_stripe" } });
      if (!provider || !isPaymentProviderConfigured(provider)) throw new Error("Configured Stripe is required for card security authorizations.");
      next2 = { id: (0, import_node_crypto14.createHash)("sha256").update(`${bookingId}:${key4}`).digest("hex").slice(0, 24), bookingId, sequence: (current?.sequence || 0) + 1, providerId: provider.id, amountMinor: required3, status: "initializing", pending: { action, key: eventKey, amountMinor: required3, actorId } };
    } else {
      if (!current?.providerPaymentId || ["canceled", "succeeded"].includes(current.status)) throw new Error("No open card authorization can be changed.");
      if (action === "capture") {
        if (!["confirmed", "checked_in"].includes(booking.status) || current.status !== "requires_capture" || current.expiresAt && new Date(current.expiresAt) <= /* @__PURE__ */ new Date()) throw new Error("Capture requires an unexpired authorization for an active stay.");
        const balance = await getBookingCollectibleBalance(tx, bookingId);
        const entries = await prisma.folioEntry.findMany({ where: { folioId: balance.folioId }, select: { direction: true, amountMinor: true, currencyCode: true } });
        const postedBalance = entries.reduce((sum, row) => {
          if (row.currencyCode !== "USD") throw new Error("Mixed-currency folio requires reconciliation.");
          return sum + (row.direction === "debit" ? row.amountMinor : -row.amountMinor);
        }, 0);
        if (amountMinor > current.amountMinor || amountMinor > Math.min(postedBalance, balance.balanceDueMinor)) throw new Error("Capture exceeds authorized funds or actual posted folio charges.");
        await requireHotelApproval(prisma, { approvalId: input.approvalId, action: "security_capture", aggregateId: current.id, amountMinor, actorId, operationKey: eventKey });
      }
      next2 = { ...current, sequence: current.sequence + 1, pending: { action, key: eventKey, amountMinor, actorId } };
    }
    await recordHotelLifecycleEvent({ prisma, actorId: actorId || void 0, eventKey, identity, beforeSnapshot: current || null, afterSnapshot: next2 });
    return next2;
  });
  return executePending(context, state, adapter);
}
async function reconcileSecurityAuthorizations(context, adapter = securityAuthorization) {
  let failed = 0;
  const due = (await states(context.prisma)).filter((state) => (state.pending || !["succeeded", "canceled"].includes(state.status)) && (!state.nextReconcileAt || new Date(state.nextReconcileAt) <= /* @__PURE__ */ new Date())).sort((a, b) => String(a.nextReconcileAt || "").localeCompare(String(b.nextReconcileAt || ""))).slice(0, 20);
  for (const state of due) {
    if (!state.pending && ["succeeded", "canceled"].includes(state.status)) continue;
    try {
      let current = state;
      if (!state.pending) {
        const booking = await context.prisma.booking.findUnique({ where: { id: state.bookingId } });
        if (booking && ["cancelled", "no_show", "checked_out"].includes(booking.status)) current = await runSerializableTransaction(context, async (tx) => {
          await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${state.bookingId}`);
          await lockHotelLifecycle(tx.prisma, `security:${state.bookingId}`);
          const [latest2] = await states(tx.prisma, state.bookingId);
          if (latest2.pending || ["succeeded", "canceled"].includes(latest2.status)) return latest2;
          const next2 = { ...latest2, sequence: latest2.sequence + 1, pending: { action: "release", key: `security-auto-release:${latest2.id}`, amountMinor: 0, actorId: null } };
          await persist(tx.prisma, latest2, next2, next2.pending.key, { action: "release_after_departure" });
          return next2;
        });
      }
      await executePending(context, current, adapter);
    } catch {
      failed++;
    }
  }
  return failed;
}

// features/keystone/mutations/index.ts
init_hotelDerivedRates();
init_hotelLoyalty();

// features/keystone/lib/maintenanceCommercial.ts
init_access();
init_serializableTransaction();
init_hotelLifecycle();
init_hotelBusinessTime();
var empty = (legacyCostMinor = 0) => ({ revision: 0, vendorName: "", vendorReference: "", dueAt: null, acknowledgedAt: null, legacyCostMinor, laborCostMinor: 0, parts: [] });
function text44(value, label, max = 500) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return result;
}
function money(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483647) throw new Error(`${label} must be a nonnegative integer amount in minor units.`);
  return Number(value);
}
function maintenanceCommercialCost(state) {
  const total = (state.legacyCostMinor || 0) + state.laborCostMinor + state.parts.filter((part) => part.status === "used").reduce((sum, part) => sum + part.quantity * part.unitCostMinor, 0);
  return money(total, "Total maintenance cost");
}
function planMaintenanceCommercial(state, command, input, now = /* @__PURE__ */ new Date()) {
  const next2 = structuredClone(state);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) throw new Error("Maintenance commercial details changed. Refresh before retrying.");
  text44(input.reason, "Evidence or change reason", 1e3);
  if (command === "plan") {
    next2.vendorName = text44(input.vendorName, "Vendor or internal team", 200);
    next2.vendorReference = text44(input.vendorReference, "Reviewed work-order or vendor reference", 200);
    const dueAt = new Date(input.dueAt);
    if (!Number.isFinite(dueAt.getTime()) || dueAt < now) throw new Error("Choose a future repair deadline with an explicit time zone.");
    if (!/(Z|[+-]\d\d:\d\d)$/.test(String(input.dueAt))) throw new Error("Repair deadline requires an explicit time zone.");
    next2.dueAt = dueAt.toISOString();
    next2.acknowledgedAt = null;
  } else if (command === "acknowledge") {
    if (!next2.vendorName || !next2.dueAt || next2.acknowledgedAt) throw new Error("An unacknowledged work order is required.");
    next2.acknowledgedAt = now.toISOString();
  } else if (command === "order_part") {
    const id = text44(input.partId, "Unique part line reference", 100);
    if (next2.parts.some((part2) => part2.id === id)) throw new Error("Part line reference already exists.");
    if (next2.parts.length >= 100) throw new Error("A work order supports at most 100 parts lines.");
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1e4) throw new Error("Part quantity must be 1\u201310000 whole units.");
    const part = { id, description: text44(input.description, "Part description", 200), quantity: input.quantity, unitCostMinor: money(input.unitCostMinor, "Part unit cost"), status: "ordered" };
    money(part.quantity * part.unitCostMinor, "Extended part cost");
    next2.parts.push(part);
  } else if (command === "part_status") {
    const part = next2.parts.find((part2) => part2.id === input.partId);
    if (!part) throw new Error("Part line does not belong to this work order.");
    const allowed = { ordered: ["received", "cancelled"], received: ["used", "returned"], used: [], cancelled: [], returned: [] };
    if (!allowed[part.status].includes(input.status)) throw new Error(`Part cannot transition from ${part.status} to ${input.status}.`);
    part.status = input.status;
  } else if (command === "labor") next2.laborCostMinor = money(input.laborCostMinor, "Total approved labor cost");
  else throw new Error("Unsupported maintenance commercial command.");
  next2.revision += 1;
  maintenanceCommercialCost(next2);
  return next2;
}
function authorize7(context) {
  if (!permissions.canManageRooms({ session: context.session })) throw new Error("Room management permission is required for maintenance commercial records.");
}
async function load(prisma, requestId, legacyCostMinor = 0) {
  const rows = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "maintenance_commercial", aggregateId: requestId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 501 });
  if (rows.length > 500) throw new Error("Work-order commercial history requires an archival review.");
  const latest2 = rows.reduce((state, row) => Number(row.afterSnapshot?.commercial?.revision) > state.revision ? row.afterSnapshot.commercial : state, empty(money(legacyCostMinor, "Previously recorded maintenance cost")));
  return { commercial: latest2, history: rows.map((row) => ({ action: row.action, occurredAt: row.occurredAt, reason: row.metadataSnapshot?.reason })) };
}
async function workspace(prisma, requestId) {
  const request = await prisma.maintenanceRequest.findUnique({ where: { id: requestId }, select: { id: true, title: true, status: true, completedAt: true, cost: true } });
  if (!request) throw new Error("Maintenance request not found.");
  const details = await load(prisma, requestId, request.cost || 0);
  return { request, ...details, actualCostMinor: maintenanceCommercialCost(details.commercial), overdue: Boolean(details.commercial.dueAt && !["completed", "verified", "cancelled"].includes(request.status) && new Date(details.commercial.dueAt) < /* @__PURE__ */ new Date()) };
}
async function hotelMaintenanceCommercial(_root, { requestId }, context) {
  authorize7(context);
  return JSON.stringify(await workspace(context.prisma, text44(requestId, "Request ID", 200)));
}
async function updateHotelMaintenanceCommercial(_root, { requestId, command, payload, idempotencyKey }, context) {
  authorize7(context);
  const id = text44(requestId, "Request ID", 200);
  const eventKey = `maintenance-commercial:${text44(idempotencyKey, "Idempotency key", 150)}`;
  if (payload.length > 2e4) throw new Error("Work-order payload is too large.");
  const data = JSON.parse(payload);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("A structured work-order request is required.");
  const requestHash = hashLifecycleRequest({ requestId: id, command, data, actorId: context.session.itemId });
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelBusinessDate(p);
    const request = await p.maintenanceRequest.findUnique({ where: { id } });
    if (!request) throw new Error("Maintenance request not found.");
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${request.roomId}`);
    const prior = await p.hotelAuditEvent.findUnique({ where: { eventKey } });
    if (prior) {
      if (prior.requestHash !== requestHash) throw new Error("Work-order idempotency key was reused with different evidence.");
      return JSON.stringify(await workspace(p, id));
    }
    if (request.status === "cancelled") throw new Error("Cancelled work orders cannot receive commercial changes.");
    const { commercial: previous } = await load(p, id, request.cost || 0);
    const next2 = planMaintenanceCommercial(previous, command, data);
    await p.maintenanceRequest.update({ where: { id }, data: { cost: maintenanceCommercialCost(next2), ...command === "plan" ? { scheduledFor: new Date(next2.dueAt) } : {} } });
    await p.hotelAuditEvent.create({ data: { eventKey, requestHash, propertyKey: HOTEL_PROPERTY_KEY, aggregateType: "maintenance_commercial", aggregateId: id, action: command, actorId: context.session.itemId, beforeSnapshot: { commercial: previous }, afterSnapshot: { commercial: next2 }, metadataSnapshot: { reason: data.reason }, occurredAt: /* @__PURE__ */ new Date() } });
    return JSON.stringify(await workspace(p, id));
  });
}
var maintenanceCommercialTypeDefs = String.raw`
  extend type Query { hotelMaintenanceCommercial(requestId:ID!):String! }
  extend type Mutation { updateHotelMaintenanceCommercial(requestId:ID!,command:String!,payload:String!,idempotencyKey:String!):String! }
`;
var maintenanceCommercialResolvers = { Query: { hotelMaintenanceCommercial }, Mutation: { updateHotelMaintenanceCommercial } };

// features/keystone/lib/hotelChannelConfiguration.ts
var import_node_crypto15 = require("node:crypto");
init_access();
init_channelCredentials();
init_hotelLifecycle();
init_serializableTransaction();
async function saveHotelChannelDraft(_root, { input }, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) throw new Error("Not authorized to configure channels.");
  const name = String(input.name || "").trim();
  const channelId = String(input.channelId || "").trim();
  const key4 = String(input.idempotencyKey || "");
  const expectedVersion = Number(input.expectedVersion || 0);
  if (!name || name.length > 150 || !/^[\w:-]{16,180}$/.test(key4) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid channel draft identity or version.");
  if (!["ota", "gds", "direct", "metasearch"].includes(input.channelType)) throw new Error("Invalid channel type.");
  const apiBaseUrl = String(input.apiBaseUrl || "").trim();
  if (apiBaseUrl) {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Bridge base URL must use HTTPS without credentials, query or fragment.");
  }
  const accessToken = String(input.accessToken || "");
  const webhookSecret = String(input.webhookSecret || "");
  if (accessToken.length > 4e3 || webhookSecret.length > 4e3 || accessToken && accessToken.length < 16 || webhookSecret && webhookSecret.length < 16) throw new Error("Credential lengths are invalid.");
  const mapping = input.roomTypes;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.keys(mapping).length > 500) throw new Error("Room mappings must be an object of external IDs to local room type IDs.");
  for (const [external, local] of Object.entries(mapping)) if (!external || external.length > 150 || typeof local !== "string" || !local || local.length > 100) throw new Error("Invalid room mapping.");
  const credentials = { mode: "disabled", apiBaseUrl, accessToken, webhookSecret };
  const request = { name, channelId, channelType: input.channelType, expectedVersion, mapping, credentialDigest: (0, import_node_crypto15.createHash)("sha256").update(JSON.stringify(credentials)).digest("hex") };
  const eventKey = `channel-draft:${key4}`;
  return runSerializableTransaction(context, async (tx) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-channel-config:${channelId || name}`);
    const identity = { request, aggregateType: "channel_configuration", aggregateId: channelId || name, action: "draft_saved" };
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    const before = channelId ? await tx.prisma.channel.findUnique({ where: { id: channelId } }) : null;
    if (channelId && !before) throw new Error("Channel not found.");
    if (before?.isActive) throw new Error("An active channel must be retired through its partner lifecycle before changing mappings.");
    if (Number(before?.mappingRules?.version || 0) !== expectedVersion) throw new Error("Channel draft changed; refresh its mapping version.");
    const ids = [...new Set(Object.values(mapping))];
    if (ids.length && await tx.prisma.roomType.count({ where: { id: { in: ids } } }) !== ids.length) throw new Error("Every mapped room type must belong to this property.");
    const data = { name, channelType: input.channelType, credentials: encryptChannelCredentials(credentials), mappingRules: { version: expectedVersion + 1, roomTypes: mapping }, isActive: false, syncInventory: false, syncRates: false, syncStatus: "paused" };
    const saved = before ? await tx.prisma.channel.update({ where: { id: before.id }, data }) : await tx.prisma.channel.create({ data });
    const result = { channelId: saved.id, name, version: expectedVersion + 1, status: "draft", credentialsStored: Boolean(accessToken && webhookSecret), activationAvailable: false };
    await recordHotelLifecycleEvent({ prisma: tx.prisma, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { version: expectedVersion }, afterSnapshot: result });
    return result;
  });
}

// features/keystone/lib/hotelMfa.ts
var import_node_crypto17 = require("node:crypto");
init_access();
init_sensitiveData();

// features/keystone/lib/abuseControl.ts
var import_node_crypto16 = require("node:crypto");
var import_client6 = require("@prisma/client");
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
  const digest = (0, import_node_crypto16.createHash)("sha256").update(`${options.scope}:${identity}:${windowStartedAt.toISOString()}`).digest("hex");
  const rows = await context.prisma.$queryRaw(import_client6.Prisma.sql`
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

// features/keystone/lib/hotelMfa.ts
init_serializableTransaction();
init_hotelLifecycle();
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encodeMfaSecret(bytes) {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits) result += BASE32[value << 5 - bits & 31];
  return result;
}
function decodeSecret(secret) {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error("Invalid authenticator secret.");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of secret) {
    value = value << 5 | BASE32.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function hotelTotp(secret, counter) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid authenticator counter.");
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const hash = (0, import_node_crypto17.createHmac)("sha1", decodeSecret(secret)).update(input).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 2147483647) % 1e6).padStart(6, "0");
}
function verifyHotelTotp(secret, code, lastCounter, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter a six-digit authenticator code.");
  const current = Math.floor(now / 3e4);
  for (const counter of [current, current - 1, current + 1]) if (counter >= 0 && counter > lastCounter && (0, import_node_crypto17.timingSafeEqual)(Buffer.from(hotelTotp(secret, counter)), Buffer.from(code))) return counter;
  throw new Error("Authenticator code is invalid, expired or already used.");
}
function hashHotelRecoveryCode(userId, code) {
  return (0, import_node_crypto17.createHash)("sha256").update(`${userId}:${code.trim().toUpperCase()}`).digest("hex");
}
function consumeHotelRecoveryCode(userId, hashes, code) {
  const values = Array.isArray(hashes) ? hashes.filter((value) => typeof value === "string") : [];
  const hash = hashHotelRecoveryCode(userId, code);
  const index = values.findIndex((value) => value.length === hash.length && (0, import_node_crypto17.timingSafeEqual)(Buffer.from(value), Buffer.from(hash)));
  if (index < 0) throw new Error("Recovery code is invalid or already used.");
  return values.filter((_, position) => position !== index);
}
var trustedStarts = /* @__PURE__ */ new WeakMap();
var readPending;
function attestStart(user) {
  const data = { listKey: "User", itemId: user.id };
  trustedStarts.set(data, Number(user.authVersion));
  return data;
}
function createHotelMfaSessionStrategy(base, loadCurrent) {
  async function pending(context) {
    const raw = await base.get({ context });
    const current = await loadCurrent(context, raw);
    if (!current?.data?.mfaEnabled || raw?.mfaVerified || !raw?.mfaNonce || raw.mfaExpiresAt <= Date.now()) return void 0;
    const consumed = await context.prisma.hotelAuditEvent.findUnique({ where: { eventKey: `mfa-challenge:${raw.mfaNonce}` } });
    return consumed ? void 0 : current;
  }
  readPending = pending;
  return {
    get: async ({ context }) => {
      const raw = await base.get({ context });
      const current = await loadCurrent(context, raw);
      if (!current || current.data.mfaEnabled && raw.mfaVerified !== true) return void 0;
      return current;
    },
    start: async ({ context, data }) => {
      const current = await loadCurrent(context, data, true);
      if (!current) throw new Error("Authentication is not permitted for this account.");
      const verifiedVersion = trustedStarts.get(data);
      trustedStarts.delete(data);
      if (verifiedVersion !== void 0 && verifiedVersion !== Number(current.data.authVersion)) throw new Error("Account credentials changed during verification. Sign in again.");
      const verified = verifiedVersion !== void 0;
      return base.start({ context, data: { ...current, mfaVerified: verified, mfaNonce: (0, import_node_crypto17.randomBytes)(24).toString("hex"), mfaExpiresAt: Date.now() + 5 * 6e4 } });
    },
    end: (args) => base.end(args)
  };
}
async function mfaAudit(prisma, userId, action, eventKey = `mfa:${(0, import_node_crypto17.randomBytes)(24).toString("hex")}`) {
  await prisma.hotelAuditEvent.create({ data: { eventKey, requestHash: hashLifecycleRequest({ userId, action }), propertyKey: HOTEL_PROPERTY_KEY, actorId: userId, aggregateType: "staff_mfa", aggregateId: userId, action, afterSnapshot: { action }, beforeSnapshot: null, metadataSnapshot: {}, occurredAt: /* @__PURE__ */ new Date() } });
}
async function mfaLimit(context, userId) {
  await enforceAbuseLimit(context, { scope: "staff-mfa-account", identity: userId, limit: 8, windowMs: 15 * 6e4, includeNetwork: false });
}
async function mfaLock(prisma, id) {
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `staff-mfa:${id}`);
}
async function currentPassword(context, user, password2) {
  const field = context.graphql.schema.getType("User")?.getFields()?.password?.extensions?.keystoneSecretField;
  if (!field?.compare || typeof password2 !== "string" || password2.length > 1e3 || !await field.compare(password2, user.password)) throw new Error("Current password is required.");
}
function createHotelMfaResolvers(codec = { encrypt: encryptSensitiveText, decrypt: decryptSensitiveText }) {
  async function hotelMfaStatus(_root, _args, context) {
    if (isSignedIn({ session: context.session })) {
      const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId } });
      return JSON.stringify({ authenticated: true, enabled: Boolean(user?.mfaEnabled), recoveryCodesRemaining: Array.isArray(user?.mfaRecoveryHashes) ? user.mfaRecoveryHashes.length : 0 });
    }
    return JSON.stringify({ authenticated: false, challengeRequired: Boolean(readPending && await readPending(context)) });
  }
  async function verifyHotelMfa(_root, { code, recovery = false }, context) {
    const challenge = readPending && await readPending(context);
    if (!challenge) throw new Error("Sign in again to start a valid MFA challenge.");
    await mfaLimit(context, challenge.itemId);
    const user = await runSerializableTransaction(context, async (tx) => {
      const p = tx.prisma;
      await mfaLock(p, challenge.itemId);
      const user2 = await p.user.findUnique({ where: { id: challenge.itemId } });
      if (!user2?.isActive || !user2.mfaEnabled || Number(user2.authVersion) !== Number(challenge.data.authVersion) || challenge.mfaExpiresAt <= Date.now()) throw new Error("MFA challenge is no longer valid.");
      if (await p.hotelAuditEvent.findUnique({ where: { eventKey: `mfa-challenge:${challenge.mfaNonce}` } })) throw new Error("MFA challenge was already used. Sign in again.");
      const data = recovery ? { mfaRecoveryHashes: consumeHotelRecoveryCode(user2.id, user2.mfaRecoveryHashes, code) } : { mfaLastCounter: verifyHotelTotp(codec.decrypt(user2.mfaSecret), code, user2.mfaLastCounter) };
      await p.user.update({ where: { id: user2.id }, data });
      await mfaAudit(p, user2.id, recovery ? "recovery_verified" : "totp_verified", `mfa-challenge:${challenge.mfaNonce}`);
      return user2;
    });
    const sessionToken = await context.sessionStrategy.start({ context, data: attestStart(user) });
    return JSON.stringify({ sessionToken });
  }
  async function manageHotelMfa(_root, { action, password: password2, code = "", recovery = false }, context) {
    if (!isSignedIn({ session: context.session })) throw new Error("Full authentication is required to manage MFA.");
    const id = context.session.itemId;
    await mfaLimit(context, id);
    return runSerializableTransaction(context, async (tx) => {
      const p = tx.prisma;
      await mfaLock(p, id);
      const user = await p.user.findUnique({ where: { id } });
      if (!user?.isActive || Number(user.authVersion) !== Number(context.session.data.authVersion)) throw new Error("Account session changed. Sign in again.");
      await currentPassword(context, user, password2);
      if (action === "enroll") {
        if (user.mfaEnabled) throw new Error("MFA is already enabled; use the governed disable action before changing authenticators.");
        const secret = encodeMfaSecret((0, import_node_crypto17.randomBytes)(20));
        await p.user.update({ where: { id }, data: { mfaPendingSecret: codec.encrypt(secret), mfaPendingExpiresAt: new Date(Date.now() + 10 * 6e4) } });
        await mfaAudit(p, id, "enrollment_started");
        return JSON.stringify({ secret, provisioningUri: `otpauth://totp/${encodeURIComponent(`Hotel:${user.email}`)}?secret=${secret}&issuer=Hotel&algorithm=SHA1&digits=6&period=30`, message: "Store this secret in an authenticator and confirm a code within ten minutes." });
      }
      let factorData = {};
      if (action === "confirm") {
        if (user.mfaEnabled || !user.mfaPendingSecret || !user.mfaPendingExpiresAt || new Date(user.mfaPendingExpiresAt).getTime() <= Date.now()) throw new Error("Enrollment expired. Start enrollment again.");
        factorData = { mfaLastCounter: verifyHotelTotp(codec.decrypt(user.mfaPendingSecret), code, -1), mfaSecret: user.mfaPendingSecret, mfaEnabled: true };
      } else {
        if (!user.mfaEnabled || !["disable", "rotate_recovery"].includes(action)) throw new Error("Choose a valid action for an enabled authenticator.");
        factorData = recovery ? { mfaRecoveryHashes: consumeHotelRecoveryCode(id, user.mfaRecoveryHashes, code) } : { mfaLastCounter: verifyHotelTotp(codec.decrypt(user.mfaSecret), code, user.mfaLastCounter) };
      }
      const codes = action === "disable" ? [] : Array.from({ length: 10 }, () => (0, import_node_crypto17.randomBytes)(16).toString("hex").toUpperCase());
      await p.user.update({ where: { id }, data: {
        ...factorData,
        authVersion: Number(user.authVersion) + 1,
        mfaPendingSecret: "",
        mfaPendingExpiresAt: null,
        mfaRecoveryHashes: codes.map((code2) => hashHotelRecoveryCode(id, code2)),
        ...action === "disable" ? { mfaEnabled: false, mfaSecret: "", mfaLastCounter: -1 } : {}
      } });
      await mfaAudit(p, id, action === "confirm" ? "enabled" : action);
      return JSON.stringify({ recoveryCodes: codes, signedOut: true, message: "Credential settings changed. Save recovery codes privately, then sign in again. Authenticator codes are single-use; wait for the next code if you just confirmed enrollment." });
    });
  }
  return { Query: { hotelMfaStatus }, Mutation: { verifyHotelMfa, manageHotelMfa } };
}
var hotelMfaResolvers = createHotelMfaResolvers();
var hotelMfaTypeDefs = String.raw`
  extend type Query { hotelMfaStatus: String! }
  extend type Mutation { verifyHotelMfa(code:String!, recovery:Boolean):String!, manageHotelMfa(action:String!, password:String!, code:String, recovery:Boolean):String! }
`;

// features/keystone/mutations/index.ts
init_hotelReceivables();

// features/keystone/lib/hotelDisputes.ts
var import_client7 = require("@prisma/client");
init_access();
init_hotelLifecycle();
init_serializableTransaction();
async function states2(prisma, id) {
  const rows = await prisma.$queryRaw(import_client7.Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent"
    WHERE "propertyKey"=${HOTEL_PROPERTY_KEY} AND "aggregateType"='payment_dispute' ${id ? import_client7.Prisma.sql`AND "aggregateId"=${id}` : import_client7.Prisma.empty}
    ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row) => row.state);
}
async function hotelDisputeOperations(_root, _args, context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Dispute payment permission is required.");
  return { disputes: await states2(context.prisma) };
}
async function annotateHotelDispute(_root, { input }, context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Dispute payment permission is required.");
  const id = String(input?.id || "");
  const note = String(input?.note || "").trim();
  const key4 = String(input?.idempotencyKey || "");
  if (!id || id.length > 300 || !key4 || key4.length > 200 || !note || note.length > 4e3) throw new Error("A bounded dispute ID, evidence note and idempotency key are required.");
  const eventKey = `dispute-note:${key4}`;
  const identity = { request: { id, note, actorId: context.session.itemId }, aggregateType: "payment_dispute", aggregateId: id, action: "evidence_recorded" };
  return runSerializableTransaction(context, async (tx) => {
    await lockHotelLifecycle(tx.prisma, `dispute:${id}`);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    const [prior] = await states2(tx.prisma, id);
    if (!prior) throw new Error("Dispute not found.");
    const next2 = { ...prior, sequence: prior.sequence + 1, evidenceNotes: [...prior.evidenceNotes, { note, actorId: context.session.itemId, recordedAt: (/* @__PURE__ */ new Date()).toISOString() }] };
    await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId: context.session.itemId, eventKey, identity, beforeSnapshot: prior, afterSnapshot: next2 });
    return next2;
  });
}

// features/keystone/mutations/index.ts
init_hotelGroupLifecycle();

// features/keystone/lib/hotelFolioReceipt.ts
init_access();
init_folioLedger();
function buildFolioReceipt(folio, settings) {
  if (folio.entries.some((entry) => entry.currencyCode !== folio.currencyCode)) throw new Error("Receipt contains mixed currencies. Reconcile the folio first.");
  const balance = calculateFolioBalance(folio.entries);
  const directBilled = folio.entries.some((entry) => entry.entryType === "transfer" && entry.direction === "credit");
  return {
    folioId: folio.id,
    folioNumber: folio.folioNumber,
    currencyCode: folio.currencyCode,
    kind: folio.status === "closed" && balance.balanceMinor === 0 ? directBilled ? "Final statement \u2014 direct billed" : "Final receipt" : "Folio statement",
    property: { name: settings.propertyName, address: [settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.postalCode].filter(Boolean).join(", "), contactEmail: settings.contactEmail },
    guestName: folio.booking?.guestName || "",
    confirmationNumber: folio.booking?.confirmationNumber || "",
    closedAt: folio.closedAt || null,
    ...balance,
    entries: folio.entries.map((entry) => ({
      id: entry.id,
      serviceDate: new Date(entry.serviceDate).toISOString().slice(0, 10),
      entryType: entry.entryType,
      direction: entry.direction,
      amountMinor: entry.amountMinor,
      currencyCode: entry.currencyCode,
      description: entry.description,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId
    }))
  };
}
async function hotelFolioReceipt(_root, { folioId }, context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Folio payment permission is required.");
  if (!folioId || folioId.length > 200) throw new Error("A bounded folio ID is required.");
  const [folio, settings] = await Promise.all([
    context.prisma.folio.findUnique({ where: { id: folioId }, include: { booking: { select: { guestName: true, confirmationNumber: true } }, entries: { orderBy: [{ serviceDate: "asc" }, { postedAt: "asc" }, { id: "asc" }] } } }),
    context.prisma.hotelSettings.findUnique({ where: { id: 1 } })
  ]);
  if (!folio || !settings) throw new Error("Folio or property was not found.");
  return buildFolioReceipt(folio, settings);
}

// features/keystone/mutations/index.ts
init_hotelGuestGovernance();

// features/keystone/lib/hotelStayServices.ts
var import_node_crypto18 = require("node:crypto");
init_access();
init_hotelLifecycle();
init_serializableTransaction();
var CATEGORIES = ["guest_request", "incident", "lost_found", "wake_up", "housekeeping_discrepancy"];
var TRANSITIONS = { open: ["assigned", "in_progress", "resolved"], assigned: ["in_progress", "resolved"], in_progress: ["resolved"], resolved: ["in_progress", "closed"], closed: [] };
function mayOperate(context) {
  return permissions.canManageBookings({ session: context.session }) || permissions.canManageHousekeeping({ session: context.session });
}
async function loadStayServices(prisma) {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: "stay_service" }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  const state = /* @__PURE__ */ new Map();
  for (const event of events) {
    const service = event.afterSnapshot?.service;
    if (service && Number(service.revision || 0) > Number(state.get(event.aggregateId)?.revision || 0)) state.set(event.aggregateId, service);
  }
  return [...state.values()];
}
function transitionStayService(service, input, now = /* @__PURE__ */ new Date()) {
  if (input.expectedStatus && service.status !== input.expectedStatus) throw new Error("Service case changed; refresh before updating.");
  if (input.status !== service.status && !TRANSITIONS[service.status]?.includes(input.status)) throw new Error("Unsupported service case transition.");
  if (service.status === "closed") throw new Error("Closed service history is immutable; create a follow-up case.");
  const assignedToId = input.assignedToId === void 0 ? service.assignedToId : input.assignedToId;
  if (input.status === "assigned" && !assignedToId) throw new Error("Assigned service cases require an active staff member.");
  if (String(input.resolution || "").length > 4e3) throw new Error("Resolution evidence is limited to 4000 characters.");
  const resolution = String(input.resolution || service.resolution || "").trim() || null;
  if (["resolved", "closed"].includes(input.status) && (!resolution || resolution.length < 3)) throw new Error("Record how the request was fulfilled, incident resolved or item handed over before resolution.");
  return { ...service, revision: service.revision + 1, status: input.status, assignedToId, resolution, updatedAt: now.toISOString(), closedAt: input.status === "closed" ? now.toISOString() : null };
}
async function getHotelStayServices(_root, { bookingId, roomId }, context) {
  if (!mayOperate(context)) throw new Error("Not authorized to read hotel service cases.");
  return JSON.stringify((await loadStayServices(context.prisma)).filter((item) => (!bookingId || item.bookingId === bookingId) && (!roomId || item.roomId === roomId)));
}
async function updateHotelStayService(_root, input, context) {
  if (!mayOperate(context)) throw new Error("Not authorized to operate hotel service cases.");
  const eventKey = String(input.idempotencyKey || "").trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotency key is required.");
  const serviceId = input.serviceId || `service_${(0, import_node_crypto18.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24)}`;
  const identity = { request: input, aggregateType: "stay_service", aggregateId: serviceId, action: input.serviceId ? "updated" : "opened" };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-service:${serviceId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot.service);
    if (input.assignedToId) {
      const staff = await p.user.findUnique({ where: { id: input.assignedToId }, include: { role: true } });
      if (!staff?.isActive || !staff.role?.canManageBookings && !staff.role?.canManageHousekeeping) throw new Error("Service assignee must be active hotel operations staff.");
    }
    const existing = (await loadStayServices(p)).find((item) => item.id === serviceId);
    let service;
    const now = /* @__PURE__ */ new Date();
    if (input.serviceId) {
      if (!existing || input.bookingId && input.bookingId !== existing.bookingId || input.roomId && input.roomId !== existing.roomId) throw new Error("Service case does not belong to the selected reservation or room.");
      service = transitionStayService(existing, input, now);
    } else {
      if (input.status !== "open") throw new Error("New service cases must start open.");
      if (!CATEGORIES.includes(String(input.category))) throw new Error("Unsupported service category.");
      const title = String(input.title || "").trim(), description = String(input.description || "").trim(), priority = String(input.priority || "normal");
      if (!title || title.length > 200 || description.length > 4e3 || !["low", "normal", "urgent"].includes(priority)) throw new Error("Provide a short service title, bounded description and valid priority.");
      if (!input.bookingId && !input.roomId) throw new Error("A reservation or physical room is required.");
      let booking = null;
      if (input.bookingId) {
        await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${input.bookingId}`);
        booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { roomAssignments: true } });
        if (!booking) throw new Error("Reservation not found.");
        if (input.roomId && !booking.roomAssignments.some((assignment) => assignment.roomId === input.roomId)) throw new Error("Room does not belong to this reservation.");
      }
      const roomId = input.roomId || booking?.roomAssignments[0]?.roomId || null;
      if (roomId) {
        await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${roomId}`);
        const room = await p.room.findUnique({ where: { id: roomId } });
        if (!room) throw new Error("Room not found.");
        if (input.category === "housekeeping_discrepancy" && room.status === "vacant") {
          await p.room.update({ where: { id: roomId }, data: { status: "out_of_order", notes: `${room.notes || ""}
[${now.toISOString()}] Availability withheld pending discrepancy case ${serviceId}: ${title}`.trim() } });
        }
      }
      const due = input.dueAt ? new Date(input.dueAt) : null;
      if (due && !Number.isFinite(due.getTime())) throw new Error("Service due time is invalid.");
      if (input.category === "wake_up" && (!due || due <= now || booking?.status !== "checked_in")) throw new Error("Wake-up requests require an in-house guest and a future due time.");
      service = { revision: 1, id: serviceId, bookingId: booking?.id || null, roomId, category: input.category, title, description, priority, dueAt: due?.toISOString() || null, assignedToId: input.assignedToId || null, status: "open", resolution: null, openedAt: now.toISOString(), updatedAt: now.toISOString(), closedAt: null };
    }
    if (service.category === "incident" && ["resolved", "closed"].includes(service.status) && !permissions.canManageBookings({ session: context.session })) throw new Error("Front-desk management must resolve incident cases.");
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: existing ? { service: existing } : null, afterSnapshot: { service }, metadata: { fulfillmentMode: "staff_recorded", discrepancyRequiresExplicitRoomReturn: service.category === "housekeeping_discrepancy" } });
    return JSON.stringify(service);
  });
}
async function assertNoOpenRoomDiscrepancy(prisma, roomId) {
  if ((await loadStayServices(prisma)).some((item) => item.roomId === roomId && item.category === "housekeeping_discrepancy" && !["resolved", "closed"].includes(item.status))) throw new Error("Resolve the housekeeping discrepancy before returning room availability.");
}

// features/keystone/mutations/index.ts
init_hotelCashier();
init_roomOutages();
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

// features/keystone/utils/ensureDefaultPaymentProviders.ts
init_paymentSecurity();
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

// features/keystone/mutations/cancelBooking.ts
init_guestBookingAccess();
init_bookingCancellation();
init_access();
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

// features/keystone/mutations/pushInventoryToChannel.ts
init_access();

// features/keystone/lib/channelSync.ts
init_channelCredentials();
var import_crypto = __toESM(require("crypto"));
init_guestProfiles();
init_guestBookingAccess();
init_reservationSnapshots();
init_bookingFolio();
init_bookingCancellation();
init_bookingAmendment();
init_hotelLifecycle();
init_inventoryLock();
init_hotelAvailability();
init_hotelBusinessTime();
init_integrationConfig();
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
function toCents(amount3) {
  if (typeof amount3 !== "number" || Number.isNaN(amount3)) {
    return 0;
  }
  return Math.round(amount3 * 100);
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
  const record2 = await context.sudo().query.RoomInventory.createOne({
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
  return { record: record2, wasCreated: true };
}
async function adjustBookedRooms(context, roomTypeId, checkInDate, checkOutDate, delta) {
  if (!checkInDate || !checkOutDate) return;
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return;
  }
  const days = getDateRangeDays(start, end);
  for (const day2 of days) {
    const { record: record2, wasCreated } = await getOrCreateRoomInventory(context, roomTypeId, day2, delta);
    if (!wasCreated) {
      const nextBookedRooms = Math.max(0, (record2.bookedRooms || 0) + delta);
      if (nextBookedRooms + (record2.blockedRooms || 0) > (record2.totalRooms || 0)) {
        throw new Error("Channel reservation exceeds available room inventory");
      }
      await context.sudo().query.RoomInventory.updateOne({
        where: { id: record2.id },
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
  await lockHotelBusinessDate(context.prisma);
  const { checkIn: boundedCheckIn, checkOut: boundedCheckOut } = hotelStayDates(payload.checkInDate, payload.checkOutDate);
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
    await lockRoomInventory(context.prisma, roomTypeId, boundedCheckIn, boundedCheckOut);
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
    inventory: inventoryRecords.map((record2) => ({
      date: record2.date,
      roomTypeId: record2.roomType?.id,
      roomTypeName: record2.roomType?.name,
      totalRooms: record2.totalRooms,
      bookedRooms: record2.bookedRooms,
      blockedRooms: record2.blockedRooms
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
init_access();
async function pullReservationsFromChannelMutation(root, { channelId }, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to sync channel reservations");
  }
  return pullReservationsFromChannel(context, channelId);
}

// features/keystone/mutations/initiateBookingPaymentSession.ts
init_paymentProviderAdapter();
init_bookingFolio();
init_serializableTransaction();
init_guestBookingAccess();
init_paymentSecurity();
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
      pricingRevision
      pricingSnapshot
      billingFolio { id }
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
  if (booking.billingFolio?.id && !canManageBookingRecords(context)) throw new Error("The group payer manages this master folio. Contact the property for your individual balance.");
  if (!PAYABLE_BOOKING_STATUSES.has(booking.status)) {
    throw new Error(`Payments cannot be started for a ${booking.status} booking.`);
  }
  if (booking.status === "pending" && booking.holdExpiresAt && new Date(booking.holdExpiresAt) <= /* @__PURE__ */ new Date()) {
    throw new Error("This reservation hold has expired.");
  }
  const collectibleMinor = (await runSerializableTransaction(context, (tx) => getBookingCollectibleBalance(tx, bookingId))).balanceDueMinor;
  const amountInCents = bookingPaymentDueNow(booking, collectibleMinor);
  if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
    throw new Error("This booking has no outstanding balance.");
  }
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: paymentProviderCode } });
  if (!provider || !isPaymentProviderConfigured(provider)) {
    throw new Error("Payment provider is disabled or not completely configured.");
  }
  const currencyCode = String(booking.currencyCode || "USD").toUpperCase();
  const obligationKey = `${booking.id}:${provider.code}:v${booking.pricingRevision || 1}:${amountInCents}:${currencyCode}`;
  const retiredAttempts = (booking.paymentSessions || []).filter((session) => session.idempotencyKey?.startsWith(`${obligationKey}:attempt:`) && session.data?.retiredAt).length;
  const idempotencyKey = `${obligationKey}:attempt:${retiredAttempts}`;
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
        await retireBookingPaymentSession(context, session.id, booking.id);
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
      await retireBookingPaymentSession(context, session.id, booking.id);
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
        data: { ...sessionData, obligation: { depositPercent: booking.pricingSnapshot?.depositPercent ?? 100, pricingRevision: booking.pricingRevision || 1, amountMinor: amountInCents, currencyCode } },
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

// features/keystone/mutations/completeBookingPayment.ts
init_bookingFolio();
init_serializableTransaction();
init_paymentProviderAdapter();
init_guestBookingAccess();
init_paymentSecurity();
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
      booking { id status paymentStatus balanceDue balanceDueMinor totalAmountMinor pricingSnapshot pricingRevision holdExpiresAt billingFolio { id } }
      paymentProvider { id code name metadata }
    `
  });
  if (!session || session.booking?.id !== bookingId) {
    throw new Error("Payment session not found for booking.");
  }
  if (session.booking.billingFolio?.id && !canManageBookingRecords(context)) throw new Error("Only the group payer or property staff may settle a master folio.");
  if (session.payment) return session.payment;
  if (!session.paymentProvider) throw new Error("Payment provider missing from session.");
  const provider = await context.prisma.paymentProvider.findUnique({ where: { id: session.paymentProvider.id } });
  if (!provider) throw new Error("Payment provider missing from session.");
  assertCustomerPaymentProvider(provider.code);
  const storedPaymentId = session.data?.paymentIntentId || session.data?.orderId || session.data?.id || null;
  if (providerPaymentId && storedPaymentId && providerPaymentId !== storedPaymentId) {
    throw new Error("Provider payment identifier does not match this payment session.");
  }
  const paymentIdentifier = providerPaymentId || storedPaymentId;
  if (!paymentIdentifier) {
    throw new Error("Provider payment identifier is required to complete payment.");
  }
  const collectible = await runSerializableTransaction(context, (tx) => getBookingCollectibleBalance(tx, bookingId));
  const stale = Boolean(session.data?.retiredAt) || !["pending", "confirmed"].includes(session.booking.status) || bookingPaymentDueNow(session.booking, collectible.balanceDueMinor) !== session.amount || session.data?.obligation && session.data.obligation.pricingRevision !== (session.booking.pricingRevision || 1) || session.booking.status === "pending" && session.booking.holdExpiresAt && new Date(session.booking.holdExpiresAt) <= /* @__PURE__ */ new Date();
  const result = await (stale ? getPaymentStatus : completePayment)({
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
    providerCaptureId: String(settlement.providerCaptureId || settlement.providerPaymentId || paymentIdentifier),
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

// features/keystone/lib/stayRegister.ts
var import_node_crypto19 = require("node:crypto");
init_hotelLifecycle();
init_serializableTransaction();
init_access();
function applyStayRegisterCommand(state, input, booking, eventKey, now = /* @__PURE__ */ new Date()) {
  const next2 = JSON.parse(JSON.stringify(state));
  next2.revision = Number(state.revision || 0) + 1;
  const at = now.toISOString();
  if (input.action === "add_occupant") {
    const name = String(input.name || "").trim();
    if (!name || name.length > 200) throw new Error("Occupant name must contain 1\u2013200 characters.");
    if (next2.occupants.filter((item) => !item.departedAt).length >= booking.numberOfGuests) throw new Error("Registered occupants cannot exceed the booked guest count.");
    next2.occupants.push({ id: (0, import_node_crypto19.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24), name, registeredAt: at });
  } else if (input.action === "remove_occupant") {
    const occupant = next2.occupants.find((item) => item.id === input.occupantId && !item.departedAt);
    if (!occupant) throw new Error("Active occupant does not belong to this stay.");
    if (next2.keys.some((key4) => key4.occupantId === occupant.id && !key4.returnedAt && !key4.retiredAt)) throw new Error("Return the occupant\u2019s keys before recording departure.");
    occupant.departedAt = at;
  } else if (input.action === "issue_key") {
    if (booking.status !== "checked_in" || !booking.roomAssignments[0]?.roomId) throw new Error("Keys can be issued only for an assigned in-house stay.");
    if (!next2.occupants.some((item) => item.id === input.occupantId && !item.departedAt)) throw new Error("Key holder must be an active registered occupant of this stay.");
    const reference = String(input.keyReference || "").trim();
    if (!reference || reference.length > 80) throw new Error("Manual key reference must contain 1\u201380 characters; never store door codes.");
    if (next2.keys.some((key4) => key4.reference === reference && !key4.returnedAt && !key4.retiredAt)) throw new Error("That key is already issued.");
    next2.keys.push({ reference, occupantId: input.occupantId, roomId: booking.roomAssignments[0].roomId, issuedAt: at });
  } else if (input.action === "retire_key") {
    const key4 = next2.keys.find((item) => item.reference === input.keyReference && !item.returnedAt && !item.retiredAt);
    if (!key4) throw new Error("Outstanding key does not belong to this stay.");
    const reason = String(input.name || "").trim();
    if (!reason || reason.length > 200) throw new Error("Record a 1\u2013200 character reason for the lost or retired key.");
    key4.retiredAt = at;
    key4.retirementReason = reason;
  } else if (input.action === "return_key") {
    const key4 = next2.keys.find((item) => item.reference === input.keyReference && !item.returnedAt && !item.retiredAt);
    if (!key4) throw new Error("Outstanding key does not belong to this stay.");
    key4.returnedAt = at;
  } else throw new Error("Unsupported stay-register command.");
  return next2;
}
async function loadStayRegister(prisma, bookingId) {
  const events = await prisma.hotelAuditEvent.findMany({ where: { aggregateType: "stay_register", aggregateId: bookingId } });
  const registers = events.map((event) => event.afterSnapshot?.register).filter(Boolean).sort((a, b) => Number(b.revision || 0) - Number(a.revision || 0));
  return registers[0] || { revision: 0, occupants: [], keys: [] };
}
async function assertNoOutstandingStayKeys(prisma, bookingId) {
  const register = await loadStayRegister(prisma, bookingId);
  if (register.keys.some((key4) => !key4.returnedAt && !key4.retiredAt)) throw new Error("Record return of all issued manual keys before room move or checkout.");
}
async function getHotelStayRegister(_root, { bookingId }, context) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error("Not authorized to read stay registration.");
  const booking = await context.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
  if (!booking) throw new Error("Booking not found.");
  const events = await context.prisma.hotelAuditEvent.findMany({ where: { aggregateType: "booking", aggregateId: bookingId, action: "room_assigned" }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  return JSON.stringify({ ...await loadStayRegister(context.prisma, bookingId), roomMoves: events.map((event) => ({ fromRoomId: event.beforeSnapshot?.roomId || null, toRoomId: event.afterSnapshot?.roomId, effectiveAt: event.afterSnapshot?.effectiveAt || event.occurredAt })) });
}
async function updateHotelStayRegister(_root, input, context) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error("Not authorized to update stay registration.");
  const eventKey = String(input.idempotencyKey || "").trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotency key is required.");
  const identity = { request: input, aggregateType: "stay_register", aggregateId: input.bookingId, action: input.action };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${input.bookingId}`);
    const replay = await findHotelLifecycleReplay(p, eventKey, identity);
    if (replay) return JSON.stringify(replay.afterSnapshot.register);
    const booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { roomAssignments: true } });
    if (!booking || !["confirmed", "checked_in"].includes(booking.status)) throw new Error("Registration requires a confirmed or in-house reservation.");
    const before = await loadStayRegister(p, booking.id);
    const register = applyStayRegisterCommand(before, input, booking, eventKey);
    if (input.action === "retire_key") {
      const key4 = register.keys.find((item, index) => item.reference === input.keyReference && item.retiredAt && !before.keys[index]?.retiredAt);
      if (!key4) throw new Error("Retired key evidence is missing.");
      await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${key4.roomId}`);
      await p.maintenanceRequest.create({ data: { roomId: key4.roomId, title: `Replace or rekey lock after lost key ${key4.reference}`, description: key4.retirementReason, category: "other", priority: "high", status: "reported", reportedById: context.session.itemId, notes: `Manual key retirement ${eventKey}; physical access must be secured and inspected.` } });
      const room = await p.room.findUnique({ where: { id: key4.roomId } });
      if (room && room.status !== "occupied") await p.room.update({ where: { id: key4.roomId }, data: { status: "out_of_order" } });
    }
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { register: before }, afterSnapshot: { register }, metadata: { manualAccountabilityOnly: true } });
    return JSON.stringify(register);
  });
}

// features/keystone/mutations/createStorefrontBooking.ts
var import_node_crypto20 = require("node:crypto");
init_hotelLifecycle();
init_serializableTransaction();
init_guestBookingAccess();
init_reservationSnapshots();
init_inventoryLock();
init_bookingFolio();
init_guestProfiles();
init_hotelAvailability();
init_hotelPricing();
init_hotelBusinessTime();
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
  const { checkIn, checkOut } = hotelStayDates(data.checkInDate, data.checkOutDate);
  const guestAccessToken = createGuestAccessToken();
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(String(data.idempotencyKey || ""))) throw new Error("A random stable booking attempt key is required.");
  const attemptId = (0, import_node_crypto20.createHash)("sha256").update(data.idempotencyKey).digest("hex");
  const eventKey = `guest-booking:${attemptId}`;
  const { quoteToken: _quote, idempotencyKey: _key, ...request } = data;
  const identity = { request: { ...request, guestName, guestEmail }, aggregateType: "booking_attempt", aggregateId: attemptId, action: "created" };
  const booking = await runSerializableTransaction(context, async (tx) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await lockHotelBusinessDate(tx.prisma);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) {
      const id = replay.afterSnapshot?.bookingId;
      if (!id) throw new Error("Booking attempt recovery evidence is missing.");
      await tx.prisma.booking.update({ where: { id }, data: { guestAccessTokenHash: hashGuestAccessToken(guestAccessToken), guestAccessTokenIssuedAt: /* @__PURE__ */ new Date() } });
      return tx.sudo().query.Booking.findOne({ where: { id }, query: "id confirmationNumber status paymentStatus guestName guestEmail checkInDate checkOutDate roomAssignments { id roomType { id name } }" });
    }
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    const quote = await calculateHotelPrice(tx, data);
    await assertHotelAvailability(tx, data);
    verifyHotelQuoteToken(String(data.quoteToken || ""), quote);
    const guest = await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: data.guestPhone });
    const created = await tx.prisma.booking.create({
      data: {
        confirmationNumber: `BK-${(0, import_node_crypto20.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
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
          securityDepositMinor: quote.securityDepositMinor,
          depositPercent: quote.depositPercent,
          arrivalInstant: quote.arrivalInstant,
          propertyTimeZone: quote.propertyTimeZone,
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
    await recordHotelLifecycleEvent({ prisma: tx.prisma, eventKey, identity, afterSnapshot: { bookingId: created.id }, metadata: { source: "website" } });
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
  });
  setGuestBookingAccess(context, booking.id, guestAccessToken);
  return booking;
}
var createStorefrontBooking_default = createStorefrontBooking;

// features/keystone/mutations/createStaffBooking.ts
var import_node_crypto21 = require("node:crypto");
init_access();
init_bookingFolio();
init_guestBookingAccess();
init_guestProfiles();
init_hotelAvailability();
init_hotelCommunications();
init_hotelPricing();
init_hotelLifecycle();
init_inventoryLock();
init_hotelBusinessTime();
init_reservationSnapshots();
init_serializableTransaction();
var STAFF_SOURCES = /* @__PURE__ */ new Set(["direct", "phone", "walk_in"]);
var STAFF_CREATE_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed"]);
function requirePrismaResult4(value) {
  if (value instanceof Error || value?.extensions?.code === "KS_PRISMA_ERROR") throw value;
  return value;
}
function isPrismaFailure(error) {
  return error?.extensions?.code === "KS_PRISMA_ERROR" || /^P\d{4}$/.test(String(error?.code || ""));
}
async function runStaffBookingTransaction(context, operation) {
  try {
    return await runSerializableTransaction(context, operation, { maxWait: 5e3, timeout: 3e4 });
  } catch (error) {
    if (isRetryableTransactionError(error)) {
      throw new Error("Room inventory changed while creating this reservation. Refresh availability and retry.");
    }
    throw error;
  }
}
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
  const { checkIn, checkOut } = hotelStayDates(data.checkInDate, data.checkOutDate);
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
  let pinnedQuote = null;
  let pinnedQuoteHash = null;
  const bookingId = await runStaffBookingTransaction(context, async (tx) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await lockHotelBusinessDate(tx.prisma);
    const replay = requirePrismaResult4(await findHotelLifecycleReplay(tx.prisma, eventKey, identity));
    if (replay) {
      const replayId = String(replay.afterSnapshot?.bookingId || "");
      if (!replayId) throw new Error("Staff reservation replay evidence is incomplete.");
      return replayId;
    }
    await lockRoomInventory(tx.prisma, data.roomTypeId, checkIn, checkOut);
    let currentQuote;
    try {
      currentQuote = await calculateHotelPrice(tx, data);
    } catch (error) {
      if (pinnedQuote && !isPrismaFailure(error) && !isRetryableTransactionError(error)) {
        throw new Error("Rate changed while creating this reservation. Request a fresh rate and retry.");
      }
      throw error;
    }
    const currentQuoteHash = hotelQuoteCommercialTermsHash(currentQuote);
    if (pinnedQuote) {
      if (!pinnedQuoteHash || currentQuoteHash !== pinnedQuoteHash) {
        throw new Error("Rate changed while creating this reservation. Request a fresh rate and retry.");
      }
    } else {
      pinnedQuote = currentQuote;
      pinnedQuoteHash = currentQuoteHash;
    }
    const quote = pinnedQuote;
    await assertHotelAvailability(tx, data);
    const guest = requirePrismaResult4(await ensureGuestProfile(tx, { name: guestName, email: guestEmail, phone: guestPhone }));
    const now = /* @__PURE__ */ new Date();
    const created = requirePrismaResult4(await tx.prisma.booking.create({
      data: {
        confirmationNumber: `BK-${(0, import_node_crypto21.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
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
          securityDepositMinor: Number(quote.settings.securityDepositMinor || 0),
          depositPercent: Number(quote.settings.depositPercent ?? 100),
          arrivalInstant: quote.arrivalInstant,
          propertyTimeZone: quote.propertyTimeZone,
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
    }));
    const averageNightMinor = Math.round(quote.roomSubtotalMinor / quote.nightlyRates.length);
    requirePrismaResult4(await tx.prisma.roomAssignment.create({
      data: {
        bookingId: created.id,
        roomTypeId: quote.roomType.id,
        guestName,
        ratePerNightMinor: averageNightMinor,
        ratePerNight: averageNightMinor / 100,
        specialRequests
      }
    }));
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
  });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/lib/inHouseStayAmendment.ts
init_hotelGuestGovernance();
init_roomOutages();
init_hotelPricing();
init_reservationSnapshots();
init_folioLedger();
init_bookingFolio();
init_inventoryLock();
init_hotelAvailability();
init_hotelLifecycle();
init_hotelBusinessTime();
init_serializableTransaction();
init_hotelCommunications();
function assertInHouseDateChange(booking, checkIn, checkOut, businessDate, roomTypeId, ratePlanId, allowCommercialMove = false) {
  if (booking.status !== "checked_in") throw new Error("Only an in-house stay can use this amendment.");
  if (checkIn.getTime() !== new Date(booking.checkInDate).getTime()) throw new Error("An in-house arrival date is immutable.");
  if (checkOut < businessDate || checkOut <= checkIn) throw new Error("Departure cannot precede the open business date or arrival.");
  if (!allowCommercialMove && (roomTypeId !== booking.roomAssignments[0]?.roomTypeId || ratePlanId !== booking.ratePlanId)) throw new Error("In-house amendments preserve the booked room type and rate plan; use a room move for physical-room changes.");
}
function planInHouseSnapshotAmendment(booking, quote, openDay, revision) {
  const proposed = buildReservationSnapshotLines({ bookingId: booking.id, checkInDate: quote.commercialMove ? quote.checkIn : booking.checkInDate, checkOutDate: quote.checkOut, roomTotalCents: quote.roomSubtotalMinor, taxTotalCents: quote.taxMinor, feesTotalCents: quote.commercialMove ? 0 : quote.feesMinor, currencyCode: quote.currencyCode, roomType: quote.roomType || booking.roomAssignments[0].roomType, ratePlan: { ...quote.ratePlan || booking.ratePlan, cancellationPolicy: booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy }, taxRateBasisPoints: quote.taxRateBasisPoints, nightlyRoomAmounts: quote.nightlyRates.map((n) => n.amountMinor), snapshotKeyPrefix: `v${revision}`, pricingSource: "in-house-amendment" }).filter((line) => new Date(line.date) >= openDay && (!quote.commercialMove || line.type !== "service_fee"));
  const historical = booking.lineItems.filter((line) => new Date(line.date) < openDay || quote.commercialMove && line.type === "service_fee");
  const replaced = booking.lineItems.filter((line) => new Date(line.date) >= openDay && (!quote.commercialMove || line.type !== "service_fee"));
  return { proposed, historical, replaced };
}
async function amendInHouseStay(context, input) {
  const eventKey = input.idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable amendment idempotency key is required.");
  const identity = { request: input, aggregateType: "booking", aggregateId: input.bookingId, action: "in_house_dates_amended" };
  return runSerializableTransaction(context, async (tx) => {
    const p = tx.prisma;
    await lockHotelLifecycle(p, eventKey);
    await lockHotelBusinessDate(p);
    await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${input.bookingId}`);
    if (await findHotelLifecycleReplay(p, eventKey, identity)) return p.booking.findUnique({ where: { id: input.bookingId } });
    const booking = await p.booking.findUnique({ where: { id: input.bookingId }, include: { roomAssignments: { include: { roomType: true } }, lineItems: { where: { snapshotStatus: "active" } }, payments: true, ratePlan: true } });
    if (!booking) throw new Error("Booking not found.");
    if (booking.groupBlockId || booking.billingFolioId) throw new Error("In-house group commercial changes require a revised group contract; group master and allocation evidence cannot be bypassed.");
    const clock = await p.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock) throw new Error("Property business date is not configured.");
    const start = new Date(input.checkInDate);
    const end = new Date(input.checkOutDate);
    const openDay = new Date(clock.currentBusinessDate);
    const assignment = booking.roomAssignments[0];
    if (booking.roomAssignments.length !== 1 || !assignment?.roomId) throw new Error("In-house amendment requires one assigned physical room.");
    const commercialMove = input.roomTypeId !== assignment.roomTypeId || input.ratePlanId !== booking.ratePlanId;
    if (commercialMove && (!input.targetRoomId || end.getTime() !== new Date(booking.checkOutDate).getTime() || end <= openDay)) throw new Error("Choose a target physical room for a same-date in-house commercial upgrade.");
    assertInHouseDateChange(booking, start, end, openDay, input.roomTypeId, input.ratePlanId, commercialMove && !!input.targetRoomId);
    for (const typeId of [.../* @__PURE__ */ new Set([assignment.roomTypeId, input.roomTypeId])].sort()) await lockRoomInventory(p, typeId, start, new Date(Math.max(end.getTime(), new Date(booking.checkOutDate).getTime())));
    const remainingStart = new Date(Math.max(start.getTime(), openDay.getTime()));
    if (end > remainingStart) await assertHotelAvailability(tx, { roomTypeId: input.roomTypeId, checkInDate: remainingStart, checkOutDate: end, excludeBookingId: booking.id });
    if (booking.source === "ota") throw new Error("Channel-origin in-house amendments require a channel acknowledgment; reconcile the channel stay before amendment.");
    const targetRoomId = input.targetRoomId || assignment.roomId, moving = targetRoomId !== assignment.roomId;
    for (const roomId of [.../* @__PURE__ */ new Set([assignment.roomId, targetRoomId])].sort()) await p.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${roomId}`);
    if (moving || commercialMove) {
      const target = await p.room.findUnique({ where: { id: targetRoomId } });
      if (!target || target.roomTypeId !== input.roomTypeId || moving && !["vacant", "inspected"].includes(target.status)) throw new Error("Target room must match the newly quoted type and be ready for occupancy.");
      const [repairs, tasks] = await Promise.all([p.maintenanceRequest.count({ where: { roomId: targetRoomId, status: { notIn: ["verified", "cancelled"] } } }), p.housekeepingTask.count({ where: { roomId: targetRoomId, status: { not: "completed" } } })]);
      if (repairs || tasks) throw new Error("Resolve target room maintenance and housekeeping before upgrade.");
      if (moving) await assertNoOutstandingStayKeys(p, booking.id);
    }
    if (end > remainingStart) await assertRoomNotOutOfOrder(p, targetRoomId, remainingStart, end);
    const conflict = await p.roomAssignment.findFirst({ where: { roomId: targetRoomId, bookingId: { not: booking.id }, booking: { OR: [{ status: { in: ["confirmed", "checked_in", "cancellation_pending"] } }, { status: "pending", holdExpiresAt: { gt: /* @__PURE__ */ new Date() } }], checkInDate: { lt: end }, checkOutDate: { gt: remainingStart } } } });
    if (conflict) throw new Error("The selected physical room conflicts with another reservation on the remaining dates.");
    const quote = { ...await calculateHotelPrice(tx, { roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId, checkInDate: commercialMove ? remainingStart.toISOString() : input.checkInDate, checkOutDate: input.checkOutDate, numberOfAdults: booking.numberOfAdults || booking.numberOfGuests || 1, numberOfChildren: booking.numberOfChildren || 0, promoCode: input.promoCode }, { existingStay: true }), commercialMove };
    const revision = Number(booking.pricingRevision || 1) + 1;
    const { proposed, historical, replaced } = planInHouseSnapshotAmendment(booking, quote, openDay, revision);
    const repricedTotal = [...historical, ...proposed].reduce((sum2, line) => sum2 + Number(line.totalPrice), 0);
    const waivedMinor = Math.max(0, Number(booking.totalAmountMinor || 0) - repricedTotal);
    if (waivedMinor > 0 && (!input.earlyDepartureReason?.trim() || input.earlyDepartureReason.trim().length > 1e3)) throw new Error("An explicit reason of 1\u20131000 characters is required for the operator waiver of booked charges.");
    if (waivedMinor > 0 && waivedMinor >= Number(quote.settings?.writeOffApprovalThresholdMinor ?? 0)) {
      if (!input.earlyDepartureApprovalId) throw new Error(`An independent write-off approval for booking ${booking.id}, ${waivedMinor} minor units, is required to waive booked charges on early departure or a lower-priced amendment.`);
      await requireHotelApproval(p, { approvalId: input.earlyDepartureApprovalId, action: "write_off", aggregateId: booking.id, amountMinor: waivedMinor, actorId: context.session.itemId, operationKey: eventKey });
    }
    const ensured = await ensureBookingFolio(tx, booking.id);
    const entries = await p.folioEntry.findMany({ where: { folioId: ensured.folioId, sourceType: "reservation_snapshot", sourceId: { in: replaced.map((line) => line.id) } }, include: { reversedBy: true } });
    const now = /* @__PURE__ */ new Date();
    for (const entry of entries.filter((item) => !item.reversedBy)) {
      await p.folioEntry.create({ data: { folioId: ensured.folioId, ...buildFolioReversalPosting(entry, { postingKey: `${eventKey}:reverse:${entry.id}`, reason: "In-house departure amendment" }), serviceDate: openDay, postedAt: now } });
    }
    await p.reservationLineItem.updateMany({ where: { id: { in: replaced.map((line) => line.id) } }, data: { snapshotStatus: "superseded", supersededAt: now } });
    for (const { reservation: _, ...line } of proposed) await p.reservationLineItem.create({ data: { ...line, reservationId: booking.id, date: new Date(line.date), snapshotStatus: "active" } });
    const allLines = [...historical, ...proposed];
    const sum = (type) => allLines.filter((line) => line.type === type).reduce((total2, line) => total2 + Number(line.totalPrice), 0);
    const room = sum("room"), tax = sum("tax"), fees = sum("service_fee"), total = room + tax + fees;
    const netPaid = booking.payments.filter((payment) => ["completed", "refunded"].includes(payment.status)).reduce((amount3, payment) => amount3 + (payment.paymentType === "refund" ? -Math.abs(payment.amountMinor) : payment.amountMinor), 0);
    const balance = Math.max(0, total - netPaid);
    const updated = await p.booking.update({ where: { id: booking.id }, data: { checkOutDate: end, ratePlanId: input.ratePlanId, roomRateMinor: room, roomRate: room / 100, taxAmountMinor: tax, taxAmount: tax / 100, feesAmountMinor: fees, feesAmount: fees / 100, totalAmountMinor: total, totalAmount: total / 100, balanceDueMinor: balance, balanceDue: balance / 100, paymentStatus: netPaid <= 0 ? "unpaid" : balance ? "partial" : "paid", pricingRevision: revision, pricingVersion: "in-house-amendment-v1", pricingSnapshot: { depositPercent: booking.pricingSnapshot?.depositPercent, securityDepositMinor: booking.pricingSnapshot?.securityDepositMinor, snapshotKeyPrefix: `v${revision}`, source: "in-house-amendment", arrivalInstant: booking.pricingSnapshot?.arrivalInstant || quote.arrivalInstant, cancellationPolicy: booking.pricingSnapshot?.cancellationPolicy || booking.lineItems.find((line) => line.cancellationPolicySnapshot)?.cancellationPolicySnapshot || booking.ratePlan?.cancellationPolicy, propertyTimeZone: quote.propertyTimeZone, preservesBefore: openDay.toISOString(), historicalSnapshotIds: historical.map((line) => line.id), roomSubtotalMinor: room, taxMinor: tax, feesMinor: fees, totalMinor: total, currencyCode: quote.currencyCode, nightlyRates: allLines.filter((line) => line.type === "room").map((line) => ({ date: new Date(line.date).toISOString().slice(0, 10), amountMinor: line.totalPrice })) } } });
    if (moving || commercialMove) {
      await p.roomAssignment.update({ where: { id: assignment.id }, data: { roomTypeId: input.roomTypeId, roomId: targetRoomId, ratePerNightMinor: quote.nightlyRates.find((night) => night.date === openDay.toISOString().slice(0, 10))?.amountMinor || 0, ratePerNight: (quote.nightlyRates.find((night) => night.date === openDay.toISOString().slice(0, 10))?.amountMinor || 0) / 100 } });
      if (moving) {
        await p.room.update({ where: { id: targetRoomId }, data: { status: "occupied" } });
        const oldRoom = await p.room.findUnique({ where: { id: assignment.roomId } });
        const oldRepairs = await p.maintenanceRequest.count({ where: { roomId: assignment.roomId, status: { notIn: ["verified", "cancelled"] } } });
        if (oldRoom && !["maintenance", "out_of_order"].includes(oldRoom.status)) await p.room.update({ where: { id: assignment.roomId }, data: { status: oldRepairs ? "maintenance" : "cleaning" } });
        await p.housekeepingTask.create({ data: { roomId: assignment.roomId, taskType: "checkout_clean", status: "pending", priority: 1, notes: `Commercial room move ${booking.confirmationNumber}; ${eventKey}; vacated ${now.toISOString()}` } });
      }
      await recordHotelLifecycleEvent({ prisma: p, eventKey: `${eventKey}:room-move`, actorId: context.session.itemId, identity: { request: { bookingId: booking.id, targetRoomId, roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId }, aggregateType: "booking", aggregateId: booking.id, action: "room_assigned" }, beforeSnapshot: { assignmentId: assignment.id, roomId: assignment.roomId, roomTypeId: assignment.roomTypeId }, afterSnapshot: { assignmentId: assignment.id, roomId: targetRoomId, roomTypeId: input.roomTypeId, effectiveAt: now }, metadata: { inHouseMove: moving, commercialAmendmentKey: eventKey } });
    }
    await ensureBookingFolio(tx, booking.id, { postSnapshotEntries: true, serviceDate: openDay });
    const collectible = await getBookingCollectibleBalance(tx, booking.id);
    Object.assign(updated, await p.booking.update({ where: { id: booking.id }, data: { balanceDueMinor: collectible.balanceDueMinor, balanceDue: collectible.balanceDueMinor / 100, paymentStatus: collectible.balanceDueMinor <= 0 ? "paid" : netPaid > 0 ? "partial" : "unpaid" } }));
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { checkOutDate: booking.checkOutDate, totalAmountMinor: booking.totalAmountMinor }, afterSnapshot: { checkOutDate: end, totalAmountMinor: total, pricingRevision: revision, preservedHistoricalLines: historical.length, guestCreditMinor: collectible.creditMinor, waivedMinor, waiverReason: waivedMinor ? input.earlyDepartureReason?.trim() : null, waiverApprovalId: input.earlyDepartureApprovalId || null } });
    await queueBookingCommunication(p, { bookingId: booking.id, kind: "booking_updated", eventKey });
    return updated;
  });
}

// features/keystone/mutations/amendStaffBooking.ts
init_access();
init_bookingAmendment();
init_hotelPricing();
async function amendStaffBooking(_root, {
  bookingId,
  checkInDate,
  checkOutDate,
  roomTypeId,
  ratePlanId,
  promoCode,
  targetRoomId,
  earlyDepartureApprovalId,
  earlyDepartureReason,
  idempotencyKey
}, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to amend staff reservations.");
  }
  const booking = await context.prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, payments: true }
  });
  if (!booking || !["pending", "confirmed", "checked_in"].includes(booking.status)) {
    throw new Error("Only open reservations can be amended.");
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
  if (booking.status === "checked_in") return amendInHouseStay(context, { bookingId, checkInDate, checkOutDate, roomTypeId: selectedRoomTypeId, ratePlanId: selectedRatePlanId, targetRoomId, promoCode: effectivePromoCode, earlyDepartureApprovalId, earlyDepartureReason, idempotencyKey });
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
      arrivalInstant: quote.arrivalInstant,
      propertyTimeZone: quote.propertyTimeZone,
      cancellationPolicy: quote.ratePlan.cancellationPolicy,
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
init_hotelCommunications();
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
init_access();
init_bookingRefund();
async function requestBookingPaymentRefund2(_root, {
  approvalId,
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
    approvalId,
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
    actorId: context.session.itemId
  });
}

// features/keystone/mutations/updateHotelPropertySettings.ts
var import_node_crypto22 = require("node:crypto");
init_hotelBusinessTime();
init_roomOutages();
init_access();
init_hotelLifecycle();

// features/keystone/lib/hotelPropertySettings.ts
function haveHotelPricingInputsChanged(before, after) {
  return !before || before.securityDepositMinor !== after.securityDepositMinor || before.depositPercent !== after.depositPercent || before.timeZone !== after.timeZone || before.checkInTime !== after.checkInTime || before.currencyCode !== after.currencyCode || before.taxRateBasisPoints !== after.taxRateBasisPoints || before.serviceFeeMinor !== after.serviceFeeMinor;
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
  const key4 = STOREFRONT_ACCENT_PRESET_KEYS.includes(value) ? value : DEFAULT_STOREFRONT_ACCENT_PRESET;
  return STOREFRONT_ACCENT_PRESETS.find((preset) => preset.key === key4);
}

// features/keystone/mutations/updateHotelPropertySettings.ts
function text45(value, label, max, required3 = false) {
  const normalized = String(value || "").trim();
  if (required3 && !normalized || normalized.length > max) throw new Error(`${label} is invalid.`);
  return normalized;
}
function stayTime(value, label) {
  const normalized = text45(value, label, 20, true);
  if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM))$/i.test(normalized)) {
    throw new Error(`${label} must use 24-hour HH:mm or h:mm AM/PM format.`);
  }
  return normalized;
}
function imagePath(value, label) {
  const normalized = text45(value, label, 500);
  if (!normalized) return "";
  if (normalized.startsWith("/images/") && !normalized.includes("..") && !normalized.includes("\\")) return normalized;
  throw new Error(`${label} must be a canonical local /images/ path.`);
}
async function updateHotelPropertySettings(_root, { data, idempotencyKey }, context) {
  if (!permissions.canManageOnboarding({ session: context.session })) throw new Error("Not authorized to configure the property.");
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 180) throw new Error("A bounded idempotency key is required.");
  const eventKey = `hotel-settings:${key4}`;
  const currencyCode = text45(data.currencyCode, "Currency code", 3, true).toUpperCase();
  if (currencyCode !== "USD") throw new Error("The bounded initial release supports USD settlement only.");
  const taxRateBasisPoints = Number(data.taxRateBasisPoints);
  const serviceFeeMinor = Number(data.serviceFeeMinor);
  if (!Number.isSafeInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 1e4) throw new Error("Tax rate basis points must be between 0 and 10000.");
  if (!Number.isSafeInteger(serviceFeeMinor) || serviceFeeMinor < 0) throw new Error("Service fee must be a non-negative integer amount.");
  const contactEmail = text45(data.contactEmail, "Contact email", 320, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Contact email is invalid.");
  const propertyName = text45(data.propertyName, "Property name", 200, true);
  if (/\b(?:grand hotel|openfront(?: hotel)?|acme|demo)\b/i.test(propertyName)) throw new Error("Property name must use the real public hotel brand.");
  const normalized = {
    refundApprovalThresholdMinor: Number(data.refundApprovalThresholdMinor ?? 0),
    writeOffApprovalThresholdMinor: Number(data.writeOffApprovalThresholdMinor ?? 0),
    cashVarianceApprovalThresholdMinor: Number(data.cashVarianceApprovalThresholdMinor ?? 0),
    prearrivalEmailEnabled: data.prearrivalEmailEnabled === true,
    prearrivalDays: Number(data.prearrivalDays ?? 1),
    loyaltyEnabled: data.loyaltyEnabled === true,
    loyaltyEarnMinorPerPoint: Number(data.loyaltyEarnMinorPerPoint ?? 100),
    loyaltyRedeemMinorPerPoint: Number(data.loyaltyRedeemMinorPerPoint ?? 1),
    loyaltyMinimumRedemptionPoints: Number(data.loyaltyMinimumRedemptionPoints ?? 100),
    securityDepositMinor: Number(data.securityDepositMinor ?? 0),
    depositPercent: Number(data.depositPercent ?? 100),
    groupsEnabled: data.groupsEnabled === true,
    ratePublicationRequiresApproval: data.ratePublicationRequiresApproval !== false,
    propertyName,
    tagline: text45(data.tagline, "Tagline", 300),
    contactEmail,
    contactPhone: text45(data.contactPhone, "Contact phone", 80, true),
    addressLine1: text45(data.addressLine1, "Address line 1", 250, true),
    addressLine2: text45(data.addressLine2, "Address line 2", 250),
    frontDeskCopy: text45(data.frontDeskCopy, "Front desk copy", 250),
    timeZone: validatePropertyTimeZone(data.timeZone),
    checkInTime: stayTime(data.checkInTime, "Check-in time"),
    checkOutTime: stayTime(data.checkOutTime, "Check-out time"),
    currencyCode,
    taxRateBasisPoints,
    serviceFeeMinor,
    storefrontAccentPreset: parseStorefrontAccentPreset(data.storefrontAccentPreset),
    heroImagePath: imagePath(data.heroImagePath, "Hero image path"),
    heroImageAltText: text45(data.heroImageAltText, "Hero image alt text", 300),
    heroImageCaption: text45(data.heroImageCaption, "Hero image caption", 500),
    amenityImagePath: imagePath(data.amenityImagePath, "Amenity image path"),
    amenityImageAltText: text45(data.amenityImageAltText, "Amenity image alt text", 300),
    amenityImageCaption: text45(data.amenityImageCaption, "Amenity image caption", 500),
    locationImagePath: imagePath(data.locationImagePath, "Location image path"),
    locationImageAltText: text45(data.locationImageAltText, "Location image alt text", 300),
    locationImageCaption: text45(data.locationImageCaption, "Location image caption", 500)
  };
  for (const key5 of ["loyaltyEarnMinorPerPoint", "loyaltyRedeemMinorPerPoint", "loyaltyMinimumRedemptionPoints"]) if (!Number.isInteger(normalized[key5]) || normalized[key5] < 1 || normalized[key5] > 1e6) throw new Error("Loyalty amounts must be whole units between 1 and 1000000.");
  if (!Number.isInteger(normalized.depositPercent) || normalized.depositPercent < 1 || normalized.depositPercent > 100) throw new Error("Deposit percentage must be 1\u2013100.");
  if (!Number.isInteger(normalized.prearrivalDays) || normalized.prearrivalDays < 1 || normalized.prearrivalDays > 14) throw new Error("Pre-arrival lead time must be 1\u201314 days.");
  for (const field of ["refundApprovalThresholdMinor", "writeOffApprovalThresholdMinor", "cashVarianceApprovalThresholdMinor", "securityDepositMinor"]) {
    if (!Number.isInteger(normalized[field]) || normalized[field] < 0 || normalized[field] > 2147483647) throw new Error("Approval thresholds must be non-negative 32-bit minor amounts.");
  }
  for (const [pathKey, altKey] of [["heroImagePath", "heroImageAltText"], ["amenityImagePath", "amenityImageAltText"], ["locationImagePath", "locationImageAltText"]]) {
    if (normalized[pathKey] && !normalized[altKey]) throw new Error(`${altKey} is required when ${pathKey} is set.`);
  }
  const identity = { request: normalized, aggregateType: "hotel_settings", aggregateId: HOTEL_PROPERTY_KEY, action: "updated" };
  await context.transaction(async (tx) => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-settings:${HOTEL_PROPERTY_KEY}`);
    if (await findHotelLifecycleReplay(tx.prisma, eventKey, identity)) return;
    await lockHotelBusinessDate(tx.prisma);
    const [before, clock, nightAuditCount, bookingCount] = await Promise.all([
      tx.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
      tx.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
      tx.prisma.nightAuditRun.count(),
      tx.prisma.booking.count()
    ]);
    const policyFields = ["refundApprovalThresholdMinor", "writeOffApprovalThresholdMinor", "cashVarianceApprovalThresholdMinor", "ratePublicationRequiresApproval", "groupsEnabled", "securityDepositMinor", "depositPercent", "loyaltyEnabled", "loyaltyEarnMinorPerPoint", "loyaltyRedeemMinorPerPoint", "loyaltyMinimumRedemptionPoints"];
    if (before && policyFields.some((field) => (before[field] ?? (field === "groupsEnabled" ? false : field === "ratePublicationRequiresApproval" ? true : 0)) !== normalized[field]) && !permissions.canManageRoles({ session: context.session })) {
      throw new Error("Changing approval or group capability policy requires role administration permission.");
    }
    if ((before?.timeZone ?? "UTC") !== normalized.timeZone) {
      await tx.prisma.$executeRawUnsafe('LOCK TABLE "HousekeepingTask", "RoomInventory", "SeasonalRate", "RatePlan", "MaintenanceRequest" IN SHARE MODE');
      const [folio, folioEntry, groupBlock, channelReservation, openHousekeepingTask, roomInventory, seasonalRate, datedRatePlan, scheduledMaintenance] = await Promise.all([
        tx.prisma.folio.findFirst({ select: { id: true } }),
        tx.prisma.folioEntry.findFirst({ select: { id: true } }),
        tx.prisma.groupBlock.findFirst({ select: { id: true } }),
        tx.prisma.channelReservation.findFirst({ select: { id: true } }),
        tx.prisma.housekeepingTask.findFirst({ where: { status: { not: "completed" } }, select: { id: true } }),
        tx.prisma.roomInventory.findFirst({ select: { id: true } }),
        tx.prisma.seasonalRate.findFirst({ select: { id: true } }),
        tx.prisma.ratePlan.findFirst({ where: { OR: [{ validFrom: { not: null } }, { validTo: { not: null } }] }, select: { id: true } }),
        tx.prisma.maintenanceRequest.findFirst({ where: { scheduledFor: { not: null }, status: { notIn: ["completed", "verified", "cancelled"] } }, select: { id: true } })
      ]);
      const scheduledRoomOutage = (await loadRoomOutages(tx.prisma)).some((outage) => outage.status === "scheduled");
      if (bookingCount || nightAuditCount || folio || folioEntry || groupBlock || channelReservation || openHousekeepingTask || roomInventory || seasonalRate || datedRatePlan || scheduledMaintenance || scheduledRoomOutage) {
        throw new Error("Property time zone cannot change after hotel operations begin; an explicit time-zone migration workflow is required.");
      }
    }
    const pricingChanged = haveHotelPricingInputsChanged(before, normalized);
    const pricingVersion = pricingChanged ? `hotel-pricing-${(0, import_node_crypto22.createHash)("sha256").update(eventKey).digest("hex").slice(0, 16)}` : before.pricingVersion;
    const updated = await tx.prisma.hotelSettings.upsert({
      where: { id: 1 },
      create: { id: 1, pricingVersion, ...normalized },
      update: { ...normalized, pricingVersion }
    });
    const today = /* @__PURE__ */ new Date();
    const propertyToday = propertyCalendarDate(today, normalized.timeZone);
    let businessDateAfter = clock?.currentBusinessDate || null;
    if (!clock && (nightAuditCount || bookingCount)) {
      throw new Error("Business date is missing for an operational property; restore it from audited evidence before setup.");
    }
    if (!clock) {
      await tx.prisma.hotelBusinessDate.create({ data: { id: 1, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: propertyToday } });
      businessDateAfter = propertyToday;
    } else if (!before && !nightAuditCount && !bookingCount && clock.currentBusinessDate.getTime() !== propertyToday.getTime()) {
      const aligned = await tx.prisma.hotelBusinessDate.updateMany({
        where: { id: clock.id, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: clock.currentBusinessDate },
        data: { currentBusinessDate: propertyToday }
      });
      if (aligned.count !== 1) throw new Error("Initial property business date changed while settings were being saved.");
      businessDateAfter = propertyToday;
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
      beforeSnapshot: before && { securityDepositMinor: before.securityDepositMinor, depositPercent: before.depositPercent, loyaltyEnabled: before.loyaltyEnabled, loyaltyEarnMinorPerPoint: before.loyaltyEarnMinorPerPoint, loyaltyRedeemMinorPerPoint: before.loyaltyRedeemMinorPerPoint, loyaltyMinimumRedemptionPoints: before.loyaltyMinimumRedemptionPoints, prearrivalEmailEnabled: before.prearrivalEmailEnabled, prearrivalDays: before.prearrivalDays, groupsEnabled: before.groupsEnabled, refundApprovalThresholdMinor: before.refundApprovalThresholdMinor, writeOffApprovalThresholdMinor: before.writeOffApprovalThresholdMinor, cashVarianceApprovalThresholdMinor: before.cashVarianceApprovalThresholdMinor, ratePublicationRequiresApproval: before.ratePublicationRequiresApproval, propertyName: before.propertyName, contactEmail: before.contactEmail, timeZone: before.timeZone, currencyCode: before.currencyCode, taxRateBasisPoints: before.taxRateBasisPoints, serviceFeeMinor: before.serviceFeeMinor, storefrontAccentPreset: before.storefrontAccentPreset },
      afterSnapshot: { securityDepositMinor: updated.securityDepositMinor, depositPercent: updated.depositPercent, loyaltyEnabled: updated.loyaltyEnabled, loyaltyEarnMinorPerPoint: updated.loyaltyEarnMinorPerPoint, loyaltyRedeemMinorPerPoint: updated.loyaltyRedeemMinorPerPoint, loyaltyMinimumRedemptionPoints: updated.loyaltyMinimumRedemptionPoints, prearrivalEmailEnabled: updated.prearrivalEmailEnabled, prearrivalDays: updated.prearrivalDays, groupsEnabled: updated.groupsEnabled, refundApprovalThresholdMinor: updated.refundApprovalThresholdMinor, writeOffApprovalThresholdMinor: updated.writeOffApprovalThresholdMinor, cashVarianceApprovalThresholdMinor: updated.cashVarianceApprovalThresholdMinor, ratePublicationRequiresApproval: updated.ratePublicationRequiresApproval, propertyName: updated.propertyName, contactEmail: updated.contactEmail, timeZone: updated.timeZone, currencyCode: updated.currencyCode, taxRateBasisPoints: updated.taxRateBasisPoints, serviceFeeMinor: updated.serviceFeeMinor, storefrontAccentPreset: updated.storefrontAccentPreset, pricingVersion: updated.pricingVersion, businessDateBefore: clock?.currentBusinessDate || null, businessDateAfter }
    });
  }, { maxWait: 5e3, timeout: 3e4, isolationLevel: "ReadCommitted" });
  return context.prisma.hotelSettings.findUnique({ where: { id: 1 } });
}

// features/keystone/mutations/updateBookingStatus.ts
init_hotelLoyalty();
init_access();
init_roomOutages();
init_bookingFolio();
init_bookingCancellation();
init_folioLedger();
init_hotelLifecycle();
init_hotelCommunications();
init_bookingConfirmation();
init_serializableTransaction();
var BLOCKED_CHECK_IN_ROOM_STATUSES = /* @__PURE__ */ new Set(["occupied", "cleaning", "maintenance", "out_of_order"]);
var TRANSITIONS2 = {
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
  if (!TRANSITIONS2[status]) throw new Error("Unsupported booking status.");
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
  await runSerializableTransaction(context, async (transactionContext) => {
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
    if (!TRANSITIONS2[booking.status]?.has(status)) {
      throw new Error(`Booking status cannot transition from ${booking.status} to ${status}.`);
    }
    const rooms = booking.roomAssignments.map((assignment) => assignment.room).filter(Boolean);
    if (status === "confirmed") await assertBookingConfirmationInventory(transactionContext, booking);
    for (const room of [...rooms].sort((a, b) => a.id.localeCompare(b.id))) {
      await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${room.id}`);
    }
    if (status === "checked_in") {
      await assertGuestEligible(prisma, booking.guestProfileId);
      if (!rooms.length) throw new Error("Assign a room before checking this guest in.");
      if (booking.roomAssignments.some((assignment) => !assignment.room || assignment.room.roomTypeId !== assignment.roomTypeId)) throw new Error("Every assigned room must match its reserved room type.");
      for (const room of rooms) await assertRoomNotOutOfOrder(prisma, room.id, booking.checkInDate, booking.checkOutDate);
      const roomIds = rooms.map((room) => room.id);
      const openWork = await prisma.housekeepingTask.count({ where: { roomId: { in: roomIds }, status: { in: ["pending", "in_progress", "inspection_needed", "on_hold"] } } });
      const openMaintenance = await prisma.maintenanceRequest.count({ where: { roomId: { in: roomIds }, status: { notIn: ["verified", "cancelled"] } } });
      if (openWork || openMaintenance) throw new Error("Complete required housekeeping and maintenance before check-in.");
      const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
      if (!clock) throw new Error("Property business date is not configured.");
      const businessDay = clock.currentBusinessDate.toISOString().slice(0, 10);
      const arrivalDay = booking.checkInDate.toISOString().slice(0, 10);
      const departureDay = booking.checkOutDate.toISOString().slice(0, 10);
      if (arrivalDay > businessDay) throw new Error(`This reservation arrives on ${arrivalDay}; the current business date is ${businessDay}.`);
      if (departureDay <= businessDay) throw new Error("This reservation has reached its departure business date.");
      const blocked = rooms.find((room) => BLOCKED_CHECK_IN_ROOM_STATUSES.has(room.status));
      if (blocked) throw new Error(`Room ${blocked.roomNumber} is ${blocked.status.replaceAll("_", " ")} and cannot be checked in.`);
    }
    if (status === "cancelled") {
      throw new Error("Use the policy-aware cancellation operation.");
    }
    const now = /* @__PURE__ */ new Date();
    let folioId = null;
    if (status === "checked_out") {
      await assertNoOutstandingStayKeys(prisma, bookingId);
      const ensured = await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
      folioId = ensured.folioId;
      const entries = await prisma.folioEntry.findMany({
        where: { folioId },
        select: { direction: true, amountMinor: true, currencyCode: true }
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
      data: { status, ...timestamps, ...status === "confirmed" ? { holdExpiresAt: null } : {} }
    });
    if (status === "checked_in") {
      await prisma.room.updateMany({ where: { id: { in: rooms.map((room) => room.id) } }, data: { status: "occupied" } });
    }
    if (status === "checked_out") {
      for (const room of rooms) {
        const openRepairs = await prisma.maintenanceRequest.count({ where: { roomId: room.id, status: { notIn: ["verified", "cancelled"] } } });
        const nextCondition = room.status === "out_of_order" ? "out_of_order" : openRepairs ? "maintenance" : "cleaning";
        await prisma.room.update({ where: { id: room.id }, data: { status: nextCondition } });
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
    if (status === "checked_out") await reconcileBookingLoyalty(prisma, bookingId, eventKey, context.session.itemId);
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
  });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/mutations/updateRoomOperationalStatus.ts
init_serializableTransaction();
init_access();
init_hotelLifecycle();
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
  await runSerializableTransaction(context, async (transactionContext) => {
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
      await assertNoOpenRoomDiscrepancy(prisma, roomId);
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
  });
  return context.prisma.room.findUnique({ where: { id: roomId } });
}

// features/keystone/mutations/reportRoomMaintenanceIssue.ts
init_serializableTransaction();

// features/keystone/lib/roomOperationalSafety.ts
function preserveRoomOccupancy(currentStatus, proposedStatus, checkedInCount) {
  if (currentStatus === "out_of_order") return "out_of_order";
  if (checkedInCount > 0) return "occupied";
  return proposedStatus;
}
async function safeRoomCondition(prisma, roomId, currentStatus, proposedStatus) {
  const checkedInCount = await prisma.roomAssignment.count({ where: { roomId, booking: { status: "checked_in" } } });
  return preserveRoomOccupancy(currentStatus, proposedStatus, checkedInCount);
}

// features/keystone/mutations/reportRoomMaintenanceIssue.ts
var import_node_crypto23 = require("node:crypto");
init_access();
init_hotelLifecycle();
var CATEGORIES2 = /* @__PURE__ */ new Set(["plumbing", "electrical", "hvac", "furniture", "appliance", "structural", "cleaning", "other"]);
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
  if (!CATEGORIES2.has(category)) throw new Error("Unsupported maintenance category.");
  if (!PRIORITIES.has(priority)) throw new Error("Unsupported maintenance priority.");
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  const requestId = `maintenance_${(0, import_node_crypto23.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24)}`;
  const request = { roomId, title: normalizedTitle, description: normalizedDescription, category, priority };
  const identity = {
    request,
    aggregateType: "maintenance_request",
    aggregateId: requestId,
    action: "reported"
  };
  await runSerializableTransaction(context, async (transactionContext) => {
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
    const roomStatus = await safeRoomCondition(prisma, roomId, room.status, priority === "emergency" ? "out_of_order" : "maintenance");
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
  });
  return context.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
}

// features/keystone/mutations/assignRoomToBooking.ts
init_roomOutages();
init_access();
init_serializableTransaction();
init_hotelLifecycle();
var BLOCKED_ROOM_STATUSES = /* @__PURE__ */ new Set(["occupied", "cleaning", "maintenance", "out_of_order"]);
var ASSIGNABLE_BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed", "checked_in"]);
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
  await runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const [booking, room] = await Promise.all([
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: { roomAssignments: true }
      }),
      prisma.room.findUnique({ where: { id: roomId }, include: { roomType: true } })
    ]);
    if (!booking) throw new Error("Booking not found.");
    if (booking.status === "pending" && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= /* @__PURE__ */ new Date())) throw new Error("Expired pending holds cannot receive room assignments.");
    if (!room?.roomTypeId || !room.roomType) throw new Error("Room or required room type not found.");
    if (!ASSIGNABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new Error("Only open reservations can receive a room assignment.");
    }
    const existing = booking.roomAssignments[0];
    for (const lockedRoomId of [...new Set([roomId, existing?.roomId].filter(Boolean))].sort()) {
      await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${lockedRoomId}`);
    }
    if (existing?.roomId === roomId) throw new Error("Reservation is already assigned to this room.");
    if (BLOCKED_ROOM_STATUSES.has(room.status)) {
      throw new Error(`Room ${room.roomNumber} is ${room.status.replaceAll("_", " ")} and cannot be assigned.`);
    }
    if (!existing?.roomTypeId) throw new Error("The reservation is missing its required booked room type assignment.");
    if (existing.roomTypeId !== room.roomTypeId) {
      throw new Error(`Room ${room.roomNumber} does not match the reservation's booked room type.`);
    }
    await assertRoomNotOutOfOrder(prisma, roomId, booking.checkInDate, booking.checkOutDate);
    const [openMaintenance, openTasks] = await Promise.all([
      prisma.maintenanceRequest.count({ where: { roomId, status: { notIn: ["verified", "cancelled"] } } }),
      prisma.housekeepingTask.count({ where: { roomId, status: { not: "completed" } } })
    ]);
    if (openMaintenance || openTasks) throw new Error("Resolve room maintenance and housekeeping before assignment.");
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId,
        bookingId: { not: bookingId },
        booking: {
          OR: [{ status: { in: ["confirmed", "checked_in", "cancellation_pending"] } }, { status: "pending", holdExpiresAt: { gt: /* @__PURE__ */ new Date() } }],
          checkInDate: { lt: booking.checkOutDate },
          checkOutDate: { gt: booking.checkInDate }
        }
      },
      include: { booking: true }
    });
    if (conflict?.booking) {
      throw new Error(`Room ${room.roomNumber} is already assigned to ${conflict.booking.confirmationNumber} for overlapping dates.`);
    }
    if (booking.status === "checked_in") await assertNoOutstandingStayKeys(prisma, bookingId);
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
    const movedAt = /* @__PURE__ */ new Date();
    if (booking.status === "checked_in") {
      if (!existing.roomId) throw new Error("In-house reservation has no current physical room.");
      await prisma.room.update({ where: { id: roomId }, data: { status: "occupied" } });
      const oldRoom = await prisma.room.findUnique({ where: { id: existing.roomId } });
      if (oldRoom && !["maintenance", "out_of_order"].includes(oldRoom.status)) {
        await prisma.room.update({ where: { id: existing.roomId }, data: { status: "cleaning" } });
      }
      await prisma.housekeepingTask.create({ data: { roomId: existing.roomId, taskType: "checkout_clean", status: "pending", priority: 1, notes: `Room move ${booking.confirmationNumber}; ${eventKey}; vacated ${movedAt.toISOString()}` } });
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: existing && { assignmentId: existing.id, roomId: existing.roomId, roomTypeId: existing.roomTypeId },
      afterSnapshot: { assignmentId: assignment.id, roomId, roomTypeId: room.roomTypeId, effectiveAt: movedAt, stayCheckIn: booking.checkInDate, stayCheckOut: booking.checkOutDate },
      metadata: { confirmationNumber: booking.confirmationNumber, inHouseMove: booking.status === "checked_in", previousRoomVacatedAt: existing?.roomId ? movedAt : null, manualKeysRequireReturn: booking.status === "checked_in" }
    });
  });
  return context.prisma.booking.findUnique({ where: { id: bookingId } });
}

// features/keystone/mutations/updateBookingStayDates.ts
init_access();
init_hotelLifecycle();

// features/keystone/lib/bookingStayDates.ts
init_hotelBusinessTime();
var ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "checked_in"];
async function changeUnpricedBookingStayDatesInTransaction({
  prisma,
  bookingId,
  checkIn,
  checkOut
}) {
  await lockHotelBusinessDate(prisma);
  await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${bookingId}`);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { roomAssignments: true, lineItems: { select: { id: true }, take: 1 } }
  });
  if (!booking) throw new Error("Booking not found.");
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) throw new Error("Cannot change dates for closed or cancelled bookings.");
  if (booking.lineItems.length) throw new Error("Priced reservations require a controlled amendment; immutable commercial snapshots cannot be rewritten.");
  const roomIds = booking.roomAssignments.map((assignment) => assignment.roomId).filter(Boolean).sort();
  for (const roomId of roomIds) {
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${roomId}`);
    const conflict = await prisma.roomAssignment.findFirst({
      where: {
        roomId,
        bookingId: { not: bookingId },
        booking: { status: { in: ACTIVE_BOOKING_STATUSES }, checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } }
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
init_access();
async function retryFailedChannelSyncsMutation(root, args, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to retry channel syncs");
  }
  return retryFailedChannelSyncs(context);
}

// features/keystone/mutations/updateMaintenanceRequestStatus.ts
init_serializableTransaction();
init_access();
init_hotelBusinessTime();
init_hotelLifecycle();
function inspectionMarker(requestId) {
  return `[maintenance-request:${requestId}]`;
}
var TRANSITIONS3 = {
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
  if (!TRANSITIONS3[status]) throw new Error("Unsupported maintenance status.");
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
  await runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    if (status === "completed") await lockHotelBusinessDate(prisma);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const maintenance = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { room: true }
    });
    if (!maintenance?.roomId || !maintenance.room) throw new Error("Maintenance request or room not found.");
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${maintenance.roomId}`);
    if (maintenance.status === status) throw new Error(`Maintenance request is already ${status}.`);
    if (!TRANSITIONS3[maintenance.status]?.has(status)) {
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
    roomStatus = await safeRoomCondition(prisma, maintenance.roomId, maintenance.room.status, roomStatus);
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
  });
  return context.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
}

// features/keystone/mutations/updateRoomInventoryControls.ts
init_access();
init_hotelLifecycle();
init_serializableTransaction();
init_hotelBusinessTime();
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
  const day2 = getInventoryDay(date);
  const inventoryKey = buildInventoryKey(roomTypeId, day2);
  const request = { roomTypeId, date: day2.toISOString(), totalRooms, bookedRooms, blockedRooms };
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
    await lockHotelBusinessDate(prisma);
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
    const next2 = {
      totalRooms: totalRooms ?? existing?.totalRooms ?? physicalRoomCount,
      bookedRooms: bookedRooms ?? existing?.bookedRooms ?? 0,
      blockedRooms: blockedRooms ?? existing?.blockedRooms ?? 0
    };
    if (next2.totalRooms > physicalRoomCount) {
      throw new Error("Inventory total cannot exceed the physical room count.");
    }
    if (next2.bookedRooms + next2.blockedRooms > next2.totalRooms) {
      throw new Error("Booked plus blocked rooms cannot exceed total rooms.");
    }
    const updated = existing ? await prisma.roomInventory.update({ where: { id: existing.id }, data: next2 }) : await prisma.roomInventory.create({
      data: { inventoryKey, date: day2, roomTypeId, ...next2 }
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
      afterSnapshot: next2,
      metadata: { roomTypeName: roomType.name }
    });
  });
  return context.prisma.roomInventory.findUnique({ where: { id: inventoryId } });
}

// features/keystone/mutations/requestBookingModification.ts
var import_node_crypto24 = require("node:crypto");
init_guestBookingAccess();
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
      requestKey: `guest-modification:${(0, import_node_crypto24.randomUUID)()}`,
      bookingId,
      requestedCheckInDate: nextIn,
      requestedCheckOutDate: nextOut,
      guestMessage: guestMessage || null,
      requestedByEmailHash: (0, import_node_crypto24.createHash)("sha256").update(normalizedEmail).digest("hex"),
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
init_access();
init_bookingAmendment();
init_hotelPricing();
init_hotelLifecycle();
init_hotelCommunications();
init_hotelBusinessTime();
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
    await lockHotelBusinessDate(prisma);
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
init_integrationConfig();
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
init_guestBookingAccess();
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

// features/keystone/queries/guestBooking.ts
init_guestBookingAccess();

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
init_hotelCommunications();
async function guestBooking(root, { bookingId }, context) {
  await assertGuestBookingAccess(context, bookingId);
  const [booking, communication] = await Promise.all([
    findStorefrontBooking(context, bookingId),
    bookingCommunicationStatus(context.prisma, bookingId)
  ]);
  if (!booking) return null;
  const pending = await context.prisma.refundIntent.aggregate({ where: { bookingId, status: { in: ["pending", "processing", "failed", "dead_letter"] } }, _sum: { amountMinor: true } });
  return {
    ...booking,
    refundPendingMinor: Number(pending._sum.amountMinor || 0),
    confirmationDeliveryStatus: communication.confirmation?.status || null,
    updateDeliveryStatus: communication.modification?.status || communication.update?.status || null,
    cancellationDeliveryStatus: communication.cancellation?.status || null
  };
}
var guestBooking_default = guestBooking;

// features/keystone/queries/guestBookings.ts
init_guestBookingAccess();
init_hotelCommunications();
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
init_guestBookingAccess();
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
init_hotelAvailability();
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
    securityDepositMinor: quote.securityDepositMinor,
    depositPercent: quote.depositPercent,
    pricingVersion: quote.pricingVersion,
    quoteToken: quote.quoteToken
  };
}
var storefrontQuote_default = storefrontQuote;

// features/keystone/queries/guestCancellationQuote.ts
init_cancellationPolicy();
init_bookingRefund();
init_guestBookingAccess();
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
  const capturedMinor = available.reduce((sum, amount3) => sum + amount3, 0);
  const firstRoomNight = booking.lineItems.find((line) => line.type === "room");
  const policy = firstRoomNight?.cancellationPolicySnapshot || booking.pricingSnapshot?.cancellationPolicy || booking.ratePlan?.cancellationPolicy;
  const stayNights = Math.max(1, Math.round((booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 864e5));
  const bookingTotalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
  const firstNightMinor = Number(firstRoomNight?.totalPrice || 0) || Math.ceil(bookingTotalMinor / stayNights);
  const terms = calculateCancellationTerms({
    policy,
    checkInDate: booking.pricingSnapshot?.arrivalInstant || booking.checkInDate,
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

// features/keystone/mutations/index.ts
init_guestBookingAccess();

// features/keystone/mutations/ensureReservationSnapshots.ts
init_access();
init_reservationSnapshots();
init_bookingFolio();
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
var import_node_crypto25 = require("node:crypto");

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
    timeZone: "America/New_York",
    currencyCode: "USD",
    taxRateBasisPoints: 1e3,
    serviceFeeMinor: 0,
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
    { roomNumber: "201", roomType: "Deluxe King", floor: 2, status: "vacant", notes: "Preferred high-floor upgrade room." },
    { roomNumber: "202", roomType: "Deluxe King", floor: 2, status: "vacant", notes: "Popular direct booking room." },
    { roomNumber: "203", roomType: "Deluxe King", floor: 2, status: "maintenance", notes: "AC inspection scheduled." },
    { roomNumber: "301", roomType: "Family Suite", floor: 3, status: "vacant", notes: "Extended stay family suite." },
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
        emailMarketing: false,
        smsNotifications: true,
        phoneNotifications: false,
        preferredLanguage: "en",
        newsletterSubscribed: false
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
        emailMarketing: false,
        smsNotifications: false,
        phoneNotifications: false,
        preferredLanguage: "es",
        newsletterSubscribed: false
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
      ratePlan: "Deluxe Flexible",
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
      ratePlan: "Classic Flexible",
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
      ratePlan: "Family Escape",
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
      depositAmount: 0,
      balanceDue: 1175,
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
init_guestBookingAccess();
init_reservationSnapshots();
init_bookingFolio();

// features/platform/onboarding/lib/hotelOnboardingSchema.ts
var HOTEL_ONBOARDING_ARRAY_SECTIONS = [
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
];
var HOTEL_ONBOARDING_SECTIONS = [
  "hotelSettings",
  ...HOTEL_ONBOARDING_ARRAY_SECTIONS
];
var ALLOWED_AMENITIES = /* @__PURE__ */ new Set([
  "wifi",
  "tv",
  "minibar",
  "balcony",
  "coffee_maker",
  "safe",
  "bathtub",
  "shower",
  "ac",
  "heating",
  "desk",
  "iron",
  "hair_dryer",
  "room_service",
  "ocean_view",
  "city_view",
  "garden_view",
  "kitchenette",
  "jacuzzi",
  "fireplace",
  "rain_shower",
  "premium_linens",
  "blackout_drapes",
  "sitting_area",
  "breakfast_available",
  "accessible",
  "courtyard_view",
  "heritage_details"
]);
var BED_CONFIGURATIONS = /* @__PURE__ */ new Set(["king", "queen", "double_queen", "twin", "double_twin", "king_sofa", "queen_sofa", "suite"]);
var ROOM_STATUSES2 = /* @__PURE__ */ new Set(["vacant", "occupied", "cleaning", "maintenance", "out_of_order"]);
var RATE_STATUSES = /* @__PURE__ */ new Set(["active", "inactive", "draft"]);
var CANCELLATION_POLICIES = /* @__PURE__ */ new Set(["flexible", "moderate", "strict", "non_refundable"]);
var MEAL_PLANS = /* @__PURE__ */ new Set(["room_only", "breakfast", "half_board", "full_board", "all_inclusive"]);
var BOOKING_STATUSES = /* @__PURE__ */ new Set(["pending", "confirmed", "checked_in", "checked_out", "cancellation_pending", "cancelled", "no_show"]);
var PAYMENT_STATUSES = /* @__PURE__ */ new Set(["unpaid", "partial", "paid", "refunded"]);
var BOOKING_SOURCES = /* @__PURE__ */ new Set(["direct", "website", "phone", "walk_in", "ota", "corporate", "group"]);
var HOUSEKEEPING_TYPES = /* @__PURE__ */ new Set(["checkout_clean", "stayover_clean", "deep_clean", "maintenance", "inspection", "turn_down"]);
var HOUSEKEEPING_STATUSES = /* @__PURE__ */ new Set(["pending", "in_progress", "completed", "inspection_needed", "on_hold"]);
var MAINTENANCE_CATEGORIES = /* @__PURE__ */ new Set(["plumbing", "electrical", "hvac", "furniture", "appliance", "structural", "cleaning", "other"]);
var MAINTENANCE_PRIORITIES = /* @__PURE__ */ new Set(["low", "medium", "high", "emergency"]);
var MAINTENANCE_STATUSES = /* @__PURE__ */ new Set(["reported", "assigned", "in_progress", "completed", "verified", "cancelled"]);
function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function requiredText(value, path, errors, max = 320) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    errors.push(`${path} must be a non-empty string no longer than ${max} characters.`);
  }
}
function finiteNumber(value, path, errors, options = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || options.integer && !Number.isInteger(value) || options.min !== void 0 && value < options.min) {
    errors.push(`${path} must be ${options.integer ? "an integer" : "a finite number"}${options.min !== void 0 ? ` of at least ${options.min}` : ""}.`);
  }
}
function enumValue(value, path, allowed, errors) {
  if (typeof value !== "string" || !allowed.has(value)) errors.push(`${path} contains an unsupported value.`);
}
function validDate(value, path, errors) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) errors.push(`${path} must be an ISO-compatible date.`);
}
function assertUnique(rows, section, keyFor, errors) {
  const seen = /* @__PURE__ */ new Set();
  rows.forEach((row, index) => {
    const value = String(keyFor(row) ?? "").trim().toLowerCase();
    if (!value) errors.push(`${section}[${index}] requires a stable identity.`);
    else if (seen.has(value)) errors.push(`${section} contains duplicate identity "${value}".`);
    else seen.add(value);
  });
}
function assertReference(value, values, path, errors) {
  if (typeof value !== "string" || !values.has(value)) errors.push(`${path} does not reference an item in this onboarding payload.`);
}
function rejectUnknownKeys(value, allowed, path, errors) {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).filter((key4) => !allowedKeys.has(key4));
  if (unknown.length) errors.push(`${path} contains unsupported fields: ${unknown.join(", ")}.`);
}
function validateHotelOnboardingData(value) {
  const errors = [];
  if (!record(value)) return { success: false, errors: ["Hotel onboarding data must be a JSON object."] };
  let encoded = "";
  try {
    encoded = JSON.stringify(value);
  } catch {
    return { success: false, errors: ["Hotel onboarding data must be JSON serializable."] };
  }
  if (encoded.length > 25e4) errors.push("Hotel onboarding data must be no larger than 250000 encoded characters.");
  const allowed = new Set(HOTEL_ONBOARDING_SECTIONS);
  const unknownSections = Object.keys(value).filter((key4) => !allowed.has(key4));
  if (unknownSections.length) errors.push(`Unsupported onboarding sections: ${unknownSections.join(", ")}.`);
  if (!record(value.hotelSettings)) errors.push("hotelSettings must be an object.");
  for (const section of HOTEL_ONBOARDING_ARRAY_SECTIONS) {
    const rows = value[section];
    if (!Array.isArray(rows)) errors.push(`${section} must be an array.`);
    else if (rows.length > 500) errors.push(`${section} may contain at most 500 items.`);
    else if (rows.some((row) => !record(row))) errors.push(`${section} may contain only objects.`);
  }
  if (errors.length) return { success: false, errors };
  const data = value;
  const settings = data.hotelSettings;
  rejectUnknownKeys(settings, ["propertyName", "tagline", "contactEmail", "contactPhone", "addressLine1", "addressLine2", "frontDeskCopy", "checkInTime", "checkOutTime", "timeZone", "currencyCode", "taxRateBasisPoints", "serviceFeeMinor", "storefrontAccentPreset", "heroImagePath", "heroImageAltText", "heroImageCaption", "amenityImagePath", "amenityImageAltText", "amenityImageCaption", "locationImagePath", "locationImageAltText", "locationImageCaption"], "hotelSettings", errors);
  requiredText(settings.propertyName, "hotelSettings.propertyName", errors, 200);
  requiredText(settings.contactEmail, "hotelSettings.contactEmail", errors, 320);
  if (typeof settings.contactEmail === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail)) errors.push("hotelSettings.contactEmail must be a valid email address.");
  requiredText(settings.contactPhone, "hotelSettings.contactPhone", errors, 80);
  requiredText(settings.addressLine1, "hotelSettings.addressLine1", errors, 250);
  requiredText(settings.checkInTime, "hotelSettings.checkInTime", errors, 20);
  requiredText(settings.checkOutTime, "hotelSettings.checkOutTime", errors, 20);
  if (settings.timeZone !== void 0) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }).format(/* @__PURE__ */ new Date(0));
    } catch {
      errors.push("hotelSettings.timeZone must be a valid IANA time zone.");
    }
  }
  if (settings.currencyCode !== "USD") errors.push("hotelSettings.currencyCode must be USD for the bounded release.");
  finiteNumber(settings.taxRateBasisPoints, "hotelSettings.taxRateBasisPoints", errors, { min: 0, integer: true });
  if (Number(settings.taxRateBasisPoints) > 1e4) errors.push("hotelSettings.taxRateBasisPoints may not exceed 10000.");
  finiteNumber(settings.serviceFeeMinor, "hotelSettings.serviceFeeMinor", errors, { min: 0, integer: true });
  if (!["brass", "forest", "harbor", "claret"].includes(settings.storefrontAccentPreset)) errors.push("hotelSettings.storefrontAccentPreset is unsupported.");
  assertUnique(data.roomTypes, "roomTypes", (row) => row.name, errors);
  assertUnique(data.rooms, "rooms", (row) => row.roomNumber, errors);
  assertUnique(data.ratePlans, "ratePlans", (row) => row.name, errors);
  assertUnique(data.seasonalRates, "seasonalRates", (row) => row.name, errors);
  assertUnique(data.guests, "guests", (row) => row.email, errors);
  for (const section of ["bookings", "bookingPayments", "housekeepingTasks", "maintenanceRequests", "channels", "channelReservations", "channelSyncEvents", "loyaltyTransactions", "inventory"]) {
    assertUnique(data[section], section, (row) => row.key, errors);
  }
  const roomTypes = new Set(data.roomTypes.map((row) => row.name));
  const rooms = new Map(data.rooms.map((row) => [row.roomNumber, row.roomType]));
  const guests = new Set(data.guests.map((row) => row.email));
  const bookings = new Set(data.bookings.map((row) => row.key));
  const channels = new Set(data.channels.map((row) => row.name));
  data.roomTypes.forEach((row, index) => {
    rejectUnknownKeys(row, ["name", "description", "shortDescription", "eyebrow", "viewDescription", "baseRate", "currencyCode", "maxOccupancy", "bedConfiguration", "amenities", "squareFeet", "roomImages"], `roomTypes[${index}]`, errors);
    requiredText(row.name, `roomTypes[${index}].name`, errors, 200);
    finiteNumber(row.baseRate, `roomTypes[${index}].baseRate`, errors, { min: 0 });
    finiteNumber(row.maxOccupancy, `roomTypes[${index}].maxOccupancy`, errors, { min: 1, integer: true });
    enumValue(row.bedConfiguration, `roomTypes[${index}].bedConfiguration`, BED_CONFIGURATIONS, errors);
    if (!Array.isArray(row.amenities) || row.amenities.some((amenity) => typeof amenity !== "string" || !ALLOWED_AMENITIES.has(amenity))) errors.push(`roomTypes[${index}].amenities contains an unsupported amenity.`);
    if (row.currencyCode !== void 0 && row.currencyCode !== "USD") errors.push(`roomTypes[${index}].currencyCode must be USD.`);
    if (row.roomImages !== void 0 && (!Array.isArray(row.roomImages) || row.roomImages.length > 20)) errors.push(`roomTypes[${index}].roomImages must be a bounded array.`);
    else (row.roomImages || []).forEach((image2, imageIndex) => {
      if (!record(image2)) errors.push(`roomTypes[${index}].roomImages[${imageIndex}] must be an object.`);
      else rejectUnknownKeys(image2, ["key", "imagePath", "altText", "caption", "order", "isPrimary"], `roomTypes[${index}].roomImages[${imageIndex}]`, errors);
    });
  });
  data.rooms.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "roomNumber", "roomType", "floor", "status", "notes"], `rooms[${index}]`, errors);
    requiredText(row.roomNumber, `rooms[${index}].roomNumber`, errors, 50);
    assertReference(row.roomType, roomTypes, `rooms[${index}].roomType`, errors);
    enumValue(row.status, `rooms[${index}].status`, ROOM_STATUSES2, errors);
    finiteNumber(row.floor, `rooms[${index}].floor`, errors, { min: 0, integer: true });
  });
  data.ratePlans.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "name", "description", "roomType", "baseRate", "currencyCode", "seasonalAdjustments", "minimumStay", "maximumStay", "advanceBookingMin", "advanceBookingMax", "cancellationPolicy", "mealPlan", "validFrom", "validTo", "applicableDays", "status", "isPublic", "isPromotional", "promoCode", "priority"], `ratePlans[${index}]`, errors);
    requiredText(row.name, `ratePlans[${index}].name`, errors, 200);
    assertReference(row.roomType, roomTypes, `ratePlans[${index}].roomType`, errors);
    finiteNumber(row.baseRate, `ratePlans[${index}].baseRate`, errors, { min: 0 });
    finiteNumber(row.minimumStay, `ratePlans[${index}].minimumStay`, errors, { min: 1, integer: true });
    if (row.maximumStay !== void 0) finiteNumber(row.maximumStay, `ratePlans[${index}].maximumStay`, errors, { min: row.minimumStay || 1, integer: true });
    enumValue(row.cancellationPolicy, `ratePlans[${index}].cancellationPolicy`, CANCELLATION_POLICIES, errors);
    enumValue(row.mealPlan, `ratePlans[${index}].mealPlan`, MEAL_PLANS, errors);
    enumValue(row.status, `ratePlans[${index}].status`, RATE_STATUSES, errors);
    if (row.currencyCode !== void 0 && row.currencyCode !== "USD") errors.push(`ratePlans[${index}].currencyCode must be USD.`);
  });
  data.seasonalRates.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "name", "roomType", "startDate", "endDate", "priceAdjustment", "priceMultiplier", "minimumStay", "priority", "isActive"], `seasonalRates[${index}]`, errors);
    assertReference(row.roomType, roomTypes, `seasonalRates[${index}].roomType`, errors);
    validDate(row.startDate, `seasonalRates[${index}].startDate`, errors);
    validDate(row.endDate, `seasonalRates[${index}].endDate`, errors);
    if (Date.parse(row.endDate) < Date.parse(row.startDate)) errors.push(`seasonalRates[${index}] ends before it starts.`);
    finiteNumber(row.priceMultiplier, `seasonalRates[${index}].priceMultiplier`, errors, { min: 0 });
  });
  data.guests.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "firstName", "lastName", "email", "phone", "nationality", "preferences", "loyaltyNumber", "loyaltyTier", "communicationPreferences", "company", "specialNotes", "isVip", "totalStays", "totalSpent", "lastStayAt", "loyaltyPoints"], `guests[${index}]`, errors);
    requiredText(row.firstName, `guests[${index}].firstName`, errors, 100);
    requiredText(row.lastName, `guests[${index}].lastName`, errors, 100);
    requiredText(row.email, `guests[${index}].email`, errors, 320);
    if (row.communicationPreferences?.emailMarketing === true || row.communicationPreferences?.newsletterSubscribed === true) errors.push(`guests[${index}] cannot import promotional consent without versioned evidence; record consent after setup.`);
  });
  data.bookings.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "guestEmail", "guestName", "roomType", "ratePlan", "roomNumber", "checkInDate", "checkOutDate", "numberOfGuests", "numberOfAdults", "numberOfChildren", "roomRate", "taxAmount", "feesAmount", "totalAmount", "depositAmount", "balanceDue", "currencyCode", "status", "paymentStatus", "source", "specialRequests"], `bookings[${index}]`, errors);
    assertReference(row.guestEmail, guests, `bookings[${index}].guestEmail`, errors);
    assertReference(row.roomType, roomTypes, `bookings[${index}].roomType`, errors);
    if (!data.ratePlans.some((rate) => rate.name === row.ratePlan && rate.roomType === row.roomType)) errors.push(`bookings[${index}].ratePlan must reference a compatible rate plan.`);
    assertReference(row.roomNumber, new Set(rooms.keys()), `bookings[${index}].roomNumber`, errors);
    if (rooms.get(row.roomNumber) !== row.roomType) errors.push(`bookings[${index}] assigns a room from a different room type.`);
    validDate(row.checkInDate, `bookings[${index}].checkInDate`, errors);
    validDate(row.checkOutDate, `bookings[${index}].checkOutDate`, errors);
    if (Date.parse(row.checkOutDate) <= Date.parse(row.checkInDate)) errors.push(`bookings[${index}] must check out after check-in.`);
    enumValue(row.status, `bookings[${index}].status`, BOOKING_STATUSES, errors);
    enumValue(row.paymentStatus, `bookings[${index}].paymentStatus`, PAYMENT_STATUSES, errors);
    enumValue(row.source, `bookings[${index}].source`, BOOKING_SOURCES, errors);
    for (const amount3 of ["roomRate", "taxAmount", "feesAmount", "totalAmount", "depositAmount", "balanceDue"]) finiteNumber(row[amount3], `bookings[${index}].${amount3}`, errors, { min: 0 });
    if (Math.abs(Number(row.totalAmount) - Number(row.roomRate) - Number(row.taxAmount) - Number(row.feesAmount)) > 1e-3) errors.push(`bookings[${index}] total does not equal room rate, tax, and fees.`);
    if (Math.abs(Number(row.balanceDue) - (Number(row.totalAmount) - Number(row.depositAmount))) > 1e-3) errors.push(`bookings[${index}] balance does not equal total less deposit.`);
    if (Number(row.numberOfGuests) !== Number(row.numberOfAdults) + Number(row.numberOfChildren)) errors.push(`bookings[${index}] guest counts are inconsistent.`);
  });
  data.bookingPayments.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "bookingKey", "providerCode", "amount", "currency", "paymentType", "paymentMethod", "status", "description"], `bookingPayments[${index}]`, errors);
    assertReference(row.bookingKey, bookings, `bookingPayments[${index}].bookingKey`, errors);
    requiredText(row.providerCode, `bookingPayments[${index}].providerCode`, errors, 100);
    if (row.providerCode !== "pp_manual_manual") errors.push(`bookingPayments[${index}].providerCode must use the operator-recorded demo provider.`);
    finiteNumber(row.amount, `bookingPayments[${index}].amount`, errors, { min: 0 });
    if (row.currency !== "USD") errors.push(`bookingPayments[${index}].currency must be USD.`);
  });
  data.housekeepingTasks.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "roomNumber", "taskType", "status", "priority", "notes"], `housekeepingTasks[${index}]`, errors);
    assertReference(row.roomNumber, new Set(rooms.keys()), `housekeepingTasks[${index}].roomNumber`, errors);
    enumValue(row.taskType, `housekeepingTasks[${index}].taskType`, HOUSEKEEPING_TYPES, errors);
    enumValue(row.status, `housekeepingTasks[${index}].status`, HOUSEKEEPING_STATUSES, errors);
  });
  data.maintenanceRequests.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "roomNumber", "title", "description", "category", "priority", "status", "notes"], `maintenanceRequests[${index}]`, errors);
    assertReference(row.roomNumber, new Set(rooms.keys()), `maintenanceRequests[${index}].roomNumber`, errors);
    enumValue(row.category, `maintenanceRequests[${index}].category`, MAINTENANCE_CATEGORIES, errors);
    enumValue(row.priority, `maintenanceRequests[${index}].priority`, MAINTENANCE_PRIORITIES, errors);
    enumValue(row.status, `maintenanceRequests[${index}].status`, MAINTENANCE_STATUSES, errors);
  });
  data.channels.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "name", "channelType", "isActive", "commission", "syncInventory", "syncRates", "syncStatus", "syncErrors", "mappingRules", "credentials"], `channels[${index}]`, errors);
    if (row.isActive !== false || row.syncInventory !== false || row.syncRates !== false || String(row.credentials?.mode || "").toLowerCase() === "live") {
      errors.push(`channels[${index}] must remain a disabled demonstration channel; configure live delivery through Channel settings.`);
    }
  });
  data.channelReservations.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "channel", "bookingKey", "roomType", "externalId", "guestName", "guestEmail", "checkInDate", "checkOutDate", "totalAmount", "commission", "channelStatus"], `channelReservations[${index}]`, errors);
    assertReference(row.channel, channels, `channelReservations[${index}].channel`, errors);
    assertReference(row.bookingKey, bookings, `channelReservations[${index}].bookingKey`, errors);
    assertReference(row.roomType, roomTypes, `channelReservations[${index}].roomType`, errors);
  });
  data.channelSyncEvents.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "channel", "channelName", "action", "status", "message", "errorMessage", "attempts", "occurredAt", "payload"], `channelSyncEvents[${index}]`, errors);
    assertReference(row.channel, channels, `channelSyncEvents[${index}].channel`, errors);
  });
  data.loyaltyTransactions.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "guestEmail", "bookingKey", "points", "type", "description"], `loyaltyTransactions[${index}]`, errors);
    assertReference(row.guestEmail, guests, `loyaltyTransactions[${index}].guestEmail`, errors);
    assertReference(row.bookingKey, bookings, `loyaltyTransactions[${index}].bookingKey`, errors);
  });
  data.inventory.forEach((row, index) => {
    rejectUnknownKeys(row, ["key", "label", "roomType", "date", "totalRooms", "bookedRooms", "blockedRooms"], `inventory[${index}]`, errors);
    assertReference(row.roomType, roomTypes, `inventory[${index}].roomType`, errors);
    validDate(row.date, `inventory[${index}].date`, errors);
    for (const count of ["totalRooms", "bookedRooms", "blockedRooms"]) finiteNumber(row[count], `inventory[${index}].${count}`, errors, { min: 0, integer: true });
    if (Number(row.bookedRooms) + Number(row.blockedRooms) > Number(row.totalRooms)) errors.push(`inventory[${index}] books or blocks more rooms than exist.`);
  });
  if (data.dailyMetrics.length) errors.push("dailyMetrics is derived operational reporting and must remain empty.");
  return errors.length ? { success: false, errors } : { success: true, data };
}
function assertHotelOnboardingData(value) {
  const result = validateHotelOnboardingData(value);
  if (!result.success) throw new Error(result.errors.slice(0, 8).join("\n"));
  return result.data;
}

// features/platform/onboarding/lib/hotelSeedSafety.ts
var DAY_MS = 864e5;
var HOTEL_SETUP_COMPLETION_KEY = "hotel:onboarding:completed";
async function inspectHotelSetup(prisma, requestHash) {
  const completed = await prisma.hotelSeedRecord.findUnique({ where: { seedKey: HOTEL_SETUP_COMPLETION_KEY } });
  if (completed) {
    if (completed.contentHash !== requestHash) {
      throw new Error("Hotel setup has already completed with different data. Use property, room and rate settings to make changes.");
    }
    return { replayed: true };
  }
  const records = await Promise.all([
    prisma.room.findFirst({ select: { id: true } }),
    prisma.roomType.findFirst({ select: { id: true } }),
    prisma.booking.findFirst({ select: { id: true } }),
    prisma.folio.findFirst({ select: { id: true } }),
    prisma.housekeepingTask.findFirst({ select: { id: true } }),
    prisma.maintenanceRequest.findFirst({ select: { id: true } }),
    prisma.hotelSeedRecord.findFirst({ select: { id: true } }),
    prisma.guest.findFirst({ select: { id: true } }),
    prisma.ratePlan.findFirst({ select: { id: true } }),
    prisma.channel.findFirst({ select: { id: true } }),
    prisma.roomInventory.findFirst({ select: { id: true } }),
    prisma.nightAuditRun.findFirst({ select: { id: true } })
  ]);
  if (records.some(Boolean)) {
    throw new Error("Hotel setup cannot replace existing rooms, reservations or operational data. Continue through the property settings and operating workspaces.");
  }
  return { replayed: false };
}
function day(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid property business date is required for hotel setup.");
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
function prepareHotelSeed(source, businessDate, relative) {
  const seed = structuredClone(source);
  const offset = relative ? day(businessDate) - Date.UTC(2026, 2, 12) : 0;
  const shift = (value) => new Date(day(value) + offset).toISOString();
  for (const section of ["bookings", "channelReservations"]) {
    for (const row of seed[section]) {
      row.checkInDate = shift(row.checkInDate);
      row.checkOutDate = shift(row.checkOutDate);
      if (relative && row.label) row.label = `${row.guestName} \xB7 ${row.roomType} \xB7 ${row.checkInDate.slice(0, 10)}\u2013${row.checkOutDate.slice(0, 10)}`;
    }
  }
  for (const row of seed.seasonalRates) {
    row.startDate = shift(row.startDate);
    row.endDate = shift(row.endDate);
  }
  for (const row of seed.ratePlans) {
    if (row.validFrom) row.validFrom = shift(row.validFrom);
    if (row.validTo) row.validTo = shift(row.validTo);
  }
  for (const row of seed.channelSyncEvents) row.occurredAt = shift(row.occurredAt);
  for (const booking of seed.bookings) {
    const rate = seed.ratePlans.find((item) => item.name === booking.ratePlan && item.roomType === booking.roomType);
    if (!rate) throw new Error(`Booking ${booking.key} is missing a compatible rate plan.`);
    const nights = (day(booking.checkOutDate) - day(booking.checkInDate)) / DAY_MS;
    if (nights < 1 || nights > 31) throw new Error(`Booking ${booking.key} is outside the supported stay range.`);
    const capturedMinor = seed.bookingPayments.filter((payment) => payment.bookingKey === booking.key && ["completed", "refunded"].includes(payment.status)).reduce((total, payment) => total + (payment.paymentType === "refund" ? -1 : 1) * Math.round(payment.amount * 100), 0);
    const totalMinor = Math.round(booking.totalAmount * 100);
    if (capturedMinor < 0 || capturedMinor > totalMinor) throw new Error(`Booking ${booking.key} payments do not reconcile to its commercial total.`);
    booking.depositAmount = capturedMinor / 100;
    booking.balanceDue = (totalMinor - capturedMinor) / 100;
    booking.paymentStatus = capturedMinor === totalMinor ? "paid" : capturedMinor ? "partial" : "unpaid";
    if (booking.status === "checked_in" && !(day(booking.checkInDate) <= day(businessDate) && day(booking.checkOutDate) > day(businessDate))) {
      throw new Error(`Checked-in demo booking ${booking.key} must contain the current business date.`);
    }
  }
  for (const room of seed.rooms) {
    const occupied = seed.bookings.some((booking) => booking.roomNumber === room.roomNumber && booking.status === "checked_in");
    if (occupied) room.status = "occupied";
    else if (room.status === "occupied") room.status = "vacant";
  }
  for (const row of seed.inventory) {
    row.date = shift(row.date);
    const rooms = seed.rooms.filter((room) => room.roomType === row.roomType);
    row.totalRooms = rooms.length;
    row.bookedRooms = 0;
    row.blockedRooms = rooms.filter((room) => ["maintenance", "out_of_order"].includes(room.status)).length;
    if (relative && row.label) row.label = `${row.roomType} \xB7 ${row.date.slice(0, 10)}`;
  }
  return seed;
}

// features/keystone/mutations/runHotelOnboarding.ts
init_hotelLifecycle();
init_hotelBusinessTime();
init_serializableTransaction();
init_channelCredentials();
var SEED_VERSION = "hotel-seed-v4";
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
  if (!session?.itemId || session.data?.isActive !== true || !session?.data?.role?.canManageOnboarding) {
    throw new Error("You do not have permission to run hotel onboarding.");
  }
}
function normalizeHotelOnboardingTemplate(value) {
  if (value === "full" || value === "minimal" || value === "custom") return value;
  throw new Error("Unsupported onboarding template.");
}
function canonicalSeedForTemplate(template, customData) {
  const source = template === "custom" ? customData : seed_default;
  if (template === "full" || template === "custom") return assertHotelOnboardingData(source);
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
  return assertHotelOnboardingData(result);
}
function confirmationNumber() {
  return `BK-SEED-${(0, import_node_crypto25.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
function paymentReference() {
  return `PAY-SEED-${(0, import_node_crypto25.randomUUID)().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
function canonicalSeedValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalSeedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key4, nested]) => [key4, canonicalSeedValue(nested)]));
  }
  return value;
}
function seedValuesMatch(existing, expected) {
  return Object.entries(expected).every(
    ([key4, value]) => value === void 0 || JSON.stringify(canonicalSeedValue(existing[key4] ?? null)) === JSON.stringify(canonicalSeedValue(value ?? null))
  );
}
function seedRowKey(section, row, index) {
  const natural = row?.key || row?.name || row?.roomNumber || row?.email || row?.externalId || row?.date;
  if (!natural) throw new Error(`Onboarding ${section}[${index}] requires a stable key.`);
  return `${section}:${String(natural).trim().toLowerCase()}`;
}
function seedContentHash(row) {
  return (0, import_node_crypto25.createHash)("sha256").update(JSON.stringify(row)).digest("hex");
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
  const inputSeed = canonicalSeedForTemplate(normalizedTemplate, data);
  const setupHash = hashLifecycleRequest({ template: normalizedTemplate, data: inputSeed });
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "the-alder-house-onboarding"
    );
    await lockHotelBusinessDate(prisma);
    const setup = await inspectHotelSetup(prisma, setupHash);
    if (setup.replayed) {
      await prisma.user.update({ where: { id: context.session.itemId }, data: { onboardingStatus: "completed" } });
      return { success: true, message: "Hotel setup was already completed. Existing operating data was preserved.", createdCount: 0, updatedCount: 0, skippedCount: 1 };
    }
    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock) throw new Error("Property business date is not configured. Complete the reviewed installation before hotel setup.");
    const seed = prepareHotelSeed(inputSeed, clock.currentBusinessDate, normalizedTemplate !== "custom");
    await prisma.user.update({ where: { id: context.session.itemId }, data: { onboardingStatus: "in_progress" } });
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
      let record2 = existing;
      if (!existing) {
        record2 = await prisma.roomType.create({ data: { name: roomType.name, ...data2 } });
        results.push("created");
      } else if (!seedValuesMatch(existing, { name: roomType.name, ...data2 })) {
        record2 = await prisma.roomType.update({ where: { id: existing.id }, data: { name: roomType.name, ...data2 } });
        results.push("updated");
      } else {
        results.push("skipped");
      }
      roomTypeIds[roomType.name] = record2.id;
      await bindSeedRecord(prisma, seedKey, "roomTypes", record2.id, roomType);
      for (const image2 of roomType.roomImages || []) {
        const { key: _imageSeedKey, ...imageData } = image2;
        const existingImage = await prisma.roomImage.findFirst({
          where: { roomTypeId: record2.id, imagePath: image2.imagePath }
        });
        if (existingImage) {
          if (!seedValuesMatch(existingImage, imageData)) {
            await prisma.roomImage.update({ where: { id: existingImage.id }, data: imageData });
            results.push("updated");
          } else results.push("skipped");
          await bindSeedRecord(prisma, `roomImages:${record2.id}:${image2.imagePath}`, "roomImages", existingImage.id, image2);
        } else {
          const createdImage = await prisma.roomImage.create({ data: { ...imageData, roomTypeId: record2.id } });
          await bindSeedRecord(prisma, `roomImages:${record2.id}:${image2.imagePath}`, "roomImages", createdImage.id, image2);
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
      let record2 = existing;
      if (!existing) {
        record2 = await prisma.room.create({ data: { roomNumber: room.roomNumber, status: room.status, ...roomData } });
        results.push("created");
      } else if (!seedValuesMatch(existing, { roomNumber: room.roomNumber, status: room.status, ...roomData })) {
        record2 = await prisma.room.update({ where: { id: existing.id }, data: { roomNumber: room.roomNumber, status: room.status, ...roomData } });
        results.push("updated");
      } else results.push("skipped");
      roomIds[room.roomNumber] = record2.id;
      await bindSeedRecord(prisma, seedKey, "rooms", record2.id, room);
    }
    const ratePlanIds = {};
    for (const [index, rate] of (seed.ratePlans || []).entries()) {
      const seedKey = seedRowKey("ratePlans", rate, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.ratePlan.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.ratePlan.findUnique({ where: { name: rate.name } });
      const { roomType, key: _rateSeedKey, ...sourceData } = rate;
      const rateData = { ...sourceData, baseRateMinor: Math.round(Number(rate.baseRate || 0) * 100), currencyCode: rate.currencyCode || "USD", roomTypeId: roomTypeIds[roomType] };
      let record2 = existing;
      if (!existing) {
        record2 = await prisma.ratePlan.create({ data: rateData });
        results.push("created");
      } else if (!seedValuesMatch(existing, rateData)) {
        record2 = await prisma.ratePlan.update({ where: { id: existing.id }, data: rateData });
        results.push("updated");
      } else results.push("skipped");
      ratePlanIds[rate.name] = record2.id;
      await bindSeedRecord(prisma, seedKey, "ratePlans", record2.id, rate);
    }
    for (const [index, rate] of (seed.seasonalRates || []).entries()) {
      const seedKey = seedRowKey("seasonalRates", rate, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.seasonalRate.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.seasonalRate.findFirst({ where: { name: rate.name } });
      const { roomType, key: _seasonSeedKey, ...data2 } = rate;
      const rateData = { ...data2, startDate: new Date(data2.startDate), endDate: new Date(data2.endDate), roomTypeId: roomTypeIds[roomType] };
      let record2 = existing;
      if (!existing) {
        record2 = await prisma.seasonalRate.create({ data: rateData });
        results.push("created");
      } else if (!seedValuesMatch(existing, rateData)) {
        record2 = await prisma.seasonalRate.update({ where: { id: existing.id }, data: rateData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "seasonalRates", record2.id, rate);
    }
    const guestIds = {};
    for (const [index, guest] of (seed.guests || []).entries()) {
      const seedKey = seedRowKey("guests", guest, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.guest.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.guest.findUnique({ where: { email: guest.email } });
      let record2 = existing;
      const safeData = Object.fromEntries(Object.entries(guest).filter(([key4]) => !["key", "totalStays", "totalSpent", "lastStayAt", "loyaltyPoints", "loyaltyTier"].includes(key4)));
      if (!existing) {
        record2 = await prisma.guest.create({ data: safeData });
        results.push("created");
      } else {
        if (!seedValuesMatch(existing, safeData)) {
          record2 = await prisma.guest.update({ where: { id: existing.id }, data: safeData });
          results.push("updated");
        } else results.push("skipped");
      }
      guestIds[guest.email] = record2.id;
      await bindSeedRecord(prisma, seedKey, "guests", record2.id, guest);
    }
    const bookingIds = {};
    for (const [index, booking] of (seed.bookings || []).entries()) {
      const marker = `seed:${booking.key}`;
      const seedKey = seedRowKey("bookings", booking, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.booking.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.booking.findFirst({ where: { internalNotes: { startsWith: marker } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      let record2 = existing;
      if (!record2) {
        const token = createGuestAccessToken();
        const ratePlan = seed.ratePlans.find((rate) => rate.name === booking.ratePlan);
        const nights = Math.round((new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 864e5);
        const roomSubtotalMinor = Math.round(booking.roomRate * 100);
        const nightlyAmounts = allocateMinorUnits(roomSubtotalMinor, nights);
        record2 = await prisma.booking.create({
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
            ratePlanId: ratePlanIds[booking.ratePlan],
            pricingVersion: SEED_VERSION,
            pricingRevision: 1,
            pricingSnapshot: {
              snapshotKeyPrefix: "v1",
              ratePlanId: ratePlanIds[booking.ratePlan],
              ratePlanName: ratePlan.name,
              cancellationPolicy: ratePlan.cancellationPolicy,
              mealPlan: ratePlan.mealPlan,
              arrivalInstant: propertyArrivalInstant(new Date(booking.checkInDate), seed.hotelSettings.checkInTime || "15:00", seed.hotelSettings.timeZone || "UTC").toISOString(),
              propertyTimeZone: seed.hotelSettings.timeZone || "UTC",
              taxRateBasisPoints: seed.hotelSettings.taxRateBasisPoints,
              nightlyRates: nightlyAmounts.map((amountMinor, index2) => ({ date: new Date(new Date(booking.checkInDate).getTime() + index2 * 864e5).toISOString(), amountMinor })),
              roomSubtotalMinor,
              taxMinor: Math.round(booking.taxAmount * 100),
              feesMinor: Math.round(booking.feesAmount * 100),
              totalMinor: Math.round(booking.totalAmount * 100),
              currencyCode: booking.currencyCode || "USD"
            },
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            source: booking.source,
            specialRequests: booking.specialRequests,
            internalNotes: marker,
            guestProfileId: guestIds[booking.guestEmail],
            guestAccessTokenHash: hashGuestAccessToken(token),
            guestAccessTokenIssuedAt: /* @__PURE__ */ new Date(),
            holdExpiresAt: booking.status === "pending" ? new Date(Date.now() + 2 * 60 * 6e4) : null,
            checkedInAt: booking.status === "checked_in" ? new Date(booking.checkInDate) : null,
            confirmedAt: ["confirmed", "checked_in", "checked_out"].includes(booking.status) ? /* @__PURE__ */ new Date() : null
          }
        });
        await prisma.roomAssignment.create({
          data: {
            bookingId: record2.id,
            roomId: roomIds[booking.roomNumber],
            roomTypeId: roomTypeIds[booking.roomType],
            guestName: booking.guestName,
            ratePerNightMinor: Math.round(Number(booking.roomRate || 0) * 100 / Math.max(1, Math.round((new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 864e5))),
            ratePerNight: Math.round(roomSubtotalMinor / nights) / 100,
            specialRequests: booking.specialRequests
          }
        });
      }
      bookingIds[booking.key] = record2.id;
      await bindSeedRecord(prisma, seedKey, "bookings", record2.id, booking);
      await ensureBookingHasGuestAccess(transactionContext, record2.id);
      results.push(existing ? "skipped" : "created");
    }
    const allBookings = await prisma.booking.findMany({ where: { id: { in: Object.values(bookingIds) } }, select: { id: true, status: true, folio: { select: { status: true } } } });
    for (const booking of allBookings) {
      await ensureBookingHasGuestAccess(transactionContext, booking.id);
      const snapshotResult = await ensureReservationSnapshots(
        transactionContext,
        booking.id
      );
      results.push(...Array(snapshotResult.created).fill("created"));
      results.push(...Array(snapshotResult.existing).fill("skipped"));
      const folioResult2 = await ensureBookingFolio(transactionContext, booking.id, {
        postSnapshotEntries: booking.status === "checked_in",
        serviceDate: clock.currentBusinessDate
      });
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
      const record2 = existing || await prisma.bookingPayment.create({
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
      await bindSeedRecord(prisma, seedKey, "bookingPayments", record2.id, payment);
      results.push(existing ? "skipped" : "created");
    }
    const settledPayments = await prisma.bookingPayment.findMany({
      where: { bookingId: { in: Object.values(bookingIds) }, status: { in: ["completed", "refunded"] } },
      select: { id: true },
      orderBy: { id: "asc" }
    });
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
      let record2 = (binding ? await prisma.housekeepingTask.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.housekeepingTask.findFirst({ where: { roomId: roomIds[task.roomNumber], taskType: task.taskType, notes: task.notes }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const taskData = { roomId: roomIds[task.roomNumber], taskType: task.taskType, priority: task.priority, notes: task.notes };
      if (!record2) {
        record2 = await prisma.housekeepingTask.create({ data: { ...taskData, status: task.status } });
        results.push("created");
      } else if (!seedValuesMatch(record2, taskData)) {
        record2 = await prisma.housekeepingTask.update({ where: { id: record2.id }, data: taskData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "housekeepingTasks", record2.id, task);
    }
    for (const [index, request] of (seed.maintenanceRequests || []).entries()) {
      const seedKey = seedRowKey("maintenanceRequests", request, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      let record2 = (binding ? await prisma.maintenanceRequest.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.maintenanceRequest.findFirst({ where: { roomId: roomIds[request.roomNumber], title: request.title, description: request.description }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const requestData = { roomId: roomIds[request.roomNumber], title: request.title, description: request.description, category: request.category, priority: request.priority, notes: request.notes };
      if (!record2) {
        record2 = await prisma.maintenanceRequest.create({ data: { ...requestData, status: request.status } });
        results.push("created");
      } else if (!seedValuesMatch(record2, requestData)) {
        record2 = await prisma.maintenanceRequest.update({ where: { id: record2.id }, data: requestData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "maintenanceRequests", record2.id, request);
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
        credentials: encryptChannelCredentials(channel.credentials || {})
      };
      let record2 = existing;
      if (!record2) {
        record2 = await prisma.channel.create({ data: { name: channel.name, ...channelData } });
        results.push("created");
      } else if (!seedValuesMatch(record2, { name: channel.name, ...channelData })) {
        record2 = await prisma.channel.update({ where: { id: record2.id }, data: { name: channel.name, ...channelData } });
        results.push("updated");
      } else results.push("skipped");
      channelIds[channel.name] = record2.id;
      await bindSeedRecord(prisma, seedKey, "channels", record2.id, channel);
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
      let record2 = existing;
      if (!record2) {
        record2 = await prisma.channelReservation.create({ data: reservationData });
        results.push("created");
      } else if (!seedValuesMatch(record2, reservationData)) {
        record2 = await prisma.channelReservation.update({ where: { id: record2.id }, data: reservationData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "channelReservations", record2.id, reservation);
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
      let record2 = existing;
      if (!record2) {
        record2 = await prisma.channelSyncEvent.create({ data: eventData });
        results.push("created");
      } else if (!seedValuesMatch(record2, eventData)) {
        record2 = await prisma.channelSyncEvent.update({ where: { id: record2.id }, data: eventData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "channelSyncEvents", record2.id, event);
    }
    for (const [index, entry] of (seed.loyaltyTransactions || []).entries()) {
      const seedKey = seedRowKey("loyaltyTransactions", entry, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.loyaltyTransaction.findUnique({ where: { id: binding.entityId } }) : null) || await prisma.loyaltyTransaction.findFirst({ where: { guestId: guestIds[entry.guestEmail], description: entry.description, type: entry.type }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const entryData = { guestId: guestIds[entry.guestEmail], bookingId: bookingIds[entry.bookingKey], points: entry.points, type: entry.type, description: entry.description };
      let record2 = existing;
      if (!record2) {
        record2 = await prisma.loyaltyTransaction.create({ data: entryData });
        results.push("created");
      } else if (!seedValuesMatch(record2, entryData)) {
        record2 = await prisma.loyaltyTransaction.update({ where: { id: record2.id }, data: entryData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "loyaltyTransactions", record2.id, entry);
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
      let record2 = existing;
      if (!record2) {
        record2 = await prisma.roomInventory.create({ data: {
          roomTypeId: roomTypeIds[inventory.roomType],
          inventoryKey: buildInventoryKey(roomTypeIds[inventory.roomType], date),
          date,
          ...inventoryData
        } });
        results.push("created");
      } else if (!seedValuesMatch(record2, inventoryData)) {
        record2 = await prisma.roomInventory.update({ where: { id: record2.id }, data: inventoryData });
        results.push("updated");
      } else results.push("skipped");
      await bindSeedRecord(prisma, seedKey, "inventory", record2.id, inventory);
    }
    await prisma.hotelSeedRecord.create({ data: {
      seedKey: HOTEL_SETUP_COMPLETION_KEY,
      section: "setup",
      entityId: "1",
      contentHash: setupHash,
      seedVersion: SEED_VERSION
    } });
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

// features/keystone/mutations/postFolioEntry.ts
init_access();

// features/keystone/lib/folioPosting.ts
init_hotelGuestGovernance();
var import_node_crypto26 = require("node:crypto");
init_bookingFolio();

// features/keystone/lib/folioPostingPolicy.ts
function assertNewOperatorPostingAllowed(folioStatus) {
  if (folioStatus !== "open") {
    throw new Error("Closed or voided folios cannot accept new operator postings.");
  }
}

// features/keystone/lib/folioPosting.ts
init_serializableTransaction();
init_hotelCashier();
init_hotelBusinessTime();
init_folioLedger();
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
async function lock3(prisma, key4) {
  await prisma.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    key4
  );
}
async function folioResult(prisma, entry, replayed) {
  const entries = must4(await prisma.folioEntry.findMany({
    where: { folioId: entry.folioId },
    select: { direction: true, amountMinor: true, currencyCode: true }
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
  serviceDate,
  approvalId
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
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lock3(prisma, `hotel-booking:${bookingId}`);
    await lock3(prisma, `hotel-folio-booking:${bookingId}`);
    const ensured = await ensureBookingFolio(transactionContext, bookingId);
    if (posting.currencyCode !== ensured.currencyCode) throw new Error("Posting currency does not match the folio currency.");
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
    if (direction === "credit") {
      const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
      if (amountMinor >= Number(settings?.writeOffApprovalThresholdMinor ?? 0)) await requireHotelApproval(prisma, { approvalId, action: "write_off", aggregateId: bookingId, amountMinor, actorId: context.session.itemId, operationKey: posting.postingKey });
    }
    const parsedServiceDate = await currentPostingDate(prisma, serviceDate);
    const entry = must4(await prisma.folioEntry.create({
      data: {
        ...expected,
        serviceDate: parsedServiceDate,
        postedAt: /* @__PURE__ */ new Date(),
        postedById: context.session.itemId,
        metadataSnapshot: { actorId: context.session.itemId }
      }
    }));
    const balance = await getBookingCollectibleBalance(transactionContext, bookingId);
    await prisma.booking.update({ where: { id: bookingId }, data: { balanceDueMinor: balance.balanceDueMinor, balanceDue: balance.balanceDueMinor / 100 } });
    return folioResult(prisma, entry, false);
  });
}
async function reverseFolioPosting({
  context,
  entryId,
  postingKey,
  reason,
  approvalId
}) {
  const normalizedPostingKey = normalizePostingKey(postingKey);
  const normalizedReason = normalizeDescription(reason, "reason");
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lock3(prisma, `hotel-folio-entry:${entryId}`);
    const original = await prisma.folioEntry.findUnique({
      where: { id: entryId },
      include: { folio: true, reversedBy: true }
    });
    if (!original?.folioId || !original.folio) throw new Error("Folio entry not found.");
    if (original.folio.status !== "open") {
      throw new Error("Closed or voided folios cannot accept reversals.");
    }
    if (original.postingKey.startsWith("hotel-loyalty:")) throw new Error("Loyalty postings must be corrected through the points ledger.");
    if (original.entryType === "transfer") throw new Error("Transferred receivables must be corrected through their invoice lifecycle, not generic folio reversal.");
    if (["payment", "refund"].includes(original.entryType)) {
      throw new Error("Payment and refund entries must be corrected through the payment domain.");
    }
    if (original.reversedBy) {
      if (original.reversedBy.postingKey !== normalizedPostingKey || original.reversedBy.metadataSnapshot?.reason !== normalizedReason || original.reversedBy.postedById !== context.session.itemId) {
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
    if (original.direction === "debit") {
      const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
      if (original.amountMinor >= Number(settings?.writeOffApprovalThresholdMinor ?? 0)) await requireHotelApproval(prisma, { approvalId, action: "write_off", aggregateId: original.folio.bookingId || original.folio.id, amountMinor: original.amountMinor, actorId: context.session.itemId, operationKey: normalizedPostingKey });
    }
    const now = /* @__PURE__ */ new Date();
    const serviceDay = await currentPostingDate(prisma);
    const entry = await prisma.folioEntry.create({
      data: {
        ...posting,
        folioId: original.folioId,
        serviceDate: serviceDay,
        postedAt: now,
        postedById: context.session.itemId
      }
    });
    if (original.folio.bookingId) {
      const balance = await getBookingCollectibleBalance(transactionContext, original.folio.bookingId);
      await prisma.booking.update({ where: { id: original.folio.bookingId }, data: { balanceDueMinor: balance.balanceDueMinor, balanceDue: balance.balanceDueMinor / 100 } });
    }
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
  const paymentId = `manual_${(0, import_node_crypto26.createHash)("sha256").update(`${bookingId}:${normalizedKey}`).digest("hex").slice(0, 24)}`;
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lock3(prisma, `hotel-booking:${bookingId}`);
    await lock3(prisma, `hotel-folio-booking:${bookingId}`);
    await lock3(prisma, `hotel-folio-operator-payment:${normalizedKey}`);
    const booking = must4(await prisma.booking.findUnique({ where: { id: bookingId } }));
    if (!booking) throw new Error("Booking not found.");
    const provider = must4(await prisma.paymentProvider.findUnique({
      where: { code: "pp_manual_manual" }
    }));
    if (!provider) throw new Error("Manual payment provider is not configured.");
    const existingPayment = must4(await prisma.bookingPayment.findUnique({ where: { id: paymentId } }));
    if (existingPayment) {
      const evidence2 = existingPayment.providerData || {};
      if (existingPayment.bookingId !== bookingId || Math.round(Number(existingPayment.amount) * 100) !== amountMinor || existingPayment.currency !== validated.currencyCode || existingPayment.paymentMethod !== paymentMethod || existingPayment.description !== normalizedDescription || evidence2.operatorPostingKey !== normalizedKey) {
        throw new Error("postingKey is already bound to different payment evidence.");
      }
      const entry2 = await ensurePaymentFolioPosting(transactionContext, existingPayment.id);
      return folioResult(prisma, entry2, true);
    }
    const collectibleBefore = await getBookingCollectibleBalance(transactionContext, bookingId);
    if (amountMinor > collectibleBefore.balanceDueMinor) throw new Error("Payment exceeds the current collectible folio balance. Refresh before collecting.");
    const now = /* @__PURE__ */ new Date();
    const cashierShiftId = paymentMethod === "cash" ? await assertActiveCashierShift(prisma, context.session.itemId, validated.currencyCode) : null;
    const payment = must4(await prisma.bookingPayment.create({
      data: {
        id: paymentId,
        paymentReference: `PAY-${(0, import_node_crypto26.randomUUID)().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
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
          recordedBy: context.session.itemId,
          cashierShiftId
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
    const remainingMinor = (await getBookingCollectibleBalance(transactionContext, bookingId)).balanceDueMinor;
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
  serviceDate,
  approvalId
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
    serviceDate,
    approvalId
  });
}

// features/keystone/mutations/reverseFolioEntry.ts
init_access();
async function reverseFolioEntry(root, {
  entryId,
  postingKey,
  reason,
  approvalId
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to reverse folio entries.");
  }
  return reverseFolioPosting({ context, entryId, postingKey, reason, approvalId });
}

// features/keystone/mutations/recordBookingPayment.ts
init_access();
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
init_access();
init_folioLedger();
init_hotelLifecycle();
init_serializableTransaction();
var TERMINAL_BOOKING_STATUSES = /* @__PURE__ */ new Set(["checked_out", "cancelled", "no_show"]);
async function closeReconciledFolio(_root, {
  bookingId,
  idempotencyKey
}, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to close reconciled folios.");
  }
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A bounded idempotencyKey is required.");
  const eventKey = `folio:reconciled-close:${key4}`;
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
      include: { folio: { include: { entries: { select: { direction: true, amountMinor: true, currencyCode: true } } } } }
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
init_access();
init_hotelLifecycle();
init_serializableTransaction();
var TRANSITIONS4 = {
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
  idempotencyKey,
  expectedStatus,
  expectedUpdatedAt
}, context) {
  if (!permissions.canManageHousekeeping({ session: context.session })) {
    throw new Error("Not authorized to update housekeeping tasks.");
  }
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error("A stable idempotencyKey is required.");
  if (!TRANSITIONS4[status]) throw new Error("Unsupported housekeeping status.");
  const normalizedNotes = notes?.trim() || null;
  const request = { taskId, status, assignedToId: assignedToId || null, notes: normalizedNotes, expectedStatus: expectedStatus || null, expectedUpdatedAt: expectedUpdatedAt || null };
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
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-room:${task.roomId}`);
    const effectiveAssigneeId = assignedToId === void 0 ? task.assignedToId : assignedToId;
    if (effectiveAssigneeId) await assertHousekeepingStaffEligible(prisma, effectiveAssigneeId, task);
    else if (["in_progress", "completed"].includes(status)) await assertHousekeepingStaffEligible(prisma, context.session.itemId, task);
    if (expectedUpdatedAt && (!task.updatedAt || new Date(expectedUpdatedAt).getTime() !== new Date(task.updatedAt).getTime())) throw new Error("Task assignment or notes changed; refresh and resolve the offline update conflict.");
    if (expectedStatus && task.status !== expectedStatus) throw new Error(`Task changed from ${expectedStatus} to ${task.status}; refresh and resolve the offline update conflict.`);
    if (task.status === status && assignedToId === void 0 && !normalizedNotes) throw new Error(`Housekeeping task is already ${status}.`);
    if (task.status !== status && !TRANSITIONS4[task.status]?.has(status)) {
      throw new Error(`Housekeeping status cannot transition from ${task.status} to ${status}.`);
    }
    if (task.taskType === "inspection" && status === "completed" && !normalizedNotes?.includes("Inspection: cleanliness, room safety and repair completion checked.")) throw new Error("Record the inspection checklist in the dispatch panel before completing inspection.");
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
    roomStatus = await safeRoomCondition(prisma, task.roomId, task.room.status, roomStatus);
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
init_rateEconomics();
init_hotelGuestGovernance();
init_access();
init_hotelLifecycle();
init_serializableTransaction();
init_hotelBusinessTime();
var RATE_STATUSES2 = /* @__PURE__ */ new Set(["active", "inactive", "draft"]);
async function updateRatePlanPublication(root, {
  approvalId,
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
  if (status != null && !RATE_STATUSES2.has(status)) throw new Error("Unsupported rate plan status.");
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
    await lockHotelBusinessDate(prisma);
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
    const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (settings?.ratePublicationRequiresApproval !== false) await requireHotelApproval(prisma, { approvalId, action: "rate_publish", aggregateId: ratePlanId, amountMinor: 0, actorId: context.session.itemId, operationKey: eventKey, parameters: { status: nextStatus, isPublic: nextIsPublic, economicsHash: (await loadRateEconomics(prisma, ratePlanId)).economicsHash } });
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

// features/keystone/lib/hotelReporting.ts
init_roomOutages();
init_hotelBusinessTime();
var DAY_MS2 = 864e5;
var ACTIVE_RESERVATIONS = /* @__PURE__ */ new Set(["confirmed", "checked_in", "checked_out"]);
var REPORTING_SNAPSHOT_VERSION = 1;
function hotelReportingDayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}
function classifyHotelLedgerEntry(entry, currencyCode) {
  if (entry.currencyCode !== currencyCode || !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 || !["debit", "credit"].includes(entry.direction)) {
    throw new Error("Reporting refused an invalid or mixed-currency folio posting.");
  }
  const result = { roomRevenueMinor: 0, taxMinor: 0, feeMinor: 0, totalRevenueMinor: 0, paymentsMinor: 0, refundsMinor: 0 };
  const signed = entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor;
  const kind = entry.entryType === "reversal" ? entry.reverses?.entryType || entry.metadataSnapshot?.reversedEntryType : entry.entryType;
  if (kind === "payment") result.paymentsMinor = -signed;
  else if (kind === "refund") result.refundsMinor = signed;
  else if (kind === "transfer") return result;
  else if (kind === "room_charge") result.roomRevenueMinor = signed;
  else if (kind === "tax") result.taxMinor = signed;
  else if (["fee", "addon", "adjustment"].includes(kind)) result.feeMinor = signed;
  else throw new Error("Reporting refused a folio entry without a recognized economic classification.");
  result.totalRevenueMinor = result.roomRevenueMinor + result.taxMinor + result.feeMinor;
  return result;
}
function hotelAvailableRoomNights(type, inventory, date, businessDate, outages = []) {
  const historic = hotelReportingDayKey(date) < hotelReportingDayKey(businessDate);
  const rooms = type.rooms.filter((room) => !historic || !room.createdAt || new Date(room.createdAt).getTime() < date.getTime() + DAY_MS2);
  const total = inventory ? Number(inventory.totalRooms) : rooms.length;
  const datedBlocked = Number(inventory?.blockedRooms || 0);
  const currentBlocked = rooms.filter((room) => !historic && ["maintenance", "out_of_order"].includes(room.status) || outages.some((outage) => roomOutageOverlaps(outage, room.id, date, new Date(date.getTime() + DAY_MS2)))).length;
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(datedBlocked) || datedBlocked < 0) throw new Error("Reporting encountered invalid dated room supply.");
  return Math.max(0, total - Math.max(datedBlocked, currentBlocked));
}
function buildHotelReportingDay(input) {
  const { date, businessDate, currencyCode, roomTypes, inventories, bookings, entries } = input;
  const key4 = hotelReportingDayKey(date);
  const next2 = new Date(date.getTime() + DAY_MS2);
  const beforeClose = !input.closing && key4 >= hotelReportingDayKey(businessDate);
  const active = bookings.filter((booking) => ACTIVE_RESERVATIONS.has(booking.status));
  const occupied = active.filter((booking) => new Date(booking.checkInDate) < next2 && new Date(booking.checkOutDate) > date && (beforeClose || ["checked_in", "checked_out"].includes(booking.status)));
  const typeMap = new Map(roomTypes.map((type) => [type.id, {
    id: type.id,
    name: type.name,
    availableRoomNights: hotelAvailableRoomNights(type, inventories.find((row) => row.roomTypeId === type.id && hotelReportingDayKey(row.date) === key4), date, businessDate, input.outages),
    occupiedRoomNights: 0,
    roomRevenueMinor: 0
  }]));
  const lineMap = /* @__PURE__ */ new Map();
  for (const booking of bookings) for (const line of booking.lineItems || []) lineMap.set(line.id, line);
  for (const booking of occupied) {
    const datedLine = (booking.lineItems || []).find((line) => line.type === "room" && line.snapshotStatus !== "superseded" && hotelReportingDayKey(line.date) === key4);
    const typeId = datedLine?.roomTypeIdSnapshot || booking.roomAssignments?.[0]?.roomTypeId;
    const type = typeMap.get(typeId);
    if (type) type.occupiedRoomNights += 1;
  }
  const revenue = { roomRevenueMinor: 0, taxMinor: 0, feeMinor: 0, totalRevenueMinor: 0, paymentsMinor: 0, refundsMinor: 0 };
  const channelMap = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (hotelReportingDayKey(entry.serviceDate || entry.postedAt) !== key4) continue;
    const classified = classifyHotelLedgerEntry(entry, currencyCode);
    for (const field of Object.keys(revenue)) revenue[field] += classified[field];
    const booking = entry.folio?.booking;
    const sourceLineId = entry.entryType === "reversal" ? entry.reverses?.sourceId : entry.sourceId;
    const line = lineMap.get(sourceLineId);
    const typeId = line?.roomTypeIdSnapshot || booking?.roomAssignments?.[0]?.roomTypeId;
    if (typeMap.has(typeId)) typeMap.get(typeId).roomRevenueMinor += classified.roomRevenueMinor;
    if (classified.totalRevenueMinor && booking) {
      const source = booking.source || "direct";
      const channel = channelMap.get(source) || { source, bookingIds: [], revenueMinor: 0 };
      if (!channel.bookingIds.includes(booking.id)) channel.bookingIds.push(booking.id);
      channel.revenueMinor += classified.totalRevenueMinor;
      channelMap.set(source, channel);
    }
  }
  if (Object.values(revenue).some((value) => !Number.isSafeInteger(value))) throw new Error("Reporting totals exceed safe integer bounds.");
  const availableRoomNights = [...typeMap.values()].reduce((total, type) => total + type.availableRoomNights, 0);
  const occupiedRoomNights = occupied.length;
  return {
    version: REPORTING_SNAPSHOT_VERSION,
    date: date.toISOString(),
    currencyCode,
    day: {
      date: date.toISOString(),
      availableRoomNights,
      occupiedRoomNights,
      occupancyRate: availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0,
      ...revenue,
      adrMinor: occupiedRoomNights ? Math.round(revenue.roomRevenueMinor / occupiedRoomNights) : 0,
      revparMinor: availableRoomNights ? Math.round(revenue.roomRevenueMinor / availableRoomNights) : 0,
      arrivals: active.filter((booking) => hotelReportingDayKey(booking.checkInDate) === key4).length,
      departures: active.filter((booking) => hotelReportingDayKey(booking.checkOutDate) === key4).length,
      newReservations: bookings.filter((booking) => hotelReportingDayKey(booking.createdAt) === key4).length,
      cancellations: bookings.filter((booking) => booking.status !== "no_show" && booking.cancelledAt && hotelReportingDayKey(booking.cancelledAt) === key4).length,
      noShows: bookings.filter((booking) => booking.status === "no_show" && hotelReportingDayKey(booking.checkInDate) === key4).length
    },
    roomTypes: [...typeMap.values()],
    channels: [...channelMap.values()]
  };
}
async function loadHotelReportingFacts(prisma, start, end) {
  const [settings, clock, roomTypes, inventories, bookings, entries, outages] = await Promise.all([
    prisma.hotelSettings.findUnique({ where: { id: 1 } }),
    prisma.hotelBusinessDate.findUnique({ where: { id: 1 } }),
    prisma.roomType.findMany({ orderBy: { name: "asc" }, include: { rooms: true } }),
    prisma.roomInventory.findMany({ where: { date: { gte: start, lt: end } }, orderBy: [{ date: "asc" }, { roomTypeId: "asc" }], take: 20001 }),
    prisma.booking.findMany({
      where: { OR: [{ checkOutDate: { gt: start }, checkInDate: { lt: end } }, { createdAt: { gte: start, lt: end } }, { cancelledAt: { gte: start, lt: end } }, { folio: { entries: { some: { serviceDate: { gte: start, lt: end } } } } }] },
      orderBy: [{ checkInDate: "asc" }, { id: "asc" }],
      take: 5001,
      include: { roomAssignments: { take: 1 }, lineItems: true }
    }),
    prisma.folioEntry.findMany({
      where: { serviceDate: { gte: start, lt: end } },
      orderBy: [{ postedAt: "asc" }, { id: "asc" }],
      take: 20001,
      include: { reverses: { select: { entryType: true, sourceId: true } }, folio: { include: { booking: { select: { id: true, source: true, roomAssignments: { take: 1, select: { roomTypeId: true } } } } } } }
    }),
    loadRoomOutages(prisma)
  ]);
  if (!settings || !clock) throw new Error("Hotel settings and property business date must be configured.");
  if (inventories.length > 2e4 || bookings.length > 5e3 || entries.length > 2e4) throw new Error("Reporting range exceeds the supported dataset; request a shorter period.");
  return { settings, clock, roomTypes, inventories, bookings, entries, outages };
}
async function captureHotelReportingDay(prisma, businessDate) {
  const end = new Date(businessDate.getTime() + 91 * DAY_MS2);
  const facts = await loadHotelReportingFacts(prisma, businessDate, end);
  return {
    ...buildHotelReportingDay({ ...facts, date: businessDate, businessDate, closing: true, currencyCode: facts.settings.currencyCode || "USD" }),
    demandSnapshot: buildHotelDemandSnapshot(facts, new Date(businessDate.getTime() + DAY_MS2), end, businessDate)
  };
}
function buildHotelDemandSnapshot(facts, start, end, asOfBusinessDate) {
  const currencyCode = facts.settings.currencyCode || "USD";
  const active = facts.bookings.filter((booking) => ["confirmed", "checked_in"].includes(booking.status) && new Date(booking.checkInDate) < end && new Date(booking.checkOutDate) > start);
  const leadTimes = active.map((booking) => Math.max(0, Math.round((new Date(booking.checkInDate).getTime() - propertyCalendarDate(new Date(booking.createdAt), facts.settings.timeZone || "UTC").getTime()) / DAY_MS2)));
  const days = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS2) {
    const date = new Date(cursor);
    const key4 = hotelReportingDayKey(date);
    const next2 = new Date(cursor + DAY_MS2);
    const bookings = active.filter((booking) => new Date(booking.checkInDate) < next2 && new Date(booking.checkOutDate) > date);
    let roomRevenueMinor = 0;
    let unpricedRoomNights = 0;
    for (const booking of bookings) {
      const lines = (booking.lineItems || []).filter((line) => line.type === "room" && line.snapshotStatus !== "superseded" && hotelReportingDayKey(line.date) === key4);
      if (lines.length !== 1 || !Number.isSafeInteger(lines[0].totalPrice) || lines[0].totalPrice < 0 || lines[0].currencyCode !== currencyCode) {
        unpricedRoomNights += 1;
        continue;
      }
      roomRevenueMinor += lines[0].totalPrice;
    }
    if (!Number.isSafeInteger(roomRevenueMinor)) throw new Error("Demand forecast exceeds safe integer amounts.");
    const availableRoomNights = facts.roomTypes.reduce((total, type) => total + hotelAvailableRoomNights(type, facts.inventories.find((row) => row.roomTypeId === type.id && hotelReportingDayKey(row.date) === key4), date, facts.clock.currentBusinessDate, facts.outages), 0);
    days.push({ date: key4, onBooksRoomNights: bookings.length, availableRoomNights, roomRevenueMinor, unpricedRoomNights });
  }
  const bands = [{ label: "0\u20132 days", min: 0, max: 2 }, { label: "3\u20137 days", min: 3, max: 7 }, { label: "8\u201330 days", min: 8, max: 30 }, { label: "31+ days", min: 31, max: Infinity }].map((band) => ({ label: band.label, reservations: leadTimes.filter((days2) => days2 >= band.min && days2 <= band.max).length }));
  return { version: 1, asOfBusinessDate: hotelReportingDayKey(asOfBusinessDate), capturedAt: (/* @__PURE__ */ new Date()).toISOString(), start: hotelReportingDayKey(start), end: hotelReportingDayKey(end), currencyCode, days, leadTime: { reservations: leadTimes.length, averageDays: leadTimes.length ? Math.round(leadTimes.reduce((total, days2) => total + days2, 0) / leadTimes.length * 10) / 10 : null, bands } };
}
function compareHotelDemandSnapshots(current, previous, businessDate) {
  const sum = (days, field) => days.reduce((total, day2) => total + Number(day2[field]), 0);
  const totals = { roomNights: sum(current.days, "onBooksRoomNights"), availableRoomNights: sum(current.days, "availableRoomNights"), roomRevenueMinor: sum(current.days, "roomRevenueMinor"), unpricedRoomNights: sum(current.days, "unpricedRoomNights") };
  const pace = [1, 7, 30].map((daysAgo) => {
    const target = hotelReportingDayKey(new Date(businessDate.getTime() - daysAgo * DAY_MS2));
    const snapshot = previous.filter((snapshot2) => snapshot2.version === 1 && snapshot2.currencyCode === current.currencyCode && snapshot2.asOfBusinessDate <= target).sort((left, right) => right.asOfBusinessDate.localeCompare(left.asOfBusinessDate))[0];
    const baselineDays = current.days.map((day2) => snapshot?.days.find((prior) => prior.date === day2.date));
    if (!snapshot || !current.days.length || baselineDays.some((day2) => !day2)) return { daysAgo, available: false, asOfBusinessDate: null, priorRoomNights: null, pickupRoomNights: null, pickupRoomRevenueMinor: null };
    const priorRoomNights = sum(baselineDays, "onBooksRoomNights");
    return { daysAgo, available: true, asOfBusinessDate: snapshot.asOfBusinessDate, priorRoomNights, pickupRoomNights: totals.roomNights - priorRoomNights, pickupRoomRevenueMinor: totals.unpricedRoomNights || sum(baselineDays, "unpricedRoomNights") ? null : totals.roomRevenueMinor - sum(baselineDays, "roomRevenueMinor") };
  });
  return { ...current, totals, pace, basis: "Current confirmed and in-house room-night pricing snapshots. Pending holds, cancelled reservations, no-shows and unpicked group allotments are excluded. Pickup compares the same stay dates against actual preserved close snapshots; it includes cancellations and amendments and is not recognized revenue." };
}
async function getHotelOperationalReport(prisma, start, end) {
  const [facts, audits, openFolios] = await Promise.all([
    loadHotelReportingFacts(prisma, start, end),
    prisma.hotelAuditEvent.findMany({ where: { aggregateType: "night_audit", action: "completed", aggregateId: { gte: hotelReportingDayKey(start), lt: hotelReportingDayKey(end) } }, select: { afterSnapshot: true }, take: 20001, orderBy: { occurredAt: "asc" } }),
    prisma.folio.findMany({ where: { status: "open" }, take: 2001, include: { entries: { select: { direction: true, amountMinor: true, currencyCode: true } } } })
  ]);
  if (audits.length > 2e4 || openFolios.length > 2e3) throw new Error("Reporting history exceeds the supported dataset; an archival reporting workflow is required.");
  const snapshots = /* @__PURE__ */ new Map();
  for (const audit of audits) {
    const snapshot = audit.afterSnapshot?.reportingDay;
    if (snapshot?.version === REPORTING_SNAPSHOT_VERSION && snapshot.date) snapshots.set(hotelReportingDayKey(snapshot.date), snapshot);
  }
  const slices = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS2) {
    const date = new Date(cursor);
    const frozen = snapshots.get(hotelReportingDayKey(date));
    const snapshot = frozen || buildHotelReportingDay({ ...facts, date, businessDate: facts.clock.currentBusinessDate, currencyCode: facts.settings.currencyCode || "USD" });
    if (snapshot.currencyCode !== (facts.settings.currencyCode || "USD")) throw new Error("Historical reporting currency differs from the current property currency.");
    slices.push(snapshot);
  }
  const days = slices.map((slice) => slice.day);
  const sum = (field) => days.reduce((total, value) => total + Number(value[field] || 0), 0);
  const availableRoomNights = sum("availableRoomNights");
  const occupiedRoomNights = sum("occupiedRoomNights");
  const roomRevenueMinor = sum("roomRevenueMinor");
  const channels = /* @__PURE__ */ new Map();
  const roomTypes = /* @__PURE__ */ new Map();
  for (const slice of slices) {
    for (const channel of slice.channels) {
      const aggregate = channels.get(channel.source) || { source: channel.source, bookingIds: /* @__PURE__ */ new Set(), revenueMinor: 0 };
      for (const id of channel.bookingIds) aggregate.bookingIds.add(id);
      aggregate.revenueMinor += channel.revenueMinor;
      channels.set(channel.source, aggregate);
    }
    for (const type of slice.roomTypes) {
      const aggregate = roomTypes.get(type.id) || { id: type.id, name: type.name, availableRoomNights: 0, occupiedRoomNights: 0, roomRevenueMinor: 0 };
      for (const field of ["availableRoomNights", "occupiedRoomNights", "roomRevenueMinor"]) aggregate[field] += type[field];
      roomTypes.set(type.id, aggregate);
    }
  }
  const openFolioBalanceMinor = openFolios.reduce((total, folio) => total + folio.entries.reduce((balance, entry) => {
    if (entry.currencyCode !== (facts.settings.currencyCode || "USD")) throw new Error("Open folios contain mixed currencies.");
    return balance + (entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor);
  }, 0), 0);
  const businessDate = new Date(facts.clock.currentBusinessDate);
  const demandStart = new Date(Math.max(start.getTime(), businessDate.getTime()));
  const demandEnd = new Date(Math.max(demandStart.getTime(), Math.min(end.getTime(), businessDate.getTime() + 90 * DAY_MS2)));
  const priorDemand = demandStart < demandEnd ? await prisma.hotelAuditEvent.findMany({ where: { aggregateType: "night_audit", action: "completed", aggregateId: { gte: hotelReportingDayKey(new Date(businessDate.getTime() - 31 * DAY_MS2)), lt: hotelReportingDayKey(businessDate) } }, select: { afterSnapshot: true }, take: 32, orderBy: { occurredAt: "desc" } }) : [];
  const demand = compareHotelDemandSnapshots(buildHotelDemandSnapshot(facts, demandStart, demandEnd, businessDate), priorDemand.map((audit) => audit.afterSnapshot?.reportingDay?.demandSnapshot).filter(Boolean), businessDate);
  return {
    demand: JSON.stringify(demand),
    summary: {
      start,
      end,
      businessDate: facts.clock.currentBusinessDate,
      currencyCode: facts.settings.currencyCode || "USD",
      closedSnapshotDays: slices.filter((slice) => snapshots.has(hotelReportingDayKey(slice.date))).length,
      unclosedHistoricalDays: slices.filter((slice) => hotelReportingDayKey(slice.date) < hotelReportingDayKey(facts.clock.currentBusinessDate) && !snapshots.has(hotelReportingDayKey(slice.date))).length,
      forecastDays: slices.filter((slice) => hotelReportingDayKey(slice.date) >= hotelReportingDayKey(facts.clock.currentBusinessDate) && !snapshots.has(hotelReportingDayKey(slice.date))).length,
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
    // Snapshot JSON retains ISO strings; Keystone's DateTime output scalar requires Date objects.
    days: days.map((day2) => ({ ...day2, date: new Date(day2.date) })),
    channels: [...channels.values()].map((channel) => ({ source: channel.source, bookings: channel.bookingIds.size, revenueMinor: channel.revenueMinor })),
    roomTypes: [...roomTypes.values()].map((type) => ({ ...type, occupancyRate: type.availableRoomNights ? type.occupiedRoomNights / type.availableRoomNights * 100 : 0, adrMinor: type.occupiedRoomNights ? Math.round(type.roomRevenueMinor / type.occupiedRoomNights) : 0 }))
  };
}

// features/keystone/queries/hotelOperations.ts
init_bookingRefund();
init_integrationConfig();
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
  const latest2 = value.at(-1);
  if (!latest2 || typeof latest2 !== "object") {
    return { count: value.length, latestMessage: null, latestAt: null };
  }
  const error = latest2;
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
    updatedAt: DateTime!
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
    settlementBookingId: ID
    groupBlock: HotelFolioGroupRef
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
  type HotelFolioGroupRef { id: ID!, name: String! }

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
    closedSnapshotDays: Int!
    unclosedHistoricalDays: Int!
    forecastDays: Int!
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
    demand: String!
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
    canManageRoles: Boolean!
    canManageOnboarding: Boolean!
    canManageAudit: Boolean!
    canManageIntegrations: Boolean!
    canManageGuestPrivacy: Boolean!
    canApproveHotelExceptions: Boolean!
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
        canManageRoles: Boolean(role.canManageRoles),
        canManageOnboarding: Boolean(role.canManageOnboarding),
        canManageAudit: Boolean(role.canManageAudit),
        canManageIntegrations: Boolean(role.canManageIntegrations),
        canManageGuestPrivacy: Boolean(role.canManageGuestPrivacy),
        canApproveHotelExceptions: Boolean(role.canApproveHotelExceptions)
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
          groupBlock: { select: { id: true, name: true } },
          billedBookings: { take: 1, orderBy: { id: "asc" }, select: { id: true } },
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
            settlementBookingId: folio.booking?.id || folio.billedBookings?.[0]?.id || null,
            groupBlock: folio.groupBlock || null,
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
      return context.transaction((tx) => getHotelOperationalReport(tx.prisma, start, end), { isolationLevel: "RepeatableRead" });
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
init_folioLedger();
init_access();
init_hotelBusinessTime();
init_bookingFolio();
init_hotelLifecycle();
init_serializableTransaction();
function utcBusinessDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Business date is invalid.");
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
async function runHotelNightAudit(_root, { propertyKey, businessDate: value, idempotencyKey }, context) {
  if (propertyKey !== HOTEL_PROPERTY_KEY || !permissions.canManagePayments({ session: context.session })) {
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
    await lockHotelBusinessDate(prisma);
    await prisma.$queryRawUnsafe(
      'SELECT "id" FROM "HotelBusinessDate" WHERE "id" = $1 FOR UPDATE',
      1
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
        checkOutDate: { lte: businessDate }
      },
      include: {
        folio: { include: { entries: true } },
        billingFolio: { include: { entries: true } }
      }
    });
    const unsettledDepartures = departureCandidates.filter((booking) => {
      if (booking.status !== "checked_out") return true;
      if (booking.billingFolioId) return false;
      if (booking.folio?.status !== "closed") return true;
      const balanceMinor = calculateFolioBalance(booking.folio.entries).balanceMinor;
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
          where: { snapshotStatus: "active", date: { gte: businessDate, lt: nextBusinessDate } },
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
    for (const booking of bookings.filter((item) => item.checkOutDate > nextBusinessDate)) {
      const assignments = await prisma.roomAssignment.findMany({ where: { bookingId: booking.id, roomId: { not: null } } });
      for (const assignment of assignments) {
        await prisma.housekeepingTask.create({ data: { roomId: assignment.roomId, taskType: "stayover_clean", status: "pending", priority: 2, notes: `Stayover ${nextBusinessDate.toISOString().slice(0, 10)}; booking ${booking.id}; night audit ${eventKey}` } });
      }
    }
    const reportingDay = await captureHotelReportingDay(prisma, businessDate);
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
    const advanced = await prisma.hotelBusinessDate.updateMany({
      where: { id: clock.id, propertyKey: HOTEL_PROPERTY_KEY, currentBusinessDate: clock.currentBusinessDate },
      data: { currentBusinessDate: nextBusinessDate, updatedAt: completedAt }
    });
    if (advanced.count !== 1) {
      throw new Error("Property business date changed during night audit; the date was not advanced.");
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { currentBusinessDate: businessDate.toISOString() },
      afterSnapshot: {
        currentBusinessDate: nextBusinessDate.toISOString(),
        runId: run.id,
        reportingDay,
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
init_access();
init_hotelAvailability();
init_hotelBusinessTime();
init_serializableTransaction();
var import_node_crypto27 = require("node:crypto");
init_boundedLaunch();
init_inventoryLock();
init_hotelLifecycle();
function requiredText2(value, label, max = 200) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}
async function createHotelGroupBlock(_root, args, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to manage group blocks.");
  }
  const idempotencyKey = requiredText2(args.idempotencyKey, "Idempotency key");
  const contactEmail = requiredText2(args.contactEmail, "Contact email", 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Contact email must be valid.");
  const currencyCode = requiredText2(args.currencyCode, "Currency", 3).toUpperCase();
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
  if (!["guest_pays", "master_folio"].includes(args.billingType)) {
    throw new Error("Unsupported group billing type.");
  }
  hotelStayDates(arrivalDate, departureDate);
  if (arrivalDate.getUTCHours() || arrivalDate.getUTCMinutes() || arrivalDate.getUTCSeconds() || arrivalDate.getUTCMilliseconds() || departureDate.getUTCHours() || departureDate.getUTCMinutes() || departureDate.getUTCSeconds() || departureDate.getUTCMilliseconds()) throw new Error("Group stay dates must be property calendar dates at midnight UTC.");
  const eventKey = `group-block:create:${idempotencyKey}`;
  const groupId = `grp_${(0, import_node_crypto27.createHash)("sha256").update(eventKey).digest("hex").slice(0, 24)}`;
  const identity = {
    request: { ...args, arrivalDate: arrivalDate.toISOString(), departureDate: departureDate.toISOString() },
    aggregateType: "group_block",
    aggregateId: groupId,
    action: "created"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    const settings = await assertHotelGroupsEnabled(prisma);
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
    await lockHotelBusinessDate(prisma);
    const clock = await prisma.hotelBusinessDate.findUnique({ where: { id: 1 } });
    if (!clock || arrivalDate < clock.currentBusinessDate || releaseDate && releaseDate <= /* @__PURE__ */ new Date()) throw new Error("Group arrival cannot precede the open business date and pickup cutoff must be in the future.");
    await lockRoomInventory(prisma, args.roomTypeId, arrivalDate, departureDate);
    const roomType = await prisma.roomType.findUnique({
      where: { id: args.roomTypeId },
      include: { rooms: true }
    });
    if (!roomType) throw new Error("Room type not found.");
    const [availability] = await getHotelAvailability(transactionContext, { roomTypeId: args.roomTypeId, checkInDate: arrivalDate, checkOutDate: departureDate });
    if (!availability || availability.availableCount < args.roomsHeld) throw new Error("Group block exceeds available capacity on one or more nights.");
    const ratePlan = args.ratePlanId ? await prisma.ratePlan.findUnique({ where: { id: args.ratePlanId } }) : await prisma.ratePlan.findFirst({ where: { roomTypeId: args.roomTypeId, status: "active" }, orderBy: { id: "asc" } });
    if (!ratePlan || ratePlan.roomTypeId !== args.roomTypeId || ratePlan.status !== "active") throw new Error("Select an active rate plan of the allocated room type for the group contract.");
    const contract = { depositPercent: Number(settings.depositPercent ?? 100), securityDepositMinor: Number(settings.securityDepositMinor ?? 0), ratePlanId: ratePlan.id, ratePlanName: ratePlan.name, cancellationPolicy: ratePlan.cancellationPolicy, mealPlan: ratePlan.mealPlan, taxRateBasisPoints: Number(settings.taxRateBasisPoints || 0), feesMinor: Number(settings.serviceFeeMinor || 0), currencyCode, rateMinor: args.rateMinor, roomTypeId: roomType.id, roomTypeName: roomType.name, maxOccupancy: roomType.maxOccupancy, arrivalInstant: propertyArrivalInstant(arrivalDate, settings.checkInTime || "15:00", settings.timeZone || "UTC").toISOString(), propertyTimeZone: settings.timeZone || "UTC" };
    const block = await prisma.groupBlock.create({
      data: {
        id: groupId,
        blockCode: `GRP-${(0, import_node_crypto27.randomUUID)().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        name: requiredText2(args.name, "Group name"),
        status: "tentative",
        arrivalDate,
        departureDate,
        releaseDate,
        contactName: requiredText2(args.contactName, "Contact name"),
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
        contract,
        masterFolio: args.billingType === "master_folio" ? `GFOL-${block.blockCode}` : null
      }
    });
    return prisma.groupBlock.findUnique({
      where: { id: block.id },
      include: { allocations: { include: { roomType: true } }, masterFolio: true }
    });
  });
}

// features/keystone/mutations/replayHotelOutboxEvent.ts
init_access();

// features/keystone/lib/hotelOutbox.ts
var import_node_crypto28 = require("node:crypto");
var import_client8 = require("@prisma/client");
init_hotelLifecycle();
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
  const leaseToken = `${workerId}:${(0, import_node_crypto28.randomUUID)()}`;
  const topics = [...new Set((options.topics || []).map((topic) => String(topic).trim()).filter(Boolean))];
  const topicFilter = topics.length ? import_client8.Prisma.sql`AND "topic" IN (${import_client8.Prisma.join(topics)})` : import_client8.Prisma.empty;
  const claimed = await prisma.$queryRaw(import_client8.Prisma.sql`
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
  return (0, import_node_crypto28.createHash)("sha256").update(body).digest("hex");
}
function signHotelOutboxBody(body, credentialKeyId, sentAt, secret) {
  return (0, import_node_crypto28.createHmac)("sha256", secret).update(`${sentAt}.${credentialKeyId}.${body}`).digest("hex");
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
init_hotelLifecycle();
async function replayHotelOutboxEvent(_root, { eventId, idempotencyKey }, context) {
  if (!permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to replay hotel outbox events.");
  }
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable replay idempotency key is required.");
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, `hotel-outbox-replay:${key4}`);
    const auditEventKey = `hotel-outbox-replay:${key4}`;
    const request = { eventId, idempotencyKey: key4 };
    const existingAudit = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: auditEventKey } });
    if (existingAudit && existingAudit.requestHash !== hashLifecycleRequest(request)) {
      throw new Error("Outbox replay key is already bound to different evidence.");
    }
    const result = await replayHotelDeadLetter(prisma, {
      propertyKey: HOTEL_PROPERTY_KEY,
      eventId,
      idempotencyKey: key4
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
init_hotelGroupLifecycle();
init_inventoryLock();
init_access();
init_boundedLaunch();
init_hotelLifecycle();
init_serializableTransaction();
async function pickupHotelGroupBlock(_root, { groupBlockId, allocationId, bookingId, idempotencyKey }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to pick up group rooms.");
  }
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable idempotency key is required.");
  const eventKey = `group-block:pickup:${key4}`;
  const identity = {
    request: { groupBlockId, allocationId, bookingId },
    aggregateType: "group_block",
    aggregateId: groupBlockId,
    action: "room_picked_up"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await assertHotelGroupsEnabled(prisma);
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
          roomAssignments: true,
          payments: true,
          lineItems: { where: { snapshotStatus: "active" } }
        }
      })
    ]);
    if (!block || !allocation || allocation.groupBlockId !== block.id || !booking) {
      throw new Error("Group block, allocation, or booking was not found.");
    }
    assertGroupPickupAllowed(block, allocation, 1);
    if (!["pending", "confirmed"].includes(booking.status) || booking.status === "pending" && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= /* @__PURE__ */ new Date())) throw new Error("Only an open, unexpired pre-arrival reservation may join a group.");
    if (booking.roomAssignments.length !== 1) throw new Error("Each group pickup must represent exactly one room.");
    await lockRoomInventory(prisma, allocation.roomTypeId, block.arrivalDate, block.departureDate);
    const contract = await groupCommercialContract(prisma, groupBlockId);
    const nights = Math.round((block.departureDate.getTime() - block.arrivalDate.getTime()) / 864e5);
    const roomMinor = allocation.rateMinor * nights;
    const contractTotal = roomMinor + Math.round(roomMinor * contract.taxRateBasisPoints / 1e4) + contract.feesMinor;
    if (!booking.lineItems.length || booking.totalAmountMinor !== contractTotal || booking.ratePlanId !== contract.ratePlanId || booking.currencyCode !== allocation.currencyCode || booking.lineItems.some((line) => line.cancellationPolicySnapshot !== contract.cancellationPolicy)) throw new Error("Existing reservation commercial terms do not match the group contract; create the guest through the rooming list instead.");
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
    if (block.billingType === "master_folio" && (booking.folio?.entries?.length || booking.payments?.length)) {
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
init_serializableTransaction();
init_access();
init_boundedLaunch();
init_hotelLifecycle();
var TRANSITIONS5 = {
  tentative: /* @__PURE__ */ new Set(["definite", "released", "cancelled"]),
  definite: /* @__PURE__ */ new Set(["released", "cancelled"]),
  released: /* @__PURE__ */ new Set(),
  cancelled: /* @__PURE__ */ new Set()
};
async function updateHotelGroupBlockStatus(_root, { groupBlockId, status, idempotencyKey }, context) {
  if (!permissions.canManageBookings({ session: context.session })) {
    throw new Error("Not authorized to change group block status.");
  }
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable idempotency key is required.");
  if (!TRANSITIONS5[status]) throw new Error("Unsupported group block status.");
  const eventKey = `group-block:status:${key4}`;
  const identity = {
    request: { groupBlockId, status },
    aggregateType: "group_block",
    aggregateId: groupBlockId,
    action: "status_changed"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma;
    await assertHotelGroupsEnabled(prisma);
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-group:${groupBlockId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) {
      return prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { allocations: { include: { roomType: true } }, masterFolio: true } });
    }
    const block = await prisma.groupBlock.findUnique({ where: { id: groupBlockId }, include: { allocations: true, masterFolio: true } });
    if (!block) throw new Error("Group block not found.");
    if (!TRANSITIONS5[block.status]?.has(status)) throw new Error(`Group block cannot transition from ${block.status} to ${status}.`);
    const activeBookings = await prisma.booking.count({ where: { groupBlockId, status: { notIn: ["cancelled", "no_show", "checked_out"] } } });
    if (status === "cancelled" && activeBookings > 0) {
      throw new Error("Picked-up group rooms must be released from their reservations before cancellation.");
    }
    if (status === "definite" && block.releaseDate && new Date(block.releaseDate) <= /* @__PURE__ */ new Date()) throw new Error("Release cutoff has passed; create a new group commitment.");
    if (status === "cancelled" && block.masterFolio) {
      const entries = await prisma.folioEntry.count({ where: { folioId: block.masterFolio.id } });
      if (entries && block.masterFolio.status !== "closed") throw new Error("Settle and close the group master folio before cancelling the block.");
      if (!entries) await prisma.folio.update({ where: { id: block.masterFolio.id }, data: { status: "voided", closedAt: /* @__PURE__ */ new Date() } });
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
  });
}

// features/keystone/mutations/resolveOverdueCheckedInBooking.ts
init_hotelGuestGovernance();
init_serializableTransaction();
init_access();
init_bookingFolio();
init_folioLedger();
init_hotelLifecycle();
function normalize(value, label, max) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}
async function resolveOverdueCheckedInBooking(_root, { bookingId, idempotencyKey, reason, approvalId }, context) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to resolve overdue stays.");
  }
  const key4 = normalize(idempotencyKey, "idempotencyKey", 200);
  const resolutionReason = normalize(reason, "reason", 500);
  const eventKey = `overdue-stay-resolution:${key4}`;
  const identity = {
    request: { bookingId, resolution: "write_off", reason: resolutionReason },
    aggregateType: "booking",
    aggregateId: bookingId,
    action: "overdue_stay_resolved"
  };
  return runSerializableTransaction(context, async (transactionContext) => {
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
    await assertNoOutstandingStayKeys(prisma, bookingId);
    const ensured = await ensureBookingFolio(transactionContext, bookingId, { postSnapshotEntries: true });
    const entries = await prisma.folioEntry.findMany({
      where: { folioId: ensured.folioId },
      select: { direction: true, amountMinor: true, currencyCode: true }
    });
    const beforeBalance = calculateFolioBalance(entries);
    if (beforeBalance.balanceMinor < 0) throw new Error("Credit folios require refund reconciliation before overdue resolution.");
    const now = /* @__PURE__ */ new Date();
    const postingKey = `${eventKey}:write-off`;
    if (beforeBalance.balanceMinor > 0) {
      const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
      if (beforeBalance.balanceMinor >= Number(settings?.writeOffApprovalThresholdMinor ?? 0)) await requireHotelApproval(prisma, { approvalId, action: "write_off", aggregateId: bookingId, amountMinor: beforeBalance.balanceMinor, actorId: context.session.itemId, operationKey: eventKey });
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
      const repair = await prisma.maintenanceRequest.findFirst({ where: { roomId: assignment.room.id, status: { in: ["reported", "assigned", "in_progress", "waiting_parts"] } } });
      const nextStatus = assignment.room.status === "out_of_order" ? "out_of_order" : repair || assignment.room.status === "maintenance" ? "maintenance" : "cleaning";
      await prisma.room.update({ where: { id: assignment.room.id }, data: { status: nextStatus } });
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
  });
}

// features/keystone/mutations/replayRefundIntent.ts
init_access();
init_hotelLifecycle();
async function replayRefundIntent(_root, { intentId, idempotencyKey }, context) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error("Not authorized to replay refund intents.");
  }
  const key4 = String(idempotencyKey || "").trim();
  if (!key4 || key4.length > 200) throw new Error("A stable idempotency key is required.");
  const eventKey = `refund-intent-replay:${key4}`;
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
init_access();
init_paymentSecurity();
init_integrationConfig();
function bounded3(value, label, max = 500) {
  const text46 = String(value || "").trim();
  if (!text46 || text46.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return text46;
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
init_integrationConfig();
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
      ${hotelGuestGovernanceTypeDefs}
      ${hotelMfaTypeDefs}
      ${maintenanceCommercialTypeDefs}
      ${hotelDerivedRateTypeDefs}

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
        securityDepositMinor: Int!
        depositPercent: Int!
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
        refundPendingMinor: Int
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
        hotelHousekeepingStaffCapabilities: String!
        hotelPayerWindows(folioId: ID!, bookingId: ID): JSON!
        guestFolio(bookingId: ID!): JSON!
        hotelPayoutOperations: JSON!
        hotelSecurityAuthorization(bookingId: ID!): JSON!
        hotelFolioReceipt(folioId: ID!): JSON!
        hotelCashierOperations: JSON!
        hotelReceivableOperations: JSON!
        hotelDisputeOperations: JSON!
        hotelGroupWorkspace(after: ID): String!
        hotelLoyaltyAccount(bookingId: ID!): String!
        hotelRelocation(bookingId: ID!): String!
        hotelStayServices(bookingId: ID, roomId: ID): String!
        hotelRoomOutages: String!
        hotelStayRegister(bookingId: ID!): String!
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
        idempotencyKey: String!
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
        refundApprovalThresholdMinor: Int
        writeOffApprovalThresholdMinor: Int
        cashVarianceApprovalThresholdMinor: Int
        prearrivalEmailEnabled: Boolean
        prearrivalDays: Int
        loyaltyEnabled: Boolean
        loyaltyEarnMinorPerPoint: Int
        loyaltyRedeemMinorPerPoint: Int
        loyaltyMinimumRedemptionPoints: Int
        securityDepositMinor: Int
        depositPercent: Int
        groupsEnabled: Boolean
        ratePublicationRequiresApproval: Boolean
        propertyName: String!
        tagline: String
        contactEmail: String!
        contactPhone: String!
        addressLine1: String!
        addressLine2: String
        frontDeskCopy: String
        timeZone: String!
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
        updateHotelRelocation(bookingId: ID!, status: String!, expectedRevision: Int!, propertyName: String, contact: String, confirmation: String, costMinor: Int, guestAgreement: String, followUp: String, costEvidence: String, idempotencyKey: String!): String!
        detachHotelGroupBooking(bookingId: ID!, checkInDate: DateTime!, checkOutDate: DateTime!, roomTypeId: ID!, ratePlanId: ID!, reason: String!, idempotencyKey: String!): String!
        manageHotelPayout(input: JSON!): JSON!
        manageHotelSecurityAuthorization(input: JSON!): JSON!
        redeemHotelLoyalty(bookingId: ID!, points: Int!, idempotencyKey: String!): String!
        saveHotelChannelDraft(input: JSON!): JSON!
        manageHotelReceivable(input: JSON!): JSON!
        annotateHotelDispute(input: JSON!): JSON!
        createHotelGroupRoomingList(groupBlockId: ID!, allocationId: ID!, rows: String!, idempotencyKey: String!): String!
        closeHotelGroupMasterFolio(groupBlockId: ID!, idempotencyKey: String!): String!
        manageHotelCashier(input: JSON!): JSON!
        updateHotelStayService(serviceId: ID, bookingId: ID, roomId: ID, category: String, title: String, description: String, priority: String, dueAt: DateTime, status: String!, expectedStatus: String, assignedToId: ID, resolution: String, idempotencyKey: String!): String!
        updateHotelRoomOutage(roomId: ID!, outageId: ID, startDate: DateTime, endDate: DateTime, reason: String!, action: String!, idempotencyKey: String!): String!
        updateHotelStayRegister(bookingId: ID!, action: String!, name: String, occupantId: ID, keyReference: String, idempotencyKey: String!): String!
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
          approvalId: ID
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
          ratePlanId: ID
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
          approvalId: ID
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
          approvalId: ID
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
          targetRoomId: ID
          earlyDepartureApprovalId: ID
          earlyDepartureReason: String
          checkInDate: DateTime!
          checkOutDate: DateTime!
          roomTypeId: ID
          ratePlanId: ID
          promoCode: String
          idempotencyKey: String!
        ): Booking!
        requestBookingPaymentRefund(
          paymentId: ID!
          approvalId: ID
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
        updateHotelHousekeepingStaffCapability(staffId: ID!, configuration: String!, expectedRevision: Int!, idempotencyKey: String!): String!
        updateHousekeepingTaskStatus(
          taskId: ID!
          expectedStatus: String
          expectedUpdatedAt: DateTime
          status: String!
          assignedToId: ID
          notes: String
          idempotencyKey: String!
        ): HousekeepingTask
        updateRatePlanPublication(
          ratePlanId: ID!
          approvalId: ID
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
        hotelHousekeepingStaffCapabilities,
        hotelPayerWindows,
        hotelFolioReceipt,
        hotelSecurityAuthorization,
        guestFolio,
        hotelPayoutOperations,
        ...hotelGuestGovernanceResolvers.Query,
        ...hotelMfaResolvers.Query,
        ...maintenanceCommercialResolvers.Query,
        ...hotelDerivedRateResolvers.Query,
        hotelReceivableOperations,
        hotelDisputeOperations,
        hotelGroupWorkspace,
        hotelLoyaltyAccount,
        hotelRelocation,
        hotelCashierOperations,
        hotelStayServices: getHotelStayServices,
        hotelRoomOutages: getHotelRoomOutages,
        hotelStayRegister: getHotelStayRegister,
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
        ...hotelGuestGovernanceResolvers.Mutation,
        ...hotelMfaResolvers.Mutation,
        ...maintenanceCommercialResolvers.Mutation,
        ...hotelDerivedRateResolvers.Mutation,
        updateHotelRelocation,
        detachHotelGroupBooking,
        manageHotelPayout,
        manageHotelSecurityAuthorization,
        redeemHotelLoyalty,
        saveHotelChannelDraft,
        manageHotelReceivable,
        annotateHotelDispute,
        createHotelGroupRoomingList,
        closeHotelGroupMasterFolio,
        manageHotelCashier,
        updateHotelStayService,
        updateHotelRoomOutage,
        updateHotelStayRegister,
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
        updateHotelHousekeepingStaffCapability,
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
  const configured = process.env.PASSWORD_RESET_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL;
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
  const title = payload.kind === "booking_prearrival" ? "Your upcoming stay" : payload.kind === "booking_confirmation" ? "Reservation confirmed" : payload.kind === "booking_updated" ? "Reservation updated" : payload.kind === "booking_modification_response" ? `Change request ${payload.modificationDecision || "reviewed"}` : payload.kind === "booking_no_show" ? "Reservation marked no-show" : payload.kind === "booking_refund" ? "Reservation refund recorded" : "Reservation cancelled";
  const total = communicationMoney(payload.totalAmountMinor, payload.currencyCode);
  const cancellation = payload.kind === "booking_cancelled" || payload.kind === "booking_no_show" ? `<h2>Policy settlement</h2><p>${escapeHtml(payload.cancellationSummary || "The booked terms were applied.")}</p><p><strong>Refund:</strong> ${escapeHtml(communicationMoney(payload.refundableMinor, payload.currencyCode))}<br/><strong>Policy fee:</strong> ${escapeHtml(communicationMoney(payload.cancellationFeeMinor, payload.currencyCode))}</p>` : payload.kind === "booking_refund" ? `<h2>Refund</h2><p>${escapeHtml(payload.cancellationSummary || "A refund was recorded by the property.")}</p><p><strong>Amount:</strong> ${escapeHtml(communicationMoney(payload.refundableMinor, payload.currencyCode))}</p>` : payload.kind === "booking_modification_response" ? `<p><strong>Decision:</strong> ${escapeHtml(payload.modificationDecision || "reviewed")}</p>${payload.staffNote ? `<p><strong>Property note:</strong> ${escapeHtml(payload.staffNote)}</p>` : ""}` : `<p><strong>Total:</strong> ${escapeHtml(total)}</p>`;
  const lookupUrl = `${getBaseUrlForEmails()}/bookings/lookup?confirmation=${encodeURIComponent(confirmationNumber2)}&email=${encodeURIComponent(recipient)}`;
  return {
    subject: `${emailHeader(title)} \xB7 ${emailHeader(payload.confirmationNumber)} \xB7 ${emailHeader(payload.propertyName)}`,
    html: `<body style="font-family:Arial,sans-serif;color:#222"><h1>${escapeHtml(title)}</h1><p>Hello ${escapeHtml(payload.guestName)},</p><p>${payload.kind === "booking_prearrival" ? `We look forward to welcoming you to ${property}. Review your arrival details below.` : payload.kind === "booking_modification_response" ? `Your change request with ${property} has been reviewed.` : `Your reservation with ${property} has been ${payload.kind === "booking_confirmation" ? "confirmed" : payload.kind === "booking_updated" ? "updated" : payload.kind === "booking_no_show" ? "marked as a no-show under the booked terms" : payload.kind === "booking_refund" ? "updated with a refund" : "cancelled"}.`}</p><p><strong>Confirmation:</strong> ${escapeHtml(payload.confirmationNumber)}<br/><strong>Room:</strong> ${escapeHtml(payload.roomTypeName)}<br/><strong>Arrival:</strong> ${escapeHtml(communicationDate(payload.checkInDate))}<br/><strong>Departure:</strong> ${escapeHtml(communicationDate(payload.checkOutDate))}<br/><strong>Guests:</strong> ${escapeHtml(payload.numberOfGuests)}</p>${cancellation}<p><a href="${escapeHtml(lookupUrl)}">Open the secure reservation lookup</a> using your confirmation number and email.</p><p>Questions? Contact <a href="mailto:${escapeHtml(payload.contactEmail)}">${escapeHtml(payload.contactEmail)}</a>.</p></body>`
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
  const accepted = (info.accepted || []).map((recipient) => String(typeof recipient === "string" ? recipient : recipient.address).toLowerCase());
  if (!accepted.includes(payload.to.toLowerCase()) || (info.rejected || []).length) throw new Error("SMTP did not accept the intended recipient. Delivery requires operator review.");
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, transportStatus: "accepted_by_smtp", inboxDeliveryVerified: false };
}

// features/keystone/index.ts
init_access();

// features/keystone/jobs/channelSyncJobs.ts
var import_context = require("@keystone-6/core/context");
var PrismaModule = __toESM(require("@prisma/client"));

// features/keystone/lib/workerLease.ts
var import_client9 = require("@prisma/client");
async function acquireWorkerLease(prisma, options) {
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + options.ttlMs);
  const rows = await prisma.$queryRaw(import_client9.Prisma.sql`
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

// features/keystone/lib/hotelScheduledCommunications.ts
init_hotelCommunications();
init_hotelBusinessTime();
init_serializableTransaction();
async function queueHotelPrearrivalCommunications(context, now = /* @__PURE__ */ new Date()) {
  const settings = await context.prisma.hotelSettings.findUnique({ where: { id: 1 } });
  if (settings?.prearrivalEmailEnabled !== true) return { queued: 0, failures: 0 };
  const days = Number(settings.prearrivalDays);
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("Pre-arrival lead time must be 1\u201314 days.");
  const today = propertyCalendarDate(now, settings.timeZone || "UTC");
  const target = new Date(today.getTime() + days * 864e5);
  const bookings = await context.prisma.booking.findMany({ where: { status: "confirmed", checkInDate: { gt: today, lte: target } }, select: { id: true } });
  let queued = 0;
  let failures = 0;
  for (const candidate of bookings) {
    try {
      const created = await runSerializableTransaction(context, async (tx) => {
        await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `hotel-booking:${candidate.id}`);
        const booking = await tx.prisma.booking.findUnique({ where: { id: candidate.id } });
        if (!booking || booking.status !== "confirmed" || booking.checkInDate <= today || booking.checkInDate > target) return;
        const eventKey = `${booking.id}:${booking.checkInDate.toISOString().slice(0, 10)}`;
        const existing = await tx.prisma.hotelOutboxEvent.findUnique({ where: { eventKey: `hotel-communication:booking_prearrival:${eventKey}` } });
        if (existing) return;
        await queueBookingCommunication(tx.prisma, { bookingId: booking.id, kind: "booking_prearrival", eventKey });
        return true;
      });
      if (created) queued += 1;
    } catch {
      failures += 1;
    }
  }
  return { queued, failures };
}
async function prearrivalStillEligible(prisma, payload, now = /* @__PURE__ */ new Date()) {
  const [booking, settings] = await Promise.all([prisma.booking.findUnique({ where: { id: payload.bookingId } }), prisma.hotelSettings.findUnique({ where: { id: 1 } })]);
  return Boolean(settings?.prearrivalEmailEnabled && booking?.status === "confirmed" && booking.checkInDate.toISOString() === payload.checkInDate && booking.checkInDate > propertyCalendarDate(now, settings.timeZone || "UTC") && booking.guestEmail.trim().toLowerCase() === payload.to);
}

// features/keystone/jobs/hotelOutboxJobs.ts
var import_context2 = require("@keystone-6/core/context");
var PrismaModule2 = __toESM(require("@prisma/client"));
init_integrationConfig();

// features/keystone/lib/workerProgress.ts
async function recordWorkerProgress(prisma, worker) {
  const now = /* @__PURE__ */ new Date();
  const data = { ownerId: `process:${process.pid}`, heartbeatAt: now, expiresAt: new Date(now.getTime() + 18e4) };
  await prisma.hotelWorkerLease.upsert({ where: { leaseKey: `progress:${worker}` }, create: { leaseKey: `progress:${worker}`, ...data }, update: data });
}

// features/keystone/jobs/hotelOutboxJobs.ts
init_hotelCommunications();
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
    if (event.topic === "hotel.communication.booking_prearrival" && !await prearrivalStillEligible(context.prisma, event.payloadSnapshot)) return { suppressed: true, reason: "Reservation changed, arrival passed or scheduled emails disabled." };
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
      const scheduled = await queueHotelPrearrivalCommunications(context);
      if (scheduled.failures) console.error("Scheduled communication records failed:", scheduled.failures);
      await dispatchHotelOutboxBatch(
        context.prisma,
        { propertyKey: "the-alder-house", workerId, limit: 25, topics },
        handler
      );
      if (!scheduled.failures) await recordWorkerProgress(context.prisma, "outbox");
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
init_bookingCancellation();
var GLOBAL_KEY = "__hotelRefundJobsState";
async function runHotelRefundWorkerCycle(context, workerId) {
  const securityFailures = await reconcileSecurityAuthorizations(context);
  const retirements = await dispatchPaymentSessionRetirements(context);
  const result = await dispatchRefundIntentBatch(context, { workerId, limit: 10 });
  if (!securityFailures && !retirements.unresolved && !result.retried && !result.deadLettered) {
    await recordWorkerProgress(context.prisma, "refunds");
  }
}
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
      await runHotelRefundWorkerCycle(context, workerId);
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
init_hotelGroupLifecycle();
var import_context4 = require("@keystone-6/core/context");
var PrismaModule4 = __toESM(require("@prisma/client"));

// features/keystone/lib/expireHotelHolds.ts
init_bookingCancellation();
async function expireHotelHoldBatch(context, now = /* @__PURE__ */ new Date(), renewLease) {
  const failures = [];
  let processed = 0;
  let cursor;
  let leaseLost = false;
  for (; ; ) {
    if (renewLease && !await renewLease()) {
      leaseLost = true;
      break;
    }
    const rows = await context.prisma.booking.findMany({ where: { status: "pending", holdExpiresAt: { lte: now }, ...cursor ? { id: { gt: cursor } } : {} }, orderBy: { id: "asc" }, take: 50, select: { id: true } });
    if (!rows.length) break;
    for (const row of rows) {
      try {
        await requestBookingCancellation({ context, bookingId: row.id, refundReason: "Unconfirmed reservation hold expired", idempotencyKey: `hold-expired:${row.id}`, actorId: null, source: "hold_expiry" });
        processed += 1;
      } catch {
        failures.push(row.id);
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < 50) break;
  }
  return { processed, failures, leaseLost };
}

// features/keystone/jobs/hotelHoldJobs.ts
async function runHotelHoldWorkerCycle(context, ownerId, lease = acquireWorkerLease) {
  if (!await lease(context.prisma, { leaseKey: "booking-hold-expiry", ownerId, ttlMs: 12e4 })) return;
  const result = await expireHotelHoldBatch(
    context,
    /* @__PURE__ */ new Date(),
    () => lease(context.prisma, { leaseKey: "booking-hold-expiry", ownerId, ttlMs: 12e4 })
  );
  await releaseDueHotelGroupBlocks(context);
  if (result.failures.length) console.error("Hotel hold expiry records failed:", result.failures.length);
  else if (!result.leaseLost) await recordWorkerProgress(context.prisma, "holds");
}
function startHotelHoldJobs(config2) {
  if (process.env.NODE_ENV === "test") return;
  const globalState = globalThis;
  if (globalState.__hotelHoldJobsState) return;
  const context = (0, import_context4.getContext)(config2, PrismaModule4);
  const ownerId = `hotel-hold-${process.pid}`;
  let stopping = false;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      if (stopping) return;
      await runHotelHoldWorkerCycle(context, ownerId);
    } catch (error) {
      console.error("Hotel hold expiry cycle failed:", error instanceof Error ? error.message : "unknown error");
    } finally {
      running = false;
    }
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
function required2(env, key4) {
  const value = String(env[key4] || "").trim();
  if (!value) throw new Error(`${key4} is required in production.`);
  return value;
}
function strongDomainSecret(env, key4) {
  const value = required2(env, key4);
  if (value.length < 32) throw new Error(`${key4} must contain at least 32 characters.`);
  if (PLACEHOLDER2.test(value)) throw new Error(`${key4} contains a development or placeholder value.`);
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
function httpsOrigin(env, key4) {
  const value = required2(env, key4);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key4} must be a valid URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.hostname.endsWith(".local")) {
    throw new Error(`${key4} must be a canonical HTTPS origin without credentials, path, query, or fragment.`);
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
  "canManageIntegrations",
  "canManageGuestPrivacy",
  "canApproveHotelExceptions"
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
    if (!allowInitialIdentity && permissionKeys.some((key4) => Boolean(user.role[key4]) !== Boolean(embeddedRole[key4]))) return void 0;
    return {
      ...session,
      data: {
        ...session.data,
        name: user.name,
        email: user.email,
        isActive: true,
        authVersion: user.authVersion,
        mfaEnabled: Boolean(user.mfaEnabled),
        role: Object.fromEntries(["id", "name", ...permissionKeys].map((key4) => [key4, user.role[key4]]))
      }
    };
  };
  return createHotelMfaSessionStrategy(base, loadCurrent);
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
          canManageIntegrations: true,
          canManageGuestPrivacy: true,
          canApproveHotelExceptions: true
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
      canManageGuestPrivacy canApproveHotelExceptions
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
