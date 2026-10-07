import Stripe from 'stripe';

type StripeCredentials = { secretKey?: string; publishableKey?: string; webhookSecret?: string };

const getStripeClient = (credentials: StripeCredentials) => {
  if (!credentials.secretKey) throw new Error('Stripe secret key is not configured.');
  return new Stripe(credentials.secretKey, { apiVersion: '2025-11-17.clover', timeout: 20_000, maxNetworkRetries: 1 });
};

function normalizeAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Invalid payment amount');
  }
  return amount;
}

function settlementFromResource(resource: any) {
  const amount = resource?.amount_received ?? resource?.amount_total ?? resource?.amount;
  return {
    isSettled:
      resource?.status === 'succeeded' ||
      resource?.payment_status === 'paid',
    amount: Number.isSafeInteger(amount) ? amount : null,
    currencyCode: String(resource?.currency || '').toUpperCase(),
    providerPaymentId: String(resource?.payment_intent || resource?.id || ''),
    bookingId: String(resource?.metadata?.bookingId || ''),
    idempotencyKey: String(resource?.metadata?.idempotencyKey || ''),
  };
}

export async function createPaymentFunction({
  amount,
  currency,
  metadata = {},
  idempotencyKey,
  providerCredentials,
}: any) {
  const paymentIntent = await getStripeClient(providerCredentials).paymentIntents.create(
    {
      amount: normalizeAmount(amount),
      currency: (currency || 'usd').toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata,
    },
    { idempotencyKey }
  );

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    data: paymentIntent,
  };
}

export async function completePaymentFunction({ paymentId, providerCredentials }: any) {
  const paymentIntent = await getStripeClient(providerCredentials).paymentIntents.retrieve(paymentId);
  const settlement = settlementFromResource(paymentIntent);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    currencyCode: paymentIntent.currency,
    providerPaymentId: paymentIntent.id,
    metadata: paymentIntent.metadata,
    settlement,
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, metadata = {}, idempotencyKey, providerCredentials }: any) {
  if (!idempotencyKey) throw new Error('Stripe refund idempotency key is required');
  const refund = await getStripeClient(providerCredentials).refunds.create({
    payment_intent: paymentId,
    amount: amount ? normalizeAmount(Math.abs(amount)) : undefined,
    metadata,
  }, { idempotencyKey });
  return { status: refund.status, amount: refund.amount, currencyCode: refund.currency.toUpperCase(), data: refund };
}

export async function getPaymentStatusFunction({ paymentId, providerCredentials }: any) {
  return completePaymentFunction({ paymentId, providerCredentials });
}

export async function generatePaymentLinkFunction({ paymentId }: any) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}

export async function handleWebhookFunction({ rawBody, headers, providerCredentials }: any) {
  const webhookSecret = providerCredentials?.webhookSecret;
  if (!webhookSecret) throw new Error('Stripe webhook secret is not configured');
  if (typeof rawBody !== 'string' || !rawBody) {
    throw new Error('Stripe webhook raw body is required');
  }
  const signature = headers?.['stripe-signature'];
  if (!signature) throw new Error('Stripe webhook signature is required');

  const event = getStripeClient(providerCredentials).webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret
  );
  const resource = event.data.object as any;
  return {
    isValid: true,
    securityAuthorization: (event.data.object as any).object === 'payment_intent' && (event.data.object as any).metadata?.purpose === 'hotel_security' ? normalizedSecurityAuthorization(event.data.object) : null,
    event,
    eventId: event.id,
    type: event.type,
    resource,
    settlement: settlementFromResource(resource),
    dispute: resource.object === 'dispute' && event.type.startsWith('charge.dispute.') ? { id: resource.id, providerPaymentId: typeof resource.payment_intent === 'string' ? resource.payment_intent : resource.payment_intent?.id, amountMinor: resource.amount, currencyCode: String(resource.currency || '').toUpperCase(), status: resource.status, reason: resource.reason, evidenceDueBy: resource.evidence_details?.due_by || null, eventCreated: event.created, balanceTransactions: resource.balance_transactions || [] } : null,
  };
}

export async function getRefundStatusFunction({ refundId, providerCredentials }: any) {
  const refund = await getStripeClient(providerCredentials).refunds.retrieve(refundId);
  return { status: refund.status, amount: refund.amount, currencyCode: refund.currency.toUpperCase(), data: refund };
}

export async function cancelPaymentFunction({ paymentId, idempotencyKey, providerCredentials }: any) {
  const stripe = getStripeClient(providerCredentials);
  const current = await stripe.paymentIntents.retrieve(paymentId);
  if (current.status === 'succeeded' || current.status === 'canceled') return { status: current.status, settlement: settlementFromResource(current), data: current };
  const cancelled = await stripe.paymentIntents.cancel(paymentId, {}, { idempotencyKey });
  return { status: cancelled.status, settlement: settlementFromResource(cancelled), data: cancelled };
}

export function normalizedSecurityAuthorization(intent: any) {
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  return { id: intent.id, authorizationId: intent.metadata?.securityAuthorizationId, bookingId: intent.metadata?.bookingId,
    amountMinor: intent.amount, amountReceivedMinor: intent.amount_received, amountCapturableMinor: intent.amount_capturable,
    currencyCode: String(intent.currency || '').toUpperCase(), status: intent.status,
    expiresAt: charge?.payment_method_details?.card?.capture_before ? new Date(charge.payment_method_details.card.capture_before * 1000).toISOString() : null };
}
/** Manual capture keeps authorized money separate from completed hotel payments. */
export async function securityAuthorizationFunction({ action, paymentId, amountMinor, authorizationId, bookingId, idempotencyKey, providerCredentials }: any) {
  const stripe = getStripeClient(providerCredentials);
  let intent: Stripe.PaymentIntent;
  if (action === 'initiate') intent = await stripe.paymentIntents.create({ amount: normalizeAmount(amountMinor), currency: 'usd', capture_method: 'manual', payment_method_types: ['card'],
    metadata: { bookingId, securityAuthorizationId: authorizationId, purpose: 'hotel_security' } }, { idempotencyKey });
  else {
    intent = await stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
    if (action === 'capture' && intent.status === 'requires_capture') intent = await stripe.paymentIntents.capture(paymentId, { amount_to_capture: normalizeAmount(amountMinor), final_capture: true }, { idempotencyKey });
    else if (action === 'release' && !['succeeded', 'canceled'].includes(intent.status)) intent = await stripe.paymentIntents.cancel(paymentId, {}, { idempotencyKey });
  }
  return { ...normalizedSecurityAuthorization(intent), clientSecret: intent.client_secret };
}
