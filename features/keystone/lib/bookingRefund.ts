import { createHash } from 'node:crypto';

import { ensurePaymentFolioPosting } from './bookingFolio';
import { findHotelLifecycleReplay, hashLifecycleRequest, HOTEL_PROPERTY_KEY, lockHotelLifecycle, recordHotelLifecycleEvent } from './hotelLifecycle';
import { queueBookingCommunication } from './hotelCommunications';
import { calculateFolioBalance } from './folioLedger';
import { isOnlinePaymentProviderCode } from './paymentSecurity';
import { runSerializableTransaction } from './serializableTransaction';

const ACTIVE_INTENT_STATUSES = ['pending', 'processing', 'failed', 'dead_letter'];

function paymentMinor(payment: any) {
  if (Number.isSafeInteger(payment.amountMinor)) return Math.abs(payment.amountMinor);
  const amount = Math.round(Math.abs(Number(payment.amount || 0)) * 100);
  if (!Number.isSafeInteger(amount)) throw new Error('Payment amount cannot be represented in minor units.');
  return amount;
}

export async function recomputeBookingPaymentState(prisma: any, bookingId: string) {
  const [booking, ledger] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: { billingFolio: { include: { entries: { select: { direction: true, amountMinor: true } } } } } }),
    prisma.bookingPayment.findMany({
      where: { bookingId, status: { in: ['completed', 'refunded'] } },
      select: { paymentType: true, amountMinor: true },
    }),
  ]);
  if (!booking) throw new Error('Booking not found while reconciling payments.');
  const netPaidMinor = Math.max(0, ledger.reduce((sum: number, payment: any) =>
    sum + (payment.paymentType === 'refund' ? -Math.abs(Number(payment.amountMinor || 0)) : Math.max(0, Number(payment.amountMinor || 0))), 0));
  const totalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
  const terminal = ['cancelled', 'no_show'].includes(booking.status);
  const folioBalanceMinor = booking.billingFolio
    ? Math.max(0, calculateFolioBalance(booking.billingFolio.entries as any).balanceMinor)
    : null;
  const remainingMinor = terminal && folioBalanceMinor != null ? folioBalanceMinor : Math.max(0, totalMinor - netPaidMinor);
  const paymentStatus = terminal
    ? (remainingMinor > 0 ? (netPaidMinor > 0 ? 'partial' : 'unpaid') : netPaidMinor <= 0 ? 'refunded' : 'paid')
    : netPaidMinor <= 0
      ? 'unpaid'
      : remainingMinor <= 0
        ? 'paid'
        : 'partial';
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
  return Math.max(0, paymentMinor(payment) - settled - reserved);
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
}: {
  context: any;
  paymentId: string;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
  actorId: string;
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
    const availableMinor = await refundablePaymentMinor(prisma, payment);
    if (amountMinor > availableMinor) throw new Error(`Refund exceeds the available amount of ${availableMinor} minor units.`);

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
          currencyCode: String(payment.currency || 'USD').toUpperCase(),
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
