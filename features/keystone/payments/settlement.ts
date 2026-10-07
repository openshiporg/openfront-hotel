import { createHash, randomUUID } from 'node:crypto';
import { ensurePaymentFolioPosting, getBookingCollectibleBalance } from '../folios/bookingFolio';
import { recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { queueBookingCommunication } from '../communications/commands';
import { assertBookingConfirmationInventory, BookingConfirmationError } from '../bookings/confirmation';
import { captureRecoveryAmount, bookingPaymentDueNow } from '../lib/paymentSecurity';
import { queueCaptureRecoveryRefund } from '../refunds/bookingRefund';
import { requestBookingCancellation } from '../bookings/cancellation';
import { cancelPayment } from '../utils/paymentProviderAdapter';

export type PaymentReplayEvidence = {
  providerCode: string;
  replayKey: string;
  providerEventId: string;
  eventType: string;
  payloadHash: string;
};

const TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 30_000,
  isolationLevel: 'Serializable',
};

function isRetryableTransactionError(error: any) {
  return error?.code === 'P2034' || error?.code === 'P2002';
}

async function serializableTransaction<T>(
  context: any,
  operation: (transactionContext: any) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await context.transaction(operation, TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw new Error('Payment transaction retry limit exceeded.');
}

async function lockBookingPayment(prisma: any, bookingId: string) {
  await prisma.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    `hotel-booking:${bookingId}`
  );
}

function paymentSessionObligationRecoveryReason(session: any) {
  if (session.data?.retiredAt) return 'Capture belongs to a retired payment session';

  const obligation = session.data?.obligation;
  if (!obligation || typeof obligation !== 'object' || Array.isArray(obligation)) {
    return 'Capture has no frozen payment-session obligation';
  }

  const booking = session.booking;
  if (obligation.pricingRevision !== (booking.pricingRevision || 1)) {
    return 'Capture belongs to an earlier reservation pricing revision';
  }

  const expectedDepositPercent = Number(booking.pricingSnapshot?.depositPercent ?? 100);
  const expectedCurrencyCode = String(booking.currencyCode || 'USD').toUpperCase();
  if (
    !Number.isSafeInteger(obligation.amountMinor) || obligation.amountMinor !== session.amount ||
    !Number.isSafeInteger(obligation.depositPercent) || obligation.depositPercent !== expectedDepositPercent ||
    obligation.currencyCode !== expectedCurrencyCode
  ) {
    return 'Capture does not match its frozen payment-session obligation';
  }

  return '';
}

export function assertReplayMatches(existing: any, replay: PaymentReplayEvidence) {
  if (
    existing.providerCode !== replay.providerCode ||
    existing.providerEventId !== replay.providerEventId ||
    existing.eventType !== replay.eventType ||
    existing.payloadHash !== replay.payloadHash
  ) {
    throw new Error('Payment replay key is already bound to different evidence.');
  }
}

export function hashPaymentPayload(payload: string) {
  return createHash('sha256').update(payload).digest('hex');
}

