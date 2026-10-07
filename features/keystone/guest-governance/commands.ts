import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { encryptSensitiveText } from '../lib/sensitiveData';
import { loadRateEconomics, rateEconomicsReview } from '../rates/economics';

function text(value: unknown, label: string, max = 500) {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return result;
}
function allow(context: any, permission: 'canManageGuestPrivacy' | 'canApproveHotelExceptions') {
  if (!permissions[permission]({ session: context.session })) throw new Error('Not authorized for guest governance or independent approvals.');
}
function idFor(key: string) { return createHash('sha256').update(key).digest('hex').slice(0, 24); }
export function resolveGuestIdentityInput(resolvedData: Record<string, unknown>, encrypt = encryptSensitiveText) {
  if (resolvedData.idNumber === undefined) return undefined;
  const value = String(resolvedData.idNumber || '').trim();
  if (value.startsWith('enc:')) throw new Error('Enter the original identification number, not an encrypted payload.');
  return encrypt(value);
}
async function lock(prisma: any, id: string) {
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-governance:${id}`);
}
async function evidence(prisma: any, input: { eventKey: string; actorId: string; aggregateType: string; aggregateId: string; action: string; request: unknown; afterSnapshot: unknown; beforeSnapshot?: unknown }) {
  return prisma.hotelAuditEvent.create({ data: {
    eventKey: input.eventKey, propertyKey: HOTEL_PROPERTY_KEY, requestHash: hashLifecycleRequest(input.request),
    actorId: input.actorId, aggregateType: input.aggregateType, aggregateId: input.aggregateId, action: input.action,
    beforeSnapshot: input.beforeSnapshot || null, afterSnapshot: input.afterSnapshot, metadataSnapshot: {}, occurredAt: new Date(),
  } });
}
async function guestEvents(prisma: any, guestId: string) {
  const rows = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'guest_governance', aggregateId: guestId }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 5_001 });
  if (rows.length > 5_000) throw new Error('Guest governance history exceeds the bounded workspace; use a reviewed archival workflow.');
  return rows;
}
async function activeGuestMerges(prisma: any) {
  const rows = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'guest_merge' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 5_001 });
  if (rows.length > 5_000) throw new Error('Profile merge history exceeds the bounded workspace; a reviewed archival workflow is required.');
  const latest = new Map<string, any>(); for (const row of rows) latest.set(row.aggregateId, row.afterSnapshot);
  return [...latest.values()].filter(value => value.status === 'merged');
}
export async function assertGuestProfileEditable(prisma: any, guestId: string) {
  const [merges, events] = await Promise.all([activeGuestMerges(prisma), guestEvents(prisma, guestId)]);
  if (merges.some(merge => merge.sourceGuestId === guestId)) throw new Error('This profile was merged. Use the audited unmerge operation before editing it.');
  if (events.some((event: any) => event.action === 'subject_fulfilled' && event.afterSnapshot?.type === 'anonymize' && event.afterSnapshot?.status === 'completed')) throw new Error('An anonymized historical profile cannot be repurposed. Create a new guest profile.');
}
export function guestGovernanceState(events: any[]) {
  const holds = new Map<string, any>(); const consents = new Map<string, any>(); const requests = new Map<string, any>();
  let retentionDays: number | null = null;
  for (const event of events) {
    const value = event.afterSnapshot || {};
    if (event.action === 'legal_hold') holds.set(value.holdId, value);
    if (event.action === 'consent') consents.set(value.purpose, value);
    if (event.action === 'subject_request' || event.action === 'subject_fulfilled') requests.set(value.requestId, value);
    if (event.action === 'retention_policy') retentionDays = value.retentionDays;
  }
  return { holds: [...holds.values()].filter(value => value.active), consents: [...consents.values()], requests: [...requests.values()], retentionDays };
}

const GUEST_EXPORT_FIELDS = {
  id: true, firstName: true, lastName: true, email: true, phone: true, nationality: true,
  address1: true, address2: true, city: true, state: true, postalCode: true, country: true,
  company: true, preferences: true, communicationPreferences: true, specialNotes: true, createdAt: true,
};
async function guestExport(prisma: any, guestId: string) {
  const [guest, bookings, documents, events] = await Promise.all([
    prisma.guest.findUnique({ where: { id: guestId }, select: GUEST_EXPORT_FIELDS }),
    prisma.booking.findMany({ where: { guestProfileId: guestId }, take: 5_001, orderBy: { createdAt: 'asc' }, select: {
      id: true, confirmationNumber: true, checkInDate: true, checkOutDate: true, status: true, totalAmountMinor: true, currencyCode: true,
      folio: { select: { folioNumber: true, status: true, entries: { select: { entryType: true, direction: true, amountMinor: true, currencyCode: true, description: true, serviceDate: true } } } },
    } }),
    prisma.guestDocument.findMany({ where: { guestId }, select: { id: true, documentType: true, issuingCountry: true, expiryDate: true, verified: true, verifiedAt: true } }),
    guestEvents(prisma, guestId),
  ]);
  if (!guest) throw new Error('Guest not found.');
  if (bookings.length > 5_000) throw new Error('Guest export exceeds the bounded workspace; use a reviewed archival export.');
  return { guest, bookings, documents, governance: guestGovernanceState(events), history: events.map((event: any) => ({ id: event.id, action: event.action, occurredAt: event.occurredAt, evidence: event.afterSnapshot })), exportedAt: new Date().toISOString(), excludedSensitiveFields: ['document numbers and images', 'processor credentials and raw payment payloads'] };
}

export async function hotelGovernanceGuestSearch(_root: unknown, { search }: { search: string }, context: any) {
  allow(context, 'canManageGuestPrivacy');
  const query = text(search, 'Guest name or email', 100);
  if (query.length < 2) throw new Error('Enter at least two characters.');
  return JSON.stringify(await context.prisma.guest.findMany({ where: { OR: [{ email: { contains: query, mode: 'insensitive' } }, { firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }] }, take: 25, orderBy: { email: 'asc' }, select: { id: true, firstName: true, lastName: true, email: true } }));
}

export async function hotelGuestGovernance(_root: unknown, { guestId }: { guestId: string }, context: any) {
  allow(context, 'canManageGuestPrivacy');
  const id = text(guestId, 'Guest ID', 200);
  return JSON.stringify(await guestExport(context.prisma, id));
}

export async function updateHotelGuestGovernance(_root: unknown, { guestId, command, payload, idempotencyKey }: { guestId: string; command: string; payload: string; idempotencyKey: string }, context: any) {
  allow(context, 'canManageGuestPrivacy');
  const id = text(guestId, 'Guest ID', 200); const key = `guest-governance:${text(idempotencyKey, 'Idempotency key', 200)}`;
  if (payload.length > 20_000) throw new Error('Governance payload is too large.');
  const data = JSON.parse(payload); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('A structured governance request is required.');
  const request = { guestId: id, command, data, actorId: context.session.itemId };
  return runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma;
    const relatedId = command === 'merge' ? text(data.targetGuestId, 'Target guest ID', 200) : id;
    for (const target of [...new Set([id, relatedId])].sort()) await lock(prisma, target);
    const replay = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: key } });
    if (replay) {
      if (replay.requestHash !== hashLifecycleRequest(request)) throw new Error('Governance idempotency key was reused with different evidence.');
      return JSON.stringify(await guestExport(prisma, id));
    }
    const guest = await prisma.guest.findUnique({ where: { id } }); if (!guest) throw new Error('Guest not found.');
    const events = await guestEvents(prisma, id); const state = guestGovernanceState(events);
    let action = command; let after: any; let before: any = null;
    if (command === 'consent') {
      const purpose = text(data.purpose, 'Consent purpose', 100); const version = text(data.version, 'Notice version', 100);
      if (!['granted', 'revoked'].includes(data.status)) throw new Error('Consent must be granted or revoked.');
      after = { purpose, version, status: data.status, evidenceRef: text(data.evidenceRef, 'Consent evidence'), recordedAt: new Date().toISOString() };
      // Marketing defaults do not constitute consent. Revocation immediately
      // disables the corresponding preference; no subscriber list is exported.
      const preferenceField = ({ email_marketing: 'emailMarketing', email_newsletter: 'newsletterSubscribed', sms_notifications: 'smsNotifications', phone_notifications: 'phoneNotifications' } as Record<string, string>)[purpose];
      if (preferenceField) await prisma.guest.update({ where: { id }, data: { communicationPreferences: { ...(guest.communicationPreferences || {}), [preferenceField]: data.status === 'granted', ...(purpose === 'email_marketing' && data.status === 'revoked' ? { newsletterSubscribed: false } : {}) } } });
    } else if (command === 'legal_hold') {
      const holdId = text(data.holdId, 'Hold reference', 100);
      if (typeof data.active !== 'boolean') throw new Error('Legal hold active must be true or false.');
      if (!data.active && !state.holds.some(hold => hold.holdId === holdId)) throw new Error('Active legal hold not found.');
      after = { holdId, active: data.active, reason: text(data.reason, 'Hold or release reason'), recordedAt: new Date().toISOString() };
    } else if (command === 'retention_policy') {
      if (!Number.isSafeInteger(data.retentionDays) || data.retentionDays < 0 || data.retentionDays > 36_500) throw new Error('Retention must be a whole number of days between 0 and 36500.');
      after = { retentionDays: data.retentionDays, policyReference: text(data.policyReference, 'Reviewed retention policy reference') };
    } else if (command === 'document_register') {
      await assertGuestProfileEditable(prisma, id);
      if (!['passport', 'id_card', 'drivers_license', 'other'].includes(data.documentType)) throw new Error('Unsupported registration document type.');
      const expires = data.expiryDate ? new Date(data.expiryDate) : null;
      if (expires && (!Number.isFinite(expires.getTime()) || expires < new Date())) throw new Error('Registration document expiry must be a valid future date.');
      const number = text(data.documentNumber, 'Document number', 200);
      if (number.startsWith('enc:')) throw new Error('Enter the original document number, not an encrypted payload.');
      const document = await prisma.guestDocument.create({ data: {
        guestId: id, documentType: data.documentType, documentNumber: encryptSensitiveText(number),
        issuingCountry: text(data.issuingCountry, 'Issuing country', 100), expiryDate: expires,
        verified: data.verified === true, verifiedAt: data.verified === true ? new Date() : null, verifiedById: data.verified === true ? context.session.itemId : null,
        frontImage: '', backImage: '',
      } });
      after = { documentId: document.id, documentType: data.documentType, verified: data.verified === true, evidenceRef: text(data.evidenceRef, 'Identity verification evidence') };
    } else if (command === 'subject_request') {
      if (!['export', 'anonymize'].includes(data.type) || data.identityVerified !== true) throw new Error('Verify subject identity and select export or anonymize.');
      after = { requestId: idFor(key), type: data.type, status: 'pending', evidenceRef: text(data.evidenceRef, 'Subject verification evidence'), requestedAt: new Date().toISOString() };
    } else if (command === 'subject_fulfilled') {
      const subject = state.requests.find(item => item.requestId === data.requestId && item.status === 'pending');
      if (!subject) throw new Error('Pending subject request not found for this guest.');
      if (subject.type === 'anonymize') {
        if (state.holds.length) throw new Error('A legal hold prevents anonymization.');
        if (state.retentionDays === null) throw new Error('Record a reviewed retention policy before anonymization.');
        if ((await activeGuestMerges(prisma)).some(merge => [merge.sourceGuestId, merge.targetGuestId].includes(id))) throw new Error('Unmerge related profiles before fulfilling an anonymization request.');
        const active = await prisma.booking.findFirst({ where: { guestProfileId: id, status: { in: ['pending', 'confirmed', 'checked_in', 'cancellation_pending'] } }, select: { id: true } });
        if (active) throw new Error('Active reservations must be resolved before anonymization.');
        const latest = await prisma.booking.findFirst({ where: { guestProfileId: id }, orderBy: { checkOutDate: 'desc' }, select: { checkOutDate: true } });
        const retainedUntil = new Date(latest?.checkOutDate || guest.createdAt).getTime() + state.retentionDays * 86_400_000;
        if (Date.now() < retainedUntil) throw new Error('The recorded retention period has not elapsed.');
        await prisma.guestDocument.deleteMany({ where: { guestId: id } });
        const anonymousEmail = `anonymized-${id}@invalid.example`;
        await prisma.guest.update({ where: { id }, data: { firstName: 'Anonymized', lastName: 'Guest', email: anonymousEmail, phone: '', nationality: '', address1: '', address2: '', city: '', state: '', postalCode: '', country: '', company: '', specialNotes: '', idNumber: '', idType: null, preferences: {}, communicationPreferences: { emailMarketing: false }, loyaltyNumber: null, userAccountId: null, isBlacklisted: true } });
        await prisma.booking.updateMany({ where: { guestProfileId: id }, data: { guestName: 'Anonymized Guest', guestEmail: anonymousEmail, guestPhone: '', specialRequests: '' } });
      }
      after = { ...subject, status: 'completed', completedAt: new Date().toISOString(), retainedEvidence: 'Financial amounts, stay dates, immutable audit history and restricted provider evidence remain subject to the recorded retention policy.' };
    } else if (command === 'subject_export') {
      const subject = state.requests.find(item => item.requestId === data.requestId && item.type === 'export' && item.status === 'completed');
      if (!subject) throw new Error('Complete a verified export request before downloading subject data.');
      after = { requestId: subject.requestId, downloadedAt: new Date().toISOString(), excludedSensitiveFields: ['document numbers and images', 'processor credentials and raw payment payloads'] };
    } else if (command === 'merge') {
      await assertGuestProfileEditable(prisma, id);
      if (relatedId === id) throw new Error('Choose a different target profile.');
      text(data.evidenceRef, 'Verified profile identity evidence');
      const target = await prisma.guest.findUnique({ where: { id: relatedId } }); if (!target || target.isBlacklisted) throw new Error('An unrestricted target guest is required.');
      if ((await activeGuestMerges(prisma)).some(merge => [merge.sourceGuestId, merge.targetGuestId].some(value => [id, relatedId].includes(value)))) throw new Error('Unmerge an existing related mapping before merging these profiles.');
      if (state.holds.length || guestGovernanceState(await guestEvents(prisma, relatedId)).holds.length) throw new Error('Resolve legal holds before merging profiles.');
      const rows = await prisma.booking.findMany({ where: { guestProfileId: id }, select: { id: true }, take: 5_001 });
      if (rows.length > 5_000) throw new Error('Profile merge exceeds the supported bounded size.');
      const bookingIds = rows.map((row: any) => row.id);
      const sourceWasBlacklisted = Boolean(guest.isBlacklisted);
      await prisma.booking.updateMany({ where: { id: { in: bookingIds }, guestProfileId: id }, data: { guestProfileId: relatedId } });
      await prisma.guest.update({ where: { id }, data: { isBlacklisted: true } });
      after = { mergeId: idFor(key), sourceGuestId: id, targetGuestId: relatedId, bookingIds, sourceWasBlacklisted, status: 'merged', evidenceRef: data.evidenceRef };
      await evidence(prisma, { eventKey: `${key}:merge`, actorId: context.session.itemId, aggregateType: 'guest_merge', aggregateId: after.mergeId, action: 'merged', request, afterSnapshot: after });
    } else if (command === 'unmerge') {
      const mergeId = text(data.mergeId, 'Merge ID', 100);
      const records = await prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'guest_merge', aggregateId: mergeId }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 1 });
      const merge = records[0]?.afterSnapshot;
      if (!merge || merge.sourceGuestId !== id || merge.status !== 'merged') throw new Error('Active merge does not belong to this source profile.');
      await lock(prisma, merge.targetGuestId);
      if (state.holds.length || guestGovernanceState(await guestEvents(prisma, merge.targetGuestId)).holds.length) throw new Error('Resolve legal holds before changing profile mappings.');
      const count = await prisma.booking.count({ where: { id: { in: merge.bookingIds }, guestProfileId: merge.targetGuestId } });
      if (count !== merge.bookingIds.length) throw new Error('A later profile operation changed the merge mapping; resolve that operation first.');
      await prisma.booking.updateMany({ where: { id: { in: merge.bookingIds }, guestProfileId: merge.targetGuestId }, data: { guestProfileId: id } });
      await prisma.guest.update({ where: { id }, data: { isBlacklisted: merge.sourceWasBlacklisted } });
      after = { ...merge, status: 'unmerged', evidenceRef: text(data.evidenceRef, 'Unmerge reason') };
      await evidence(prisma, { eventKey: `${key}:unmerge`, actorId: context.session.itemId, aggregateType: 'guest_merge', aggregateId: mergeId, action: 'unmerged', request, afterSnapshot: after });
    } else throw new Error('Unsupported guest governance command.');
    await evidence(prisma, { eventKey: key, actorId: context.session.itemId, aggregateType: 'guest_governance', aggregateId: id, action, request, beforeSnapshot: before, afterSnapshot: after });
    return JSON.stringify(await guestExport(prisma, id));
  });
}

export type HotelApprovalAction = 'refund' | 'write_off' | 'rate_publish' | 'cash_variance' | 'security_capture' | 'payout_reconcile';
export function assertHotelApprovalEvidence(request: any, decision: any, input: { action: HotelApprovalAction; aggregateId: string; amountMinor: number; actorId: string; parameters?: unknown }) {
  if (!request || !decision || request.action !== input.action || request.aggregateId !== input.aggregateId || request.amountMinor !== input.amountMinor || request.requestedBy !== input.actorId) throw new Error('Approval does not match the requested action, actor, target and amount.');
  if (decision.status !== 'approved' || decision.approvedBy === request.requestedBy) throw new Error('An independent approval is required.');
  if (input.parameters !== undefined && hashLifecycleRequest(request.parameters) !== hashLifecycleRequest(input.parameters)) throw new Error('Approval parameters do not match the requested change.');
}
export async function requireHotelApproval(prisma: any, input: { approvalId?: string | null; action: HotelApprovalAction; aggregateId: string; amountMinor: number; actorId: string; operationKey: string; parameters?: unknown }) {
  const approvalId = text(input.approvalId, 'Independent approval ID', 100);
  await lock(prisma, `approval:${approvalId}`);
  const [request, decision, consumed] = await Promise.all([
    prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:request` } }),
    prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:decision` } }),
    prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:used` } }),
  ]);
  assertHotelApprovalEvidence(request?.afterSnapshot, decision?.afterSnapshot, input);
  if (consumed) {
    if (consumed.afterSnapshot?.operationKey !== input.operationKey) throw new Error('Approval has already been used by another operation.');
    return;
  }
  await evidence(prisma, { eventKey: `hotel-approval:${approvalId}:used`, actorId: input.actorId, aggregateType: 'hotel_approval', aggregateId: approvalId, action: 'used', request: input, afterSnapshot: { operationKey: input.operationKey } });
}

