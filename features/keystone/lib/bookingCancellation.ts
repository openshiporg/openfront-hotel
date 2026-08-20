import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { refundPayment } from '../utils/paymentProviderAdapter';
import { ensureBookingFolio, ensurePaymentFolioPosting } from './bookingFolio';
import { createManualRefundInTransaction, recomputeBookingPaymentState } from './bookingRefund';
import { calculateCancellationTerms } from './cancellationPolicy';
import { cancellationSettlementStatus } from './cancellationSettlement';
import { buildFolioReversalPosting } from './folioLedger';
import { queueBookingCommunication } from './hotelCommunications';
import { isOnlinePaymentProviderCode } from './paymentSecurity';
import {
  HOTEL_PROPERTY_KEY,
  findHotelLifecycleReplay,
  hashLifecycleRequest,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from './hotelLifecycle';

const CANCELLABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);
const ACTIVE_REFUND_INTENT_STATUSES = ['pending', 'processing', 'failed', 'dead_letter'];
const REFUND_MAX_ATTEMPTS = 8;
const TRANSACTION_RETRY_LIMIT = 5;

function requirePrismaResult<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

function retryableTransactionError(error: any) {
  const code = error?.code || error?.extensions?.prisma?.code;
  return code === 'P2002' || code === 'P2034';
}

function paymentMinor(payment: any) {
  if (Number.isSafeInteger(payment.amountMinor)) return Math.abs(payment.amountMinor);
  const value = Math.round(Math.abs(Number(payment.amount || 0)) * 100);
  if (!Number.isSafeInteger(value)) throw new Error('Payment amount cannot be represented in minor units.');
  return value;
}

function normalizeCancellationInput(input: { bookingId: string; refundReason?: string | null; idempotencyKey: string }) {
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('A stable idempotency key is required.');
  const reason = String(input.refundReason || 'Cancellation requested').trim();
  if (!reason || reason.length > 500) throw new Error('Cancellation reason is required.');
  return { bookingId: input.bookingId, reason, idempotencyKey };
}

async function applyCancellationFolioTerms(
  tx: any,
  booking: any,
  eventKey: string,
  cancellationFeeMinor: number,
) {
  const ensured = await ensureBookingFolio(tx, booking.id, { postSnapshotEntries: true });
  const activeLineIds = new Set(booking.lineItems.map((line: any) => line.id));
  const entries = await tx.prisma.folioEntry.findMany({
    where: { folioId: ensured.folioId },
    include: { reversedBy: true },
    orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
  });
  const now = new Date();
  for (const entry of entries) {
    if (entry.sourceType !== 'reservation_snapshot' || !activeLineIds.has(entry.sourceId) || entry.reversedBy) continue;
    const reversal = buildFolioReversalPosting(entry, {
      postingKey: `${eventKey}:reverse:${entry.id}`,
      reason: 'Reservation cancelled under snapshotted rate terms',
    });
    await tx.prisma.folioEntry.create({
      data: {
        folioId: ensured.folioId,
        ...reversal,
        serviceDate: now,
        postedAt: now,
        metadataSnapshot: { ...(reversal.metadataSnapshot as any), cancellationEventKey: eventKey },
      },
    });
  }
  if (cancellationFeeMinor > 0) {
    await tx.prisma.folioEntry.upsert({
      where: { postingKey: `${eventKey}:fee` },
      create: {
        folioId: ensured.folioId,
        postingKey: `${eventKey}:fee`,
        entryType: 'adjustment',
        direction: 'debit',
        amountMinor: cancellationFeeMinor,
        currencyCode: String(booking.currencyCode || 'USD').toUpperCase(),
        description: 'Cancellation fee due under booked rate terms',
        serviceDate: now,
        postedAt: now,
        sourceType: 'system',
        sourceId: booking.id,
        metadataSnapshot: { cancellationEventKey: eventKey },
      },
      update: {},
    });
  }
  return ensured.folioId;
}

