import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { permissions } from '../access';
import { requireHotelApproval } from '../guest-governance/commands';
import { assertActiveCashierShift } from '../cashier/commands';
import { reconcileBookingLoyalty } from '../loyalty/commands';
import { releaseCancelledGroupPickup } from '../groups/commands';
import { ensurePaymentFolioPosting } from '../folios/bookingFolio';
import { recomputeBookingPaymentState } from './bookingRefund';
import { cancellationSettlementStatus } from '../lib/cancellationSettlement';
import { queueBookingCommunication } from '../communications/commands';
import {
  HOTEL_PROPERTY_KEY,
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { PaymentProviderConfigurationError, validateRefundSettlement } from '../lib/paymentSecurity';
import { getRefundStatus, refundPayment } from '../utils/paymentProviderAdapter';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';

function requirePrismaResult<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

/** Scalar projection returned by the SQL lease/claim operation. */
export type RefundIntentClaim = {
  id: string; intentKey: string; cancellationEventKey: string; propertyKey: string;
  bookingId: string; sourcePaymentId: string; paymentProviderId: string;
  amountMinor: number; currencyCode: string; reason: string; actorId: string | null;
  attempts: number; maxAttempts: number; leaseToken: string | null; providerRefundId?: string | null;
};

/**
 * Relation-loaded shape used only while finalizing durable refund evidence.
 * Keeping it distinct from the raw claim projection prevents scalar IDs from
 * being mistaken for the source-payment relation.
 */
type RefundIntentSettlement = RefundIntentClaim & {
  status: string;
  sourcePayment: {
    providerCaptureId?: string | null;
    providerPaymentId?: string | null;
    stripePaymentIntentId?: string | null;
    currency?: string | null;
    paymentMethod?: string | null;
  };
  paymentProvider?: { code: string } | null;
  booking: { confirmationNumber: string };
};

/** @deprecated Use RefundIntentClaim; kept for callers of the old lib export. */
export type RefundIntentRecord = RefundIntentClaim;

export async function claimRefundIntents(prisma: any, options: { workerId: string; limit?: number; now?: Date; leaseMs?: number }) {
  const workerId = String(options.workerId || '').trim();
  if (!workerId) throw new Error('Refund workerId is required.');
  const now = options.now || new Date();
  const limit = Math.min(50, Math.max(1, Number(options.limit || 10)));
  const leaseMs = Math.min(15 * 60_000, Math.max(5_000, Number(options.leaseMs || 60_000)));
  const leaseToken = `${workerId}:${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return requirePrismaResult(await prisma.$queryRaw(Prisma.sql`
    WITH exhausted AS (
      UPDATE "RefundIntent" AS intent
      SET "status"='dead_letter', "deadLetteredAt"=COALESCE(intent."deadLetteredAt", ${now}),
          "lastError"='Refund attempt limit exhausted before settlement; operator reconciliation required.',
          "leaseToken"='', "leaseExpiresAt"=NULL, "updatedAt"=${now}
      WHERE intent."propertyKey"=${HOTEL_PROPERTY_KEY}
        AND intent."paymentProvider" IN (SELECT "id" FROM "PaymentProvider" WHERE "code" IN ('pp_stripe_stripe','pp_paypal_paypal'))
        AND intent."attempts" >= intent."maxAttempts"
        AND (intent."status" IN ('pending','failed')
          OR (intent."status" = 'processing' AND intent."leaseExpiresAt" <= ${now}))
      RETURNING intent."id"
    ), candidates AS (
      SELECT "id" FROM "RefundIntent"
      WHERE "propertyKey" = ${HOTEL_PROPERTY_KEY}
        AND "paymentProvider" IN (SELECT "id" FROM "PaymentProvider" WHERE "code" IN ('pp_stripe_stripe','pp_paypal_paypal'))
        AND "attempts" < "maxAttempts"
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
  `)) as RefundIntentClaim[];
}

function assertExistingRefundPaymentMatchesIntent(payment: any, intent: RefundIntentSettlement, providerRefundId: string) {
  const providerData = payment.providerData && typeof payment.providerData === 'object' ? payment.providerData : {};
  const sourceProviderPaymentId = String(intent.sourcePayment.providerCaptureId || intent.sourcePayment.providerPaymentId || intent.sourcePayment.stripePaymentIntentId || '');
  if (
    payment.bookingId !== intent.bookingId || payment.booking?.id !== intent.bookingId ||
    payment.paymentProviderId !== intent.paymentProviderId || payment.amountMinor !== -intent.amountMinor ||
    String(payment.currency || '').trim().toUpperCase() !== String(intent.currencyCode || '').trim().toUpperCase() ||
    payment.paymentType !== 'refund' || payment.status !== 'refunded' ||
    String(payment.providerPaymentId || '') !== sourceProviderPaymentId ||
    payment.providerRefundId !== providerRefundId || providerData.sourcePaymentId !== intent.sourcePaymentId ||
    providerData.refundIntentKey !== intent.intentKey
  ) throw new Error('Existing refund payment does not match intent.');
}

function retryDelay(attempts: number) {
  return Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, Math.min(10, attempts - 1)));
}

async function deferRefundIntentForConfiguration(prisma: any, intent: RefundIntentClaim, error: PaymentProviderConfigurationError) {
  await prisma.refundIntent.updateMany({
    where: { id: intent.id, status: 'processing', leaseToken: intent.leaseToken },
    data: {
      status: 'pending', attempts: Math.max(0, intent.attempts - 1), lastAttemptAt: null,
      lastError: safeOperationalErrorMessage('refund', error), availableAt: new Date(Date.now() + 60_000),
      deadLetteredAt: null, leaseToken: '', leaseExpiresAt: null,
    },
  });
}

export async function failRefundIntent(prisma: any, intent: RefundIntentClaim, error: unknown) {
  const message = safeOperationalErrorMessage('refund', error);
  const dead = intent.attempts >= intent.maxAttempts;
  await prisma.refundIntent.updateMany({
    where: { id: intent.id, status: 'processing', leaseToken: intent.leaseToken },
    data: {
      status: dead ? 'dead_letter' : 'failed', lastError: message,
      availableAt: new Date(Date.now() + retryDelay(intent.attempts)),
      deadLetteredAt: dead ? new Date() : null, leaseToken: '', leaseExpiresAt: null,
    },
  });
  return dead;
}

export async function settleRefundIntent(context: any, intent: RefundIntentClaim, providerResult: any) {
  return context.transaction(async (tx: any) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-refund:${intent.intentKey}`);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${intent.bookingId}`);
    const current = await prisma.refundIntent.findUnique({
      where: { id: intent.id }, include: { sourcePayment: true, paymentProvider: true, booking: true },
    }) as RefundIntentSettlement | null;
    if (current?.status === 'succeeded') {
      if (!String(current.providerRefundId || '').trim()) throw new Error('Succeeded refund is missing its stored provider identity.');
      const replayEvidence = validateRefundSettlement(providerResult, current);
      if (!replayEvidence.settled) throw new Error('Succeeded refund replay must contain settled provider evidence.');
      return { settled: true, failed: false };
    }
    if (!current || current.status !== 'processing' || current.leaseToken !== intent.leaseToken) {
      throw new Error('Refund intent lease was lost.');
    }
    const evidence = validateRefundSettlement(providerResult, current);
    const providerRefundId = evidence.id;
    if (!evidence.settled) {
      const exhausted = current.attempts >= current.maxAttempts;
      const deadLettered = evidence.failed || exhausted;
      await prisma.refundIntent.update({
        where: { id: current.id },
        data: { status: deadLettered ? 'dead_letter' : 'pending', providerRefundId,
          providerResultSnapshot: providerResult.data || {},
          lastError: evidence.failed ? `Provider refund ${evidence.status}; operator reconciliation required.`
            : exhausted ? `Provider refund ${evidence.status}; retry limit reached; operator reconciliation required.`
              : `Provider refund ${evidence.status}; awaiting settlement.`,
          availableAt: new Date(Date.now() + retryDelay(current.attempts)),
          deadLetteredAt: deadLettered ? new Date() : null, leaseToken: '', leaseExpiresAt: null },
      });
      return { settled: false, failed: deadLettered };
    }
    const manual = current.paymentProvider?.code === 'pp_manual_manual';
    let cashierShiftId: string | null = null;
    if (manual) {
      if (!permissions.canManagePayments({ session: context.session })) throw new Error('Only payment staff may confirm a physical refund payout.');
      const sourceCurrencyCode = String(current.sourcePayment.currency || 'USD').trim().toUpperCase();
      if (String(current.currencyCode || '').trim().toUpperCase() !== sourceCurrencyCode) {
        throw new Error('Manual refund currency does not match its source payment.');
      }
      if (current.sourcePayment.paymentMethod === 'cash') cashierShiftId = await assertActiveCashierShift(prisma, context.session.itemId, sourceCurrencyCode);
    }
    const refundId = `refund_${createHash('sha256').update(current.intentKey).digest('hex').slice(0, 24)}`;
    let refund = await prisma.bookingPayment.findUnique({ where: { id: refundId }, include: { booking: true } });
    if (refund) assertExistingRefundPaymentMatchesIntent(refund, current, providerRefundId);
    if (!refund) {
      refund = await prisma.bookingPayment.create({
        data: {
          id: refundId,
          bookingId: current.bookingId,
          paymentProviderId: current.paymentProviderId,
          amountMinor: -current.amountMinor,
          amount: -(current.amountMinor / 100),
          currency: current.currencyCode,
          paymentType: 'refund',
          paymentMethod: current.sourcePayment.paymentMethod || 'credit_card',
          status: 'refunded',
          providerPaymentId: current.sourcePayment.providerCaptureId || current.sourcePayment.providerPaymentId || current.sourcePayment.stripePaymentIntentId,
          providerRefundId,
          providerData: { providerResult: providerResult.data || {}, sourcePaymentId: current.sourcePaymentId, refundIntentKey: current.intentKey, ...(cashierShiftId ? { cashierShiftId } : {}) },
          processedById: manual ? context.session.itemId : null,
          description: `Refund for booking ${current.booking.confirmationNumber}`,
          processedAt: new Date(), refundedAt: new Date(),
        },
      });
    }
    await ensurePaymentFolioPosting(tx, refund.id);
    await prisma.refundIntent.update({
      where: { id: current.id },
      data: { status: 'succeeded', providerRefundId, providerResultSnapshot: providerResult.data || {}, completedAt: new Date(), lastError: '', leaseToken: '', leaseExpiresAt: null },
    });

    await reconcileBookingLoyalty(prisma, current.bookingId, `refund:${current.intentKey}`, context.session?.itemId);
    const isCancellation = String(current.cancellationEventKey || '').startsWith('booking:cancel:');
    if (!isCancellation) {
      await recomputeBookingPaymentState(prisma, current.bookingId);
      await queueBookingCommunication(prisma, {
        bookingId: current.bookingId,
        kind: 'booking_refund',
        eventKey: current.intentKey,
        cancellation: { summary: current.reason, refundableMinor: current.amountMinor, cancellationFeeMinor: 0 },
      });
      return { settled: true, failed: false };
    }
    const outstanding = await prisma.refundIntent.count({
      where: {
        bookingId: current.bookingId,
        cancellationEventKey: current.cancellationEventKey,
        status: { in: ['pending', 'processing', 'failed', 'dead_letter'] },
      },
    });
    if (!outstanding) {
      const eventKey = `${current.cancellationEventKey}:completed`;
      const identity = {
        request: { bookingId: current.bookingId, cancellationEventKey: current.cancellationEventKey },
        aggregateType: 'booking', aggregateId: current.bookingId, action: 'cancellation_settled',
      };
      await lockHotelLifecycle(prisma, eventKey);
      if (!(await findHotelLifecycleReplay(prisma, eventKey, identity))) {
        const [booking, ledger, cancellationAudit] = await Promise.all([
          prisma.booking.findUniqueOrThrow({ where: { id: current.bookingId } }),
          prisma.bookingPayment.findMany({
            where: { bookingId: current.bookingId, status: { in: ['completed', 'refunded'] } },
            select: { paymentType: true, amountMinor: true },
          }),
          prisma.hotelAuditEvent.findUnique({ where: { eventKey: current.cancellationEventKey } }),
        ]);
        const netRetainedMinor = Math.max(0, ledger.reduce((sum: number, payment: any) =>
          sum + (payment.paymentType === 'refund' ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
        const terms = (cancellationAudit?.afterSnapshot as any)?.cancellationTerms || {};
        const cancellationFeeMinor = Math.max(0, Number(terms.cancellationFeeMinor || 0));
        const outstandingFeeMinor = Math.max(0, cancellationFeeMinor - netRetainedMinor);
        const finalStatus = cancellationSettlementStatus(cancellationAudit);
        const updated = await prisma.booking.update({
          where: { id: current.bookingId },
          data: {
            status: finalStatus,
            paymentStatus: outstandingFeeMinor > 0 ? (netRetainedMinor > 0 ? 'partial' : 'unpaid') : netRetainedMinor === 0 ? 'refunded' : 'paid',
            balanceDueMinor: outstandingFeeMinor,
            balanceDue: outstandingFeeMinor / 100,
            cancelledAt: new Date(),
          },
        });
        await recomputeBookingPaymentState(prisma, current.bookingId);
        await releaseCancelledGroupPickup(prisma, current.bookingId, eventKey);
        await recordHotelLifecycleEvent({
          prisma, eventKey, actorId: current.actorId, identity,
          beforeSnapshot: { status: booking.status, paymentStatus: booking.paymentStatus },
          afterSnapshot: { status: updated.status, paymentStatus: updated.paymentStatus, netRetainedMinor, outstandingFeeMinor },
          metadata: { cancellationEventKey: current.cancellationEventKey },
        });
        await queueBookingCommunication(prisma, {
          bookingId: current.bookingId,
          kind: finalStatus === 'no_show' ? 'booking_no_show' : 'booking_cancelled',
          eventKey,
          cancellation: {
            summary: String(terms.summary || 'The booked cancellation terms were applied.'),
            refundableMinor: Number(terms.refundableMinor || 0),
            cancellationFeeMinor: Number(terms.cancellationFeeMinor || 0),
          },
        });
      }
    }
    return { settled: true, failed: false };
  }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
}

export async function dispatchRefundIntentBatch(context: any, options: { workerId: string; limit?: number }) {
  const intents = await claimRefundIntents(context.prisma, options);
  const result = { succeeded: 0, retried: 0, deadLettered: 0 };
  for (const intent of intents) {
    try {
      const [sourcePayment, provider] = await Promise.all([
        context.prisma.bookingPayment.findUnique({ where: { id: intent.sourcePaymentId } }),
        context.prisma.paymentProvider.findUnique({ where: { id: intent.paymentProviderId } }),
      ]);
      if (!sourcePayment || !provider) throw new Error('Refund intent provider evidence is incomplete.');
      const paymentId = sourcePayment.providerCaptureId || sourcePayment.providerPaymentId || sourcePayment.stripePaymentIntentId;
      if (!paymentId) throw new Error('Refund source provider id is missing.');
      // Deliberately outside a DB transaction; provider-native idempotency binds retries.
      const providerResult = intent.providerRefundId
        ? await getRefundStatus({ provider, refundId: intent.providerRefundId })
        : await refundPayment({
            provider, paymentId, amount: intent.amountMinor, currency: intent.currencyCode,
            idempotencyKey: intent.intentKey,
            metadata: { bookingId: intent.bookingId, sourcePaymentId: intent.sourcePaymentId, refundIntentKey: intent.intentKey },
          });
      const outcome = await settleRefundIntent(context, intent, providerResult);
      if (outcome.settled) result.succeeded += 1;
      else if (outcome.failed) result.deadLettered += 1;
      else result.retried += 1;
    } catch (error) {
      if (error instanceof PaymentProviderConfigurationError) {
        await deferRefundIntentForConfiguration(context.prisma, intent, error);
        result.retried += 1;
        continue;
      }
      const dead = await failRefundIntent(context.prisma, intent, error);
      if (dead) result.deadLettered += 1; else result.retried += 1;
    }
  }
  return result;
}

/** Explicit staff acknowledgement of money handed back; cancellation alone cannot fabricate it. */
export async function confirmManualRefundPayout(context: any, intentId: string, approvalId?: string | null) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error('Payment permission is required.');
  return context.transaction(async (tx: any) => {
    const intent = await tx.prisma.refundIntent.findUnique({ where: { id: intentId }, include: { paymentProvider: true } });
    if (!intent || intent.paymentProvider?.code !== 'pp_manual_manual') throw new Error('Manual refund intent not found.');
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${intent.bookingId}`);
    const current = await tx.prisma.refundIntent.findUnique({ where: { id: intent.id } });
    if (current.status === 'succeeded') return { status: 'recorded', intentId };
    const settings = await tx.prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (current.amountMinor >= Number(settings?.refundApprovalThresholdMinor ?? 0)) await requireHotelApproval(tx.prisma, { approvalId, action: 'refund', aggregateId: current.sourcePaymentId, amountMinor: current.amountMinor, actorId: context.session.itemId, operationKey: `manual-payout:${intent.id}` });
    const leaseToken = `staff:${context.session.itemId}:${intent.id}`;
    await tx.prisma.refundIntent.update({ where: { id: intent.id }, data: { status: 'processing', leaseToken, actorId: context.session.itemId } });
    await settleRefundIntent({ ...tx, session: context.session, transaction: (fn: any) => fn(tx) }, { ...current, leaseToken }, {
      status: 'completed', amount: current.amountMinor, currencyCode: current.currencyCode, data: { id: `manual:${intent.id}`, acknowledgedBy: context.session.itemId },
    });
    return { status: 'recorded', intentId };
  }, { maxWait: 5000, timeout: 30000, isolationLevel: 'Serializable' });
}
