import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { permissions } from '../access';
import { requireHotelApproval } from '../guest-governance/commands';
import { findHotelLifecycleReplay, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
export type PayoutRow = { providerCaptureId: string; grossMinor: number; refundMinor: number; feeMinor: number; netMinor: number };
export type ManageHotelPayoutInput =
  | { action: 'import'; idempotencyKey: string; providerCode: string; payoutId: string; payoutDate: string; currencyCode: string; csv: string }
  | { action: 'refresh'; idempotencyKey: string; id: string }
  | { action: 'confirm'; idempotencyKey: string; id: string; bankReference: string; bankAmountMinor: number; approvalId?: string };
export type ManageHotelPayoutDraft =
  | Omit<Extract<ManageHotelPayoutInput, { action: 'import' }>, 'idempotencyKey'>
  | Omit<Extract<ManageHotelPayoutInput, { action: 'refresh' }>, 'idempotencyKey'>
  | Omit<Extract<ManageHotelPayoutInput, { action: 'confirm' }>, 'idempotencyKey'>;
function text(value: unknown, label: string, max = 200) { const result = String(value || '').trim(); if (!result || result.length > max) throw new Error(`${label} is required and bounded.`); return result; }
function amount(value: any, signed = false) { if (!Number.isSafeInteger(value) || (!signed && value < 0) || Math.abs(value) > 2147483647) throw new Error('Statement amounts must be bounded integer minor units.'); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function parseManageHotelPayoutInput(value: unknown): ManageHotelPayoutInput {
  if (!isRecord(value)) throw new Error('Action is required and bounded.');
  const actionText = text(value.action, 'Action');
  const idempotencyKey = text(value.idempotencyKey, 'Attempt key', 150);
  if (!['import', 'refresh', 'confirm'].includes(actionText)) throw new Error('Unsupported statement action.');
  if (actionText === 'import') {
    const providerCode = text(value.providerCode, 'Provider');
    if (!['pp_stripe_stripe', 'pp_paypal_paypal'].includes(providerCode)) throw new Error('Unsupported statement provider.');
    const payoutId = text(value.payoutId, 'Payout ID', 150), payoutDate = text(value.payoutDate, 'Payout date', 10), currencyCode = text(value.currencyCode, 'Currency', 3).toUpperCase();
    if (currencyCode !== 'USD' || !/^\d{4}-\d{2}-\d{2}$/.test(payoutDate) || Number.isNaN(Date.parse(payoutDate)) || new Date(payoutDate).toISOString().slice(0, 10) !== payoutDate) throw new Error('A valid payout date and USD statement are required.');
    if (typeof value.csv !== 'string') throw new Error('Statement CSV exceeds the bounded import size.');
    return { action: 'import', idempotencyKey, providerCode, payoutId, payoutDate, currencyCode, csv: value.csv };
  }
  if (actionText === 'refresh') return { action: 'refresh', idempotencyKey, id: text(value.id, 'Statement ID') };
  const approvalId = typeof value.approvalId === 'string' ? value.approvalId : undefined;
  return { action: 'confirm', idempotencyKey, id: text(value.id, 'Statement ID'), bankReference: text(value.bankReference, 'Bank deposit/debit reference', 200), bankAmountMinor: amount(value.bankAmountMinor, true), approvalId };
}
export function parseHotelPayoutCsv(csv: string): PayoutRow[] {
  if (typeof csv !== 'string' || csv.length > 300000) throw new Error('Statement CSV exceeds the bounded import size.');
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift() !== 'providerCaptureId,grossMinor,refundMinor,feeMinor,netMinor' || !lines.length || lines.length > 1000) throw new Error('Use the exact statement header and 1–1000 rows.');
  const ids = new Set<string>();
  return lines.map(line => {
    const cells = line.split(','); if (cells.length !== 5 || !/^[A-Za-z0-9_-]{1,200}$/.test(cells[0]) || cells.slice(1).some(value => !/^-?\d+$/.test(value))) throw new Error('Statement rows require a provider capture ID and four integer amounts, without embedded delimiters.');
    if (ids.has(cells[0])) throw new Error('Duplicate capture IDs within one statement are not allowed.'); ids.add(cells[0]);
    const row = { providerCaptureId: cells[0], grossMinor: amount(Number(cells[1])), refundMinor: amount(Number(cells[2])), feeMinor: amount(Number(cells[3])), netMinor: amount(Number(cells[4]), true) };
    if (row.grossMinor - row.refundMinor - row.feeMinor !== row.netMinor || (!row.grossMinor && !row.refundMinor && !row.feeMinor)) throw new Error('Every row must reconcile gross less refunds and fees to net.');
    return row;
  });
}
async function statements(prisma: any): Promise<any[]> {
  const rows = await prisma.$queryRaw(Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent" WHERE "propertyKey"=${HOTEL_PROPERTY_KEY} AND "aggregateType"='payout_statement' ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row: any) => row.state);
}
async function validateSource(prisma: any, statement: any, all: any[]) {
  const exceptions: string[] = [];
  const earlier = all.filter(item => item.id !== statement.id && item.status === 'matched' && item.providerId === statement.providerId);
  for (const row of statement.rows as PayoutRow[]) {
    const captures = await prisma.bookingPayment.findMany({ where: { paymentProviderId: statement.providerId, providerCaptureId: row.providerCaptureId, paymentType: { not: 'refund' }, status: 'completed' }, take: 2 });
    if (captures.length !== 1) { exceptions.push(`${row.providerCaptureId}: expected one completed capture.`); continue; }
    const payment = captures[0];
    if (payment.currency !== statement.currencyCode || !Number.isSafeInteger(payment.amountMinor)) { exceptions.push(`${row.providerCaptureId}: capture currency or amount requires reconciliation.`); continue; }
    const refunds = await prisma.bookingPayment.findMany({ where: { paymentProviderId: statement.providerId, bookingId: payment.bookingId, paymentType: 'refund', status: 'refunded', OR: [{ providerData: { path: ['sourcePaymentId'], equals: payment.id } }, { providerPaymentId: row.providerCaptureId }] } });
    if (refunds.some((refund: any) => refund.currency !== statement.currencyCode || !Number.isSafeInteger(refund.amountMinor))) { exceptions.push(`${row.providerCaptureId}: refund currency or amount requires reconciliation.`); continue; }
    const prior = earlier.flatMap(item => item.rows).filter(item => item.providerCaptureId === row.providerCaptureId);
    const priorGross = prior.reduce((sum: number, item: any) => sum + item.grossMinor, 0), priorRefund = prior.reduce((sum: number, item: any) => sum + item.refundMinor, 0);
    const refundable = refunds.reduce((sum: number, item: any) => sum + Math.abs(item.amountMinor), 0);
    if (priorGross + row.grossMinor > payment.amountMinor || (row.grossMinor > 0 && priorGross + row.grossMinor !== payment.amountMinor)) exceptions.push(`${row.providerCaptureId}: gross capture is duplicated, incomplete, or differs from payment evidence.`);
    if (priorRefund + row.refundMinor > refundable) exceptions.push(`${row.providerCaptureId}: statement refund is not backed by settled refunds or was already allocated.`);
    if (row.grossMinor === 0 && priorGross !== payment.amountMinor) exceptions.push(`${row.providerCaptureId}: refund/fee-only rows require the original capture in an earlier matched statement.`);
  }
  return exceptions;
}
function authorize(context: any) { if (!permissions.canManagePayments({ session: context.session })) throw new Error('Payout reconciliation requires payment permission.'); return context.session.itemId as string; }
export async function hotelPayoutOperations(_root: unknown, _args: unknown, context: any) { authorize(context); return { statements: await statements(context.prisma) }; }
export async function manageHotelPayout(_root: unknown, args: { input: unknown }, context: any) {
  const actorId = authorize(context); const input = parseManageHotelPayoutInput(args.input); const action = input.action; const key = input.idempotencyKey;
  let candidate: any;
  if (action === 'import') {
    const { providerCode, payoutId, payoutDate, currencyCode } = input;
    const rows = parseHotelPayoutCsv(input.csv); const totals = rows.reduce((sum, row) => ({ grossMinor: sum.grossMinor + row.grossMinor, refundMinor: sum.refundMinor + row.refundMinor, feeMinor: sum.feeMinor + row.feeMinor, netMinor: sum.netMinor + row.netMinor }), { grossMinor: 0, refundMinor: 0, feeMinor: 0, netMinor: 0 });
    Object.values(totals).forEach(value => amount(value, true));
    const sourceHash = createHash('sha256').update(JSON.stringify({ providerCode, payoutId, payoutDate, currencyCode, rows })).digest('hex');
    candidate = { id: createHash('sha256').update(`${providerCode}:${payoutId}`).digest('hex').slice(0, 24), providerCode, payoutId, payoutDate, currencyCode, rows, totals, sourceHash };
  }
  const id = action === 'import' ? candidate.id : input.id;
  const bankReference = action === 'confirm' ? input.bankReference : '';
  const bankAmountMinor = action === 'confirm' ? input.bankAmountMinor : 0;
  const eventKey = `payout:${key}`; const identity = { request: { action, id, candidate: candidate || null, bankReference, bankAmountMinor, actorId }, aggregateType: 'payout_statement', aggregateId: id, action };
  return runSerializableTransaction(context, async tx => {
    const prisma = tx.prisma; await lockHotelLifecycle(prisma, 'payout-statements');
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity); if (replay) return replay.afterSnapshot;
    const all = await statements(prisma), prior = all.find(item => item.id === id);
    if (prior?.status === 'matched') throw new Error('Matched statements are immutable; corrections require a separately reviewed adjustment statement.');
    let next = candidate ? { ...candidate, sequence: (prior?.sequence || 0) + 1, importedBy: actorId } : { ...prior, sequence: (prior?.sequence || 0) + 1 };
    if (!candidate && !prior) throw new Error('Statement not found.');
    if (candidate) { const provider = await prisma.paymentProvider.findUnique({ where: { code: candidate.providerCode } }); if (!provider) throw new Error('Statement provider is not registered.'); next.providerId = provider.id; }
    const exceptions = await validateSource(prisma, next, all); next = { ...next, exceptions, status: exceptions.length ? 'exceptions' : 'awaiting_independent_review' };
    if (action === 'confirm') {
      if (exceptions.length) throw new Error('Resolve every source reconciliation exception before confirming a statement.');
      if (bankAmountMinor !== next.totals.netMinor) throw new Error('Bank statement amount must equal the exact signed payout net.');
      if (all.some(item => item.id !== id && item.status === 'matched' && item.bankReference === bankReference)) throw new Error('Bank settlement reference is already allocated to another statement.');
      await requireHotelApproval(prisma, { approvalId: input.approvalId, action: 'payout_reconcile', aggregateId: id, amountMinor: Math.abs(bankAmountMinor), actorId, operationKey: eventKey, parameters: { sourceHash: next.sourceHash, bankReference, bankAmountMinor } });
      next = { ...next, status: 'matched', bankReference, bankAmountMinor, reviewedBy: actorId, matchedAt: new Date().toISOString(), evidenceOrigin: 'operator_imported_provider_statement_and_bank_reference' };
    }
    await recordHotelLifecycleEvent({ prisma, actorId, eventKey, identity, beforeSnapshot: prior || null, afterSnapshot: next }); return next;
  });
}
