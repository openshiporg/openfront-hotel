import { Prisma } from '@prisma/client';
import { permissions } from '../access';
import { getBookingCollectibleBalance } from '../folios/bookingFolio';
import { calculateFolioBalance } from '../folios/ledger';
import { currentPostingDate } from '../lib/hotelBusinessTime';
import { assertActiveCashierShift } from '../cashier/commands';
import { requireHotelApproval } from '../guest-governance/commands';
import { findHotelLifecycleReplay, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { HOTEL_RECEIVABLE_ACTIONS, type HotelPayerAllocation, type HotelReceivableAction, type ManageHotelReceivableInput } from './contracts';

type Account = { id: string; sequence: number; name: string; billingEmail: string; creditLimitMinor: number; termsDays: number; currencyCode: 'USD' };
type PayerAllocation = HotelPayerAllocation;
type Invoice = { id: string; sequence: number; accountId: string; folioId: string; bookingId: string | null; currencyCode: 'USD'; amountMinor: number; balanceMinor: number; issuedOn: string; dueOn: string; status: 'open' | 'paid' | 'written_off' | 'credit_due' | 'refunded'; reference: string; creditedMinor?: number; writtenOffMinor?: number; payerAllocations?: PayerAllocation[] };
const RECEIVABLE_PROJECTION_VERSION = 1;
const MAX_RECEIVABLE_MINOR = 2_147_483_647;
function authorize(context: any) { if (!permissions.canManagePayments({ session: context.session })) throw new Error('Receivables payment permission is required.'); return context.session.itemId as string; }
function text(value: unknown, label: string, max = 200) { const result = String(value || '').trim(); if (!result || result.length > max) throw new Error(`${label} is required and bounded.`); return result; }
function minor(value: unknown, minimum = 1, maximum = MAX_RECEIVABLE_MINOR) { if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error('Enter a valid integer minor-unit amount.'); return Number(value); }
function projectionError(): never { throw new Error('Receivable event projection integrity is invalid.'); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function projectionDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return projectionError();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return projectionError();
  return value;
}
function validateReceivableProjection(type: string, aggregateId: unknown, value: unknown): Account | Invoice {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || value.id !== aggregateId || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1) return projectionError();
  if (value.projectionVersion !== undefined && value.projectionVersion !== RECEIVABLE_PROJECTION_VERSION) return projectionError();
  const { projectionVersion: _projectionVersion, ...state } = value;
  if (type === 'receivable_account') {
    if (typeof state.name !== 'string' || !state.name || state.name.length > 200 || typeof state.billingEmail !== 'string' || state.billingEmail.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.billingEmail) || !Number.isSafeInteger(state.creditLimitMinor) || Number(state.creditLimitMinor) < 0 ||
      !Number.isInteger(state.termsDays) || Number(state.termsDays) < 0 || Number(state.termsDays) > 365 || state.currencyCode !== 'USD') return projectionError();
    return state as Account;
  }
  if (type !== 'receivable_invoice' || typeof state.accountId !== 'string' || !state.accountId || typeof state.folioId !== 'string' || !state.folioId ||
    !(state.bookingId === null || (typeof state.bookingId === 'string' && Boolean(state.bookingId))) || state.currencyCode !== 'USD' ||
    !Number.isSafeInteger(state.amountMinor) || Number(state.amountMinor) <= 0 || Number(state.amountMinor) > MAX_RECEIVABLE_MINOR ||
    !Number.isSafeInteger(state.balanceMinor) || Math.abs(Number(state.balanceMinor)) > Number(state.amountMinor) ||
    !['open', 'paid', 'written_off', 'credit_due', 'refunded'].includes(String(state.status)) || typeof state.reference !== 'string' || !state.reference || state.reference.length > 200) return projectionError();
  const issuedOn = projectionDate(state.issuedOn);
  const dueOn = projectionDate(state.dueOn);
  if (dueOn < issuedOn) return projectionError();
  for (const field of ['creditedMinor', 'writtenOffMinor'] as const) {
    if (state[field] !== undefined && (!Number.isSafeInteger(state[field]) || Number(state[field]) < 0 || Number(state[field]) > Number(state.amountMinor))) return projectionError();
  }
  const creditedMinor = Number(state.creditedMinor || 0);
  const writtenOffMinor = Number(state.writtenOffMinor || 0);
  if (creditedMinor + writtenOffMinor > Number(state.amountMinor) ||
    (state.status === 'open' && Number(state.balanceMinor) <= 0) ||
    (['paid', 'written_off', 'refunded'].includes(String(state.status)) && Number(state.balanceMinor) !== 0) ||
    (state.status === 'credit_due' && Number(state.balanceMinor) >= 0) ||
    (state.status === 'written_off' && writtenOffMinor === 0)) return projectionError();
  if (state.payerAllocations !== undefined) {
    if (!Array.isArray(state.payerAllocations) || state.payerAllocations.length > 200) return projectionError();
    const seen = new Set<string>(); let allocatedMinor = 0;
    for (const allocation of state.payerAllocations) {
      if (!isRecord(allocation) || typeof allocation.entryId !== 'string' || !allocation.entryId || seen.has(allocation.entryId) ||
        !Number.isSafeInteger(allocation.amountMinor) || Number(allocation.amountMinor) <= 0 || Number(allocation.amountMinor) > MAX_RECEIVABLE_MINOR) return projectionError();
      seen.add(allocation.entryId); allocatedMinor += Number(allocation.amountMinor);
      if (!Number.isSafeInteger(allocatedMinor)) return projectionError();
    }
    if (allocatedMinor > Number(state.amountMinor)) return projectionError();
  }
  return state as Invoice;
}
function versionReceivableProjection<T extends Account | Invoice>(state: T): T & { projectionVersion: number } {
  return { ...state, projectionVersion: RECEIVABLE_PROJECTION_VERSION };
}
async function latest(prisma: any, type: 'receivable_account'): Promise<Account[]>;
async function latest(prisma: any, type: 'receivable_invoice'): Promise<Invoice[]>;
async function latest(prisma: any, type: 'receivable_account' | 'receivable_invoice'): Promise<(Account | Invoice)[]> {
  const rows = await prisma.$queryRaw(Prisma.sql`WITH raw_events AS (
      SELECT "id", "aggregateId", "afterSnapshot", "occurredAt",
        CASE WHEN jsonb_typeof("afterSnapshot")='object' AND jsonb_typeof("afterSnapshot"->'sequence')='number'
          THEN CASE WHEN ("afterSnapshot"->>'sequence') ~ '^[1-9][0-9]{0,15}$' THEN ("afterSnapshot"->>'sequence')::numeric ELSE NULL END
          ELSE NULL END AS raw_sequence
      FROM "HotelAuditEvent" WHERE "aggregateType"=${type} AND "propertyKey"=${HOTEL_PROPERTY_KEY}
    ), sequenced AS (
      SELECT *, CASE WHEN raw_sequence <= 9007199254740991 THEN raw_sequence ELSE NULL END AS sequence FROM raw_events
    ), integrity AS (
      SELECT EXISTS(SELECT 1 FROM sequenced WHERE sequence IS NULL) AS "hasMalformed",
        EXISTS(SELECT 1 FROM sequenced WHERE sequence IS NOT NULL GROUP BY "aggregateId", sequence HAVING COUNT(*) > 1) AS "hasTied"
    ), selected AS (
      SELECT DISTINCT ON ("aggregateId") "aggregateId", "afterSnapshot" AS state FROM sequenced WHERE sequence IS NOT NULL
      ORDER BY "aggregateId", sequence DESC, "occurredAt" DESC, "id" DESC
    )
    SELECT selected."aggregateId", selected.state, integrity."hasMalformed", integrity."hasTied"
    FROM integrity LEFT JOIN selected ON TRUE`);
  if (rows.some((row: any) => row.hasMalformed || row.hasTied)) return projectionError();
  return rows.filter((row: any) => row.state !== null && row.state !== undefined)
    .map((row: any) => validateReceivableProjection(type, row.aggregateId, row.state));
}
export function receivableAging(invoices: Invoice[], on: Date) {
  const day = new Date(on); day.setUTCHours(0, 0, 0, 0);
  return invoices.map(invoice => { const overdueDays = Math.max(0, Math.floor((day.getTime() - new Date(invoice.dueOn).getTime()) / 86400000));
    return { ...invoice, overdueDays, agingBucket: invoice.balanceMinor < 0 ? 'credit due to company' : !invoice.balanceMinor ? 'settled' : overdueDays === 0 ? 'current' : overdueDays <= 30 ? '1–30 days' : overdueDays <= 60 ? '31–60 days' : '61+ days' }; });
}
function receivableAccountBalances(accounts: Account[], invoices: Invoice[]) {
  const accountIds = new Set(accounts.map(account => account.id));
  const balances = new Map<string, number>();
  for (const invoice of invoices) {
    if (!accountIds.has(invoice.accountId)) return projectionError();
    const outstanding = (balances.get(invoice.accountId) || 0) + invoice.balanceMinor;
    if (!Number.isSafeInteger(outstanding)) return projectionError();
    balances.set(invoice.accountId, outstanding);
  }
  return balances;
}
async function loadReceivableWorkspace(context: any) {
  authorize(context);
  const [accounts, invoices, clock] = await Promise.all([latest(context.prisma, 'receivable_account'), latest(context.prisma, 'receivable_invoice'), context.prisma.hotelBusinessDate.findUnique({ where: { id: 1 } })]);
  if (!clock) throw new Error('Property business date is required.');
  const balances = receivableAccountBalances(accounts, invoices);
  return {
    accounts: accounts.map(account => ({ ...account, outstandingMinor: balances.get(account.id) || 0 })),
    invoices: receivableAging(invoices, clock.currentBusinessDate),
  };
}

