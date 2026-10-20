import { createHash } from 'node:crypto';

import { ensurePaymentFolioPosting } from '../folios/bookingFolio';
import { reconcileBookingLoyalty } from '../loyalty/commands';
import { assertReplayMatches } from '../payments/settlement';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { recomputeBookingPaymentState, refundablePaymentMinor } from './bookingRefund';

/** A refund as the provider reported it in a signature-verified webhook. */
export type VerifiedProviderRefund = {
  id: string;
  /** The captured payment the refund belongs to (Stripe payment intent, PayPal capture). */
  providerPaymentId: string;
  amountMinor: number;
  currencyCode: string;
  status: 'succeeded' | 'failed' | 'pending';
  /** The Hotel refund intent key, when Hotel requested the refund itself. */
  requestKey?: string | null;
  data?: unknown;
};

type Replay = { providerCode: string; replayKey: string; providerEventId: string; eventType: string; payloadHash: string };

/**
 * Record a verified provider refund exactly once. Refunds Hotel requested settle through their
 * refund intent and its provider status check; a refund issued outside Hotel (for example in the
 * provider dashboard) is added to the payment ledger and folio only once the provider reports it
 * succeeded. Pending or failed refunds are recorded as evidence, never as money returned.
 */
export async function recordVerifiedProviderRefund(context: any, provider: any, refund: VerifiedProviderRefund, replay: Replay) {
  if (!refund.id || !refund.providerPaymentId) throw new Error('Verified refund is missing its provider identity.');
  if (!Number.isSafeInteger(refund.amountMinor) || refund.amountMinor <= 0 || !/^[A-Z]{3}$/.test(refund.currencyCode)) {
    throw new Error('Verified refund amount and currency are invalid.');
  }
  return runSerializableTransaction(context, async (tx: any) => {
    const prisma = tx.prisma;
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-provider-refund:${provider.code}:${refund.id}`);
    const existingEvent = await prisma.paymentEvent.findUnique({ where: { replayKey: replay.replayKey } });
    if (existingEvent) { assertReplayMatches(existingEvent, replay); return { success: true, duplicate: true, type: replay.eventType }; }

    const captures = await prisma.bookingPayment.findMany({
      where: {
        paymentProviderId: provider.id, paymentType: { not: 'refund' }, status: 'completed',
        OR: [{ providerCaptureId: refund.providerPaymentId }, { providerPaymentId: refund.providerPaymentId }],
      },
      take: 2,
    });
    if (captures.length !== 1) throw new Error('Verified refund must map to exactly one captured payment.');
    const capture = captures[0];
    if (String(capture.currency || '').toUpperCase() !== refund.currencyCode) throw new Error('Verified refund currency differs from the captured payment.');
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${capture.bookingId}`);

    const intent = await prisma.refundIntent.findFirst({
      where: { paymentProviderId: provider.id, OR: [{ providerRefundId: refund.id }, ...(refund.requestKey ? [{ intentKey: refund.requestKey }] : [])] },
      select: { id: true },
    });
    const recorded = await prisma.bookingPayment.findFirst({
      where: { paymentProviderId: provider.id, paymentType: 'refund', providerRefundId: refund.id },
    });

    // A webhook can arrive before the refund worker has stored the provider's refund id (PayPal
    // carries no request key); an unfinished Hotel refund of the same amount on the same capture
    // is treated as that refund, and settles through its own status check.
    const unfinishedIntent = intent ? null : await prisma.refundIntent.findFirst({
      where: { sourcePaymentId: capture.id, amountMinor: refund.amountMinor, status: { in: ['pending', 'processing', 'failed'] }, providerRefundId: null },
      select: { id: true },
    });

    let outcome: string;
    if (intent || unfinishedIntent) {
      outcome = intent ? 'hotel_refund_intent' : 'hotel_refund_intent_unconfirmed';
    } else if (recorded) {
      if (Number(recorded.amountMinor) !== -refund.amountMinor) throw new Error('A recorded refund with this provider identity has a different amount; reconcile it manually.');
      outcome = 'already_recorded';
    } else if (refund.status !== 'succeeded') {
      outcome = `not_settled:${refund.status}`;
    } else {
      if (refund.amountMinor > await refundablePaymentMinor(prisma, capture)) {
        throw new Error('Provider refund exceeds the refundable balance on record; reconcile it manually.');
      }
      const created = await prisma.bookingPayment.create({
        data: {
          id: `refund_ext_${createHash('sha256').update(`${provider.code}:${refund.id}`).digest('hex').slice(0, 24)}`,
          bookingId: capture.bookingId,
          paymentProviderId: provider.id,
          amountMinor: -refund.amountMinor,
          amount: -(refund.amountMinor / 100),
          currency: refund.currencyCode,
          paymentType: 'refund',
          paymentMethod: capture.paymentMethod || 'credit_card',
          status: 'refunded',
          providerPaymentId: refund.providerPaymentId,
          providerRefundId: refund.id,
          providerData: { origin: 'provider_external', sourcePaymentId: capture.id, providerResult: refund.data ?? {} },
          description: 'Refund issued in the payment provider',
          processedAt: new Date(),
          refundedAt: new Date(),
        },
      });
      await ensurePaymentFolioPosting(tx, created.id);
      await reconcileBookingLoyalty(prisma, capture.bookingId, `external-refund:${provider.code}:${refund.id}`, null);
      await recomputeBookingPaymentState(prisma, capture.bookingId);
      outcome = 'recorded';
    }

    await prisma.paymentEvent.create({
      data: { ...replay, status: 'processed', processedAt: new Date(), bookingId: capture.bookingId, paymentId: capture.id, evidence: { refundId: refund.id, refundStatus: refund.status, outcome } },
    });
    return { success: true, duplicate: false, type: replay.eventType };
  });
}
