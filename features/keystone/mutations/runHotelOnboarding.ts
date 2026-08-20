import { createHash, randomUUID } from 'node:crypto';

import seedData from '../../platform/onboarding/lib/seed.json';
import {
  createGuestAccessToken,
  hashGuestAccessToken,
  ensureBookingHasGuestAccess,
} from '../lib/guestBookingAccess';
import { ensureReservationSnapshots } from '../lib/reservationSnapshots';
import { ensureBookingFolio, ensurePaymentFolioPosting } from '../lib/bookingFolio';
import { ensureDefaultPaymentProviders } from '../utils/ensureDefaultPaymentProviders';
import { buildInventoryKey } from './updateRoomInventoryControls';
import {
  DEFAULT_STOREFRONT_ACCENT_PRESET,
  parseStorefrontAccentPreset,
} from '../../storefront/lib/storefront-theme';

export type HotelOnboardingTemplate = 'full' | 'minimal' | 'custom';
const SEED_VERSION = 'hotel-seed-v2';
const CUSTOM_SECTIONS = new Set([
  'hotelSettings', 'roomTypes', 'rooms', 'ratePlans', 'seasonalRates', 'guests', 'bookings',
  'bookingPayments', 'housekeepingTasks', 'maintenanceRequests', 'channels', 'channelReservations',
  'channelSyncEvents', 'loyaltyTransactions', 'inventory', 'dailyMetrics',
]);

type SeedResult = 'created' | 'updated' | 'skipped';

const MINIMAL_KEYS: Record<string, Set<string>> = {
  roomTypes: new Set(['Classic Queen', 'Deluxe King']),
  rooms: new Set(['101', '102', '103', '201', '203']),
  ratePlans: new Set(['Classic Flexible', 'Deluxe Flexible']),
  seasonalRates: new Set(['Spring City Weekend']),
  guests: new Set(['ava.carter@example.com']),
  bookings: new Set(['ava-deluxe-weekend']),
  bookingPayments: new Set(['ava-deposit']),
  housekeepingTasks: new Set(['hk-room-103']),
  maintenanceRequests: new Set(['maint-203-hvac']),
  channels: new Set(['booking-com']),
  channelReservations: new Set(['bookingcom-ava']),
  channelSyncEvents: new Set(['bookingcom-sync-ok']),
  loyaltyTransactions: new Set(['ava-gold-bonus']),
  inventory: new Set(['classic-2026-03-18', 'deluxe-2026-03-18']),
  dailyMetrics: new Set(),
};

export function assertCanRunHotelOnboarding(session: any) {
  if (!session?.itemId || !session?.data?.role?.canManageOnboarding) {
    throw new Error('You do not have permission to run hotel onboarding.');
  }
}

export function normalizeHotelOnboardingTemplate(value: string): HotelOnboardingTemplate {
  if (value === 'full' || value === 'minimal' || value === 'custom') return value;
  throw new Error('Unsupported onboarding template.');
}

function normalizeCustomSeed(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Custom onboarding data must be an object.');
  const source = value as Record<string, unknown>;
  const unknown = Object.keys(source).filter(key => !CUSTOM_SECTIONS.has(key));
  if (unknown.length) throw new Error('Custom onboarding data contains unsupported sections.');
  const encoded = JSON.stringify(source);
  if (encoded.length > 250_000) throw new Error('Custom onboarding data is too large.');
  for (const [key, rows] of Object.entries(source)) {
    if (key === 'hotelSettings') continue;
    if (!Array.isArray(rows) || rows.length > 500) throw new Error(`Custom onboarding section ${key} must be a bounded array.`);
    if (key === 'dailyMetrics' && rows.length) throw new Error('dailyMetrics is legacy-only; operational reports derive facts from bookings, folios, and payments.');
  }
  return source as any;
}

function canonicalSeedForTemplate(template: HotelOnboardingTemplate, customData?: unknown) {
  const source: any = template === 'custom' ? normalizeCustomSeed(customData) : seedData;
  if (template === 'full' || template === 'custom') return source;
  const result: any = { hotelSettings: source.hotelSettings };
  for (const [section, rows] of Object.entries(source)) {
    if (!Array.isArray(rows)) continue;
    const allowed = MINIMAL_KEYS[section];
    result[section] = allowed
      ? rows.filter((row: any) =>
          allowed.has(
            section === 'roomTypes' || section === 'ratePlans' || section === 'seasonalRates'
              ? row.name
              : section === 'rooms'
                ? row.roomNumber
                : section === 'guests'
                  ? row.email
                  : section === 'dailyMetrics'
                    ? row.date
                    : row.key
          )
        )
      : rows;
  }
  return result;
}

