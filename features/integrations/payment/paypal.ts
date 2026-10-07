import { PaymentProviderCredentialRejectedError } from './providerErrors';

const NO_DIVISION_CURRENCIES = [
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'XAF', 'XOF',
  'BIF', 'DJF', 'GNF', 'KMF', 'MGA', 'RWF', 'XPF',
  'HTG', 'VUV', 'XAG', 'XDR', 'XAU',
];

type PayPalCredentials = { clientId?: string; clientSecret?: string; webhookId?: string; sandbox?: boolean };

const getPayPalBaseUrl = (credentials: PayPalCredentials) =>
  credentials.sandbox === false ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const formatPayPalAmount = (amount: number, currency: string): string =>
  NO_DIVISION_CURRENCIES.includes(currency.toUpperCase())
    ? Math.round(amount).toString()
    : (Math.round(amount) / 100).toFixed(2);

const parsePayPalAmount = (value: string, currency: string): number =>
  NO_DIVISION_CURRENCIES.includes(currency.toUpperCase())
    ? parseInt(value, 10)
    : Math.round(parseFloat(value) * 100);

function paypalFetch(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) });
}

function rejectAuthenticationFailure(response: Response) {
  if ([401, 403].includes(response.status)) throw new PaymentProviderCredentialRejectedError();
}

