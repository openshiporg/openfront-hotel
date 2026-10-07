import { createHash } from 'node:crypto';
import { requireHotelApproval } from '../guest-governance/commands';
import { assertActiveCashierShift } from '../cashier/commands';

import { ensurePaymentFolioPosting, getBookingCollectibleBalance } from '../folios/bookingFolio';
import { findHotelLifecycleReplay, hashLifecycleRequest, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { queueBookingCommunication } from '../communications/commands';
import { isOnlinePaymentProviderCode } from '../lib/paymentSecurity';
import { runSerializableTransaction } from '../lib/serializableTransaction';

const ACTIVE_INTENT_STATUSES = ['pending', 'processing', 'failed', 'dead_letter'];

function paymentMinor(payment: any) {
  if (Number.isSafeInteger(payment.amountMinor)) return Math.abs(payment.amountMinor);
  const amount = Math.round(Math.abs(Number(payment.amount || 0)) * 100);
  if (!Number.isSafeInteger(amount)) throw new Error('Payment amount cannot be represented in minor units.');
  return amount;
}

function capturedPaymentMinor(payment: any) {
  const amountMinor = payment.amountMinor === null || payment.amountMinor === undefined
    ? Math.round(Number(payment.amount || 0) * 100)
    : payment.amountMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Completed capture must have a positive captured amount.');
  }
  return amountMinor;
}

function sourceCaptureCurrency(payment: any) {
  const sourceCurrency = String(payment?.currency || '').trim().toUpperCase();
  const bookingCurrency = String(payment?.booking?.currencyCode || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(sourceCurrency) || !/^[A-Z]{3}$/.test(bookingCurrency) || sourceCurrency !== bookingCurrency) {
    throw new Error('Source capture currency does not match booking currency.');
  }
  return sourceCurrency;
}

export async function recomputeBookingPaymentState(prisma: any, bookingId: string) {
  const [booking, ledger, pendingRefunds] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: { billingFolio: { include: { entries: { select: { direction: true, amountMinor: true, currencyCode: true } } } } } }),
    prisma.bookingPayment.findMany({
      where: { bookingId, status: { in: ['completed', 'refunded'] } },
      select: { paymentType: true, amountMinor: true },
    }),
    prisma.refundIntent.findMany({ where: { bookingId, status: { in: ACTIVE_INTENT_STATUSES } }, select: { amountMinor: true } }),
  ]);
  if (!booking) throw new Error('Booking not found while reconciling payments.');
  const netPaidMinor = Math.max(0, ledger.reduce((sum: number, payment: any) =>
    sum + (payment.paymentType === 'refund' ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
  const reservedMinor = pendingRefunds.reduce((sum: number, intent: any) => sum + Number(intent.amountMinor || 0), 0);
  const effectivePaidMinor = Math.max(0, netPaidMinor - reservedMinor);
  const terminal = ['cancelled', 'no_show', 'cancellation_pending'].includes(booking.status);
  const remainingMinor = (await getBookingCollectibleBalance({ prisma }, bookingId)).balanceDueMinor;
  const hadCapture = ledger.some((payment: any) => payment.paymentType !== 'refund' && Number(payment.amountMinor) > 0);
  const paymentStatus = terminal
    ? (remainingMinor > 0 ? (netPaidMinor > 0 ? 'partial' : 'unpaid') : netPaidMinor <= 0 ? hadCapture ? 'refunded' : 'unpaid' : 'paid')
    : remainingMinor <= 0 ? 'paid' : effectivePaidMinor <= 0 ? 'unpaid' : 'partial';
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus,
      balanceDueMinor: remainingMinor,
      balanceDue: remainingMinor / 100,
    },
  });
  return { netPaidMinor, remainingMinor, paymentStatus };
}