export async function requestBookingCancellation({
  context,
  bookingId,
  refundReason,
  idempotencyKey,
  actorId,
  source = 'guest',
  withinTransaction = false,
}: {
  context: any;
  bookingId: string;
  refundReason?: string | null;
  idempotencyKey: string;
  actorId?: string | null;
  source?: 'guest' | 'staff' | 'channel' | 'no_show';
  withinTransaction?: boolean;
}) {
  const normalized = normalizeCancellationInput({ bookingId, refundReason, idempotencyKey });
  const eventKey = `booking:cancel:${normalized.idempotencyKey}`;
  const identity = {
    request: { bookingId, refundReason: normalized.reason, source },
    aggregateType: 'booking', aggregateId: bookingId, action: 'cancellation_requested',
  };

  const execute = async (tx: any) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) {
      const current = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!current) throw new Error('Cancellation replay evidence is incomplete.');
      return current;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ratePlan: true,
        lineItems: {
          where: { snapshotStatus: 'active' },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        },
        payments: { include: { paymentProvider: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        refundIntents: true,
      },
    });
    if (!booking) throw new Error('Booking not found.');
    if (booking.status === 'cancelled' || booking.status === 'cancellation_pending') {
      throw new Error(`Booking is already ${booking.status.replaceAll('_', ' ')}.`);
    }
    if (!CANCELLABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new Error(`A ${booking.status} booking cannot be cancelled.`);
    }
    if (source === 'no_show' && booking.checkInDate > new Date()) {
      throw new Error('A reservation cannot be marked no-show before its arrival time.');
    }

    const captures = booking.payments.filter((payment: any) =>
      payment.status === 'completed' && payment.paymentType !== 'refund' && paymentMinor(payment) > 0
    );
    const refunds = booking.payments.filter((payment: any) =>
      payment.paymentType === 'refund' && payment.status === 'refunded'
    );
    const availableByPayment = new Map<string, number>();
    let availableCapturedMinor = 0;
    for (const payment of captures) {
      const settledRefundMinor = refunds
        .filter((refund: any) => (refund.providerData as any)?.sourcePaymentId === payment.id)
        .reduce((sum: number, refund: any) => sum + paymentMinor(refund), 0);
      const reservedRefundMinor = booking.refundIntents
        .filter((intent: any) => intent.sourcePaymentId === payment.id && ACTIVE_REFUND_INTENT_STATUSES.includes(intent.status))
        .reduce((sum: number, intent: any) => sum + intent.amountMinor, 0);
      const available = paymentMinor(payment) - settledRefundMinor - reservedRefundMinor;
      if (available < 0) throw new Error('Recorded refunds exceed the captured payment.');
      availableByPayment.set(payment.id, available);
      availableCapturedMinor += available;
    }
    const firstRoomNight = booking.lineItems.find((line: any) => line.type === 'room');
    const policy = firstRoomNight?.cancellationPolicySnapshot ||
      (booking.pricingSnapshot as any)?.cancellationPolicy || booking.ratePlan?.cancellationPolicy;
    const stayNights = Math.max(1, Math.round((booking.checkOutDate.getTime() - booking.checkInDate.getTime()) / 86_400_000));
    const bookingTotalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
    const firstNightMinor = Number(firstRoomNight?.totalPrice || 0) || Math.ceil(bookingTotalMinor / stayNights);
    const cancellationTerms = calculateCancellationTerms({
      policy,
      checkInDate: booking.checkInDate,
      cancelledAt: new Date(),
      capturedMinor: availableCapturedMinor,
      firstNightMinor,
      bookingTotalMinor,
    });
    const folioId = await applyCancellationFolioTerms(tx, booking, eventKey, cancellationTerms.cancellationFeeMinor);

    let remainingRefundMinor = cancellationTerms.refundableMinor;
    const createdIntentIds: string[] = [];
    const manualRefundIds: string[] = [];
    for (const payment of captures) {
      const available = availableByPayment.get(payment.id) || 0;
      const refundMinor = Math.min(available, remainingRefundMinor);
      if (refundMinor <= 0) continue;
      remainingRefundMinor -= refundMinor;
      if (payment.paymentProvider?.code === 'pp_manual_manual') {
        const refund = await createManualRefundInTransaction({
          tx,
          sourcePayment: payment,
          amountMinor: refundMinor,
          reason: normalized.reason,
          eventKey: `${eventKey}:${payment.id}`,
          actorId: actorId || null,
        });
        manualRefundIds.push(refund.id);
        continue;
      }
      if (!payment.paymentProvider || !isOnlinePaymentProviderCode(payment.paymentProvider.code)) {
        throw new Error('The captured payment provider does not support a durable refund workflow.');
      }
      const providerPaymentId = payment.providerCaptureId || payment.providerPaymentId || payment.stripePaymentIntentId;
      if (!providerPaymentId) throw new Error('A completed payment is missing its provider identifier.');
      const intentKey = `${eventKey}:${payment.id}`;
      const refundRequest = { bookingId, sourcePaymentId: payment.id, amountMinor: refundMinor, reason: normalized.reason };
      const intent = requirePrismaResult(await prisma.refundIntent.create({
        data: {
          intentKey,
          requestHash: hashLifecycleRequest(refundRequest),
          cancellationEventKey: eventKey,
          propertyKey: HOTEL_PROPERTY_KEY,
          bookingId,
          sourcePaymentId: payment.id,
          paymentProviderId: payment.paymentProvider.id,
          amountMinor: refundMinor,
          currencyCode: String(payment.currency || 'USD').toUpperCase(),
          reason: normalized.reason,
          actorId: actorId || null,
          status: 'pending', attempts: 0, maxAttempts: REFUND_MAX_ATTEMPTS, availableAt: new Date(),
        },
        select: { id: true },
      }));
      createdIntentIds.push(intent.id);
    }
    if (remainingRefundMinor !== 0) throw new Error('Cancellation refund allocation did not match captured payment evidence.');

    const hasOutstandingRefunds = createdIntentIds.length > 0 || booking.refundIntents.some((intent: any) =>
      ['pending', 'processing', 'failed', 'dead_letter'].includes(intent.status)
    );
    const retainedMinor = Math.max(0, availableCapturedMinor - cancellationTerms.refundableMinor);
    const outstandingFeeMinor = Math.max(0, cancellationTerms.cancellationFeeMinor - retainedMinor);
    const finalPaymentStatus = outstandingFeeMinor > 0
      ? (retainedMinor > 0 ? 'partial' : 'unpaid')
      : availableCapturedMinor > 0 && cancellationTerms.refundableMinor === availableCapturedMinor
        ? 'refunded'
        : booking.paymentStatus;
    const now = new Date();
    const updated = requirePrismaResult(await prisma.booking.update({
      where: { id: bookingId },
      data: hasOutstandingRefunds
        ? { status: 'cancellation_pending', balanceDueMinor: outstandingFeeMinor, balanceDue: outstandingFeeMinor / 100 }
        : {
            status: source === 'no_show' ? 'no_show' : 'cancelled',
            paymentStatus: finalPaymentStatus,
            balanceDueMinor: outstandingFeeMinor,
            balanceDue: outstandingFeeMinor / 100,
            cancelledAt: now,
          },
    }));
    await recordHotelLifecycleEvent({
      prisma, eventKey, actorId: actorId || null, identity,
      beforeSnapshot: { status: booking.status, paymentStatus: booking.paymentStatus, balanceDue: booking.balanceDue },
      afterSnapshot: {
        status: updated.status,
        folioId,
        refundIntentIds: createdIntentIds,
        manualRefundIds,
        cancellationTerms,
      },
      metadata: { confirmationNumber: booking.confirmationNumber, refundReason: normalized.reason, source },
    });
    if (!hasOutstandingRefunds) {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: source === 'no_show' ? 'booking_no_show' : 'booking_cancelled',
        eventKey,
        cancellation: {
          summary: cancellationTerms.summary,
          refundableMinor: cancellationTerms.refundableMinor,
          cancellationFeeMinor: cancellationTerms.cancellationFeeMinor,
        },
      });
    }
    return updated;
  };
  if (withinTransaction) return execute(context);
  for (let attempt = 1; attempt <= TRANSACTION_RETRY_LIMIT; attempt += 1) {
    try {
      return await context.transaction(execute, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'ReadCommitted' });
    } catch (error) {
      if (!retryableTransactionError(error) || attempt === TRANSACTION_RETRY_LIMIT) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 10));
    }
  }
  throw new Error('Cancellation transaction retry limit exceeded.');
}

