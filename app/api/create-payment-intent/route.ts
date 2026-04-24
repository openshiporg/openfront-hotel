import { NextRequest, NextResponse } from 'next/server';

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency = 'usd', metadata } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();

    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured on this environment' },
        { status: 503 }
      );
    }

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects amount in cents
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: metadata || {},
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