function confirmationNumber() {
  return `BK-SEED-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function paymentReference() {
  return `PAY-SEED-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function canonicalSeedValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalSeedValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalSeedValue(nested)]));
  }
  return value;
}

function seedValuesMatch(existing: Record<string, unknown>, expected: Record<string, unknown>) {
  return Object.entries(expected).every(([key, value]) => value === undefined ||
    JSON.stringify(canonicalSeedValue(existing[key] ?? null)) === JSON.stringify(canonicalSeedValue(value ?? null))
  );
}

function seedRowKey(section: string, row: any, index: number) {
  const natural = row?.key || row?.name || row?.roomNumber || row?.email || row?.externalId || row?.date;
  if (!natural) throw new Error(`Onboarding ${section}[${index}] requires a stable key.`);
  return `${section}:${String(natural).trim().toLowerCase()}`;
}

function seedContentHash(row: unknown) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

async function bindSeedRecord(prisma: any, seedKey: string, section: string, entityId: string, row: unknown) {
  await prisma.hotelSeedRecord.upsert({
    where: { seedKey },
    create: { seedKey, section, entityId, contentHash: seedContentHash(row), seedVersion: SEED_VERSION },
    update: { entityId, contentHash: seedContentHash(row), seedVersion: SEED_VERSION },
  });
}