function receivablePageSize(value: unknown) {
  if (value === undefined || value === null) return 50;
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new Error('Receivable page size must be an integer from 1 to 100.');
  }
  return Number(value);
}

function pageReceivableRows<T extends { id: string }>(rows: T[], cursor: unknown, pageSize: number) {
  // Projection validation and account-balance reconciliation happen before this stable keyset page.
  const ordered = [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  let start = 0;
  if (cursor !== undefined && cursor !== null) {
    const cursorId = text(cursor, 'Receivable page cursor');
    const cursorIndex = ordered.findIndex(row => row.id === cursorId);
    if (cursorIndex < 0) throw new Error('Receivable page cursor is invalid; reload the workspace.');
    start = cursorIndex + 1;
  }
  const items = ordered.slice(start, start + pageSize);
  const hasMore = start + items.length < ordered.length;
  return { items, hasMore, nextCursor: hasMore && items.length ? items[items.length - 1].id : null };
}

/** Legacy full-workspace resolver retained for existing callers; the dashboard uses the bounded page query. */
export async function hotelReceivableOperations(_root: unknown, _args: unknown, context: any) {
  return loadReceivableWorkspace(context);
}

/** Select and validate the complete latest projection before returning a bounded stable page. */
export async function hotelReceivableOperationsPage(
  _root: unknown,
  args: { afterAccountId?: unknown; afterInvoiceId?: unknown; pageSize?: unknown },
  context: any,
) {
  const workspace = await loadReceivableWorkspace(context);
  const pageSize = receivablePageSize(args?.pageSize);
  const accounts = pageReceivableRows(workspace.accounts, args?.afterAccountId, pageSize);
  const invoices = pageReceivableRows(workspace.invoices, args?.afterInvoiceId, pageSize);
  return {
    accounts: accounts.items,
    invoices: invoices.items,
    accountsHasMore: accounts.hasMore,
    nextAccountCursor: accounts.nextCursor,
    invoicesHasMore: invoices.hasMore,
    nextInvoiceCursor: invoices.nextCursor,
  };
}

export function parseManageHotelReceivableInput(value: unknown): ManageHotelReceivableInput {
  if (!isRecord(value)) throw new Error('Receivables input must be an object.');
  const actionValue = value.action;
  if (typeof actionValue !== 'string' || !HOTEL_RECEIVABLE_ACTIONS.includes(actionValue as HotelReceivableAction)) {
    throw new Error('Unknown receivables action.');
  }
  const action = actionValue as HotelReceivableAction;
  const base = {
    id: text(value.id, 'Record ID'),
    idempotencyKey: text(value.idempotencyKey, 'Idempotency key'),
    reference: text(value.reference, 'Billing or payment reference'),
    billingEmail: String(value.billingEmail || ''),
    termsDays: Number(value.termsDays || 0),
    accountId: String(value.accountId || ''),
    folioId: String(value.folioId || ''),
    bookingId: String(value.bookingId || ''),
    method: String(value.method || ''),
    approvalId: String(value.approvalId || ''),
  };
  if (action === 'route_charges') {
    const payerAllocations = normalizePayerAllocations(value.payerAllocations);
    return { ...base, action, amountMinor: minor(payerAllocations.reduce((sum, row) => sum + row.amountMinor, 0)), payerAllocations };
  }
  return { ...base, action, amountMinor: minor(value.amountMinor, action === 'account' ? 0 : 1, action === 'account' ? Number.MAX_SAFE_INTEGER : MAX_RECEIVABLE_MINOR) };
}

export async function manageHotelReceivable(_root: unknown, args: { input: unknown }, context: any) {
  const actorId = authorize(context);
  const input = parseManageHotelReceivableInput(args.input);
  const action = input.action;
  const id = input.id;
  const idempotencyKey = input.idempotencyKey;
  const payerAllocations: PayerAllocation[] = input.action === 'route_charges' ? input.payerAllocations : [];
  const amountMinor = input.amountMinor;
  const createsInvoice = action === 'invoice' || action === 'route_charges';
  const reference = input.reference;
  const normalized = { action, id, amountMinor, payerAllocations, reference, accountId: input.accountId, folioId: input.folioId,
    bookingId: input.bookingId, billingEmail: input.billingEmail, termsDays: input.termsDays, method: input.method, approvalId: input.approvalId, actorId };
  const aggregateType = action === 'account' ? 'receivable_account' : 'receivable_invoice';
  const eventKey = `receivable:${idempotencyKey}`; const identity = { request: normalized, aggregateType, aggregateId: id, action };
  return runSerializableTransaction(context, async (tx: any) => {
    // Match folio mutation lock order before the property receivables serialization lock.
    const parentFolio = createsInvoice ? await tx.prisma.folio.findUnique({ where: { id: text(input.folioId, 'Folio ID') }, select: { bookingId: true } }) : null;
    const settlementBookingId = parentFolio?.bookingId || (action === 'route_charges' ? normalized.bookingId : '');
    if (settlementBookingId) await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${settlementBookingId}`);
    if (createsInvoice) await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-folio:${normalized.folioId}`);
    await lockHotelLifecycle(tx.prisma, 'receivables');
    const folio = createsInvoice ? await tx.prisma.folio.findUnique({ where: { id: input.folioId }, include: { entries: true } }) : null;
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity); if (replay) return validateReceivableProjection(aggregateType, replay.aggregateId, replay.afterSnapshot);
    const accounts = await latest(tx.prisma, 'receivable_account'); const invoices = await latest(tx.prisma, 'receivable_invoice');
    receivableAccountBalances(accounts, invoices);
    let before: Account | Invoice | null = null; let next: Account | Invoice;
    if (action === 'account') {
      if (accounts.some(a => a.id === id)) throw new Error('This credit account already exists.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.billingEmail) || normalized.billingEmail.length > 320) throw new Error('A valid billing email is required.');
      if (!Number.isInteger(normalized.termsDays) || normalized.termsDays < 0 || normalized.termsDays > 365) throw new Error('Credit terms must be 0–365 days.');
      next = { id, sequence: 1, name: reference, billingEmail: normalized.billingEmail, creditLimitMinor: amountMinor, termsDays: normalized.termsDays, currencyCode: 'USD' };
    } else if (createsInvoice) {
      if (!folio || folio.status !== 'open' || folio.currencyCode !== 'USD') throw new Error('An open USD folio is required for direct billing.');
      if (action === 'route_charges') {
        const member = await payerWindowMember(tx.prisma, folio, normalized.bookingId);
        validatePayerAllocations(folio, invoices, payerAllocations, member);
      }
      if (invoices.some(i => i.id === id)) throw new Error('This invoice already exists.');
      const account = accounts.find(a => a.id === input.accountId); if (!account) throw new Error('Approved credit account not found.');
      const balance = settlementBookingId ? (await getBookingCollectibleBalance(tx, settlementBookingId)).balanceDueMinor : calculateFolioBalance(folio.entries).balanceMinor;
      if (amountMinor > balance) throw new Error('Invoice allocation exceeds the remaining folio balance.');
      const outstanding = invoices.filter(i => i.accountId === account.id).reduce((sum, i) => sum + i.balanceMinor, 0);
      if (outstanding + amountMinor > account.creditLimitMinor) throw new Error('Account credit limit would be exceeded.');
      const day = await currentPostingDate(tx.prisma); const due = new Date(day); due.setUTCDate(due.getUTCDate() + account.termsDays);
      next = { id, sequence: 1, accountId: account.id, folioId: folio.id, bookingId: settlementBookingId || null, currencyCode: 'USD', amountMinor,
        balanceMinor: amountMinor, issuedOn: day.toISOString().slice(0, 10), dueOn: due.toISOString().slice(0, 10), status: 'open', reference, ...(payerAllocations.length ? { payerAllocations } : {}) };
      await tx.prisma.folioEntry.create({ data: { folioId: folio.id, postingKey: `ar-transfer:${id}`, entryType: 'transfer', direction: 'credit', amountMinor, currencyCode: 'USD',
        description: `Direct bill to ${account.name}: ${reference}`, serviceDate: day, postedAt: new Date(), sourceType: 'system', sourceId: id,
        metadataSnapshot: { receivableInvoiceId: id, accountId: account.id, sourceEntryIds: payerAllocations.length ? payerAllocations.map(row => row.entryId) : folio.entries.map((entry: any) => entry.id), payerAllocations, actorId } } });
    } else {
      const invoice = invoices.find(i => i.id === id); if (!invoice || (action === 'refund_credit' ? invoice.status !== 'credit_due' || amountMinor > -invoice.balanceMinor : invoice.status !== 'open' || amountMinor > invoice.balanceMinor)) throw new Error('Collection or payout exceeds the eligible invoice balance.');
      before = invoice; const remaining = invoice.balanceMinor + (action === 'refund_credit' ? amountMinor : -amountMinor);
      if (action === 'write_off') {
        await requireHotelApproval(tx.prisma, { approvalId: input.approvalId, action: 'write_off', aggregateId: id, amountMinor, actorId, operationKey: eventKey });
      } else if (action === 'refund_credit') {
        await requireHotelApproval(tx.prisma, { approvalId: input.approvalId, action: 'refund', aggregateId: id, amountMinor, actorId, operationKey: eventKey });
      }
      if (action !== 'write_off' && !['cash', 'bank_transfer', 'check'].includes(normalized.method)) throw new Error('Record a cash, bank transfer or check collection with its receipt reference.');
      const cashierShiftId = action !== 'write_off' && normalized.method === 'cash' ? await assertActiveCashierShift(tx.prisma, actorId, 'USD') : null;
      const day = await currentPostingDate(tx.prisma);
      next = { ...invoice, sequence: invoice.sequence + 1, writtenOffMinor: (invoice.writtenOffMinor || 0) + (action === 'write_off' ? amountMinor : 0), balanceMinor: remaining, status: remaining < 0 ? 'credit_due' : remaining > 0 ? 'open' : action === 'write_off' ? 'written_off' : action === 'refund_credit' ? 'refunded' : 'paid' };
      await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId, eventKey: `${eventKey}:collection`, identity: { request: normalized, aggregateType: 'receivable_payment', aggregateId: id, action },
        afterSnapshot: { invoiceId: id, amountMinor: action === 'refund_credit' ? -amountMinor : amountMinor, currencyCode: 'USD', method: normalized.method, cashierShiftId, reference, serviceDate: day.toISOString().slice(0, 10), kind: action } });
    }
    if (createsInvoice && settlementBookingId) {
      const obligation = await getBookingCollectibleBalance(tx, settlementBookingId);
      await tx.prisma.booking.update({ where: { id: settlementBookingId }, data: { balanceDueMinor: obligation.balanceDueMinor, balanceDue: obligation.balanceDueMinor / 100, paymentStatus: obligation.balanceDueMinor ? 'partial' : 'paid' } });
    }
    await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId, eventKey, identity, beforeSnapshot: before, afterSnapshot: versionReceivableProjection(next) });
    return next;
  });
}