export async function hotelApprovalWorkspace(_root: unknown, { offset = 0 }: { offset?: number }, context: any) {
  if (!permissions.canApproveHotelExceptions({ session: context.session }) && !permissions.canManagePayments({ session: context.session }) && !permissions.canManageRooms({ session: context.session })) throw new Error('Not authorized for hotel approvals.');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Approval history offset must be a nonnegative integer.');
  const requests = await context.prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'hotel_approval', action: 'request' }, take: 101, skip: offset, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] });
  const page = requests.slice(0, 100);
  const rows = page.length ? await context.prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'hotel_approval', aggregateId: { in: page.map((row: any) => row.aggregateId) } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] }) : [];
  return JSON.stringify({ rows: rows.map((row: any) => ({ approvalId: row.aggregateId, action: row.action, occurredAt: row.occurredAt, evidence: row.afterSnapshot })), nextOffset: requests.length > 100 ? offset + 100 : null });
}
export async function updateHotelApproval(_root: unknown, { payload, idempotencyKey }: { payload: string; idempotencyKey: string }, context: any) {
  if (payload.length > 10_000) throw new Error('Approval payload too large.');
  const data = JSON.parse(payload); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('A structured approval request is required.');
  const key = text(idempotencyKey, 'Idempotency key', 200);
  const decision = ['approved', 'declined'].includes(data.status);
  if (decision) allow(context, 'canApproveHotelExceptions');
  else if (!permissions.canManagePayments({ session: context.session }) && !permissions.canManageRooms({ session: context.session })) throw new Error('Not authorized to request hotel approval.');
  const approvalId = decision ? text(data.approvalId, 'Approval ID', 100) : idFor(key);
  return runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma; await lock(prisma, `approval:${approvalId}`);
    let after: any;
    if (decision) {
      const request = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: `hotel-approval:${approvalId}:request` } });
      if (!request || request.afterSnapshot.requestedBy === context.session.itemId) throw new Error('A different authorized staff member must approve this request.');
      after = { status: data.status, approvedBy: context.session.itemId, reason: text(data.reason, 'Approval reason') };
    } else {
      if (!['refund', 'write_off', 'rate_publish', 'cash_variance', 'security_capture', 'payout_reconcile'].includes(data.action) || !Number.isSafeInteger(data.amountMinor) || data.amountMinor < 0) throw new Error('Valid approval action and amount are required.');
      if (data.action === 'payout_reconcile' && (!/^[a-f0-9]{64}$/.test(String(data.parameters?.sourceHash || '')) || !String(data.parameters?.bankReference || '').trim() || String(data.parameters.bankReference).length > 200 || !Number.isSafeInteger(data.parameters?.bankAmountMinor))) throw new Error('Payout approval requires an exact statement source hash, bank reference and signed integer bank amount.');
      if (data.action === 'rate_publish' && (!['active', 'inactive', 'draft'].includes(data.parameters?.status) || typeof data.parameters?.isPublic !== 'boolean')) throw new Error('Rate approval must specify the publication status and public visibility.');
      let parameters = data.parameters || null;
      let economicReview: any = null;
      if (data.action === 'rate_publish') {
        const economics = await loadRateEconomics(prisma, text(data.aggregateId, 'Target ID', 200));
        parameters = { ...parameters, economicsHash: economics.economicsHash };
        economicReview = { target: rateEconomicsReview(economics.plan, economics.derivedConfig) };
        if (parameters.derivedRate?.enabled) {
          const source = await loadRateEconomics(prisma, text(parameters.derivedRate.sourcePlanId, 'Source rate ID', 200));
          parameters.sourceEconomicsHash = source.economicsHash; economicReview.source = rateEconomicsReview(source.plan, source.derivedConfig);
        }
      }
      after = { action: data.action, aggregateId: text(data.aggregateId, 'Target ID', 200), amountMinor: data.amountMinor, requestedBy: context.session.itemId, reason: text(data.reason, 'Request reason'), parameters, ...(economicReview ? { economicReview } : {}) };
    }
    const eventKey = `hotel-approval:${approvalId}:${decision ? 'decision' : 'request'}`;
    const request = { ...after, idempotencyKey: key };
    const existing = await prisma.hotelAuditEvent.findUnique({ where: { eventKey } });
    if (existing) { if (existing.requestHash !== hashLifecycleRequest(request)) throw new Error('Approval identity already has a different request or decision.'); }
    else await evidence(prisma, { eventKey, actorId: context.session.itemId, aggregateType: 'hotel_approval', aggregateId: approvalId, action: decision ? 'decision' : 'request', request, afterSnapshot: after });
    return JSON.stringify({ approvalId, ...after });
  });
}

export const hotelGuestGovernanceTypeDefs = String.raw`
  extend type Query { hotelGuestGovernance(guestId: ID!): String!, hotelGovernanceGuestSearch(search: String!): String!, hotelApprovalWorkspace(offset: Int): String! }
  extend type Mutation {
    updateHotelGuestGovernance(guestId: ID!, command: String!, payload: String!, idempotencyKey: String!): String!
    updateHotelApproval(payload: String!, idempotencyKey: String!): String!
  }
`;
export const hotelGuestGovernanceResolvers = { Query: { hotelGuestGovernance, hotelGovernanceGuestSearch, hotelApprovalWorkspace }, Mutation: { updateHotelGuestGovernance, updateHotelApproval } };