export async function refundablePaymentMinor(prisma: any, payment: any) {
  const [refunds, intents] = await Promise.all([
    prisma.bookingPayment.findMany({
      where: { bookingId: payment.bookingId, paymentType: 'refund', status: 'refunded' },
      select: { amountMinor: true, amount: true, providerData: true },
    }),
    prisma.refundIntent.findMany({
      where: { sourcePaymentId: payment.id, status: { in: ACTIVE_INTENT_STATUSES } },
      select: { amountMinor: true },
    }),
  ]);
  const settled = refunds
    .filter((refund: any) => (refund.providerData as any)?.sourcePaymentId === payment.id)
    .reduce((sum: number, refund: any) => sum + paymentMinor(refund), 0);
  const reserved = intents.reduce((sum: number, intent: any) => sum + Number(intent.amountMinor || 0), 0);
  return Math.max(0, capturedPaymentMinor(payment) - settled - reserved);
}

export async function createManualRefundInTransaction({
  tx,
  sourcePayment,
  amountMinor,
  reason,
  eventKey,
  actorId,
}: {
  tx: any;
  sourcePayment: any;
  amountMinor: number;
  reason: string;
  eventKey: string;
  actorId: string | null;
}) {
  const id = `manual_refund_${createHash('sha256').update(`${sourcePayment.id}:${eventKey}`).digest('hex').slice(0, 24)}`;
  const existing = await tx.prisma.bookingPayment.findUnique({ where: { id } });
  if (existing) {
    if (
      existing.bookingId !== sourcePayment.bookingId ||
      existing.amountMinor !== -amountMinor ||
      (existing.providerData as any)?.sourcePaymentId !== sourcePayment.id
    ) {
      throw new Error('Manual refund replay evidence does not match.');
    }
    await ensurePaymentFolioPosting(tx, existing.id);
    return existing;
  }
  const cashierShiftId = sourcePayment.paymentMethod === 'cash' ? await assertActiveCashierShift(tx.prisma, actorId, String(sourcePayment.currency || 'USD')) : null;
  const now = new Date();
  const refund = await tx.prisma.bookingPayment.create({
    data: {
      id,
      paymentReference: `REF-${createHash('sha256').update(eventKey).digest('hex').slice(0, 14).toUpperCase()}`,
      bookingId: sourcePayment.bookingId,
      paymentProviderId: sourcePayment.paymentProviderId,
      amountMinor: -amountMinor,
      amount: -(amountMinor / 100),
      currency: String(sourcePayment.currency || 'USD').toUpperCase(),
      paymentType: 'refund',
      paymentMethod: sourcePayment.paymentMethod || 'other',
      status: 'refunded',
      providerPaymentId: sourcePayment.providerPaymentId,
      providerRefundId: `manual:${eventKey}`,
      providerData: {
        sourcePaymentId: sourcePayment.id,
        operatorRefundKey: eventKey,
        recordedBy: actorId,
        ...(cashierShiftId ? { cashierShiftId } : {}),
      },
      description: reason,
      processedAt: now,
      refundedAt: now,
      processedById: actorId,
    },
  });
  await ensurePaymentFolioPosting(tx, refund.id);
  return refund;
}

