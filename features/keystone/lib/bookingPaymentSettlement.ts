import { createHash, randomUUID } from 'node:crypto';
import { ensurePaymentFolioPosting } from './bookingFolio';
import { recordHotelLifecycleEvent } from './hotelLifecycle';
import { queueBookingCommunication } from './hotelCommunications';

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
    `hotel-payment:${bookingId}`
  );
}

function assertReplayMatches(existing: any, replay: PaymentReplayEvidence) {
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
    if (session.payment) {
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
      await ensurePaymentFolioPosting(transactionContext, session.payment.id);
      return { paymentId: session.payment.id, replayed: true };
    }
    if (!['pending', 'confirmed'].includes(String(session.booking.status))) {
      throw new Error(`Payments cannot be completed for a ${session.booking.status} booking.`);
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

    const now = new Date();
    const payment = await prisma.bookingPayment.create({
      data: {
        paymentReference: `PAY-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
        paymentType: 'full_payment',
        amountMinor: amount,
        amount: amount / 100,
        currency: 'USD',
        paymentMethod: providerCode === 'pp_paypal_paypal' ? 'paypal' : 'credit_card',
        status: 'completed',
        providerPaymentId,
        providerCaptureId: providerCaptureId || providerPaymentId,
        providerData: providerData || {},
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

    await ensurePaymentFolioPosting(transactionContext, payment.id);

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
      sum + (item.paymentType === 'refund' ? -Math.abs(Number(item.amountMinor || 0)) : Math.max(0, Number(item.amountMinor || 0))), 0));
    const totalMinor = Number(session.booking.totalAmountMinor || Math.round(Number(session.booking.totalAmount || 0) * 100));
    const remainingMinor = Math.max(0, totalMinor - paidMinor);

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: remainingMinor <= 0 ? 'paid' : paidMinor > 0 ? 'partial' : 'unpaid',
        balanceDueMinor: remainingMinor,
        balanceDue: remainingMinor / 100,
        ...(remainingMinor <= 0
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
    if (remainingMinor <= 0) {
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

    return { paymentId: payment.id, replayed: false };
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
