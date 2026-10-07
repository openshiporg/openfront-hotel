import { randomUUID } from 'node:crypto';
import { permissions } from '../access';
import { isOnlinePaymentProviderCode } from '../lib/paymentSecurity';
import { paymentIntegrationConfigured, paymentProviderCredentialsConfigured } from '../lib/integrationConfig';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';
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
    if (!paymentProviderCredentialsConfigured({ code, isInstalled: true, credentials: data.credentials })) {
      throw new Error(`Payment provider ${code} credentials are incomplete or invalid.`);
    }
    data.isInstalled = true;
  }

  return runSerializableTransaction(context, async transactionContext => {
    await transactionContext.prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-payment-provider-config:${existing.id}`,
    );
    const current = await transactionContext.prisma.paymentProvider.findUnique({ where: { id: existing.id } });
    if (!current || current.code !== code) throw new Error('Payment provider identity changed during configuration.');
    const result = await transactionContext.sudo().query.PaymentProvider.updateOne({
      where: { id: current.id },
      data,
      query: 'id name code isInstalled',
    });
    const persisted = await transactionContext.prisma.paymentProvider.findUniqueOrThrow({ where: { id: current.id } });
    const auditId = randomUUID();
    await transactionContext.prisma.hotelAuditEvent.create({
      data: {
        eventKey: `payment-provider:${current.id}:${auditId}`,
        requestHash: hashLifecycleRequest({ code, enabled, auditId }),
        propertyKey: HOTEL_PROPERTY_KEY,
        aggregateType: 'payment_provider',
        aggregateId: current.id,
        action: enabled ? 'configured' : 'disabled',
        actorId: context.session.itemId,
        beforeSnapshot: {
          code: current.code,
          isInstalled: current.isInstalled,
          credentialsComplete: paymentProviderCredentialsConfigured(current),
        },
        afterSnapshot: {
          code: persisted.code,
          isInstalled: persisted.isInstalled,
          credentialsComplete: paymentProviderCredentialsConfigured(persisted),
        },
        metadataSnapshot: {
          credentialValuesOmitted: true,
          credentialsRotated: enabled,
          credentialsRetainedOnDisable: !enabled,
        },
      },
    });
    return {
      id: result.id,
      name: result.name,
      code: result.code,
      isInstalled: result.isInstalled,
      configured: paymentIntegrationConfigured(persisted),
    };
  });
}