async function getPayPalAccessToken(credentials: PayPalCredentials) {
  const { clientId, clientSecret } = credentials;
  if (!clientId || !clientSecret) throw new Error('PayPal credentials are not configured.');

  const response = await paypalFetch(`${getPayPalBaseUrl(credentials)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en_US',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  rejectAuthenticationFailure(response);
  if (!response.ok) throw new Error('Failed to get PayPal access token');
  const body = await response.json();
  if (!body.access_token) throw new Error('Failed to get PayPal access token');
  return body.access_token as string;
}

export function settlementFromCapture(capture: any) {
  const amount = capture?.amount;
  return {
    isSettled: capture?.status === 'COMPLETED',
    amount: amount?.value
      ? parsePayPalAmount(amount.value, amount.currency_code)
      : null,
    currencyCode: String(amount?.currency_code || '').toUpperCase(),
    providerPaymentId: String(capture?.supplementary_data?.related_ids?.order_id || ''),
    providerCaptureId: String(capture?.id || ''),
    bookingId: String(capture?.custom_id || ''),
    idempotencyKey: '',
  };
}

export async function handleWebhookFunction({ rawBody, headers, providerCredentials }: any) {
  const webhookId = providerCredentials?.webhookId;
  if (!webhookId) throw new Error('PayPal webhook ID is not configured');
  if (typeof rawBody !== 'string' || !rawBody) {
    throw new Error('PayPal webhook raw body is required');
  }

  const event = JSON.parse(rawBody);
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(
    `${getPayPalBaseUrl(providerCredentials)}/v1/notifications/verify-webhook-signature`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        auth_algo: headers?.['paypal-auth-algo'],
        cert_url: headers?.['paypal-cert-url'],
        transmission_id: headers?.['paypal-transmission-id'],
        transmission_sig: headers?.['paypal-transmission-sig'],
        transmission_time: headers?.['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: event,
      }),
    }
  );
  rejectAuthenticationFailure(response);
  if (!response.ok) throw new Error('PayPal webhook signature verification failed');
  const verification = await response.json();
  if (verification.verification_status !== 'SUCCESS') {
    throw new Error('Invalid webhook signature');
  }

  const settlement = settlementFromCapture(event.resource);
  if (settlement.providerPaymentId && !settlement.bookingId && String(event.event_type || '').startsWith('PAYMENT.CAPTURE.')) {
    const orderResponse = await paypalFetch(`${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(settlement.providerPaymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    rejectAuthenticationFailure(orderResponse);
    if (!orderResponse.ok) throw new Error('Verified PayPal capture order could not be resolved.');
    const order = await orderResponse.json();
    settlement.bookingId = String(order.purchase_units?.[0]?.custom_id || '');
  }
  return {
    isValid: true,
    event,
    eventId: event.id,
    type: event.event_type,
    resource: event.resource,
    settlement,
  };
}

export async function createPaymentFunction({
  amount,
  currency,
  metadata = {},
  idempotencyKey,
  providerCredentials,
}: any) {
  if (!metadata.returnUrl || !metadata.cancelUrl) {
    throw new Error('Verified PayPal return and cancellation URLs are required.');
  }
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(`${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'PayPal-Request-Id': idempotencyKey,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: (currency || 'USD').toUpperCase(),
          value: formatPayPalAmount(amount, currency || 'USD'),
        },
        custom_id: metadata.bookingId,
        invoice_id: metadata.idempotencyKey,
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        return_url: metadata.returnUrl,
        cancel_url: metadata.cancelUrl,
        user_action: 'PAY_NOW',
      },
    }),
  });
  const order = await response.json();
  rejectAuthenticationFailure(response);
  if (!response.ok || order.error) {
    throw new Error(`PayPal order creation failed: ${order.error?.message || response.status}`);
  }
  return {
    orderId: order.id,
    status: order.status,
    approveLink: order.links?.find((link: any) => link.rel === 'approve')?.href || null,
    data: order,
  };
}

export async function completePaymentFunction({ paymentId, providerCredentials }: any) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(paymentId)}/capture`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': `capture:${paymentId}`,
      },
    }
  );
  const order = await response.json();
  rejectAuthenticationFailure(response);
  if (!response.ok || order.error) {
    if (order.details?.some((detail: any) => detail.issue === 'ORDER_ALREADY_CAPTURED')) return getPaymentStatusFunction({ paymentId, providerCredentials });
    throw new Error(`PayPal capture failed: ${order.error?.message || response.status}`);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const settlement = settlementFromCapture(capture);
  settlement.bookingId ||= String(order.purchase_units?.[0]?.custom_id || '');
  settlement.providerPaymentId ||= String(order.id || paymentId);
  return {
    status: capture?.status || order.status,
    amount: settlement.amount,
    currencyCode: settlement.currencyCode,
    providerPaymentId: capture?.id || order.id,
    metadata: { bookingId: settlement.bookingId },
    settlement,
    data: order,
  };
}

export async function refundPaymentFunction({ paymentId, amount, currency = 'USD', idempotencyKey, providerCredentials }: any) {
  if (!idempotencyKey) throw new Error('PayPal refund idempotency key is required');
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': idempotencyKey,
      },
      body: JSON.stringify({
        amount: amount ? {
          value: formatPayPalAmount(Math.abs(amount), currency),
          currency_code: currency.toUpperCase(),
        } : undefined,
      }),
    }
  );
  const refund = await response.json();
  rejectAuthenticationFailure(response);
  if (!response.ok || refund.error) {
    throw new Error(`PayPal refund failed: ${refund.error?.message || response.status}`);
  }
  return {
    status: refund.status,
    currencyCode: String(refund.amount?.currency_code || '').toUpperCase(),
    amount: refund.amount
      ? parsePayPalAmount(refund.amount.value, refund.amount.currency_code)
      : undefined,
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId, providerCredentials }: any) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(
    `${getPayPalBaseUrl(providerCredentials)}/v2/checkout/orders/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const order = await response.json();
  rejectAuthenticationFailure(response);
  if (!response.ok || order.error) {
    throw new Error(`PayPal status check failed: ${order.error?.message || response.status}`);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const settlement = settlementFromCapture(capture);
  settlement.providerPaymentId ||= String(order.id || paymentId);
  settlement.bookingId ||= String(order.purchase_units?.[0]?.custom_id || '');
  return { status: order.status, settlement, data: order };
}

export async function generatePaymentLinkFunction({ paymentId }: any) {
  return `https://www.paypal.com/activity/payment/${paymentId}`;
}

export async function getRefundStatusFunction({ refundId, providerCredentials }: any) {
  const accessToken = await getPayPalAccessToken(providerCredentials);
  const response = await paypalFetch(`${getPayPalBaseUrl(providerCredentials)}/v2/payments/refunds/${encodeURIComponent(refundId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const refund = await response.json();
  rejectAuthenticationFailure(response);
  if (!response.ok || refund.error) throw new Error(`PayPal refund status check failed: ${response.status}`);
  return { status: refund.status, currencyCode: String(refund.amount?.currency_code || '').toUpperCase(),
    amount: refund.amount ? parsePayPalAmount(refund.amount.value, refund.amount.currency_code) : undefined, data: refund };
}

export async function cancelPaymentFunction() {
  throw new Error('PayPal uncaptured order cancellation is unavailable; retire the local attempt and reconcile provider expiry or any late capture.');
}
