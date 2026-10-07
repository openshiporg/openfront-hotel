import { Prisma } from '@prisma/client';
import { requireHotelApproval } from '../guest-governance/commands';
import { permissions } from '../access';
import { findHotelLifecycleReplay, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export type HotelCashierShiftAction = 'open' | 'drop' | 'close' | 'approve';
export type HotelCashierAction = HotelCashierShiftAction | 'pay_refund';
type CashierCommandFields = { shiftId: string; drawerId?: string; amountMinor?: number; reason?: string; approvalId?: string; idempotencyKey?: string };
export type ManageHotelCashierInput =
  | (CashierCommandFields & { action: 'pay_refund'; approvalId?: string | null })
  | (CashierCommandFields & { action: 'open'; drawerId: string; amountMinor: number; idempotencyKey: string })
  | (CashierCommandFields & { action: Exclude<HotelCashierShiftAction, 'open'>; amountMinor: number; idempotencyKey: string });

export type CashierShift = { id: string; drawerId: string; actorId: string; currencyCode: 'USD'; status: 'open' | 'awaiting_review' | 'closed';
  sequence: number; openedAt: string; floatMinor: number; dropsMinor: number; expectedMinor?: number; countedMinor?: number; varianceMinor?: number; closedAt?: string; reviewedBy?: string };
function amount(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('Cash amount must be non-negative integer minor units.'); return Number(value); }
function text(value: unknown, label: string, max = 200) { const result = String(value || '').trim(); if (!result || result.length > max) throw new Error(`${label} is required and bounded.`); return result; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function parseManageHotelCashierInput(value: unknown): ManageHotelCashierInput {
  if (!isRecord(value)) throw new Error('Action is required and bounded.');
  const actionText = text(value.action, 'Action');
  if (!['open', 'drop', 'close', 'approve', 'pay_refund'].includes(actionText)) throw new Error('Unknown cashier action.');
  const action = actionText as HotelCashierAction;
  const shiftId = text(value.shiftId, action === 'pay_refund' ? 'Refund intent ID' : 'Shift ID');
  if (action === 'pay_refund') {
    const approvalId = typeof value.approvalId === 'string' ? value.approvalId : undefined;
    return { action, shiftId, approvalId };
  }
  const idempotencyKey = text(value.idempotencyKey, 'Idempotency key');
  const reason = String(value.reason || '').trim();
  if (reason.length > 500) throw new Error('Reason is too long.');
  const amountMinor = action === 'approve' ? 0 : amount(value.amountMinor);
  const approvalId = String(value.approvalId || '');
  if (action === 'open') return { action, shiftId, idempotencyKey, amountMinor, drawerId: text(value.drawerId, 'Drawer', 80), reason, approvalId };
  return { action, shiftId, idempotencyKey, amountMinor, reason, approvalId };
}
function authorize(context: any) { if (!context.session?.itemId || !permissions.canManagePayments({ session: context.session })) throw new Error('Cashier payment permission is required.'); return context.session.itemId as string; }

async function shifts(prisma: any): Promise<CashierShift[]> {
  // Audit events are immutable, service-owned typed state transitions. Sequence
  // avoids millisecond timestamp ties, and the shared cashier lock serializes writers.
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state
    FROM "HotelAuditEvent" WHERE "aggregateType"='cashier_shift' AND "propertyKey"=${HOTEL_PROPERTY_KEY}
    ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC
  `);
  return rows.map((row: any) => row.state);
}
async function lock(prisma: any) { await lockHotelLifecycle(prisma, 'cashier-shifts'); }

export async function assertActiveCashierShift(prisma: any, actorId: string | null, currencyCode = 'USD') {
  await lock(prisma);
  const active = (await shifts(prisma)).filter(s => s.actorId === actorId && s.status === 'open' && s.currencyCode === currencyCode);
  if (active.length !== 1) throw new Error('Open a cashier shift before recording cash payment or cash refund.');
  return active[0].id;
}
async function cashLedger(prisma: any, shiftId: string) {
  const [bookingPayments, receivablePayments] = await Promise.all([
    prisma.bookingPayment.findMany({ where: { paymentMethod: 'cash', status: { in: ['completed', 'refunded'] },
      providerData: { path: ['cashierShiftId'], equals: shiftId } }, select: { id: true, amountMinor: true, currency: true } }),
    prisma.hotelAuditEvent.findMany({ where: { aggregateType: 'receivable_payment', action: { in: ['collect', 'refund_credit'] }, afterSnapshot: { path: ['cashierShiftId'], equals: shiftId } }, select: { afterSnapshot: true } }),
  ]);
  return [...bookingPayments, ...receivablePayments.map((event: any) => ({ amountMinor: event.afterSnapshot.amountMinor, currency: event.afterSnapshot.currencyCode }))];
}

export function expectedCash(shift: Pick<CashierShift, 'floatMinor' | 'dropsMinor'>, ledger: { amountMinor: number; currency: string }[]) {
  if (ledger.some(p => !Number.isSafeInteger(p.amountMinor) || p.currency !== 'USD')) throw new Error('Cashier ledger currency or amount is invalid.');
  const result = shift.floatMinor - shift.dropsMinor + ledger.reduce((sum, p) => sum + p.amountMinor, 0);
  if (!Number.isSafeInteger(result)) throw new Error('Cashier balance exceeds safe accounting bounds.');
  return result;
}

export async function hotelCashierOperations(_root: unknown, _args: unknown, context: any) {
  authorize(context);
  const states = await shifts(context.prisma);
  const result = await Promise.all(states.filter(s => s.status !== 'closed').map(async shift => ({ ...shift, expectedMinor: expectedCash(shift, await cashLedger(context.prisma, shift.id)) })));
  const manualRefunds = await context.prisma.refundIntent.findMany({ where: { paymentProvider: { code: 'pp_manual_manual' }, status: { in: ['pending', 'failed', 'dead_letter'] } }, include: { booking: { select: { confirmationNumber: true } } }, take: 100 });
  return { manualRefunds: manualRefunds.map((intent: any) => ({ id: intent.id, amountMinor: intent.amountMinor, currencyCode: intent.currencyCode, confirmationNumber: intent.booking?.confirmationNumber, reason: intent.reason })), shifts: [...result, ...states.filter(s => s.status === 'closed').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, 100)] };
}

export async function manageHotelCashier(_root: unknown, args: { input: unknown }, context: any) {
  const actorId = authorize(context); const input = parseManageHotelCashierInput(args.input); const action = input.action;
  if (action === 'pay_refund') {
    const { confirmManualRefundPayout } = await import('../refunds/refundIntentWorker');
    return confirmManualRefundPayout(context, input.shiftId, input.approvalId);
  }
  const { shiftId, idempotencyKey: key, amountMinor = 0, reason = '', approvalId = '' } = input;
  const normalized = { action, shiftId, actorId, amountMinor,
    drawerId: action === 'open' ? input.drawerId : '', reason, approvalId: String(approvalId || '') };
  const eventKey = `cashier:${key}`;
  const identity = { request: normalized, aggregateType: 'cashier_shift', aggregateId: shiftId, action };
  return runSerializableTransaction(context, async (tx: any) => {
    await lock(tx.prisma);
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity); if (replay) return replay.afterSnapshot;
    const current = await shifts(tx.prisma); const prior = current.find(s => s.id === shiftId);
    let next: CashierShift;
    if (action === 'open') {
      if (prior || current.some(s => s.status === 'open' && (s.actorId === actorId || s.drawerId === normalized.drawerId))) throw new Error('This cashier or drawer already has an open shift.');
      next = { id: shiftId, drawerId: normalized.drawerId, actorId, currencyCode: 'USD', status: 'open', sequence: 1,
        openedAt: new Date().toISOString(), floatMinor: normalized.amountMinor, dropsMinor: 0 };
    } else {
      if (!prior) throw new Error('Cashier shift not found.');
      next = { ...prior, sequence: prior.sequence + 1 };
      if (action === 'approve') {
        if (prior.status !== 'awaiting_review' || prior.actorId === actorId) throw new Error('A different payment manager must review a counted shift variance.');
        if (!reason) throw new Error('Variance approval requires a reason.');
        const settings = await tx.prisma.hotelSettings.findUnique({ where: { id: 1 } });
        if (Math.abs(prior.varianceMinor || 0) >= Number(settings?.cashVarianceApprovalThresholdMinor ?? 0)) await requireHotelApproval(tx.prisma, { approvalId: input.approvalId, action: 'cash_variance', aggregateId: shiftId, amountMinor: Math.abs(prior.varianceMinor || 0), actorId: prior.actorId, operationKey: eventKey });
        next.status = 'closed'; next.reviewedBy = actorId;
      } else {
        if (prior.status !== 'open' || prior.actorId !== actorId) throw new Error('Only the assigned cashier can operate their open shift.');
        const expectedMinor = expectedCash(prior, await cashLedger(tx.prisma, shiftId));
        if (action === 'drop') {
          if (!reason || normalized.amountMinor <= 0 || normalized.amountMinor > expectedMinor) throw new Error('Cash drop requires a reason and cannot exceed expected cash.');
          next.dropsMinor += normalized.amountMinor;
        } else {
          const varianceMinor = normalized.amountMinor - expectedMinor;
          if (varianceMinor && !reason) throw new Error('Cash variance requires an explanation.');
          next = { ...next, expectedMinor, countedMinor: normalized.amountMinor, varianceMinor, closedAt: new Date().toISOString(), status: varianceMinor ? 'awaiting_review' : 'closed' };
        }
      }
    }
    await recordHotelLifecycleEvent({ prisma: tx.prisma, actorId, eventKey, identity, beforeSnapshot: prior || null, afterSnapshot: next, metadata: { reason } });
    return next;
  });
}
