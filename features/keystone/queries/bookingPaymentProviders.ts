import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

async function bookingPaymentProviders(root: unknown, args: unknown, context: any) {
  await ensureDefaultPaymentProviders(context);

  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { isInstalled: { equals: true } },
    query: `
      id
      name
      code
      metadata
    `,
  });

  return providers;
}

export default bookingPaymentProviders;