/** Cancel unpaid company debt first; collected amounts become explicit payer credit,
 * never a fabricated booking refund or a write-off of money already received. */
export async function creditDirectBillingForCancellation(tx: any, bookingId: string, folioId: string, cancellationKey: string) {
  await lockHotelLifecycle(tx.prisma, 'receivables');
  // A child reversal cannot be assigned to an amount-only master invoice without a stored charge window.
  const invoices = (await latest(tx.prisma, 'receivable_invoice')).filter(invoice => invoice.folioId === folioId && (
    invoice.bookingId === bookingId ||
    (invoice.bookingId === null && Array.isArray(invoice.payerAllocations) && invoice.payerAllocations.length > 0)
  ));
  const entries = await tx.prisma.folioEntry.findMany({ where: { folioId }, select: { id: true, reversesId: true, amountMinor: true, direction: true, currencyCode: true } });
  const reversed = new Set(entries.filter((entry: any) => entry.reversesId).map((entry: any) => entry.reversesId));
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
    const payerAllocations = invoice.payerAllocations?.map(row => { const release = reversed.has(row.entryId) ? Math.min(allocationCredit, row.amountMinor) : 0; allocationCredit -= release; return { ...row, amountMinor: row.amountMinor - release }; }).filter(row => row.amountMinor > 0);
    const next: Invoice = { ...invoice, ...(payerAllocations ? { payerAllocations } : {}), sequence: invoice.sequence + 1, writtenOffMinor: (invoice.writtenOffMinor || 0) - writtenOffReversed, creditedMinor: (invoice.creditedMinor || 0) + creditMinor,
      balanceMinor, status: balanceMinor < 0 ? 'credit_due' : balanceMinor > 0 ? 'open' : 'paid' };
    const day = await currentPostingDate(tx.prisma);
    await tx.prisma.folioEntry.create({ data: { folioId, postingKey: eventKey, entryType: 'transfer', direction: 'debit', amountMinor: creditMinor, currencyCode: 'USD',
      description: `Cancellation credit memo for company invoice ${invoice.reference}`, serviceDate: day, postedAt: new Date(), sourceType: 'system', sourceId: invoice.id,
      metadataSnapshot: { receivableInvoiceId: invoice.id, cancellationKey, creditMemo: true } } });
    await recordHotelLifecycleEvent({ prisma: tx.prisma, eventKey, identity: { request: { bookingId, invoiceId: invoice.id, creditMinor, cancellationKey }, aggregateType: 'receivable_invoice', aggregateId: invoice.id, action: 'cancellation_credited' },
      beforeSnapshot: invoice, afterSnapshot: versionReceivableProjection(next) });
  }
}


