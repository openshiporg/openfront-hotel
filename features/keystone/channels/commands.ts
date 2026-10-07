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
  totalAmount?: number
  commission?: number
  numberOfGuests?: number
  specialRequests?: string
  roomCount?: number
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

function toCents(amount?: number | null) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return 0
  }
  return Math.round(amount * 100)
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
    numberOfGuests: reservation?.numberOfGuests || reservation?.guests,
    specialRequests: reservation?.specialRequests,
    roomCount: reservation?.roomCount || reservation?.rooms || 1,
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

async function upsertChannelReservation(context: any, channel: any, payload: ChannelReservationPayload, eventType: string, verifiedEvent: VerifiedChannelEvent) {
  if (!payload.externalId) {
    throw new Error('Channel reservation payload missing externalId')
  }

  await lockHotelBusinessDate(context.prisma);
  const { checkIn: boundedCheckIn, checkOut: boundedCheckOut } = hotelStayDates(payload.checkInDate, payload.checkOutDate)
  const channelKey = `${channel.id}:${payload.externalId}`
  if (!verifiedEvent.eventKey || !/^[a-f0-9]{64}$/i.test(verifiedEvent.payloadHash)) throw new Error('Verified channel event identity is required')
  const existing = await context.sudo().query.ChannelReservation.findMany({
    where: {
      externalId: { equals: payload.externalId },
      channel: { id: { equals: channel.id } },
    },
    query: 'id checkInDate checkOutDate roomType { id name } reservation { id confirmationNumber numberOfGuests totalAmount numberOfNights roomAssignments { roomType { id name } } }',
    take: 1,
  })

  const reservation = existing[0]
  const roomTypeId = await resolveRoomTypeId(context, channel, payload)
  const roomCount = payload.roomCount && payload.roomCount > 0 ? payload.roomCount : 1
  if (!Number.isInteger(roomCount) || roomCount !== 1) throw new Error('Multi-room channel reservations require an explicit group allocation.')

  if (!reservation) {
    const guestProfile = await ensureGuestProfile(context, {
      name: payload.guestName,
      email: payload.guestEmail || `channel-${channel.id}-${payload.externalId}@invalid.local`,
    })
    if (!roomTypeId) throw new Error('Channel reservation room type is not mapped')
    await lockRoomInventory(context.prisma, roomTypeId, boundedCheckIn, boundedCheckOut)
    await assertHotelAvailability(context, { roomTypeId, checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate })
    const createdBooking = await context.prisma.booking.create({
      data: {
        confirmationNumber: `BK-OTA-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail || guestProfile.email,
        guestProfileId: guestProfile.id,
        checkInDate: new Date(payload.checkInDate),
        checkOutDate: new Date(payload.checkOutDate),
        numberOfGuests: payload.numberOfGuests || 1,
        status: 'confirmed',
        source: 'ota',
        roomRateMinor: toCents(payload.totalAmount), taxAmountMinor: 0, feesAmountMinor: 0,
        totalAmountMinor: toCents(payload.totalAmount), depositAmountMinor: 0, balanceDueMinor: toCents(payload.totalAmount),
        currencyCode: 'USD', roomRate: payload.totalAmount || 0,
        taxAmount: 0, feesAmount: 0, totalAmount: payload.totalAmount || 0, depositAmount: 0,
        balanceDue: payload.totalAmount || 0, pricingVersion: 'channel-create-v1', pricingRevision: 1,
        pricingSnapshot: { snapshotKeyPrefix: 'v1', source: 'channel', roomSubtotalMinor: toCents(payload.totalAmount), taxMinor: 0, feesMinor: 0, totalMinor: toCents(payload.totalAmount), currencyCode: 'USD' },
      },
    })
    await context.prisma.roomAssignment.create({
      data: {
        bookingId: createdBooking.id,
        roomTypeId,
        guestName: payload.guestName,
        ratePerNightMinor: Math.round(toCents(payload.totalAmount) / Math.max(1, Math.round((new Date(payload.checkOutDate).getTime() - new Date(payload.checkInDate).getTime()) / 86_400_000))),
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
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : undefined,
        checkInDate: new Date(payload.checkInDate).toISOString(),
        checkOutDate: new Date(payload.checkOutDate).toISOString(),
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: toCents(payload.totalAmount),
        commission: toCents(payload.commission),
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: new Date().toISOString(),
      },
      query: 'id',
    })

    if (roomTypeId) {
      await adjustBookedRooms(context, roomTypeId, payload.checkInDate, payload.checkOutDate, roomCount)
    }

    await recordHotelLifecycleEvent({
      prisma: context.prisma,
      eventKey: `channel-booking:create:${channelKey}`,
      actorId: null,
      identity: { request: { channelKey, checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate, totalAmountMinor: toCents(payload.totalAmount) }, aggregateType: 'booking', aggregateId: booking!.id, action: 'created_from_channel' },
      afterSnapshot: { status: 'confirmed', checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate, totalAmountMinor: toCents(payload.totalAmount) },
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

  if (eventType === 'modify') {
    const guestProfile = await ensureGuestProfile(context, {
      name: payload.guestName,
      email: payload.guestEmail || `channel-${channel.id}-${payload.externalId}@invalid.local`,
    })
    if (!reservation.reservation?.id || !roomTypeId) throw new Error('Channel modification lacks booking or room-type binding')
    await amendUnpaidBooking({
      context,
      bookingId: reservation.reservation.id,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      roomTypeId,
      guestName: payload.guestName,
      guestEmail: payload.guestEmail || guestProfile.email,
      guestProfileId: guestProfile.id,
      numberOfGuests: payload.numberOfGuests || 1,
      totalAmountMinor: toCents(payload.totalAmount),
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
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : undefined,
        checkInDate: new Date(payload.checkInDate).toISOString(),
        checkOutDate: new Date(payload.checkOutDate).toISOString(),
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: toCents(payload.totalAmount),
        commission: toCents(payload.commission),
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

  return { action: 'updated', booking: reservation.reservation }
}

function resolveEventType(eventType: string) {
  const normalized = eventType.toLowerCase()
  if (normalized.includes('cancel')) return 'cancel'
  if (normalized.includes('modif') || normalized.includes('update')) return 'modify'
  if (normalized.includes('create') || normalized.includes('new')) return 'create'
  return 'create'
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
    if (renewLease && !(await renewLease())) return {
      channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
      details: { message: 'Worker claim expired before channel delivery; no request was sent.' },
    }
    await postToChannel(outbound.endpoint, payload, {
      'X-OpenFront-Channel': channel.id,
      ...outbound.headers,
    }, fetchImpl)
    if (renewLease && !(await renewLease())) return {
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
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: 'inventory_push',
      status: 'failed',
      message: 'Inventory push failed',
      payload,
      errorMessage: failure,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DEFAULT_RETRY_DELAY_MS),
    })

    await appendChannelSyncError(context, channel.id, failure)

    return {
      channelId: channel.id,
      status: 'failed',
      syncedAt: new Date().toISOString(),
      details: { error: failure },
    }
  }
}

export async function pullReservationsFromChannel(
  context: any,
  channelId: string,
  fetchImpl: typeof fetch = fetch,
  renewLease?: () => Promise<boolean>,
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

  const payload = {
    channelId: channel.id,
    channelName: channel.name,
  }

  try {
    const outbound = requireLiveChannelEndpoint(channel, 'reservations')
    if (renewLease && !(await renewLease())) return {
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
      if (renewLease && !(await renewLease())) return {
        channelId: channel.id, status: 'skipped', syncedAt: new Date().toISOString(),
        details: { message: 'Worker claim expired; remaining reservation rows were not applied.' },
      }
      const mapped = mapReservationPayload(reservation)
      const eventType = resolveEventType(mapped.status)
      const canonical = JSON.stringify(reservation);
      const payloadHash = crypto.createHash('sha256').update(canonical).digest('hex');
      const providerVersion = String(reservation?.eventId || reservation?.version || reservation?.updatedAt || payloadHash).slice(0, 255);
      const verifiedEvent = { eventKey: `pull:${channel.id}:${mapped.externalId}:${providerVersion}`, payloadHash };
      await serializableChannelTransaction(
        context,
        (transactionContext: any) => upsertChannelReservation(transactionContext, channel, mapped, eventType, verifiedEvent),
      )
    }

    if (renewLease && !(await renewLease())) return {
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
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: 'reservation_pull',
      status: 'failed',
      message: 'Reservation pull failed',
      payload,
      errorMessage: failure,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DEFAULT_RETRY_DELAY_MS),
    })

    await appendChannelSyncError(context, channel.id, failure)

    return {
      channelId: channel.id,
      status: 'failed',
      syncedAt: new Date().toISOString(),
      details: { error: failure },
    }
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
  const providerEventId = String(
    getStringHeader(headers, 'x-webhook-id') || payload?.eventId || payload?.id || ''
  ).trim()
  if (!providerEventId || providerEventId.length > 255) {
    throw new Error('Channel webhook event id is required')
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

    const eventType = payload?.eventType || payload?.event || payload?.type || 'reservation.created'
    const mappedReservation = mapReservationPayload(payload)
    const action = resolveEventType(eventType)
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
  const failedEvents = await context.sudo().query.ChannelSyncEvent.findMany({
    where: {
      status: { equals: 'failed' },
      nextAttemptAt: { lte: now },
    },
    query: 'id channel { id } action attempts payload',
    take: 25,
  })

  let processed = 0; let succeeded = 0; let failed = 0; let leaseLost = false
  for (const event of failedEvents) {
    if (renewLease && !(await renewLease())) { leaseLost = true; break; }
    const attempts = (event.attempts || 0) + 1
    try {
      let result: ChannelSyncResult
      if (event.action === 'inventory_push') {
        result = await pushInventoryToChannel(context, event.channel.id, event.payload?.dateRange as DateRangeInput, fetchImpl, renewLease)
      } else if (event.action === 'reservation_pull') {
        result = await pullReservationsFromChannel(context, event.channel.id, fetchImpl, renewLease)
      } else {
        throw new Error('Unsupported channel retry operation.')
      }
      if (result.status !== 'success') throw new Error('Channel retry did not complete successfully.')
      if (renewLease && !(await renewLease())) { leaseLost = true; break; }

      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: { status: 'success', attempts, nextAttemptAt: null, message: 'Retry succeeded' },
      })
      succeeded += 1; processed += 1
    } catch (error) {
      if (renewLease && !(await renewLease())) { leaseLost = true; break; }
      const failure = safeOperationalErrorMessage('channel', error)
      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: {
          status: 'failed',
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * DEFAULT_RETRY_DELAY_MS).toISOString(),
          errorMessage: failure,
          message: 'Retry failed',
        },
      })
      await appendChannelSyncError(context, event.channel.id, failure)
      failed += 1; processed += 1
    }
  }

  return { processed, succeeded, failed, leaseLost, retriedAt: new Date().toISOString() }
}
