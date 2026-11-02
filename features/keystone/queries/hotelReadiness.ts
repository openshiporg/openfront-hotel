import { propertyCalendarDate } from '../lib/hotelBusinessTime';
import { getWorkerReadiness } from '../lib/workerProgress';
import { getOutboxDispatchConfig, paymentIntegrationConfigured } from '../lib/integrationConfig';
import { hotelMailInfrastructureConfigured } from '../lib/mail';

function realPropertyName(value: string | null | undefined) {
  return Boolean(String(value || '').trim());
}

const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
const RESERVED_SUFFIX = /\.(?:example|test|invalid)$/;

/**
 * A demo store (payments run on Stripe TEST keys) keeps fictional contact addresses on purpose, so a
 * reserved example domain is accepted there. A live store still needs a real address.
 */
export function stripeTestModeStore(env: NodeJS.ProcessEnv = process.env) {
  return String(env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
}

export function realContactEmail(value: string | null | undefined, allowExampleDomains = stripeTestModeStore()) {
  const address = String(value || '').trim().toLowerCase();
  const domain = address.split('@')[1] || '';
  if (!address || !domain) return false;
  const reserved = RESERVED_DOMAINS.includes(domain) || RESERVED_SUFFIX.test(domain);
  return allowExampleDomains || !reserved;
}

/**
 * Deployment readiness over GraphQL: `{ hotelReadiness }` returns `{ status, checks }`.
 * Public like the probe it replaces (flags only, no records); reads run through the
 * Keystone context's Prisma client rather than a second standalone client.
 */
export default async function hotelReadiness(_root: unknown, _args: unknown, context: any) {
  const prisma = context.prisma as any;
  const smtpConfigured = hotelMailInfrastructureConfigured();
  let communicationsRequired = smtpConfigured;
  try {
    communicationsRequired = smtpConfigured || getOutboxDispatchConfig().enabled;
    const [settings, clock, providers, sellableRate, activeChannel, enabledRateSync, enabledInventorySync, activeGroupBlock, openGroupFolio, activeGroupBooking] = await Promise.all([
      prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { groupsEnabled: true, timeZone: true, id: true, propertyName: true, contactEmail: true, contactPhone: true, addressLine1: true } }),
      prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { id: true, currentBusinessDate: true } }),
      // Every supported online provider, judged by the same predicate checkout uses: an empty
      // Stripe record can be configured from the deployment environment without isInstalled.
      prisma.paymentProvider.findMany({ where: { code: { in: ['pp_stripe_stripe', 'pp_paypal_paypal'] } } }),
      prisma.ratePlan.findFirst({
        where: { status: 'active', isPublic: true, currencyCode: 'USD', roomType: { rooms: { some: { status: { notIn: ['maintenance', 'out_of_order'] } } } } },
        select: { id: true },
      }),
      prisma.channel.findFirst({ where: { isActive: true }, select: { id: true } }),
      prisma.channel.findFirst({ where: { syncRates: true }, select: { id: true } }),
      prisma.channel.findFirst({ where: { syncInventory: true }, select: { id: true } }),
      prisma.groupBlock.findFirst({ where: { status: { in: ['tentative', 'definite'] } }, select: { id: true } }),
      prisma.folio.findFirst({ where: { groupBlockId: { not: null }, status: 'open' }, select: { id: true } }),
      prisma.booking.findFirst({ where: { groupBlockId: { not: null }, status: { in: ['pending', 'confirmed', 'checked_in'] } }, select: { id: true } }),
    ]);
    const [overdueStay, orphanOccupiedRoom] = clock ? await Promise.all([
      prisma.booking.findFirst({ where: { status: 'checked_in', checkOutDate: { lt: clock.currentBusinessDate } }, select: { id: true } }),
      prisma.room.findFirst({ where: { status: 'occupied', roomAssignments: { none: { booking: { status: 'checked_in' } } } }, select: { id: true } }),
    ]) : [null, null];
    const mailEnabled = Boolean(settings?.contactEmail) && smtpConfigured;
    const paymentEnabled = providers.some(paymentIntegrationConfigured);
    const today = new Date();
    const utcToday = propertyCalendarDate(today, settings?.timeZone || 'UTC').getTime();
    const businessDateCurrent = Boolean(clock && Math.abs(clock.currentBusinessDate.getTime() - utcToday) <= 86_400_000);
    const propertyConfigured = Boolean(
      realPropertyName(settings?.propertyName) && realContactEmail(settings?.contactEmail) &&
      settings?.contactPhone?.trim() && settings.addressLine1?.trim()
    );
    const groupsDisabled = !activeGroupBlock && !openGroupFolio && !activeGroupBooking;
    const brokenGroupBilling = await prisma.booking.findFirst({ where: { groupBlock: { billingType: 'master_folio' }, billingFolioId: null, status: { in: ['pending', 'confirmed', 'checked_in'] } }, select: { id: true } });
    const groupsHealthy = settings?.groupsEnabled === true ? !brokenGroupBilling : groupsDisabled;
    const frontDeskClear = !overdueStay && !orphanOccupiedRoom;
    const progress = await prisma.hotelWorkerLease.findMany({ where: { leaseKey: { in: ['progress:holds', 'progress:refunds', 'progress:outbox', 'heartbeat:outbox'] } } });
    const workers = getWorkerReadiness(progress, communicationsRequired);
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    const [stuckHold, stuckRefund, stuckOutbox] = await Promise.all([
      prisma.booking.findFirst({ where: { status: 'pending', holdExpiresAt: { lt: staleBefore } }, select: { id: true } }),
      prisma.refundIntent.findFirst({ where: { status: 'dead_letter' }, select: { id: true } }),
      // A message that has been due for a while and is still waiting or retrying is a delivery
      // problem even if the worker itself keeps running.
      prisma.hotelOutboxEvent.findFirst({ where: { OR: [{ status: 'dead_letter' }, { status: { in: ['pending', 'failed'] }, availableAt: { lt: staleBefore } }] }, select: { id: true } }),
    ]);
    const recoveryClear = !stuckHold && !stuckRefund && !stuckOutbox;
    const configured = Boolean(
      workers.ready && recoveryClear && propertyConfigured &&
      businessDateCurrent && sellableRate && !activeChannel && !enabledRateSync && !enabledInventorySync && groupsHealthy && frontDeskClear && mailEnabled && paymentEnabled,
    );
    if (!configured) {
      return { status: 'not_ready', checks: { database: true, workers: { holds: workers.holds, refunds: workers.refunds, communications: workers.communications, communicationsWorkerRunning: workers.communicationsWorkerRunning, communicationsRequired: workers.communicationsRequired }, recoveryClear, property: propertyConfigured, businessDate: businessDateCurrent, inventory: Boolean(sellableRate), channelsDisabled: !activeChannel && !enabledRateSync && !enabledInventorySync, groupsDisabled, groupsHealthy, frontDeskClear, mail: mailEnabled, payment: paymentEnabled, paymentVerification: 'not_checked' } };
    }
    return { status: 'ready', checks: { database: true, workers: { holds: workers.holds, refunds: workers.refunds, communications: workers.communications, communicationsWorkerRunning: workers.communicationsWorkerRunning, communicationsRequired: workers.communicationsRequired }, recoveryClear, property: true, businessDate: true, inventory: true, channelsDisabled: true, groupsDisabled, groupsHealthy: true, frontDeskClear: true, mail: true, payment: true, paymentVerification: 'not_checked' } };
  } catch {
    return { status: 'not_ready', checks: { database: false, workers: { holds: false, refunds: false, communications: false, communicationsRequired }, recoveryClear: false, property: false, businessDate: false, inventory: false, channelsDisabled: false, groupsDisabled: false, frontDeskClear: false, mail: false, payment: false } };
  }
}