async function runHotelOnboarding(
  _root: unknown,
  { template, data }: { template: string; data?: unknown },
  context: any
) {
  assertCanRunHotelOnboarding(context.session);
  const normalizedTemplate = normalizeHotelOnboardingTemplate(template);
  const seed = canonicalSeedForTemplate(normalizedTemplate, data);

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.prisma as any;
    await prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'the-alder-house-onboarding'
    );

    const results: SeedResult[] = [];
    const settings = {
      ...seed.hotelSettings,
      storefrontAccentPreset: parseStorefrontAccentPreset(
        seed.hotelSettings?.storefrontAccentPreset || DEFAULT_STOREFRONT_ACCENT_PRESET,
      ),
    };
    const existingSettings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (!existingSettings) {
      await prisma.hotelSettings.create({ data: { id: 1, ...settings } });
      results.push('created');
    } else if (!seedValuesMatch(existingSettings, settings)) {
      await prisma.hotelSettings.update({ where: { id: 1 }, data: settings });
      results.push('updated');
    } else {
      results.push('skipped');
    }
    await bindSeedRecord(prisma, 'hotelSettings:the-alder-house', 'hotelSettings', '1', settings);

    const roomTypeIds: Record<string, string> = {};
    for (const [index, roomType] of (seed.roomTypes || []).entries()) {
      const seedKey = seedRowKey('roomTypes', roomType, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.roomType.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.roomType.findUnique({ where: { name: roomType.name } });
      const data = {
        shortDescription: roomType.shortDescription || roomType.description,
        eyebrow: roomType.eyebrow,
        viewDescription: roomType.viewDescription,
        baseRateMinor: Math.round(Number(roomType.baseRate || 0) * 100),
        currencyCode: roomType.currencyCode || 'USD',
        baseRate: roomType.baseRate,
        maxOccupancy: roomType.maxOccupancy,
        bedConfiguration: roomType.bedConfiguration,
        amenities: roomType.amenities,
        squareFeet: roomType.squareFeet,
      };
      let record = existing;
      if (!existing) {
        record = await prisma.roomType.create({ data: { name: roomType.name, ...data } });
        results.push('created');
      } else if (!seedValuesMatch(existing, { name: roomType.name, ...data })) {
        record = await prisma.roomType.update({ where: { id: existing.id }, data: { name: roomType.name, ...data } });
        results.push('updated');
      } else {
        results.push('skipped');
      }
      roomTypeIds[roomType.name] = record.id;
      await bindSeedRecord(prisma, seedKey, 'roomTypes', record.id, roomType);

      for (const image of roomType.roomImages || []) {
        const { key: _imageSeedKey, ...imageData } = image;
        const existingImage = await prisma.roomImage.findFirst({
          where: { roomTypeId: record.id, imagePath: image.imagePath },
        });
        if (existingImage) {
          if (!seedValuesMatch(existingImage, imageData)) { await prisma.roomImage.update({ where: { id: existingImage.id }, data: imageData }); results.push('updated'); }
          else results.push('skipped');
          await bindSeedRecord(prisma, `roomImages:${record.id}:${image.imagePath}`, 'roomImages', existingImage.id, image);
        } else {
          const createdImage = await prisma.roomImage.create({ data: { ...imageData, roomTypeId: record.id } });
          await bindSeedRecord(prisma, `roomImages:${record.id}:${image.imagePath}`, 'roomImages', createdImage.id, image);
          results.push('created');
        }
      }
    }

    const roomIds: Record<string, string> = {};
    for (const [index, room] of (seed.rooms || []).entries()) {
      const seedKey = seedRowKey('rooms', room, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.room.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.room.findUnique({ where: { roomNumber: room.roomNumber } });
      const roomData = { floor: room.floor, notes: room.notes, roomTypeId: roomTypeIds[room.roomType] };
      let record = existing;
      if (!existing) {
        record = await prisma.room.create({ data: { roomNumber: room.roomNumber, status: room.status, ...roomData } });
        results.push('created');
      } else if (!seedValuesMatch(existing, { roomNumber: room.roomNumber, status: room.status, ...roomData })) {
        record = await prisma.room.update({ where: { id: existing.id }, data: { roomNumber: room.roomNumber, status: room.status, ...roomData } });
        results.push('updated');
      } else results.push('skipped');
      roomIds[room.roomNumber] = record.id;
      await bindSeedRecord(prisma, seedKey, 'rooms', record.id, room);
    }

    for (const [index, rate] of (seed.ratePlans || []).entries()) {
      const seedKey = seedRowKey('ratePlans', rate, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.ratePlan.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.ratePlan.findUnique({ where: { name: rate.name } });
      const { roomType, key: _rateSeedKey, ...sourceData } = rate;
      const rateData = { ...sourceData, baseRateMinor: Math.round(Number(rate.baseRate || 0) * 100), currencyCode: rate.currencyCode || 'USD', roomTypeId: roomTypeIds[roomType] };
      let record = existing;
      if (!existing) { record = await prisma.ratePlan.create({ data: rateData }); results.push('created'); }
      else if (!seedValuesMatch(existing, rateData)) { record = await prisma.ratePlan.update({ where: { id: existing.id }, data: rateData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'ratePlans', record.id, rate);
    }

    for (const [index, rate] of (seed.seasonalRates || []).entries()) {
      const seedKey = seedRowKey('seasonalRates', rate, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.seasonalRate.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.seasonalRate.findFirst({ where: { name: rate.name } });
      const { roomType, key: _seasonSeedKey, ...data } = rate;
      const rateData = { ...data, startDate: new Date(data.startDate), endDate: new Date(data.endDate), roomTypeId: roomTypeIds[roomType] };
      let record = existing;
      if (!existing) { record = await prisma.seasonalRate.create({ data: rateData }); results.push('created'); }
      else if (!seedValuesMatch(existing, rateData)) { record = await prisma.seasonalRate.update({ where: { id: existing.id }, data: rateData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'seasonalRates', record.id, rate);
    }

    const guestIds: Record<string, string> = {};
    for (const [index, guest] of (seed.guests || []).entries()) {
      const seedKey = seedRowKey('guests', guest, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.guest.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.guest.findUnique({ where: { email: guest.email } });
      let record = existing;
      const safeData = Object.fromEntries(Object.entries(guest).filter(([key]) => !['key', 'totalStays', 'totalSpent', 'lastStayAt', 'loyaltyPoints', 'loyaltyTier'].includes(key)));
      if (!existing) { record = await prisma.guest.create({ data: safeData }); results.push('created'); }
      else {
        if (!seedValuesMatch(existing, safeData)) { record = await prisma.guest.update({ where: { id: existing.id }, data: safeData }); results.push('updated'); }
        else results.push('skipped');
      }
      guestIds[guest.email] = record.id;
      await bindSeedRecord(prisma, seedKey, 'guests', record.id, guest);
    }

    const bookingIds: Record<string, string> = {};
    for (const [index, booking] of (seed.bookings || []).entries()) {
      const marker = `seed:${booking.key}`;
      const seedKey = seedRowKey('bookings', booking, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.booking.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.booking.findFirst({ where: { internalNotes: { startsWith: marker } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      let record = existing;
      if (!record) {
        const token = createGuestAccessToken();
        record = await prisma.booking.create({
          data: {
            confirmationNumber: confirmationNumber(),
            guestName: booking.guestName,
            guestEmail: booking.guestEmail,
            checkInDate: new Date(booking.checkInDate),
            checkOutDate: new Date(booking.checkOutDate),
            numberOfGuests: booking.numberOfGuests,
            numberOfAdults: booking.numberOfAdults,
            numberOfChildren: booking.numberOfChildren,
            roomRateMinor: Math.round(Number(booking.roomRate || 0) * 100),
            taxAmountMinor: Math.round(Number(booking.taxAmount || 0) * 100),
            feesAmountMinor: Math.round(Number(booking.feesAmount || 0) * 100),
            totalAmountMinor: Math.round(Number(booking.totalAmount || 0) * 100),
            depositAmountMinor: Math.round(Number(booking.depositAmount || 0) * 100),
            balanceDueMinor: Math.round(Number(booking.balanceDue || 0) * 100),
            currencyCode: booking.currencyCode || 'USD',
            roomRate: booking.roomRate,
            taxAmount: booking.taxAmount,
            feesAmount: booking.feesAmount,
            totalAmount: booking.totalAmount,
            depositAmount: booking.depositAmount,
            balanceDue: booking.balanceDue,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            source: booking.source,
            specialRequests: booking.specialRequests,
            internalNotes: marker,
            guestProfileId: guestIds[booking.guestEmail],
            guestAccessTokenHash: hashGuestAccessToken(token),
            guestAccessTokenIssuedAt: new Date(),
          },
        });
        await prisma.roomAssignment.create({
          data: {
            bookingId: record.id,
            roomId: roomIds[booking.roomNumber],
            roomTypeId: roomTypeIds[booking.roomType],
            guestName: booking.guestName,
            ratePerNightMinor: Math.round(Number(booking.roomRate || 0) * 100 / Math.max(1, Math.round((new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 86_400_000))),
            ratePerNight: booking.roomRate,
            specialRequests: booking.specialRequests,
          },
        });
      }
      bookingIds[booking.key] = record.id;
      await bindSeedRecord(prisma, seedKey, 'bookings', record.id, booking);
      await ensureBookingHasGuestAccess(transactionContext, record.id);
      results.push(existing ? 'skipped' : 'created');
    }

    // Backfill every pre-gate reservation in the same transaction. A booking
    // without a room-type assignment is an invalid snapshot source and rolls
    // the entire onboarding application back instead of leaving partial data.
    const allBookings = await prisma.booking.findMany({ select: { id: true, folio: { select: { status: true } } } });
    for (const booking of allBookings) {
      await ensureBookingHasGuestAccess(transactionContext, booking.id);
      const snapshotResult = await ensureReservationSnapshots(
        transactionContext,
        booking.id
      );
      results.push(...Array(snapshotResult.created).fill('created' as const));
      results.push(...Array(snapshotResult.existing).fill('skipped' as const));
      const folioResult = await ensureBookingFolio(transactionContext, booking.id, { postSnapshotEntries: booking.folio?.status !== 'closed' && booking.folio?.status !== 'voided' });
      results.push(...Array(folioResult.created).fill('created' as const));
      results.push(...Array(folioResult.existing).fill('skipped' as const));
    }

    await ensureDefaultPaymentProviders(transactionContext);
    const providers = await prisma.paymentProvider.findMany({
      select: { id: true, code: true },
    });
    const providerIds = Object.fromEntries(providers.map((provider: any) => [provider.code, provider.id]));

    for (const [index, payment] of (seed.bookingPayments || []).entries()) {
      const seedKey = seedRowKey('bookingPayments', payment, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.bookingPayment.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.bookingPayment.findFirst({ where: {
          description: payment.description, amountMinor: Math.round(Number(payment.amount || 0) * 100), paymentType: payment.paymentType,
          booking: { internalNotes: { startsWith: `seed:${payment.bookingKey}` } },
        }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const record = existing || await prisma.bookingPayment.create({
        data: {
          paymentReference: paymentReference(),
          bookingId: bookingIds[payment.bookingKey],
          paymentProviderId: providerIds[payment.providerCode],
          amountMinor: Math.round(Number(payment.amount || 0) * 100),
          amount: payment.amount,
          currency: payment.currency,
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
          status: payment.status,
          description: payment.description,
          processedAt: payment.status === 'completed' ? new Date() : null,
        },
      });
      await bindSeedRecord(prisma, seedKey, 'bookingPayments', record.id, payment);
      results.push(existing ? 'skipped' : 'created');
    }

    // Repair any historical settled payment that predates automatic folio
    // posting. The stable payment-derived posting key makes this replay-safe.
    const settledPayments = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "BookingPayment"
       WHERE "booking" IS NOT NULL AND "status" IN ('completed', 'refunded')
       ORDER BY "id" ASC`
    ) as Array<{ id: string }>;
    for (const payment of settledPayments) {
      const existingEntry = await prisma.folioEntry.findUnique({
        where: { postingKey: `folio:payment:${payment.id}` },
        select: { id: true },
      });
      await ensurePaymentFolioPosting(transactionContext, payment.id);
      results.push(existingEntry ? 'skipped' : 'created');
    }

    for (const [index, task] of (seed.housekeepingTasks || []).entries()) {
      const seedKey = seedRowKey('housekeepingTasks', task, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      let record = (binding ? await prisma.housekeepingTask.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.housekeepingTask.findFirst({ where: { roomId: roomIds[task.roomNumber], taskType: task.taskType, notes: task.notes }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const taskData = { roomId: roomIds[task.roomNumber], taskType: task.taskType, priority: task.priority, notes: task.notes };
      if (!record) { record = await prisma.housekeepingTask.create({ data: { ...taskData, status: task.status } }); results.push('created'); }
      else if (!seedValuesMatch(record, taskData)) { record = await prisma.housekeepingTask.update({ where: { id: record.id }, data: taskData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'housekeepingTasks', record.id, task);
    }

    for (const [index, request] of (seed.maintenanceRequests || []).entries()) {
      const seedKey = seedRowKey('maintenanceRequests', request, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      let record = (binding ? await prisma.maintenanceRequest.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.maintenanceRequest.findFirst({ where: { roomId: roomIds[request.roomNumber], title: request.title, description: request.description }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const requestData = { roomId: roomIds[request.roomNumber], title: request.title, description: request.description, category: request.category, priority: request.priority, notes: request.notes };
      if (!record) { record = await prisma.maintenanceRequest.create({ data: { ...requestData, status: request.status } }); results.push('created'); }
      else if (!seedValuesMatch(record, requestData)) { record = await prisma.maintenanceRequest.update({ where: { id: record.id }, data: requestData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'maintenanceRequests', record.id, request);
    }

    const channelIds: Record<string, string> = {};
    for (const [index, channel] of (seed.channels || []).entries()) {
      const seedKey = seedRowKey('channels', channel, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.channel.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.channel.findUnique({ where: { name: channel.name } });
      const live = channel.isActive === true && String(channel.credentials?.mode || '').toLowerCase() === 'live';
      const channelData = {
        channelType: channel.channelType, isActive: live, commission: channel.commission,
        syncInventory: channel.syncInventory, syncRates: false, syncStatus: live ? channel.syncStatus : 'paused',
        syncErrors: channel.syncErrors, mappingRules: channel.mappingRules, credentials: channel.credentials,
      };
      let record = existing;
      if (!record) { record = await prisma.channel.create({ data: { name: channel.name, ...channelData } }); results.push('created'); }
      else if (!seedValuesMatch(record, { name: channel.name, ...channelData })) { record = await prisma.channel.update({ where: { id: record.id }, data: { name: channel.name, ...channelData } }); results.push('updated'); }
      else results.push('skipped');
      channelIds[channel.name] = record.id;
      await bindSeedRecord(prisma, seedKey, 'channels', record.id, channel);
    }

    for (const [index, reservation] of (seed.channelReservations || []).entries()) {
      const seedKey = seedRowKey('channelReservations', reservation, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.channelReservation.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.channelReservation.findFirst({ where: { externalId: reservation.externalId, channelId: channelIds[reservation.channel] } });
      const reservationData = {
        channelId: channelIds[reservation.channel], channelKey: `${channelIds[reservation.channel]}:${reservation.externalId}`, externalId: reservation.externalId,
        reservationId: bookingIds[reservation.bookingKey], roomTypeId: roomTypeIds[reservation.roomType],
        guestName: reservation.guestName, guestEmail: reservation.guestEmail,
        checkInDate: new Date(reservation.checkInDate), checkOutDate: new Date(reservation.checkOutDate),
        totalAmount: reservation.totalAmount, commission: reservation.commission, channelStatus: reservation.channelStatus,
      };
      let record = existing;
      if (!record) { record = await prisma.channelReservation.create({ data: reservationData }); results.push('created'); }
      else if (!seedValuesMatch(record, reservationData)) { record = await prisma.channelReservation.update({ where: { id: record.id }, data: reservationData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'channelReservations', record.id, reservation);
    }

    for (const [index, event] of (seed.channelSyncEvents || []).entries()) {
      const seedKey = seedRowKey('channelSyncEvents', event, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.channelSyncEvent.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.channelSyncEvent.findFirst({ where: { channelId: channelIds[event.channel], message: event.message }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const eventData = { channelId: channelIds[event.channel], action: event.action, status: event.status, message: event.message,
        errorMessage: event.errorMessage, attempts: event.attempts, occurredAt: new Date(event.occurredAt), payload: event.payload };
      let record = existing;
      if (!record) { record = await prisma.channelSyncEvent.create({ data: eventData }); results.push('created'); }
      else if (!seedValuesMatch(record, eventData)) { record = await prisma.channelSyncEvent.update({ where: { id: record.id }, data: eventData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'channelSyncEvents', record.id, event);
    }

    for (const [index, entry] of (seed.loyaltyTransactions || []).entries()) {
      const seedKey = seedRowKey('loyaltyTransactions', entry, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.loyaltyTransaction.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.loyaltyTransaction.findFirst({ where: { guestId: guestIds[entry.guestEmail], description: entry.description, type: entry.type }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const entryData = { guestId: guestIds[entry.guestEmail], bookingId: bookingIds[entry.bookingKey], points: entry.points, type: entry.type, description: entry.description };
      let record = existing;
      if (!record) { record = await prisma.loyaltyTransaction.create({ data: entryData }); results.push('created'); }
      else if (!seedValuesMatch(record, entryData)) { record = await prisma.loyaltyTransaction.update({ where: { id: record.id }, data: entryData }); results.push('updated'); }
      else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'loyaltyTransactions', record.id, entry);
    }

    for (const [index, inventory] of (seed.inventory || []).entries()) {
      const date = new Date(inventory.date);
      const seedKey = seedRowKey('inventory', inventory, index);
      const binding = await prisma.hotelSeedRecord.findUnique({ where: { seedKey } });
      const existing = (binding ? await prisma.roomInventory.findUnique({ where: { id: binding.entityId } }) : null)
        || await prisma.roomInventory.findFirst({ where: { roomTypeId: roomTypeIds[inventory.roomType], date } });
      const inventoryData = {
        totalRooms: inventory.totalRooms, bookedRooms: inventory.bookedRooms, blockedRooms: inventory.blockedRooms,
      };
      let record = existing;
      if (!record) {
        record = await prisma.roomInventory.create({ data: {
          roomTypeId: roomTypeIds[inventory.roomType], inventoryKey: buildInventoryKey(roomTypeIds[inventory.roomType], date), date, ...inventoryData,
        } });
        results.push('created');
      } else if (!seedValuesMatch(record, inventoryData)) {
        record = await prisma.roomInventory.update({ where: { id: record.id }, data: inventoryData }); results.push('updated');
      } else results.push('skipped');
      await bindSeedRecord(prisma, seedKey, 'inventory', record.id, inventory);
    }

    await prisma.user.update({
      where: { id: context.session.itemId },
      data: { onboardingStatus: 'completed' },
    });

    return {
      success: true,
      message: 'The Alder House onboarding completed atomically.',
      createdCount: results.filter((result) => result === 'created').length,
      updatedCount: results.filter((result) => result === 'updated').length,
      skippedCount: results.filter((result) => result === 'skipped').length,
    };
  }, { timeout: 120_000 });
}

export default runHotelOnboarding;
