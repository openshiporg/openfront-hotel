import { releaseCancelledGroupPickup } from '../groups/commands';
import { creditDirectBillingForCancellation } from '../receivables/commands';
import { currentPostingDate, propertyArrivalInstant } from '../lib/hotelBusinessTime';

import { ensureBookingFolio } from '../folios/bookingFolio';
import { recomputeBookingPaymentState } from '../refunds/bookingRefund';
import { calculateCancellationTerms } from '../lib/cancellationPolicy';
import { buildFolioReversalPosting, normalizeFolioCurrency } from '../folios/ledger';
import { queueBookingCommunication } from '../communications/commands';
import { isOnlinePaymentProviderCode } from '../lib/paymentSecurity';
import {
  HOTEL_PROPERTY_KEY,
  findHotelLifecycleReplay,
  hashLifecycleRequest,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';

const CANCELLABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);
const ACTIVE_REFUND_INTENT_STATUSES = ['pending', 'processing', 'failed', 'dead_letter'];
const REFUND_MAX_ATTEMPTS = 8;
const MAX_REFUND_INTENT_MINOR = 2_147_483_647;
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
  const serviceDay = await currentPostingDate(tx.prisma);
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
        serviceDate: serviceDay,
        postedAt: now,
        metadataSnapshot: { ...(reversal.metadataSnapshot as any), cancellationEventKey: eventKey, originalServiceDate: entry.serviceDate },
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
        serviceDate: serviceDay,
        postedAt: now,
        sourceType: 'system',
        sourceId: booking.id,
        metadataSnapshot: { cancellationEventKey: eventKey },
      },
      update: {},
    });
  }
  await creditDirectBillingForCancellation(tx, booking.id, ensured.folioId, eventKey);
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
  source?: 'guest' | 'staff' | 'channel' | 'no_show' | 'hold_expiry' | 'payment_recovery';
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
    if (source === 'no_show') {
      if (booking.status !== 'confirmed') throw new Error('Only a confirmed reservation can be marked no-show.');
      const settings = booking.pricingSnapshot?.arrivalInstant ? null : await prisma.hotelSettings.findUnique({ where: { id: 1 } });
      const arrival = booking.pricingSnapshot?.arrivalInstant ? new Date(booking.pricingSnapshot.arrivalInstant) : new Date(propertyArrivalInstant(booking.checkInDate, settings?.checkInTime || '15:00', settings?.timeZone || 'UTC'));
      if (!Number.isFinite(arrival.getTime()) || arrival > new Date()) throw new Error('A reservation cannot be marked no-show before its arrival time.');
    }

    const abandoned = source === 'hold_expiry' || source === 'payment_recovery';
    if (abandoned && booking.status !== 'pending') throw new Error('Only an unconfirmed reservation can use hold recovery.');
    if (source === 'hold_expiry' && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) > new Date())) {
      throw new Error('The reservation hold has not expired.');
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
    const cancellationTerms = abandoned ? { policy: 'flexible' as const, refundableMinor: availableCapturedMinor, cancellationFeeMinor: 0, capturedMinor: availableCapturedMinor, summary: 'Unconfirmed reservation released without a cancellation fee. Any received payment is being returned.', fullRefundDeadline: null } : calculateCancellationTerms({
      policy,
      checkInDate: (booking.pricingSnapshot as any)?.arrivalInstant || booking.checkInDate,
      cancelledAt: new Date(),
      capturedMinor: availableCapturedMinor,
      firstNightMinor,
      bookingTotalMinor,
    });
    const folioId = await applyCancellationFolioTerms(tx, booking, eventKey, cancellationTerms.cancellationFeeMinor);

    let remainingRefundMinor = cancellationTerms.refundableMinor;
    const cancellationRefundIntentIds: string[] = [];
    const manualRefundIds: string[] = [];
    for (const payment of captures) {
      const available = availableByPayment.get(payment.id) || 0;
      const refundMinor = Math.min(available, remainingRefundMinor);
      if (refundMinor <= 0) continue;
      if (!Number.isSafeInteger(refundMinor) || refundMinor > MAX_REFUND_INTENT_MINOR) {
        throw new Error('Cancellation refund amount exceeds the PostgreSQL Int32 minor-unit limit.');
      }
      remainingRefundMinor -= refundMinor;
      const isManual = payment.paymentProvider?.code === 'pp_manual_manual';
      if (!payment.paymentProvider || (!isManual && !isOnlinePaymentProviderCode(payment.paymentProvider.code))) {
        throw new Error('The captured payment provider does not support a durable refund workflow.');
      }
      const providerPaymentId = payment.providerCaptureId || payment.providerPaymentId || payment.stripePaymentIntentId;
      if (!isManual && !providerPaymentId) throw new Error('A completed payment is missing its provider identifier.');
      const sourceCurrencyCode = normalizeFolioCurrency(String(payment.currency || ''));
      const bookingCurrencyCode = normalizeFolioCurrency(String(booking.currencyCode || 'USD'));
      if (sourceCurrencyCode !== bookingCurrencyCode) {
        throw new Error('Cancellation refund currency does not match booking currency.');
      }
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
          currencyCode: sourceCurrencyCode,
          reason: normalized.reason,
          actorId: actorId || null,
          status: 'pending', attempts: 0, maxAttempts: REFUND_MAX_ATTEMPTS, availableAt: new Date(),
        },
        select: { id: true },
      }));
      cancellationRefundIntentIds.push(intent.id);
    }
    if (remainingRefundMinor !== 0) throw new Error('Cancellation refund allocation did not match captured payment evidence.');

    const outstandingRefundIntents = booking.refundIntents.filter((intent: any) =>
      ACTIVE_REFUND_INTENT_STATUSES.includes(intent.status)
    );
    for (const intent of outstandingRefundIntents) {
      const boundCancellationKey = String(intent.cancellationEventKey || '').trim();
      if (boundCancellationKey && boundCancellationKey !== eventKey) {
        throw new Error('An outstanding refund is already bound to a different cancellation.');
      }
      if (!boundCancellationKey) {
        await prisma.refundIntent.update({ where: { id: intent.id }, data: { cancellationEventKey: eventKey } });
      }
    }
    const refundIntentIds = [...new Set([
      ...cancellationRefundIntentIds,
      ...outstandingRefundIntents.map((intent: any) => intent.id),
    ])];
    const hasOutstandingRefunds = refundIntentIds.length > 0;
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
      data: hasOutstandingRefunds && !abandoned
        ? { status: 'cancellation_pending', balanceDueMinor: outstandingFeeMinor, balanceDue: outstandingFeeMinor / 100 }
        : {
            status: source === 'no_show' ? 'no_show' : 'cancelled',
            paymentStatus: finalPaymentStatus,
            balanceDueMinor: outstandingFeeMinor,
            balanceDue: outstandingFeeMinor / 100,
            cancelledAt: now,
            holdExpiresAt: null,
          },
    }));
    await recomputeBookingPaymentState(prisma, bookingId);
    if (['cancelled', 'no_show'].includes(updated.status)) await releaseCancelledGroupPickup(prisma, bookingId, eventKey);
    await recordHotelLifecycleEvent({
      prisma, eventKey, actorId: actorId || null, identity,
      beforeSnapshot: { status: booking.status, paymentStatus: booking.paymentStatus, balanceDue: booking.balanceDue },
      afterSnapshot: {
        status: updated.status,
        folioId,
        refundIntentIds,
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

export {
  claimRefundIntents,
  confirmManualRefundPayout,
  dispatchRefundIntentBatch,
  settleRefundIntent,
} from '../refunds/refundIntentWorker';
export type { RefundIntentClaim, RefundIntentRecord } from '../refunds/refundIntentWorker';