export type RefundIntentRecord = {
  id: string; intentKey: string; cancellationEventKey: string; propertyKey: string;
  bookingId: string; sourcePaymentId: string; paymentProviderId: string;
  amountMinor: number; currencyCode: string; reason: string; actorId: string | null;
  attempts: number; maxAttempts: number; leaseToken: string | null;
};

export async function claimRefundIntents(prisma: any, options: { workerId: string; limit?: number; now?: Date; leaseMs?: number }) {
  const workerId = String(options.workerId || '').trim();
  if (!workerId) throw new Error('Refund workerId is required.');
  const now = options.now || new Date();
  const limit = Math.min(50, Math.max(1, Number(options.limit || 10)));
  const leaseMs = Math.min(15 * 60_000, Math.max(5_000, Number(options.leaseMs || 60_000)));
  const leaseToken = `${workerId}:${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return requirePrismaResult(await prisma.$queryRaw(Prisma.sql`
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
  `)) as RefundIntentRecord[];
}

function retryDelay(attempts: number) {
  return Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, Math.min(10, attempts - 1)));
}

async function failRefundIntent(prisma: any, intent: RefundIntentRecord, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
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

export async function settleRefundIntent(context: any, intent: RefundIntentRecord, providerResult: any) {
  return context.transaction(async (tx: any) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-refund:${intent.intentKey}`);
    const current = await prisma.refundIntent.findUnique({
      where: { id: intent.id }, include: { sourcePayment: true, paymentProvider: true, booking: true },
    });
    if (current?.status === 'succeeded') return;
    if (!current || current.status !== 'processing' || current.leaseToken !== intent.leaseToken) {
      throw new Error('Refund intent lease was lost.');
    }
    const providerRefundId = String(providerResult?.data?.id || providerResult?.data?.refund_id || '').trim();
    if (!providerRefundId) throw new Error('Provider did not return durable refund evidence.');
    const returnedAmount = providerResult?.amount ?? providerResult?.data?.amount;
    if (returnedAmount !== undefined && Number(returnedAmount) !== current.amountMinor) {
      throw new Error('Provider refund amount does not match the durable intent.');
    }
    const refundId = `refund_${createHash('sha256').update(current.intentKey).digest('hex').slice(0, 24)}`;
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
          paymentType: 'refund',
          paymentMethod: current.sourcePayment.paymentMethod || 'credit_card',
          status: 'refunded',
          providerPaymentId: current.sourcePayment.providerCaptureId || current.sourcePayment.providerPaymentId || current.sourcePayment.stripePaymentIntentId,
          providerRefundId,
          providerData: { providerResult: providerResult.data || {}, sourcePaymentId: current.sourcePaymentId, refundIntentKey: current.intentKey },
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

    const isCancellation = String(current.cancellationEventKey || '').startsWith('booking:cancel:');
    if (!isCancellation) {
      await recomputeBookingPaymentState(prisma, current.bookingId);
      await queueBookingCommunication(prisma, {
        bookingId: current.bookingId,
        kind: 'booking_refund',
        eventKey: current.intentKey,
        cancellation: { summary: current.reason, refundableMinor: current.amountMinor, cancellationFeeMinor: 0 },
      });
      return;
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
      const providerResult = await refundPayment({
        provider, paymentId, amount: intent.amountMinor, currency: intent.currencyCode,
        idempotencyKey: intent.intentKey,
        metadata: { bookingId: intent.bookingId, sourcePaymentId: intent.sourcePaymentId, refundIntentKey: intent.intentKey },
      });
      await settleRefundIntent(context, intent, providerResult);
      result.succeeded += 1;
    } catch (error) {
      const dead = await failRefundIntent(context.prisma, intent, error);
      if (dead) result.deadLettered += 1; else result.retried += 1;
    }
  }
  return result;
}
