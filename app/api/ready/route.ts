import { PrismaClient } from '@prisma/client';
import { paymentIntegrationConfigured } from '@/features/keystone/lib/integrationConfig';
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
  try {
    const [settings, clock, providers, sellableRate, activeChannel, enabledRateSync, enabledInventorySync, activeGroupBlock, openGroupFolio, activeGroupBooking] = await Promise.all([
      prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { id: true, propertyName: true, contactEmail: true, contactPhone: true, addressLine1: true } }),
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
    const mailEnabled = Boolean(settings?.contactEmail) && hotelMailInfrastructureConfigured();
    const paymentEnabled = providers.some(paymentIntegrationConfigured);
    const today = new Date();
    const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const businessDateCurrent = Boolean(clock && Math.abs(clock.currentBusinessDate.getTime() - utcToday) <= 86_400_000);
    const propertyConfigured = Boolean(
      realPropertyName(settings?.propertyName) && realContactEmail(settings?.contactEmail) &&
      settings?.contactPhone?.trim() && settings.addressLine1?.trim()
    );
    const groupsDisabled = !activeGroupBlock && !openGroupFolio && !activeGroupBooking;
    const frontDeskClear = !overdueStay && !orphanOccupiedRoom;
    const configured = Boolean(
      propertyConfigured &&
      businessDateCurrent && sellableRate && !activeChannel && !enabledRateSync && !enabledInventorySync && groupsDisabled && frontDeskClear && mailEnabled && paymentEnabled,
    );
    if (!configured) {
      return Response.json(
        { status: 'not_ready', checks: { database: true, property: propertyConfigured, businessDate: businessDateCurrent, inventory: Boolean(sellableRate), channelsDisabled: !activeChannel && !enabledRateSync && !enabledInventorySync, groupsDisabled, frontDeskClear, mail: mailEnabled, payment: paymentEnabled } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      { status: 'ready', checks: { database: true, property: true, businessDate: true, inventory: true, channelsDisabled: true, groupsDisabled: true, frontDeskClear: true, mail: true, payment: true } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'not_ready', checks: { database: false, property: false, businessDate: false, inventory: false, channelsDisabled: false, groupsDisabled: false, frontDeskClear: false, mail: false, payment: false } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
