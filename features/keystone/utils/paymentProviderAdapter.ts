export async function executeAdapterFunction({ provider, functionName, args }: any) {
  const functionPath = provider?.[functionName];

  if (!functionPath) {
    throw new Error(`Provider ${provider?.code || provider?.id || 'unknown'} is missing ${functionName}`);
  }

  if (functionPath.startsWith('http')) {
    const response = await fetch(functionPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...args }),
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }

    return response.json();
  }

  const adapter = await import(`../../integrations/payment/${functionPath}`);
  const fn = (adapter as any)[functionName];

  if (!fn) {
    throw new Error(`Function ${functionName} not found in adapter ${functionPath}`);
  }

  try {
    return await fn({ provider, ...args });
  } catch (error: any) {
    throw new Error(`Error executing ${functionName} for provider ${functionPath}: ${error?.message || 'Unknown error'}`);
  }
}

export async function createPayment({ provider, cart, amount, currency, metadata }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'createPaymentFunction',
    args: { cart, amount, currency, metadata },
  });
}

export async function capturePayment({ provider, paymentId, amount }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'capturePaymentFunction',
    args: { paymentId, amount },
  });
}

export async function refundPayment({ provider, paymentId, amount, currency, metadata }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'refundPaymentFunction',
    args: { paymentId, amount, currency, metadata },
  });
}

export async function getPaymentStatus({ provider, paymentId }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'getPaymentStatusFunction',
    args: { paymentId },
  });
}

export async function generatePaymentLink({ provider, paymentId }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'generatePaymentLinkFunction',
    args: { paymentId },
  });
}

export async function handleWebhook({ provider, event, headers }: any) {
  return executeAdapterFunction({
    provider,
    functionName: 'handleWebhookFunction',
    args: { event, headers },
  });
}