export async function finalizeBookingPayment({
  context,
  bookingId,
  paymentSessionId,
  providerCode,
  providerPaymentId,
  providerCaptureId,
  amount,
  currencyCode,
  providerData,
  replay,
}: {
  context: any;
  bookingId: string;
  paymentSessionId: string;
  providerCode: string;
  providerPaymentId: string;
  providerCaptureId?: string | null;
  amount: number;
  currencyCode: string;
  providerData?: unknown;
  replay?: PaymentReplayEvidence;
}) {
  return serializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma as any;
    await lockBookingPayment(prisma, bookingId);

    if (replay) {
      const existingEvent = await prisma.paymentEvent.findUnique({
        where: { replayKey: replay.replayKey },
      });
      if (existingEvent) {
        assertReplayMatches(existingEvent, replay);
        return {
          paymentId: existingEvent.paymentId,
          replayed: true,
        };
      }
    }

    const session = await prisma.bookingPaymentSession.findUnique({
      where: { id: paymentSessionId },
      include: { booking: true, paymentProvider: true, payment: true },
    });
    if (!session || session.bookingId !== bookingId || !session.booking) {
      throw new Error('Payment session not found for booking.');
    }
    if (!session.paymentProvider || session.paymentProvider.code !== providerCode) {
      throw new Error('Settlement provider does not match the payment session.');
    }
    const storedProviderId = String(session.data?.paymentIntentId || session.data?.orderId || session.data?.id || '');
    if (!storedProviderId || storedProviderId !== providerPaymentId) throw new Error('Settlement identifier does not match the stored payment session.');
    if (session.payment) {
      if (session.payment.amountMinor !== amount || session.payment.currency !== currencyCode.trim().toUpperCase() ||
          (session.payment.providerPaymentId !== providerPaymentId && session.payment.providerPaymentId !== providerCaptureId) ||
          session.payment.providerCaptureId !== (providerCaptureId || providerPaymentId)) {
        throw new Error('Payment session is already bound to different settlement evidence.');
      }
      if (replay) {
        await prisma.paymentEvent.create({
          data: {
            ...replay,
            status: 'processed',
            processedAt: new Date(),
            evidence: { duplicateSettlement: true },
            bookingId,
            paymentId: session.payment.id,
          },
        });
      }
      await ensurePaymentFolioPosting(transactionContext, session.payment.id, session.payment.providerData?.recoveryReason ? { allowRecoveryReopen: true } : {});
      return { paymentId: session.payment.id, replayed: true };
    }
    if (!Number.isSafeInteger(amount) || amount !== session.amount) {
      throw new Error('Settlement amount does not match the payment session.');
    }
    if (currencyCode.trim().toUpperCase() !== 'USD') {
      throw new Error('Settlement currency does not match the booking currency.');
    }
    if (!providerPaymentId) {
      throw new Error('Provider payment identifier is required.');
    }

    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-provider-capture:${providerCode}:${providerCaptureId || providerPaymentId}`);
    const otherCapture = await prisma.bookingPayment.findFirst({ where: {
      paymentProviderId: session.paymentProviderId, providerCaptureId: providerCaptureId || providerPaymentId,
      paymentType: { not: 'refund' },
    } });
    if (otherCapture) throw new Error('Provider capture is already bound to another payment session.');
    const now = new Date();
    let confirmationAvailable = ['pending', 'confirmed'].includes(session.booking.status);
    let recoveryReason = confirmationAvailable ? '' : `Late capture for ${session.booking.status} reservation`;
    if (confirmationAvailable) {
      try { await assertBookingConfirmationInventory(transactionContext, session.booking, now); }
      catch (error) {
        if (!(error instanceof BookingConfirmationError)) throw error;
        confirmationAvailable = false;
        recoveryReason = error.message;
      }
    }
    const beforeCapture = await getBookingCollectibleBalance(transactionContext, bookingId);
    const reservedRefunds = await prisma.refundIntent.findMany({ where: { bookingId, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } }, select: { amountMinor: true } });
    const reservedMinor = reservedRefunds.reduce((sum: number, intent: any) => sum + intent.amountMinor, 0);
    const obligationRecoveryReason = paymentSessionObligationRecoveryReason(session);
    const staleObligation = Boolean(obligationRecoveryReason);
    const recoveryMinor = staleObligation ? amount : captureRecoveryAmount(session.booking, amount, beforeCapture.balanceDueMinor, confirmationAvailable);
    if (staleObligation) recoveryReason = obligationRecoveryReason;
    if (recoveryMinor && !recoveryReason) recoveryReason = 'Capture exceeds the current reservation obligation';
    const payment = await prisma.bookingPayment.create({
      data: {
        paymentReference: `PAY-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
        paymentType: session.booking.status === 'pending' && Number(session.booking.pricingSnapshot?.depositPercent ?? 100) < 100 ? 'deposit' : 'full_payment',
        amountMinor: amount,
        amount: amount / 100,
        currency: 'USD',
        paymentMethod: providerCode === 'pp_paypal_paypal' ? 'paypal' : 'credit_card',
        status: 'completed',
        providerPaymentId,
        providerCaptureId: providerCaptureId || providerPaymentId,
        providerData: { ...((providerData as Record<string, unknown>) || {}), ...(recoveryReason ? { recoveryReason, recoveryMinor } : {}) },
        stripePaymentIntentId:
          providerCode === 'pp_stripe_stripe' ? providerPaymentId : '',
        description: `Payment for booking ${session.booking.confirmationNumber}`,
        receiptEmail: session.booking.guestEmail,
        processedAt: now,
        bookingId,
        paymentProviderId: session.paymentProviderId,
        paymentSessionId: session.id,
      },
    });

    await ensurePaymentFolioPosting(transactionContext, payment.id, recoveryReason ? { allowRecoveryReopen: true } : {});

    await prisma.bookingPaymentSession.update({
      where: { id: session.id },
      data: {
        isInitiated: true,
        paymentAuthorizedAt: now,
        data: {
          ...((session.data as Record<string, unknown>) || {}),
          completionResult: providerData || {},
        },
      },
    });

    const ledger = await prisma.bookingPayment.findMany({
      where: {
        bookingId,
        status: { in: ['completed', 'refunded'] },
      },
      select: { paymentType: true, amountMinor: true },
    });
    const paidMinor = Math.max(0, ledger.reduce((sum: number, item: any) =>
      sum + (item.paymentType === 'refund' ? -Math.abs(Number(item.amountMinor || 0)) : Math.max(0, Number(item.amountMinor || 0))), 0) - reservedMinor - recoveryMinor);

    if (!confirmationAvailable && session.booking.status === 'pending') {
      await requestBookingCancellation({ context: transactionContext, bookingId, source: 'payment_recovery',
        refundReason: recoveryReason, idempotencyKey: `capture-recovery:${payment.id}`, withinTransaction: true });
    } else if (recoveryMinor > 0) {
      await queueCaptureRecoveryRefund(prisma, payment, recoveryMinor, recoveryReason);
    }

    const remainingMinor = (await getBookingCollectibleBalance(transactionContext, bookingId)).balanceDueMinor;
    const depositSatisfied = remainingMinor <= 0 || (!recoveryMinor && session.booking.status === 'pending' && bookingPaymentDueNow(session.booking, remainingMinor) === 0);
    if (confirmationAvailable) await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: remainingMinor <= 0 ? 'paid' : paidMinor > 0 ? 'partial' : 'unpaid',
        balanceDueMinor: remainingMinor,
        balanceDue: remainingMinor / 100,
        ...(payment.paymentType === 'deposit' ? { depositAmountMinor: paidMinor, depositAmount: paidMinor / 100 } : {}),
        ...(depositSatisfied
          ? {
              status: 'confirmed',
              holdExpiresAt: null,
              confirmedAt: session.booking.confirmedAt || now,
            }
          : {}),
      },
    });

    await recordHotelLifecycleEvent({
      prisma,
      eventKey: `payment:${payment.id}:settled`,
      identity: {
        request: {
          bookingId,
          paymentSessionId: session.id,
          providerCode,
          providerPaymentId,
          amount,
          currencyCode: 'USD',
        },
        aggregateType: 'booking_payment',
        aggregateId: payment.id,
        action: 'settled',
      },
      afterSnapshot: {
        status: payment.status,
        amountMinor: amount,
        currencyCode: 'USD',
        bookingId,
      },
      metadata: { providerCode, paymentSessionId: session.id },
    });
    if (confirmationAvailable && depositSatisfied) {
      await queueBookingCommunication(prisma, {
        bookingId,
        kind: 'booking_confirmation',
        eventKey: `booking:${bookingId}:confirmation:v${session.booking.pricingRevision || 1}`,
      });
    }

    if (replay) {
      await prisma.paymentEvent.create({
        data: {
          ...replay,
          status: 'processed',
          processedAt: now,
          evidence: { amount, currencyCode: 'USD', providerPaymentId },
          bookingId,
          paymentId: payment.id,
        },
      });
    }

    return { paymentId: payment.id, replayed: false, recoveryMinor, confirmationAvailable };
  });
}

