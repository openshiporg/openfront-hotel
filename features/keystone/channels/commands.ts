import { readChannelCredentials } from '../lib/channelCredentials';
import crypto from 'crypto'
import { ensureGuestProfile } from '../lib/guestProfiles'
import { ensureBookingHasGuestAccess } from '../lib/guestBookingAccess'
import { ensureReservationSnapshots } from '../folios/reservationSnapshots'
import { ensureBookingFolio } from '../folios/bookingFolio'
import { requestBookingCancellation } from '../bookings/cancellation'
import { amendUnpaidBooking } from '../bookings/amendment'
import { recordHotelLifecycleEvent } from '../lib/hotelLifecycle'
import { lockRoomInventory } from '../inventory/roomNightLocks'
import { assertHotelAvailability, hotelStayDates } from '../inventory/roomAvailability'
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime'
import { channelIntegrationMode, requireLiveChannelEndpoint } from '../lib/integrationConfig'
import { safeOperationalErrorMessage } from '../lib/safeOperationalError'
import { acquireWorkerLease, createWorkerLeaseOwnerId, releaseWorkerLease } from '../lib/workerLease'

const DEFAULT_RETRY_DELAY_MS = 2 * 60 * 1000
const CHANNEL_OPERATION_LEASE_TTL_MS = 120_000
const CHANNEL_OUTCOME_UNKNOWN_MESSAGE = 'Remote outcome is unknown. Reconcile partner evidence before any replay; automatic retry is suppressed.'

export type ChannelOperationLease = {
  renew: () => Promise<boolean>
  fence: (prisma: any) => Promise<boolean>
  release: () => Promise<void>
}

export type ChannelOperationLeaseProvider = {
  acquire: (context: any, channelId: string, renewOuterLease?: () => Promise<boolean>) => Promise<ChannelOperationLease | null>
}

export const workerChannelOperationLeaseProvider: ChannelOperationLeaseProvider = {
  async acquire(context, channelId, renewOuterLease) {
    const leaseKey = `hotel-channel-operation:${channelId}`
    const ownerId = createWorkerLeaseOwnerId('hotel-channel-operation')
    const options = { leaseKey, ownerId, ttlMs: CHANNEL_OPERATION_LEASE_TTL_MS }
    let released = false
    const renew = async () => {
      if (released || (renewOuterLease && !(await renewOuterLease()))) return false
      return acquireWorkerLease(context.prisma, options)
    }
    if (!(await renew())) return null
    return {
      renew,
      fence: (prisma: any) => !released ? acquireWorkerLease(prisma, options) : Promise.resolve(false),
      release: async () => {
        if (released) return
        released = true
        await releaseWorkerLease(context.prisma, { leaseKey, ownerId })
      },
    }
  },
}

class ChannelLeaseLostError extends Error {
  constructor() { super('Channel operation ownership changed before its durable result was committed.') }
}

class ChannelOutcomeUnknownError extends Error {
  constructor(message: string) { super(message) }
}

async function serializableChannelTransaction(context: any, operation: (tx: any) => Promise<any>, lease?: ChannelOperationLease) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await context.transaction(async (tx: any) => {
        if (lease && !(await lease.fence(tx.prisma))) throw new ChannelLeaseLostError()
        return operation(tx)
      }, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' })
    } catch (error: any) {
      const detail = `${error?.message || ''} ${error?.extensions?.debug?.message || ''}`;
      const retryable = error?.code === 'P2034' || error?.code === '40001' || error?.extensions?.prisma?.code === 'P2034' || /could not serialize|write conflict|deadlock/i.test(detail)
      if (!retryable || attempt === 3) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 20))
    }
  }
}

type DateRangeInput = {
  startDate?: string | null
  endDate?: string | null
}

type ChannelSyncResult = {
  channelId: string
  status: 'success' | 'failed' | 'skipped'
  syncedAt: string
  details?: Record<string, unknown>
}

type ChannelReservationPayload = {
  externalId: string
  status: string
  guestName: string
  guestEmail?: string
  checkInDate: string
  checkOutDate: string
  roomTypeCode?: string
  roomTypeName?: string
  totalAmount?: unknown
  commission?: unknown
  numberOfGuests?: number
  specialRequests?: string
  roomCount?: number
  currencyCode?: string
  adults?: number
  children?: number
  cancellationPolicy?: string
  rawData?: Record<string, unknown>
}

