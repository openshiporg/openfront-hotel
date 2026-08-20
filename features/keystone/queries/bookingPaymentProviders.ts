import { paymentIntegrationConfigured } from '../lib/integrationConfig';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

async function bookingPaymentProviders(_root: unknown, _args: unknown, context: any) {
  await ensureDefaultPaymentProviders(context);
  const providers = await context.prisma.paymentProvider.findMany({
    where: { code: { in: ['pp_stripe_stripe', 'pp_paypal_paypal'] }, isInstalled: true },
    orderBy: { name: 'asc' },
  });
  return providers.filter(paymentIntegrationConfigured);
}

export default bookingPaymentProviders;