export async function requestBookingPaymentRefund({
  context,
  paymentId,
  amountMinor,
  reason,
  idempotencyKey,
  actorId,
  approvalId,
}: {
  context: any;
  paymentId: string;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
  actorId: string;
  approvalId?: string | null;
}) {
  const key = String(idempotencyKey || '').trim();
  const normalizedReason = String(reason || '').trim();
  if (!key || key.length > 200) throw new Error('A bounded refund idempotency key is required.');
  if (!normalizedReason || normalizedReason.length > 500) throw new Error('A bounded refund reason is required.');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Refund amount must be a positive integer amount.');
  const eventKey = `booking:refund:${key}`;
  const identity = {
    request: { paymentId, amountMinor, reason: normalizedReason },
    aggregateType: 'booking_payment',
    aggregateId: paymentId,
    action: 'refund_requested',
  };

  return runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    const replay = await findHotelLifecycleReplay(prisma, eventKey, identity);
    if (replay) return (replay.afterSnapshot as any);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-payment-refund:${paymentId}`);
    const payment = await prisma.bookingPayment.findUnique({
      where: { id: paymentId },
      include: { paymentProvider: true, booking: true },
    });
    if (!payment || payment.status !== 'completed' || payment.paymentType === 'refund') {
      throw new Error('Only a completed capture can be refunded.');
    }
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${payment.bookingId}`);
    const currentBooking = await prisma.booking.findUnique({ where: { id: payment.bookingId }, select: { status: true } });
    if (!currentBooking) throw new Error('Booking not found for refund request.');
    if (currentBooking.status === 'cancellation_pending') {
      throw new Error('A cancellation refund is already in progress; resolve it before requesting another refund.');
    }
    const availableMinor = await refundablePaymentMinor(prisma, payment);
    if (amountMinor > availableMinor) throw new Error(`Refund exceeds the available amount of ${availableMinor} minor units.`);

    const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (amountMinor >= Number(settings?.refundApprovalThresholdMinor ?? 0)) await requireHotelApproval(prisma, { approvalId, action: 'refund', aggregateId: paymentId, amountMinor, actorId, operationKey: eventKey });
    let result: any;
    if (payment.paymentProvider?.code === 'pp_manual_manual') {
      const refund = await createManualRefundInTransaction({
        tx,
        sourcePayment: payment,
        amountMinor,
        reason: normalizedReason,
        eventKey,
        actorId,
      });
      await recomputeBookingPaymentState(prisma, payment.bookingId);
      result = { status: 'recorded', paymentId: refund.id, intentId: null, amountMinor };
    } else {
      if (!payment.paymentProvider || !isOnlinePaymentProviderCode(payment.paymentProvider.code)) {
        throw new Error('This payment provider does not support the durable refund workflow.');
      }
      const currencyCode = sourceCaptureCurrency(payment);
      const providerPaymentId = payment.providerCaptureId || payment.providerPaymentId || payment.stripePaymentIntentId;
      if (!providerPaymentId) throw new Error('The captured payment is missing its provider identifier.');
      const intentKey = `${eventKey}:${payment.id}`;
      const intent = await prisma.refundIntent.create({
        data: {
          intentKey,
          requestHash: hashLifecycleRequest({ paymentId, amountMinor, reason: normalizedReason }),
          cancellationEventKey: '',
          propertyKey: HOTEL_PROPERTY_KEY,
          bookingId: payment.bookingId,
          sourcePaymentId: payment.id,
          paymentProviderId: payment.paymentProvider.id,
          amountMinor,
          currencyCode,
          reason: normalizedReason,
          actorId,
          status: 'pending',
          attempts: 0,
          maxAttempts: 8,
          availableAt: new Date(),
        },
      });
      result = { status: 'queued', paymentId: payment.id, intentId: intent.id, amountMinor };
    }
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId,
      identity,
      beforeSnapshot: { availableMinor },
      afterSnapshot: result,
      metadata: { bookingId: payment.bookingId, providerCode: payment.paymentProvider?.code || null },
    });
    if (result.status === 'recorded') {
      await queueBookingCommunication(prisma, {
        bookingId: payment.bookingId,
        kind: 'booking_refund',
        eventKey,
        cancellation: { summary: normalizedReason, refundableMinor: amountMinor, cancellationFeeMinor: 0 },
      });
    }
    return result;
  });
}

/** Called only inside the capture transaction, under the shared booking lock. */
export async function queueCaptureRecoveryRefund(prisma: any, payment: any, amountMinor: number, reason: string) {
  const intentKey = `capture-recovery:${payment.id}`;
  return prisma.refundIntent.upsert({
    where: { intentKey },
    create: {
      intentKey, requestHash: hashLifecycleRequest({ paymentId: payment.id, amountMinor, reason }),
      cancellationEventKey: '', propertyKey: HOTEL_PROPERTY_KEY, bookingId: payment.bookingId,
      sourcePaymentId: payment.id, paymentProviderId: payment.paymentProviderId,
      amountMinor, currencyCode: payment.currency, reason, actorId: null,
      status: 'pending', attempts: 0, maxAttempts: 8, availableAt: new Date(),
    }, update: {},
  });
}
