import { permissions } from '../access';
import { isOnlinePaymentProviderCode } from '../lib/paymentSecurity';
import { paymentIntegrationConfigured } from '../lib/integrationConfig';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';

function bounded(value: unknown, label: string, max = 500) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return text;
}

export default async function configureHotelPaymentProvider(
  _root: unknown,
  { code, enabled, credentials }: { code: string; enabled: boolean; credentials?: Record<string, unknown> | null },
  context: any,
) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) {
    throw new Error('Not authorized to configure payment providers.');
  }
  if (!isOnlinePaymentProviderCode(code)) throw new Error('Unsupported payment provider.');
  await ensureDefaultPaymentProviders(context);
  const existing = await context.prisma.paymentProvider.findUnique({ where: { code } });
  if (!existing) throw new Error('Payment provider record is unavailable.');

  const data: Record<string, unknown> = { isInstalled: false };
  if (enabled) {
    const input = credentials && typeof credentials === 'object' ? credentials : {};
    data.credentials = code === 'pp_stripe_stripe'
      ? {
          secretKey: bounded(input.secretKey, 'Stripe secret key'),
          publishableKey: bounded(input.publishableKey, 'Stripe publishable key'),
          webhookSecret: bounded(input.webhookSecret, 'Stripe webhook secret'),
        }
      : {
          clientId: bounded(input.clientId, 'PayPal client ID'),
          clientSecret: bounded(input.clientSecret, 'PayPal client secret'),
          webhookId: bounded(input.webhookId, 'PayPal webhook ID'),
          sandbox: input.sandbox !== false,
        };
    data.isInstalled = true;
  }

  await context.query.PaymentProvider.updateOne({ where: { id: existing.id }, data, query: 'id' });
  const provider = await context.prisma.paymentProvider.findUniqueOrThrow({ where: { id: existing.id } });
  return {
    id: provider.id,
    name: provider.name,
    code: provider.code,
    isInstalled: provider.isInstalled,
    configured: paymentIntegrationConfigured(provider),
  };
}
