type ProviderRecord = {
  id: string;
  name: string;
  code: string;
  isInstalled: boolean;
  metadata?: Record<string, unknown> | null;
  credentials?: Record<string, unknown> | null;
  createPaymentFunction: string;
  capturePaymentFunction: string;
  refundPaymentFunction: string;
  getPaymentStatusFunction: string;
  generatePaymentLinkFunction: string;
  handleWebhookFunction: string;
};

async function ensureProvider(context: any, code: string, data: Record<string, any>) {
  const existing = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: code } },
    query: `
      id
      name
      code
      isInstalled
      metadata
      credentials
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
    `,
    take: 1,
  });

  if (existing[0]) {
    return existing[0] as ProviderRecord;
  }

  return (await context.sudo().query.PaymentProvider.createOne({
    data,
    query: `
      id
      name
      code
      isInstalled
      metadata
      credentials
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
    `,
  })) as ProviderRecord;
}

export async function ensureDefaultPaymentProviders(context: any) {
  const providers: ProviderRecord[] = [];

  providers.push(
    await ensureProvider(context, 'pp_manual_manual', {
      name: 'Manual Payments',
      code: 'pp_manual_manual',
      isInstalled: true,
      metadata: {
        provider: 'manual',
        displayName: 'Pay at property',
      },
      credentials: {},
      createPaymentFunction: 'manual',
      capturePaymentFunction: 'manual',
      refundPaymentFunction: 'manual',
      getPaymentStatusFunction: 'manual',
      generatePaymentLinkFunction: 'manual',
      handleWebhookFunction: 'manual',
    })
  );

  if (process.env.STRIPE_SECRET_KEY) {
    providers.push(
      await ensureProvider(context, 'pp_stripe_stripe', {
        name: 'Stripe',
        code: 'pp_stripe_stripe',
        isInstalled: true,
        metadata: {
          provider: 'stripe',
          displayName: 'Credit / debit card',
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
        },
        credentials: {},
        createPaymentFunction: 'stripe',
        capturePaymentFunction: 'stripe',
        refundPaymentFunction: 'stripe',
        getPaymentStatusFunction: 'stripe',
        generatePaymentLinkFunction: 'stripe',
        handleWebhookFunction: 'stripe',
      })
    );
  }

  if (process.env.PAYPAL_CLIENT_SECRET && process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) {
    providers.push(
      await ensureProvider(context, 'pp_paypal_paypal', {
        name: 'PayPal',
        code: 'pp_paypal_paypal',
        isInstalled: true,
        metadata: {
          provider: 'paypal',
          displayName: 'PayPal',
          clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
          sandbox: process.env.NEXT_PUBLIC_PAYPAL_SANDBOX !== 'false',
        },
        credentials: {},
        createPaymentFunction: 'paypal',
        capturePaymentFunction: 'paypal',
        refundPaymentFunction: 'paypal',
        getPaymentStatusFunction: 'paypal',
        generatePaymentLinkFunction: 'paypal',
        handleWebhookFunction: 'paypal',
      })
    );
  }

  return providers;
}