function getStringHeader(headers: Record<string, string | string[] | undefined>, key: string) {
  const value = headers[key.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

function normalizeSignature(signature?: string | null) {
  if (!signature) return ''
  return signature.replace(/^sha256=/, '').trim()
}

function buildSignature(secret: string, payload: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}

function signaturesMatch(actualHex: string, expectedHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false
  const actual = Buffer.from(actualHex, 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function getDateRangeDays(startDate: Date, endDate: Date) {
  const days: Date[] = []
  const current = new Date(startDate.getTime())
  current.setUTCHours(0, 0, 0, 0)

  const end = new Date(endDate.getTime())
  end.setUTCHours(0, 0, 0, 0)

  while (current < end) {
    days.push(new Date(current.getTime()))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return days
}

function getDayWindow(date: Date) {
  const start = new Date(date.getTime())
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start.getTime())
  end.setUTCDate(end.getUTCDate() + 1)
  return { start, end }
}

const MAX_STORED_MINOR = 2_147_483_647
const MAX_CHANNEL_RETRY_ATTEMPTS = 5

/**
 * A channel amount in USD minor units: a number or decimal string in whole cents, within the
 * stored integer range. Missing or malformed amounts are refused, never read as zero.
 */
function channelMinorUnits(value: unknown, label: string, required = true): number {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`Channel reservation ${label} is missing.`)
    return 0
  }
  let minor: number
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Channel reservation ${label} is invalid.`)
    minor = Math.round(value * 100)
    if (Math.abs(value * 100 - minor) > 1e-6) throw new Error(`Channel reservation ${label} has more than two decimal places.`)
  } else if (typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim())) {
    const [whole, fraction = ''] = value.trim().split('.')
    minor = Number(`${whole}${fraction.padEnd(2, '0')}`)
  } else {
    throw new Error(`Channel reservation ${label} is invalid.`)
  }
  if (!Number.isSafeInteger(minor) || minor > MAX_STORED_MINOR) throw new Error(`Channel reservation ${label} is too large.`)
  return minor
}

/** Validated commercial facts for a channel stay: USD money and a party the room type sleeps. */
async function channelStayTerms(context: any, payload: ChannelReservationPayload, roomTypeId: string) {
  const currencyCode = String(payload.currencyCode || '').trim().toUpperCase()
  if (currencyCode !== 'USD') throw new Error('Channel reservations must state their currency, and only USD is supported.')
  const totalMinor = channelMinorUnits(payload.totalAmount, 'total')
  const commissionMinor = channelMinorUnits(payload.commission, 'commission', false)
  const guests = Number(payload.numberOfGuests)
  if (!Number.isInteger(guests) || guests < 1) throw new Error('Channel reservation guest count is invalid.')
  if (payload.adults !== undefined || payload.children !== undefined) {
    const adults = Number(payload.adults ?? 0), children = Number(payload.children ?? 0)
    if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0 || adults + children !== guests) {
      throw new Error('Channel reservation adult and child counts do not match the guest count.')
    }
  }
  const roomType = await context.prisma.roomType.findUnique({ where: { id: roomTypeId }, select: { maxOccupancy: true, name: true } })
  if (!roomType) throw new Error('Channel reservation room type was not found.')
  if (guests > Number(roomType.maxOccupancy)) throw new Error(`${roomType.name} sleeps up to ${roomType.maxOccupancy} guests.`)
  return { currencyCode, totalMinor, commissionMinor, guests }
}

function mapReservationPayload(raw: any): ChannelReservationPayload {
  const reservation = raw?.reservation ?? raw?.data ?? raw

  return {
    externalId: reservation?.externalId || reservation?.id || reservation?.reservationId || '',
    status: reservation?.status || reservation?.channelStatus || raw?.eventType || raw?.type || 'unknown',
    guestName: reservation?.guestName || reservation?.guest?.name || 'Unknown Guest',
    guestEmail: reservation?.guestEmail || reservation?.guest?.email,
    checkInDate: reservation?.checkInDate || reservation?.arrivalDate,
    checkOutDate: reservation?.checkOutDate || reservation?.departureDate,
    roomTypeCode: reservation?.roomTypeCode || reservation?.roomTypeId || reservation?.roomType,
    roomTypeName: reservation?.roomTypeName,
    totalAmount: reservation?.totalAmount ?? reservation?.amount,
    commission: reservation?.commission,
    numberOfGuests: reservation?.numberOfGuests ?? reservation?.guests,
    specialRequests: reservation?.specialRequests,
    roomCount: reservation?.roomCount || reservation?.rooms || 1,
    currencyCode: reservation?.currencyCode ?? reservation?.currency,
    adults: reservation?.adults,
    children: reservation?.children,
    cancellationPolicy: reservation?.cancellationPolicy,
    rawData: reservation,
  }
}

async function logChannelSyncEvent(
  context: any,
  data: {
    channelId: string
    action: 'inventory_push' | 'reservation_pull' | 'webhook_event' | 'retry_attempt'
    status: 'success' | 'failed' | 'processing'
    message?: string
    payload?: Record<string, unknown>
    errorMessage?: string
    attempts?: number
    nextAttemptAt?: Date | null
    replayKey?: string
  }
) {
  return context.sudo().query.ChannelSyncEvent.createOne({
    data: {
      channel: { connect: { id: data.channelId } },
      action: data.action,
      status: data.status,
      replayKey: data.replayKey,
      message: data.message,
      payload: data.payload || {},
      errorMessage: data.errorMessage,
      attempts: data.attempts ?? 0,
      nextAttemptAt: data.nextAttemptAt ? data.nextAttemptAt.toISOString() : null,
    },
    query: 'id',
  })
}

async function appendChannelSyncError(context: any, channelId: string, error: string) {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: 'id syncErrors',
  })

  const existingErrors = Array.isArray(channel?.syncErrors) ? channel.syncErrors : []
  const nextErrors = [...existingErrors, { message: error, occurredAt: new Date().toISOString() }].slice(-20)

  await context.sudo().query.Channel.updateOne({
    where: { id: channelId },
    data: {
      syncErrors: nextErrors,
      syncStatus: 'error',
      lastSyncAt: new Date().toISOString(),
    },
  })
}

async function updateChannelSyncStatus(context: any, channelId: string, status: 'active' | 'error' | 'paused') {
  await context.sudo().query.Channel.updateOne({
    where: { id: channelId },
    data: {
      syncStatus: status,
      lastSyncAt: new Date().toISOString(),
    },
  })
}

async function resolveRoomTypeId(context: any, channel: any, payload: ChannelReservationPayload) {
  const mappingRules = channel?.mappingRules || {}
  const roomTypeMapping = mappingRules.roomTypes || mappingRules

  const mappedId = payload.roomTypeCode ? roomTypeMapping[payload.roomTypeCode] : null

  if (mappedId) {
    const mappedRoom = await context.sudo().query.RoomType.findOne({
      where: { id: mappedId },
      query: 'id name',
    })
    if (mappedRoom) {
      return mappedRoom.id
    }
  }

  if (payload.roomTypeName) {
    const matched = await context.sudo().query.RoomType.findMany({
      where: { name: { equals: payload.roomTypeName } },
      query: 'id name',
      take: 1,
    })
    if (matched[0]) {
      return matched[0].id
    }
  }

  return null
}

async function getOrCreateRoomInventory(context: any, roomTypeId: string, date: Date, roomsToBook: number) {
  const window = getDayWindow(date)
  const inventoryKey = `${roomTypeId}:${window.start.toISOString().slice(0, 10)}`
  const existing = await context.sudo().query.RoomInventory.findMany({
    where: {
      roomType: { id: { equals: roomTypeId } },
      date: { gte: window.start.toISOString(), lt: window.end.toISOString() },
    },
    query: 'id bookedRooms totalRooms blockedRooms date',
    take: 1,
  })

  if (existing[0]) {
    return { record: existing[0], wasCreated: false }
  }

  const roomCount = await context.sudo().query.Room.count({
    where: { roomType: { id: { equals: roomTypeId } } },
  })

  if (roomsToBook > roomCount) {
    throw new Error('Channel reservation exceeds physical room inventory')
  }

  const record = await context.sudo().query.RoomInventory.createOne({
    data: {
      inventoryKey,
      date: window.start.toISOString(),
      roomType: { connect: { id: roomTypeId } },
      totalRooms: roomCount || 0,
      bookedRooms: Math.max(roomsToBook, 0),
      blockedRooms: 0,
    },
    query: 'id bookedRooms totalRooms blockedRooms date',
  })

  return { record, wasCreated: true }
}

async function adjustBookedRooms(context: any, roomTypeId: string, checkInDate: string, checkOutDate: string, delta: number) {
  if (!checkInDate || !checkOutDate) return

  const start = new Date(checkInDate)
  const end = new Date(checkOutDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return
  }

  const days = getDateRangeDays(start, end)

  for (const day of days) {
    const { record, wasCreated } = await getOrCreateRoomInventory(context, roomTypeId, day, delta)
    if (!wasCreated) {
      const nextBookedRooms = Math.max(0, (record.bookedRooms || 0) + delta)
      if (nextBookedRooms + (record.blockedRooms || 0) > (record.totalRooms || 0)) {
        throw new Error('Channel reservation exceeds available room inventory')
      }

      await context.sudo().query.RoomInventory.updateOne({
        where: { id: record.id },
        data: {
          bookedRooms: nextBookedRooms,
        },
      })
    }
  }
}

type VerifiedChannelEvent = { eventKey: string; payloadHash: string };
export type ChannelEventType = 'create' | 'modify' | 'cancel';

const CANCELLATION_POLICIES = new Set(['flexible', 'moderate', 'strict', 'non_refundable']);

async function upsertChannelReservation(context: any, channel: any, payload: ChannelReservationPayload, eventType: ChannelEventType, verifiedEvent: VerifiedChannelEvent) {
  if (!payload.externalId) {
    throw new Error('Channel reservation payload missing externalId')
  }

  await lockHotelBusinessDate(context.prisma);
  const channelKey = `${channel.id}:${payload.externalId}`
  if (!verifiedEvent.eventKey || !/^[a-f0-9]{64}$/i.test(verifiedEvent.payloadHash)) throw new Error('Verified channel event identity is required')
  await context.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-channel-reservation:${channelKey}`)
  const existing = await context.sudo().query.ChannelReservation.findMany({
    where: {
      externalId: { equals: payload.externalId },
      channel: { id: { equals: channel.id } },
    },
    query: 'id checkInDate checkOutDate totalAmount channelStatus roomType { id name } reservation { id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } } }',
    take: 1,
  })
  const reservation = existing[0]
  // A cancellation can arrive before the reservation it cancels; it is kept so a delayed
  // create for the same reservation can never book the room afterwards.
  const tombstoneKey = `channel-tombstone:${channelKey}`
  const tombstone = await context.prisma.hotelAuditEvent.findUnique({ where: { eventKey: tombstoneKey }, select: { id: true } })

  if (!reservation) {
    if (eventType === 'cancel') {
      if (!tombstone) {
        await recordHotelLifecycleEvent({
          prisma: context.prisma, eventKey: tombstoneKey, actorId: null,
          identity: { request: { channelKey }, aggregateType: 'channel_reservation', aggregateId: channelKey, action: 'cancelled_before_import' },
          afterSnapshot: { channelKey, cancelledBy: verifiedEvent.eventKey },
          metadata: { channelId: channel.id, externalId: payload.externalId },
        })
      }
      return { action: 'cancellation_recorded', booking: null }
    }
    if (tombstone) return { action: 'ignored_cancelled_reservation', booking: null }
    if (eventType === 'modify') throw new Error('Channel change for a reservation that was never imported; reconcile it with the channel.')
  }

  const { checkIn: boundedCheckIn, checkOut: boundedCheckOut } = hotelStayDates(payload.checkInDate, payload.checkOutDate)
  const roomTypeId = await resolveRoomTypeId(context, channel, payload)
  const roomCount = payload.roomCount && payload.roomCount > 0 ? payload.roomCount : 1
  if (!Number.isInteger(roomCount) || roomCount !== 1) throw new Error('Multi-room channel reservations require an explicit group allocation.')

  if (!reservation) {
    if (!roomTypeId) throw new Error('Channel reservation room type is not mapped')
    const terms = await channelStayTerms(context, payload, roomTypeId)
    const guestProfile = await ensureGuestProfile(context, {
      name: payload.guestName,
      email: payload.guestEmail || `channel-${channel.id}-${payload.externalId}@invalid.local`,
    })
    await lockRoomInventory(context.prisma, roomTypeId, boundedCheckIn, boundedCheckOut)
    await assertHotelAvailability(context, { roomTypeId, checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate })
    // The channel's own cancellation terms are recorded only when it states them; otherwise the
    // reservation is cancelled through the channel and Hotel does not assume a policy.
    const cancellationPolicy = CANCELLATION_POLICIES.has(String(payload.cancellationPolicy)) ? String(payload.cancellationPolicy) : null
    const createdBooking = await context.prisma.booking.create({
      data: {
        confirmationNumber: `BK-OTA-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail || guestProfile.email,
        guestProfileId: guestProfile.id,
        checkInDate: boundedCheckIn,
        checkOutDate: boundedCheckOut,
        numberOfGuests: terms.guests,
        numberOfAdults: payload.adults ?? terms.guests,
        numberOfChildren: payload.children ?? 0,
        status: 'confirmed',
        source: 'ota',
        roomRateMinor: terms.totalMinor, taxAmountMinor: 0, feesAmountMinor: 0,
        totalAmountMinor: terms.totalMinor, depositAmountMinor: 0, balanceDueMinor: terms.totalMinor,
        currencyCode: terms.currencyCode, roomRate: terms.totalMinor / 100,
        taxAmount: 0, feesAmount: 0, totalAmount: terms.totalMinor / 100, depositAmount: 0,
        balanceDue: terms.totalMinor / 100, pricingVersion: 'channel-create-v1', pricingRevision: 1,
        pricingSnapshot: { snapshotKeyPrefix: 'v1', source: 'channel', ...(cancellationPolicy ? { cancellationPolicy } : {}), roomSubtotalMinor: terms.totalMinor, taxMinor: 0, feesMinor: 0, totalMinor: terms.totalMinor, currencyCode: terms.currencyCode },
      },
    })
    const nights = Math.max(1, Math.round((boundedCheckOut.getTime() - boundedCheckIn.getTime()) / 86_400_000))
    await context.prisma.roomAssignment.create({
      data: {
        bookingId: createdBooking.id,
        roomTypeId,
        guestName: payload.guestName,
        ratePerNightMinor: Math.round(terms.totalMinor / nights),
      },
    })
    await ensureBookingHasGuestAccess(context, createdBooking.id)
    await ensureReservationSnapshots(context, createdBooking.id)
    await ensureBookingFolio(context, createdBooking.id)
    const booking = await context.sudo().query.Booking.findOne({
      where: { id: createdBooking.id },
      query: 'id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } }',
    })
    if (!booking) throw new Error('Channel booking projection failed')

    await context.sudo().query.ChannelReservation.createOne({
      data: {
        channel: { connect: { id: channel.id } },
        channelKey,
        externalId: payload.externalId,
        reservation: { connect: { id: booking!.id } },
        roomType: { connect: { id: roomTypeId } },
        checkInDate: boundedCheckIn.toISOString(),
        checkOutDate: boundedCheckOut.toISOString(),
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: terms.totalMinor,
        commission: terms.commissionMinor,
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: new Date().toISOString(),
      },
      query: 'id',
    })

    await adjustBookedRooms(context, roomTypeId, payload.checkInDate, payload.checkOutDate, roomCount)

    await recordHotelLifecycleEvent({
      prisma: context.prisma,
      eventKey: `channel-booking:create:${channelKey}`,
      actorId: null,
      identity: { request: { channelKey, checkInDate: boundedCheckIn.toISOString(), checkOutDate: boundedCheckOut.toISOString(), totalAmountMinor: terms.totalMinor }, aggregateType: 'booking', aggregateId: booking!.id, action: 'created_from_channel' },
      afterSnapshot: { status: 'confirmed', checkInDate: boundedCheckIn.toISOString(), checkOutDate: boundedCheckOut.toISOString(), totalAmountMinor: terms.totalMinor, cancellationPolicy },
      metadata: { channelId: channel.id, externalId: payload.externalId },
    })

    return { action: 'created', booking }
  }

  if (eventType === 'cancel') {
    if (!reservation.reservation?.id) throw new Error('Channel reservation is not linked to a booking')
    await requestBookingCancellation({
      context,
      bookingId: reservation.reservation.id,
      refundReason: `Channel cancellation ${channelKey}`,
      idempotencyKey: `channel:${channelKey}:cancel:${verifiedEvent.eventKey}`,
      actorId: null,
      source: 'channel',
      withinTransaction: true,
    })
    if (reservation.roomType?.id) {
      await adjustBookedRooms(context, reservation.roomType.id, reservation.checkInDate, reservation.checkOutDate, -roomCount)
    }

    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        channelStatus: 'cancelled',
        lastSyncedAt: new Date().toISOString(),
        syncErrors: [],
      },
    })

    return { action: 'cancellation_requested', booking: reservation.reservation }
  }

  // A modification, or a confirmed reservation whose stay details changed, goes through the
  // governed amendment. The same details again only refresh the channel record.
  if (!roomTypeId) throw new Error('Channel reservation room type is not mapped')
  const terms = await channelStayTerms(context, payload, roomTypeId)
  const changed = eventType === 'modify' || (
    new Date(reservation.checkInDate).getTime() !== boundedCheckIn.getTime() ||
    new Date(reservation.checkOutDate).getTime() !== boundedCheckOut.getTime() ||
    reservation.roomType?.id !== roomTypeId ||
    Number(reservation.totalAmount) !== terms.totalMinor ||
    Number(reservation.reservation?.numberOfGuests) !== terms.guests
  )

  if (changed) {
    const guestProfile = await ensureGuestProfile(context, {
      name: payload.guestName,
      email: payload.guestEmail || `channel-${channel.id}-${payload.externalId}@invalid.local`,
    })
    if (!reservation.reservation?.id) throw new Error('Channel modification lacks booking binding')
    await amendUnpaidBooking({
      context,
      bookingId: reservation.reservation.id,
      checkInDate: boundedCheckIn.toISOString(),
      checkOutDate: boundedCheckOut.toISOString(),
      roomTypeId,
      guestName: payload.guestName,
      guestEmail: payload.guestEmail || guestProfile.email,
      guestProfileId: guestProfile.id,
      numberOfGuests: terms.guests,
      totalAmountMinor: terms.totalMinor,
      currencyCode: terms.currencyCode,
      idempotencyKey: `channel:${channelKey}:modify:${verifiedEvent.eventKey}`,
      source: 'channel',
      withinTransaction: true,
    })
    const updatedBooking = await context.sudo().query.Booking.findOne({
      where: { id: reservation.reservation.id },
      query: 'id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } }',
    })

    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        roomType: { connect: { id: roomTypeId } },
        checkInDate: boundedCheckIn.toISOString(),
        checkOutDate: boundedCheckOut.toISOString(),
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: terms.totalMinor,
        commission: terms.commissionMinor,
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: new Date().toISOString(),
      },
    })

    return { action: 'modified', booking: updatedBooking }
  }

  await context.sudo().query.ChannelReservation.updateOne({
    where: { id: reservation.id },
    data: {
      channelStatus: payload.status,
      rawData: payload.rawData || {},
      lastSyncedAt: new Date().toISOString(),
    },
  })

  return { action: 'unchanged', booking: reservation.reservation }
}

const CREATE_EVENTS = new Set(['reservation.created', 'reservation.new', 'create', 'created', 'new', 'confirmed', 'booked'])
const MODIFY_EVENTS = new Set(['reservation.modified', 'reservation.updated', 'modify', 'modified', 'update', 'updated'])
const CANCEL_EVENTS = new Set(['reservation.cancelled', 'reservation.canceled', 'cancel', 'cancelled', 'canceled'])

/** Only recognised reservation operations; anything else (status notices, payments, heartbeats) is ignored. */
export function resolveEventType(eventType: unknown): ChannelEventType | null {
  const normalized = String(eventType ?? '').trim().toLowerCase()
  if (CREATE_EVENTS.has(normalized)) return 'create'
  if (MODIFY_EVENTS.has(normalized)) return 'modify'
  if (CANCEL_EVENTS.has(normalized)) return 'cancel'
  return null
}

export async function postToChannel(
  endpoint: string,
  payload: Record<string, unknown>,
  headers?: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 30_000,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('Channel transport timeout is invalid.');
  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'transport failure'
    throw new ChannelOutcomeUnknownError(`Channel request ended without a confirmed partner result: ${detail}`)
  }

  try {
    if (!response.ok) {
      throw new ChannelOutcomeUnknownError(`Channel endpoint returned HTTP ${response.status}; remote application is unconfirmed.`)
    }
    if (response.status === 204) return null
    const body = await response.text()
    if (!body.trim()) return null
    try {
      return JSON.parse(body)
    } catch {
      throw new ChannelOutcomeUnknownError('Channel endpoint returned an invalid response body after accepting the request.')
    }
  } catch (error) {
    if (error instanceof ChannelOutcomeUnknownError) throw error
    throw new ChannelOutcomeUnknownError('Channel response could not be confirmed after the request was sent.')
  }
}

function resolveInventoryEndpoint(channel: any) {
  const credentials = readChannelCredentials(channel)
  if (credentials.inventoryEndpoint) return credentials.inventoryEndpoint
  if (credentials.syncEndpoint) return credentials.syncEndpoint
  if (credentials.apiBaseUrl) return `${credentials.apiBaseUrl}/inventory/sync`
  return null
}

function resolveReservationEndpoint(channel: any) {
  const credentials = readChannelCredentials(channel)
  if (credentials.reservationEndpoint) return credentials.reservationEndpoint
  if (credentials.pullReservationsEndpoint) return credentials.pullReservationsEndpoint
  if (credentials.apiBaseUrl) return `${credentials.apiBaseUrl}/reservations/pull`
  return null
}

export async function pushInventoryToChannel(
  context: any,
  channelId: string,
  dateRange?: DateRangeInput,
  fetchImpl: typeof fetch = fetch,
  renewLease?: () => Promise<boolean>,
  options: { retryOfEventId?: string } = {},
): Promise<ChannelSyncResult> {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: 'id name isActive syncStatus credentials mappingRules',
  })

  if (!channel) {
    throw new Error('Channel not found')
  }

  const mode = channelIntegrationMode(channel)
  if (mode === 'disabled' || mode === 'demo') {
    return {
      channelId: channel.id,
      status: 'skipped',
      syncedAt: new Date().toISOString(),
      details: { message: `Channel inventory sync is explicitly ${mode}.`, mode },
    }
  }

  // Manual, scheduled and retry runs for one channel share one operation lease, so two of
  // them never talk to the channel at the same time.
  const lease = await workerChannelOperationLeaseProvider.acquire(context, channel.id, renewLease)
  if (!lease) {
    return {
      channelId: channel.id,
      status: 'skipped',
      syncedAt: new Date().toISOString(),
      details: { message: 'Another operation for this channel is running.' },
    }
  }
  try {
    const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : new Date()
    const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const inventoryRecords = await context.sudo().query.RoomInventory.findMany({
      where: {
        date: { gte: startDate.toISOString(), lte: endDate.toISOString() },
      },
      query: 'id date totalRooms bookedRooms blockedRooms roomType { id name }',
    })

    const payload = {
      channelId: channel.id,
      channelName: channel.name,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      inventory: inventoryRecords.map((record: any) => ({
        date: record.date,
        roomTypeId: record.roomType?.id,
        roomTypeName: record.roomType?.name,
        totalRooms: record.totalRooms,
        bookedRooms: record.bookedRooms,
        blockedRooms: record.blockedRooms,
      })),
    }

    try {
      const outbound = requireLiveChannelEndpoint(channel, 'inventory')
      if (!(await lease.renew())) return {
        channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
        details: { message: 'Worker claim expired before channel delivery; no request was sent.' },
      }
      await postToChannel(outbound.endpoint, payload, {
        'X-OpenFront-Channel': channel.id,
        ...outbound.headers,
      }, fetchImpl)
      if (!(await lease.renew())) return {
        channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
        details: { message: 'Worker claim changed after channel delivery; verify the durable sync event.' },
      }

      await logChannelSyncEvent(context, {
        channelId: channel.id,
        action: 'inventory_push',
        status: 'success',
        message: 'Inventory pushed to channel',
        payload,
      })

      await updateChannelSyncStatus(context, channel.id, 'active')

      return {
        channelId: channel.id,
        status: 'success',
        syncedAt: new Date().toISOString(),
        details: { inventoryCount: inventoryRecords.length },
      }
    } catch (error: any) {
      const failure = safeOperationalErrorMessage('channel', error)
      // A request that may have reached the channel is never sent again automatically; it waits
      // for reconciliation. Retries record their result on the original event, not a new one.
      const outcomeUnknown = error instanceof ChannelOutcomeUnknownError
      if (!options.retryOfEventId) {
        await logChannelSyncEvent(context, {
          channelId: channel.id,
          action: 'inventory_push',
          status: 'failed',
          message: outcomeUnknown ? CHANNEL_OUTCOME_UNKNOWN_MESSAGE : 'Inventory push failed',
          payload,
          errorMessage: failure,
          attempts: 1,
          nextAttemptAt: outcomeUnknown ? null : new Date(Date.now() + DEFAULT_RETRY_DELAY_MS),
        })
      }

      await appendChannelSyncError(context, channel.id, failure)

      return {
        channelId: channel.id,
        status: 'failed',
        syncedAt: new Date().toISOString(),
        details: { error: failure, outcomeUnknown },
      }
    }
  } finally {
    await lease.release()
  }
}

export async function pullReservationsFromChannel(
  context: any,
  channelId: string,
  fetchImpl: typeof fetch = fetch,
  renewLease?: () => Promise<boolean>,
  options: { retryOfEventId?: string } = {},
): Promise<ChannelSyncResult> {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: 'id name isActive syncStatus credentials mappingRules',
  })

  if (!channel) {
    throw new Error('Channel not found')
  }

  const mode = channelIntegrationMode(channel)
  if (mode === 'disabled' || mode === 'demo') {
    return {
      channelId: channel.id,
      status: 'skipped',
      syncedAt: new Date().toISOString(),
      details: { message: `Channel reservation pull is explicitly ${mode}.`, mode },
    }
  }

  // Manual, scheduled and retry runs for one channel share one operation lease, so two of
  // them never talk to the channel at the same time.
  const lease = await workerChannelOperationLeaseProvider.acquire(context, channel.id, renewLease)
  if (!lease) {
    return {
      channelId: channel.id,
      status: 'skipped',
      syncedAt: new Date().toISOString(),
      details: { message: 'Another operation for this channel is running.' },
    }
  }
  try {
    const payload = {
      channelId: channel.id,
      channelName: channel.name,
    }

    try {
      const outbound = requireLiveChannelEndpoint(channel, 'reservations')
      if (!(await lease.renew())) return {
        channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
        details: { message: 'Worker claim expired before channel request; no request was sent.' },
      }
      const reservationsResponse = await postToChannel(outbound.endpoint, payload, {
        'X-OpenFront-Channel': channel.id,
        ...outbound.headers,
      }, fetchImpl)

      if (!Array.isArray(reservationsResponse?.reservations)) {
        throw new Error('Channel reservation response did not contain a valid reservation array.')
      }
      const reservations = reservationsResponse.reservations

      for (const reservation of reservations) {
        if (!(await lease.renew())) return {
          channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
          details: { message: 'Worker claim expired; remaining reservation rows were not applied.' },
        }
        const mapped = mapReservationPayload(reservation)
        const eventType = resolveEventType(mapped.status)
        if (!eventType) continue
        const canonical = JSON.stringify(reservation);
        const payloadHash = crypto.createHash('sha256').update(canonical).digest('hex');
        const providerVersion = String(reservation?.eventId || reservation?.version || reservation?.updatedAt || payloadHash).slice(0, 255);
        const verifiedEvent = { eventKey: `pull:${channel.id}:${mapped.externalId}:${providerVersion}`, payloadHash };
        await serializableChannelTransaction(
          context,
          (transactionContext: any) => upsertChannelReservation(transactionContext, channel, mapped, eventType, verifiedEvent),
          lease,
        )
      }

      if (!(await lease.renew())) return {
        channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
        details: { message: 'Worker claim changed after channel response; verify the durable sync event.' },
      }
      await logChannelSyncEvent(context, {
        channelId: channel.id,
        action: 'reservation_pull',
        status: 'success',
        message: 'Reservations pulled from channel',
        payload: { reservationCount: reservations.length },
      })

      await updateChannelSyncStatus(context, channel.id, 'active')

      return {
        channelId: channel.id,
        status: 'success',
        syncedAt: new Date().toISOString(),
        details: { reservationCount: reservations.length },
      }
    } catch (error: any) {
      const failure = safeOperationalErrorMessage('channel', error)
      // A request that may have reached the channel is never sent again automatically; it waits
      // for reconciliation. Retries record their result on the original event, not a new one.
      const outcomeUnknown = error instanceof ChannelOutcomeUnknownError
      if (!options.retryOfEventId) {
        await logChannelSyncEvent(context, {
          channelId: channel.id,
          action: 'reservation_pull',
          status: 'failed',
          message: outcomeUnknown ? CHANNEL_OUTCOME_UNKNOWN_MESSAGE : 'Reservation pull failed',
          payload,
          errorMessage: failure,
          attempts: 1,
          nextAttemptAt: outcomeUnknown ? null : new Date(Date.now() + DEFAULT_RETRY_DELAY_MS),
        })
      }

      await appendChannelSyncError(context, channel.id, failure)

      return {
        channelId: channel.id,
        status: 'failed',
        syncedAt: new Date().toISOString(),
        details: { error: failure, outcomeUnknown },
      }
    }
  } finally {
    await lease.release()
  }
}

export async function handleChannelWebhook(
  context: any,
  channelId: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
) {
  const configuredChannel = await context.prisma.channel.findUnique({
    where: { id: channelId },
    select: { isActive: true, credentials: true },
  })
  const credentials = configuredChannel ? readChannelCredentials(configuredChannel) : {}
  const secret = String(credentials.webhookSecret || '')
  if (!configuredChannel?.isActive || String(credentials.mode || '').toLowerCase() !== 'live' || secret.length < 16) {
    throw new Error('Channel webhook is disabled or not completely configured')
  }
  const signatureHeader =
    getStringHeader(headers, 'x-openfront-webhook-signature') ||
    getStringHeader(headers, 'x-channel-signature')
  const signature = normalizeSignature(signatureHeader)
  const expected = buildSignature(secret, rawBody)
  if (!signaturesMatch(signature, expected)) {
    throw new Error('Invalid webhook signature')
  }

  const payload = JSON.parse(rawBody)
  // The replay identity comes from the signed body. An unsigned header cannot choose it.
  const providerEventId = String(payload?.eventId || payload?.id || '').trim()
  if (!providerEventId || providerEventId.length > 255) {
    throw new Error('Channel webhook event id is required')
  }
  const headerEventId = String(getStringHeader(headers, 'x-webhook-id') || '').trim()
  if (headerEventId && headerEventId !== providerEventId) {
    throw new Error('Channel webhook event id header does not match the signed event')
  }
  const replayKey = `${channelId}:${providerEventId}`
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

  return serializableChannelTransaction(context, async (transactionContext: any) => {
    await transactionContext.prisma.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `hotel-channel-event:${replayKey}`
    )
    const existing = await transactionContext.sudo().query.ChannelSyncEvent.findOne({
      where: { replayKey },
      query: 'id payload',
    })
    if (existing) {
      if (existing.payload?.payloadHash !== payloadHash) throw new Error('Channel event id was reused with different payload evidence')
      return { success: true, duplicate: true, action: 'replayed' }
    }

    const channel = await transactionContext.sudo().query.Channel.findOne({
      where: { id: channelId },
      query: 'id name mappingRules',
    })
    if (!channel) throw new Error('Channel not found')

    const eventType = payload?.eventType || payload?.event || payload?.type || ''
    const mappedReservation = mapReservationPayload(payload)
    const action = resolveEventType(eventType)
    if (!action) {
      await logChannelSyncEvent(transactionContext, {
        channelId: channel.id,
        action: 'webhook_event',
        status: 'success',
        replayKey,
        message: 'Webhook ignored: unsupported event type',
        payload: { eventType: String(eventType).slice(0, 100), providerEventId, payloadHash, action: 'ignored' },
      })
      return { success: true, duplicate: false, action: 'ignored' }
    }
    const reservationResult = await upsertChannelReservation(
      transactionContext,
      channel,
      mappedReservation,
      action,
      { eventKey: replayKey, payloadHash }
    )

    await logChannelSyncEvent(transactionContext, {
      channelId: channel.id,
      action: 'webhook_event',
      status: 'success',
      replayKey,
      message: `Webhook handled: ${eventType}`,
      payload: {
        eventType,
        providerEventId,
        payloadHash,
        externalId: mappedReservation.externalId,
        action: reservationResult.action,
      },
    })

    return { success: true, duplicate: false, action: reservationResult.action }
  })
}

export async function retryFailedChannelSyncs(
  context: any,
  renewLease?: () => Promise<boolean>,
  fetchImpl: typeof fetch = fetch,
) {
  const now = new Date().toISOString()
  // One retry chain per original operation, due work first, bounded by MAX_CHANNEL_RETRY_ATTEMPTS.
  const failedEvents = await context.sudo().query.ChannelSyncEvent.findMany({
    where: {
      status: { equals: 'failed' },
      nextAttemptAt: { lte: now },
      attempts: { lt: MAX_CHANNEL_RETRY_ATTEMPTS },
    },
    orderBy: [{ nextAttemptAt: 'asc' }],
    query: 'id channel { id } action attempts payload',
    take: 25,
  })

  let processed = 0; let succeeded = 0; let failed = 0; let leaseLost = false
  for (const event of failedEvents) {
    if (renewLease && !(await renewLease())) { leaseLost = true; break; }
    const attempts = (event.attempts || 0) + 1
    let result: ChannelSyncResult
    try {
      if (event.action === 'inventory_push') {
        result = await pushInventoryToChannel(context, event.channel.id, event.payload?.dateRange as DateRangeInput, fetchImpl, renewLease, { retryOfEventId: event.id })
      } else if (event.action === 'reservation_pull') {
        result = await pullReservationsFromChannel(context, event.channel.id, fetchImpl, renewLease, { retryOfEventId: event.id })
      } else {
        throw new Error('Unsupported channel retry operation.')
      }
    } catch (error) {
      result = { channelId: event.channel.id, status: 'failed', syncedAt: new Date().toISOString(), details: { error: safeOperationalErrorMessage('channel', error) } }
    }
    if (renewLease && !(await renewLease())) { leaseLost = true; break; }
    // Another operation held the channel: nothing was sent, so this does not count as an attempt.
    if (result.status === 'skipped') continue

    if (result.status === 'success') {
      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: { status: 'success', attempts, nextAttemptAt: null, message: 'Retry succeeded' },
      })
      succeeded += 1; processed += 1
      continue
    }

    const outcomeUnknown = Boolean(result.details?.outcomeUnknown)
    const exhausted = attempts >= MAX_CHANNEL_RETRY_ATTEMPTS
    const failure = String(result.details?.error || 'Channel retry did not complete successfully.')
    await context.sudo().query.ChannelSyncEvent.updateOne({
      where: { id: event.id },
      data: {
        status: 'failed',
        attempts,
        nextAttemptAt: outcomeUnknown || exhausted ? null : new Date(Date.now() + Math.pow(2, attempts) * DEFAULT_RETRY_DELAY_MS).toISOString(),
        errorMessage: failure,
        message: outcomeUnknown ? CHANNEL_OUTCOME_UNKNOWN_MESSAGE : exhausted ? 'Retry limit reached; review the channel before sending again.' : 'Retry failed',
      },
    })
    failed += 1; processed += 1
  }

  return { processed, succeeded, failed, leaseLost, retriedAt: new Date().toISOString() }
}
