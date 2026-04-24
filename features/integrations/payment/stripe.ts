import Stripe from 'stripe';

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error('Stripe secret key not configured');
  }

  return new Stripe(stripeKey, {
    apiVersion: '2025-11-17.clover',
  });
};

function normalizeAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid payment amount');
  }

  return Math.round(amount);
}

export async function createPaymentFunction({ amount, currency, metadata = {} }: any) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: normalizeAmount(amount),
    currency: (currency || 'usd').toLowerCase(),
    automatic_payment_methods: {
      enabled: true,
    },
    metadata,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    data: paymentIntent,
  };
}

export async function capturePaymentFunction({ paymentId, amount }: any) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amount ? normalizeAmount(amount) : undefined,
  });

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, metadata = {} }: any) {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create({
    payment_intent: paymentId,
    amount: amount ? normalizeAmount(Math.abs(amount)) : undefined,
    metadata,
  });

  return {
    status: refund.status,
    amount: refund.amount,
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId }: any) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    data: paymentIntent,
  };
}

export async function generatePaymentLinkFunction({ paymentId }: any) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}

export async function handleWebhookFunction({ event, headers }: any) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret is not configured');
  }

  const stripe = getStripeClient();

  const rawBody = typeof event === 'string' ? event : JSON.stringify(event);
  const stripeEvent = stripe.webhooks.constructEvent(
    rawBody,
    headers['stripe-signature'],
    webhookSecret
  );

  return {
    isValid: true,
    event: stripeEvent,
    type: stripeEvent.type,
    resource: stripeEvent.data.object,
  };
}
