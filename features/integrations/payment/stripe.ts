import Stripe from 'stripe';

type StripeCredentials = { secretKey?: string; publishableKey?: string; webhookSecret?: string };

const getStripeClient = (credentials: StripeCredentials) => {
  if (!credentials.secretKey) throw new Error('Stripe secret key is not configured.');
  return new Stripe(credentials.secretKey, { apiVersion: '2025-11-17.clover' });
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
  return { status: refund.status, amount: refund.amount, data: refund };
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
    event,
    eventId: event.id,
    type: event.type,
    resource,
    settlement: settlementFromResource(resource),
  };
}