function normalizePayerAllocations(input: unknown): PayerAllocation[] {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error('Choose 1–200 posted charge allocations.');
  const rows = input.map(row => {
    if (!isRecord(row)) throw new Error('Each charge allocation must be an object.');
    return { entryId: text(row.entryId, 'Charge entry ID'), amountMinor: minor(row.amountMinor) };
  });
  if (new Set(rows.map(row => row.entryId)).size !== rows.length) throw new Error('A charge may appear only once per routing request.');
  return rows.sort((a, b) => a.entryId.localeCompare(b.entryId));
}
function validatePayerAllocations(folio: any, invoices: Invoice[], allocations: PayerAllocation[], member: any) {
  const sameFolio = invoices.filter(invoice => invoice.folioId === folio.id);
  if (sameFolio.some(invoice => !invoice.payerAllocations && invoice.amountMinor > (invoice.creditedMinor || 0))) throw new Error('Existing amount-only company allocations require reviewed charge attribution before adding charge-level windows.');
  const reversed = new Set(folio.entries.filter((entry: any) => entry.reversesId).map((entry: any) => entry.reversesId));
  for (const row of allocations) {
    const charge = folio.entries.find((entry: any) => entry.id === row.entryId);
    if (member && (!charge || charge.sourceType !== 'reservation_snapshot' || !member.lineItems.some((line: any) => line.id === charge.sourceId))) throw new Error('A group member window can route only that member’s attributable posted reservation charges.');
    if (!charge || charge.direction !== 'debit' || charge.currencyCode !== folio.currencyCode || !['room_charge', 'tax', 'fee', 'addon'].includes(charge.entryType) || reversed.has(charge.id) || charge.reversedById) throw new Error('Every allocation must reference an unreversed posted charge belonging to this folio.');
    const assigned = sameFolio.flatMap(invoice => invoice.payerAllocations || []).filter(item => item.entryId === row.entryId).reduce((sum, item) => sum + item.amountMinor, 0);
    if (assigned + row.amountMinor > charge.amountMinor) throw new Error('Company windows cannot allocate a charge more than once or exceed its remaining guest portion.');
  }
}
export async function hotelPayerWindows(_root: unknown, { folioId, bookingId }: { folioId: string; bookingId?: string | null }, context: any) {
  authorize(context);
  const folio = await context.prisma.folio.findUnique({ where: { id: text(folioId, 'Folio ID') }, include: { entries: { orderBy: [{ serviceDate: 'asc' }, { id: 'asc' }] } } });
  if (!folio) throw new Error('Source folio not found.');
  const member = await payerWindowMember(context.prisma, folio, String(bookingId || ''));
  const invoices = (await latest(context.prisma, 'receivable_invoice')).filter(invoice => invoice.folioId === folio.id && (!member || invoice.bookingId === member.id || invoice.bookingId === null));
  const reversed = new Set(folio.entries.filter((entry: any) => entry.reversesId).map((entry: any) => entry.reversesId));
  const charges = folio.entries.filter((entry: any) => (!member || (entry.sourceType === 'reservation_snapshot' && member.lineItems.some((line: any) => line.id === entry.sourceId))) && entry.direction === 'debit' && ['room_charge', 'tax', 'fee', 'addon'].includes(entry.entryType)).map((entry: any) => {
    const companyMinor = invoices.flatMap(invoice => invoice.payerAllocations || []).filter(row => row.entryId === entry.id).reduce((sum, row) => sum + row.amountMinor, 0);
    const isReversed = reversed.has(entry.id); return { entryId: entry.id, description: entry.description, amountMinor: entry.amountMinor, companyMinor, guestMinor: isReversed ? 0 : Math.max(0, entry.amountMinor - companyMinor), reversed: isReversed };
  });
  return { folioId: folio.id, bookingId: member?.id || folio.bookingId, remainingPayer: member ? 'group_master' : 'guest', currencyCode: folio.currencyCode, guestLedgerBalanceMinor: calculateFolioBalance(folio.entries).balanceMinor, charges,
    companyWindows: invoices.map(invoice => ({ invoiceId: invoice.id, accountId: invoice.accountId, reference: invoice.reference, balanceMinor: invoice.balanceMinor, status: invoice.status, payerAllocations: invoice.payerAllocations || [], unassignedMinor: invoice.payerAllocations ? 0 : Math.max(0, invoice.amountMinor - (invoice.creditedMinor || 0)) })) };
}


async function payerWindowMember(prisma: any, folio: any, bookingId: string) {
  if (folio.bookingId) { if (bookingId && folio.bookingId !== bookingId) throw new Error('Selected booking does not own this folio.'); return null; }
  if (!folio.groupBlockId || !bookingId) throw new Error('Select the group member booking ID for a shared master folio window.');
  const member = await prisma.booking.findUnique({ where: { id: bookingId }, include: { lineItems: true } });
  if (!member || member.id !== bookingId || member.billingFolioId !== folio.id || member.groupBlockId !== folio.groupBlockId) throw new Error('Selected group member does not belong to this master folio.');
  return member;
}
