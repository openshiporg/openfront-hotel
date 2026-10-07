import { propertyCalendarDate } from '@/features/keystone/lib/hotelBusinessTime';
import { PrismaClient } from '@prisma/client';
import { getWorkerReadiness } from '@/features/keystone/lib/workerProgress';
import { getOutboxDispatchConfig, paymentIntegrationConfigured } from '@/features/keystone/lib/integrationConfig';
import { hotelMailInfrastructureConfigured } from '@/features/keystone/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalForReadiness = globalThis as unknown as { hotelReadinessPrisma?: PrismaClient };
const prisma = globalForReadiness.hotelReadinessPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForReadiness.hotelReadinessPrisma = prisma;

function realPropertyName(value: string | null | undefined) {
  const name = String(value || '').trim();
  return Boolean(name) && !/\b(?:grand hotel|openfront(?: hotel)?|acme|demo)\b/i.test(name);
}

function realContactEmail(value: string | null | undefined) {
  const address = String(value || '').trim().toLowerCase();
  const domain = address.split('@')[1] || '';
  return Boolean(address) && !['example.com', 'example.net', 'example.org'].includes(domain) && !/\.(?:example|test|invalid)$/.test(domain);
}

export async function GET() {
  const smtpConfigured = hotelMailInfrastructureConfigured();
  let communicationsRequired = smtpConfigured;
  try {
    communicationsRequired = smtpConfigured || getOutboxDispatchConfig().enabled;
    const [settings, clock, providers, sellableRate, activeChannel, enabledRateSync, enabledInventorySync, activeGroupBlock, openGroupFolio, activeGroupBooking] = await Promise.all([
      (prisma as any).hotelSettings.findUnique({ where: { id: 1 }, select: { groupsEnabled: true, timeZone: true, id: true, propertyName: true, contactEmail: true, contactPhone: true, addressLine1: true } }),
      prisma.hotelBusinessDate.findUnique({ where: { id: 1 }, select: { id: true, currentBusinessDate: true } }),
      prisma.paymentProvider.findMany({ where: { code: { in: ['pp_stripe_stripe', 'pp_paypal_paypal'] }, isInstalled: true } }),
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
    const progress = await prisma.hotelWorkerLease.findMany({ where: { leaseKey: { in: ['progress:holds', 'progress:refunds', 'progress:outbox'] } } });
    const workers = getWorkerReadiness(progress, communicationsRequired);
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    const [stuckHold, stuckRefund, stuckOutbox] = await Promise.all([
      prisma.booking.findFirst({ where: { status: 'pending', holdExpiresAt: { lt: staleBefore } }, select: { id: true } }),
      prisma.refundIntent.findFirst({ where: { status: 'dead_letter' }, select: { id: true } }),
      prisma.hotelOutboxEvent.findFirst({ where: { status: 'dead_letter' }, select: { id: true } }),
    ]);
    const recoveryClear = !stuckHold && !stuckRefund && !stuckOutbox;
    const configured = Boolean(
      workers.ready && recoveryClear && propertyConfigured &&
      businessDateCurrent && sellableRate && !activeChannel && !enabledRateSync && !enabledInventorySync && groupsHealthy && frontDeskClear && mailEnabled && paymentEnabled,
    );
    if (!configured) {
      return Response.json(
        { status: 'not_ready', checks: { database: true, workers: { holds: workers.holds, refunds: workers.refunds, communications: workers.communications, communicationsRequired: workers.communicationsRequired }, recoveryClear, property: propertyConfigured, businessDate: businessDateCurrent, inventory: Boolean(sellableRate), channelsDisabled: !activeChannel && !enabledRateSync && !enabledInventorySync, groupsDisabled, groupsHealthy, frontDeskClear, mail: mailEnabled, payment: paymentEnabled } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      { status: 'ready', checks: { database: true, workers: { holds: workers.holds, refunds: workers.refunds, communications: workers.communications, communicationsRequired: workers.communicationsRequired }, recoveryClear, property: true, businessDate: true, inventory: true, channelsDisabled: true, groupsDisabled, groupsHealthy: true, frontDeskClear: true, mail: true, payment: true } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'not_ready', checks: { database: false, workers: { holds: false, refunds: false, communications: false, communicationsRequired }, recoveryClear: false, property: false, businessDate: false, inventory: false, channelsDisabled: false, groupsDisabled: false, frontDeskClear: false, mail: false, payment: false } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
