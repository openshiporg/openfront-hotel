export async function handleWebhookFunction({ event, headers }: any) {
  return {
    isValid: true,
    event,
    type: event?.type || 'manual.event',
    resource: event?.data || event,
  };
}

export async function createPaymentFunction({ amount, currency }: any) {
  return {
    status: 'pending',
    data: {
      status: 'pending',
      amount,
      currency: (currency || 'usd').toLowerCase(),
    },
  };
}

export async function capturePaymentFunction({ amount }: any) {
  return {
    status: 'captured',
    amount,
    data: {
      status: 'captured',
      amount,
      captured_at: new Date().toISOString(),
    },
  };
}

export async function refundPaymentFunction({ amount }: any) {
  return {
    status: 'refunded',
    amount,
    data: {
      status: 'refunded',
      amount,
      refunded_at: new Date().toISOString(),
    },
  };
}

export async function getPaymentStatusFunction() {
  return {
    status: 'succeeded',
    data: {
      status: 'succeeded',
    },
  };
}

export async function generatePaymentLinkFunction() {
  return null;
}
