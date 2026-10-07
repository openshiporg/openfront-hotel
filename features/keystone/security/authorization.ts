import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { permissions } from '../access';
import { assertGuestBookingAccess, canManageBookingRecords } from '../lib/guestBookingAccess';
import { securityAuthorization } from '../utils/paymentProviderAdapter';
import { isPaymentProviderConfigured } from '../lib/paymentSecurity';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent, findHotelLifecycleReplay } from '../lib/hotelLifecycle';
import { requireHotelApproval } from '../guest-governance/commands';
import { ensurePaymentFolioPosting, getBookingCollectibleBalance } from '../folios/bookingFolio';
import { queueCaptureRecoveryRefund, recomputeBookingPaymentState } from '../refunds/bookingRefund';
import { assertReplayMatches, type PaymentReplayEvidence } from '../payments/settlement';

type SecurityState = { id: string; bookingId: string; sequence: number; providerId: string; providerPaymentId?: string; amountMinor: number; status: string; expiresAt?: string | null; paymentId?: string; capturedMinor?: number; pending?: { action: string; key: string; amountMinor: number; actorId: string | null } | null; lastError?: string; nextReconcileAt?: string };
async function states(prisma: any, bookingId?: string): Promise<SecurityState[]> {
  const rows = await prisma.$queryRaw(Prisma.sql`SELECT DISTINCT ON ("aggregateId") "afterSnapshot" AS state FROM "HotelAuditEvent" WHERE "propertyKey"=${HOTEL_PROPERTY_KEY} AND "aggregateType"='security_authorization' ${bookingId ? Prisma.sql`AND "aggregateId"=${bookingId}` : Prisma.empty} ORDER BY "aggregateId", ("afterSnapshot"->>'sequence')::integer DESC`);
  return rows.map((row: any) => row.state);
}
async function persist(prisma: any, before: SecurityState | undefined, after: SecurityState, key: string, request: any) {
  await recordHotelLifecycleEvent({ prisma, actorId: after.pending?.actorId || undefined, eventKey: key,
    identity: { request, aggregateType: 'security_authorization', aggregateId: after.bookingId, action: request.action }, beforeSnapshot: before || null, afterSnapshot: after });
}
function projection(state: SecurityState | undefined) {
  if (!state) return null;
  return { id: state.id, bookingId: state.bookingId, amountMinor: state.amountMinor, status: state.status, expiresAt: state.expiresAt || null, paymentId: state.paymentId || null, pending: Boolean(state.pending), lastError: state.lastError || '' };
}
export async function hotelSecurityAuthorization(_root: unknown, { bookingId }: { bookingId: string }, context: any) {
  await assertGuestBookingAccess(context, bookingId);
  const [state] = await states(context.prisma, bookingId);
  const booking = await context.prisma.booking.findUnique({ where: { id: bookingId }, select: { pricingSnapshot: true } });
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: 'pp_stripe_stripe' } });
  return { authorization: projection(state), configuredAmountMinor: Number(booking?.pricingSnapshot?.securityDepositMinor || 0), available: Boolean(isPaymentProviderConfigured(provider)), operator: permissions.canManagePayments({ session: context.session }) };
}
export function validateSecurityEvidence(state: SecurityState, evidence: any) {
  if (evidence.authorizationId !== state.id || evidence.bookingId !== state.bookingId || (state.providerPaymentId && evidence.id !== state.providerPaymentId) || !String(evidence.id || '').startsWith('pi_')) throw new Error('Security authorization identity mismatch.');
  if (evidence.currencyCode !== 'USD' || evidence.amountMinor !== state.amountMinor || !Number.isSafeInteger(evidence.amountReceivedMinor) || evidence.amountReceivedMinor < 0 || evidence.amountReceivedMinor > state.amountMinor || !Number.isSafeInteger(evidence.amountCapturableMinor) || evidence.amountCapturableMinor < 0 || evidence.amountCapturableMinor > state.amountMinor) throw new Error('Security authorization amount or currency mismatch.');
  if (!['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'succeeded', 'canceled'].includes(evidence.status)) throw new Error('Unrecognized security authorization status.');
  if (state.capturedMinor !== undefined && evidence.status === 'succeeded' && evidence.amountReceivedMinor !== state.capturedMinor) throw new Error('Captured security evidence changed its settled amount.');
  if (evidence.status === 'succeeded' && evidence.amountReceivedMinor <= 0) throw new Error('Captured security authorization has no settlement amount.');
}
async function applyEvidence(tx: any, state: SecurityState, evidence: any, eventKey: string) {
  validateSecurityEvidence(state, evidence);
  const prisma = tx.prisma;
  let paymentId = state.paymentId;
  if (evidence.status === 'succeeded' && !paymentId) {
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-provider-capture:pp_stripe_stripe:${evidence.id}`);
    const existing = await prisma.bookingPayment.findFirst({ where: { paymentProviderId: state.providerId, providerCaptureId: evidence.id, paymentType: { not: 'refund' } } });
    if (existing) {
      if (existing.bookingId !== state.bookingId || existing.amountMinor !== evidence.amountReceivedMinor) throw new Error('Security capture already belongs to different payment evidence.');
      paymentId = existing.id;
    } else {
      const booking = await prisma.booking.findUnique({ where: { id: state.bookingId } });
      const collectible = await getBookingCollectibleBalance(tx, state.bookingId);
      const authorizedCapture = state.pending?.action === 'capture' && state.pending.amountMinor === evidence.amountReceivedMinor;
      const recoveryMinor = !authorizedCapture || !['confirmed', 'checked_in'].includes(booking.status) ? evidence.amountReceivedMinor : Math.max(0, evidence.amountReceivedMinor - collectible.balanceDueMinor);
      const payment = await prisma.bookingPayment.create({ data: { paymentReference: `SEC-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`, bookingId: state.bookingId, paymentProviderId: state.providerId,
        paymentType: 'full_payment', amountMinor: evidence.amountReceivedMinor, amount: evidence.amountReceivedMinor / 100, currency: 'USD', paymentMethod: 'credit_card', status: 'completed', providerPaymentId: evidence.id, providerCaptureId: evidence.id,
        providerData: { securityAuthorizationId: state.id, ...(recoveryMinor ? { recoveryReason: 'Security capture exceeds its authorized current obligation', recoveryMinor } : {}) }, description: 'Approved security authorization capture against folio charges', processedAt: new Date(), processedById: state.pending?.actorId || null } });
      paymentId = payment.id;
      await ensurePaymentFolioPosting(tx, payment.id, recoveryMinor ? { allowRecoveryReopen: true } : {});
      if (recoveryMinor) await queueCaptureRecoveryRefund(prisma, payment, recoveryMinor, 'Security capture exceeds its authorized current obligation');
      await recomputeBookingPaymentState(prisma, state.bookingId);
    }
  }
  const pending = !['succeeded', 'canceled'].includes(evidence.status) && ['capture', 'release'].includes(state.pending?.action || '') ? state.pending : null;
  const status = state.status === 'requires_capture' && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(evidence.status) ? state.status : evidence.status;
  const next = { ...state, sequence: state.sequence + 1, providerPaymentId: evidence.id, status, expiresAt: evidence.expiresAt || state.expiresAt || null, paymentId, ...(evidence.status === 'succeeded' ? { capturedMinor: evidence.amountReceivedMinor } : {}), pending, lastError: '', nextReconcileAt: new Date(Date.now() + 60000).toISOString() };
  await persist(prisma, state, next, eventKey, { action: 'provider_evidence', evidence });
  return next;
}
async function executePending(context: any, state: SecurityState, adapter = securityAuthorization) {
  const operation = state.pending;
  const provider = await context.prisma.paymentProvider.findUnique({ where: { id: state.providerId } });
  if (!provider || provider.code !== 'pp_stripe_stripe') throw new Error('Stripe authorization provider not found.');
  let evidence: any;
  try {
    evidence = await adapter({ provider, action: operation?.action || 'sync', paymentId: state.providerPaymentId, amountMinor: operation?.amountMinor ?? state.amountMinor,
      authorizationId: state.id, bookingId: state.bookingId, idempotencyKey: operation?.key || `security-sync:${state.id}` });
  } catch {
    await runSerializableTransaction(context, async tx => {
      await lockHotelLifecycle(tx.prisma, `security:${state.bookingId}`);
      const [current] = await states(tx.prisma, state.bookingId);
      if (current?.id === state.id && current.pending?.key === operation?.key) await persist(tx.prisma, current, { ...current, sequence: current.sequence + 1, lastError: 'Provider reconciliation failed; retry the same operation.', nextReconcileAt: new Date(Date.now() + 60000).toISOString() }, `security-error:${randomUUID()}`, { action: 'provider_failed', operationKey: operation?.key });
    });
    throw new Error('Security authorization is awaiting provider reconciliation. Retry the same operation.');
  }
  const next = await runSerializableTransaction(context, async tx => {
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${state.bookingId}`);
    await lockHotelLifecycle(tx.prisma, `security:${state.bookingId}`);
    const [current] = await states(tx.prisma, state.bookingId);
    if (current?.id !== state.id) throw new Error('Security authorization changed during provider reconciliation.');
    // A webhook may already have reconciled the same capture. Preserve terminal state.
    if (['succeeded', 'canceled'].includes(current.status) && evidence.status !== current.status && evidence.status !== 'succeeded') return current;
    return applyEvidence(tx, current, evidence, `security-result:${randomUUID()}`);
  });
  return { authorization: projection(next), clientSecret: ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(next.status) ? evidence.clientSecret : null };
}
export async function manageHotelSecurityAuthorization(_root: unknown, { input }: { input: any }, context: any, adapter = securityAuthorization) {
  const bookingId = String(input?.bookingId || ''); const action = String(input?.action || ''); const key = String(input?.idempotencyKey || '');
  if (!bookingId || bookingId.length > 200 || !['initiate', 'sync', 'release', 'capture'].includes(action) || !key || key.length > 150) throw new Error('A bounded booking ID, operation and attempt key are required.');
  await assertGuestBookingAccess(context, bookingId);
  if (['capture', 'release'].includes(action) && !permissions.canManagePayments({ session: context.session })) throw new Error('Security capture or release requires payment permission.');
  const actorId = context.session?.itemId || null;
  const amountMinor = action === 'capture' ? Number(input.amountMinor) : 0;
  if (action === 'capture' && (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)) throw new Error('A positive integer capture amount is required.');
  const eventKey = `security-operation:${key}`;
  const identity = { request: { bookingId, action, amountMinor, actorId }, aggregateType: 'security_authorization', aggregateId: bookingId, action };
  const state = await runSerializableTransaction(context, async tx => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    await lockHotelLifecycle(prisma, `security:${bookingId}`);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    const [current] = await states(prisma, bookingId);
    if (replay) { if (current?.id !== replay.afterSnapshot.id) throw new Error('This operation belongs to a retired authorization.'); return current; }
    if (current?.pending) {
      if (action === 'sync') return current;
      throw new Error('Reconcile the existing pending authorization operation first.');
    }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found.');
    if (booking.billingFolioId && !canManageBookingRecords(context)) throw new Error('The property manages group security authorizations.');
    if (action === 'sync') { if (!current) throw new Error('No security authorization exists.'); return current; }
    let next: SecurityState;
    if (action === 'initiate') {
      if (!['confirmed', 'checked_in'].includes(booking.status)) throw new Error('Security authorization requires a confirmed or checked-in stay.');
      if (current && !['canceled', 'succeeded'].includes(current.status)) return current;
      const required = Number(booking.pricingSnapshot?.securityDepositMinor || 0);
      if (!Number.isSafeInteger(required) || required <= 0) throw new Error('This reservation has no contracted security authorization amount.');
      const provider = await prisma.paymentProvider.findUnique({ where: { code: 'pp_stripe_stripe' } });
      if (!provider || !isPaymentProviderConfigured(provider)) throw new Error('Configured Stripe is required for card security authorizations.');
      next = { id: createHash('sha256').update(`${bookingId}:${key}`).digest('hex').slice(0, 24), bookingId, sequence: (current?.sequence || 0) + 1, providerId: provider.id, amountMinor: required, status: 'initializing', pending: { action, key: eventKey, amountMinor: required, actorId } };
    } else {
      if (!current?.providerPaymentId || ['canceled', 'succeeded'].includes(current.status)) throw new Error('No open card authorization can be changed.');
      if (action === 'capture') {
        if (!['confirmed', 'checked_in'].includes(booking.status) || current.status !== 'requires_capture' || (current.expiresAt && new Date(current.expiresAt) <= new Date())) throw new Error('Capture requires an unexpired authorization for an active stay.');
        const balance = await getBookingCollectibleBalance(tx, bookingId);
        const entries = await prisma.folioEntry.findMany({ where: { folioId: balance.folioId }, select: { direction: true, amountMinor: true, currencyCode: true } });
        const postedBalance = entries.reduce((sum: number, row: any) => { if (row.currencyCode !== 'USD') throw new Error('Mixed-currency folio requires reconciliation.'); return sum + (row.direction === 'debit' ? row.amountMinor : -row.amountMinor); }, 0);
        if (amountMinor > current.amountMinor || amountMinor > Math.min(postedBalance, balance.balanceDueMinor)) throw new Error('Capture exceeds authorized funds or actual posted folio charges.');
        await requireHotelApproval(prisma, { approvalId: input.approvalId, action: 'security_capture', aggregateId: current.id, amountMinor, actorId, operationKey: eventKey });
      }
      next = { ...current, sequence: current.sequence + 1, pending: { action, key: eventKey, amountMinor, actorId } };
    }
    await recordHotelLifecycleEvent({ prisma, actorId: actorId || undefined, eventKey, identity, beforeSnapshot: current || null, afterSnapshot: next });
    return next;
  });
  return executePending(context, state, adapter);
}
export async function recordVerifiedSecurityAuthorization(context: any, provider: any, evidence: any, replay: PaymentReplayEvidence) {
  return runSerializableTransaction(context, async tx => {
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${evidence.bookingId}`);
    await lockHotelLifecycle(tx.prisma, `security:${evidence.bookingId}`);
    const existing = await tx.prisma.paymentEvent.findUnique({ where: { replayKey: replay.replayKey } });
    if (existing) { assertReplayMatches(existing, replay); return { success: true, duplicate: true }; }
    const [state] = await states(tx.prisma, evidence.bookingId);
    if (!state || state.providerId !== provider.id) throw new Error('Verified authorization has no matching property record.');
    validateSecurityEvidence(state, evidence);
    const terminal = ['succeeded', 'canceled'].includes(state.status);
    const next = terminal && state.status !== evidence.status && evidence.status !== 'succeeded' ? state : await applyEvidence(tx, state, evidence, `security-webhook:${replay.replayKey}`);
    await tx.prisma.paymentEvent.create({ data: { ...replay, status: 'processed', processedAt: new Date(), bookingId: state.bookingId, paymentId: next.paymentId || null, evidence: { securityAuthorizationId: state.id } } });
    return { success: true, duplicate: false };
  });
}
export async function reconcileSecurityAuthorizations(context: any, adapter = securityAuthorization) {
  let failed = 0;
  const due = (await states(context.prisma)).filter(state => (state.pending || !['succeeded', 'canceled'].includes(state.status)) && (!state.nextReconcileAt || new Date(state.nextReconcileAt) <= new Date())).sort((a, b) => String(a.nextReconcileAt || '').localeCompare(String(b.nextReconcileAt || ''))).slice(0, 20);
  for (const state of due) {
    if (!state.pending && ['succeeded', 'canceled'].includes(state.status)) continue;
    try {
      let current = state;
      if (!state.pending) {
        const booking = await context.prisma.booking.findUnique({ where: { id: state.bookingId } });
        if (booking && ['cancelled', 'no_show', 'checked_out'].includes(booking.status)) current = await runSerializableTransaction(context, async tx => {
          await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${state.bookingId}`);
          await lockHotelLifecycle(tx.prisma, `security:${state.bookingId}`);
          const [latest] = await states(tx.prisma, state.bookingId);
          if (latest.pending || ['succeeded', 'canceled'].includes(latest.status)) return latest;
          const next = { ...latest, sequence: latest.sequence + 1, pending: { action: 'release', key: `security-auto-release:${latest.id}`, amountMinor: 0, actorId: null } };
          await persist(tx.prisma, latest, next, next.pending.key, { action: 'release_after_departure' }); return next;
        });
      }
      await executePending(context, current, adapter);
    } catch { failed++; }
  }
  return failed;
}