export async function recordPaymentEvent({
  context,
  replay,
  status,
  evidence = {},
}: {
  context: any;
  replay: PaymentReplayEvidence;
  status: 'ignored' | 'failed';
  evidence?: Record<string, unknown>;
}) {
  return serializableTransaction(context, async (transactionContext) => {
    const prisma = transactionContext.prisma as any;
    await prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-payment-event:${replay.replayKey}`
    );
    const existing = await prisma.paymentEvent.findUnique({
      where: { replayKey: replay.replayKey },
    });
    if (existing) {
      assertReplayMatches(existing, replay);
      return { replayed: true };
    }
    await prisma.paymentEvent.create({
      data: {
        ...replay,
        status,
        processedAt: new Date(),
        evidence,
      },
    });
    return { replayed: false };
  });
}

/** Persist retirement before cancellation I/O; late capture remains compensatable. */
export async function retireBookingPaymentSession(context: any, sessionId: string, bookingId: string, cancel = cancelPayment) {
  const session: any = await serializableTransaction(context, async (tx: any) => {
    await lockBookingPayment(tx.prisma, bookingId);
    const current = await tx.prisma.bookingPaymentSession.findUnique({ where: { id: sessionId }, include: { paymentProvider: true, payment: true } });
    if (!current || current.bookingId !== bookingId) throw new Error('Retired payment session does not belong to booking.');
    if (current.payment) {
      await tx.prisma.bookingPaymentSession.update({ where: { id: current.id }, data: { isSelected: false, data: { ...(current.data || {}), retirement: { status: 'captured' } } } });
      return null;
    }
    const data = { ...(current.data || {}), retiredAt: current.data?.retiredAt || new Date().toISOString(),
      retirement: current.data?.retirement || { status: current.paymentProvider?.code === 'pp_stripe_stripe' ? 'pending' : 'provider_expiry_required', attempts: 0 } };
    await tx.prisma.bookingPaymentSession.update({ where: { id: current.id }, data: { isSelected: false, data } });
    return { ...current, data };
  });
  if (!session || session.paymentProvider?.code !== 'pp_stripe_stripe' || ['cancelled', 'captured'].includes(session.data?.retirement?.status)) return;
  const attempts = Number(session.data?.retirement?.attempts || 0) + 1;
  let retirement: any;
  try {
    const result = await cancel({ provider: session.paymentProvider, paymentId: session.data.paymentIntentId,
      idempotencyKey: `retire:${session.id}` });
    if (result.settlement?.isSettled) {
      await finalizeBookingPayment({ context, bookingId, paymentSessionId: session.id, providerCode: session.paymentProvider.code,
        providerPaymentId: session.data.paymentIntentId, providerCaptureId: session.data.paymentIntentId,
        amount: result.settlement.amount, currencyCode: result.settlement.currencyCode, providerData: result.data });
      retirement = { status: 'captured', attempts };
    } else if (result.status === 'canceled') retirement = { status: 'cancelled', attempts };
    else throw new Error('Provider cancellation is not terminal.');
  } catch {
    retirement = { status: 'failed', attempts, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** Math.min(attempts, 10))).toISOString(),
      message: 'Provider cancellation could not be confirmed; late settlement remains recoverable.' };
  }
  await serializableTransaction(context, async (tx: any) => {
    await lockBookingPayment(tx.prisma, bookingId);
    const current = await tx.prisma.bookingPaymentSession.findUnique({ where: { id: sessionId } });
    await tx.prisma.bookingPaymentSession.update({ where: { id: sessionId }, data: { data: { ...(current.data || {}), retirement } } });
  });
  return retirement.status as string;
}

export async function dispatchPaymentSessionRetirements(context: any) {
  const sessions = await context.prisma.bookingPaymentSession.findMany({
    where: { OR: [{ data: { path: ['retirement', 'status'], equals: 'pending' } }, { data: { path: ['retirement', 'status'], equals: 'failed' } }] },
    orderBy: { updatedAt: 'asc' }, take: 20,
  });
  let unresolved = 0;
  for (const session of sessions) {
    if (session.data?.retirement?.nextAttemptAt && new Date(session.data.retirement.nextAttemptAt) > new Date()) { unresolved += 1; continue; }
    const status = await retireBookingPaymentSession(context, session.id, session.bookingId);
    if (status === 'failed') unresolved += 1;
  }
  return { unresolved };
}
