import crypto from 'crypto'
import { sendBookingConfirmationEmail, sendReservationCancellationEmail, sendReservationModificationEmail } from './mail'

const DEFAULT_RETRY_DELAY_MS = 2 * 60 * 1000

type DateRangeInput = {
  startDate?: string | null
  endDate?: string | null
}

type ChannelSyncResult = {
  channelId: string
  status: 'success' | 'failed'
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
    return undefined
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
  }
) {
  await context.sudo().query.ChannelSyncEvent.createOne({
    data: {
      channel: { connect: { id: data.channelId } },
      action: data.action,
      status: data.status,
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

  const record = await context.sudo().query.RoomInventory.createOne({
    data: {
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

      await context.sudo().query.RoomInventory.updateOne({
        where: { id: record.id },
        data: {
          bookedRooms: nextBookedRooms,
        },
      })
    }
  }
}

async function sendReservationEmail(payload: ChannelReservationPayload, booking: any, type: 'new' | 'modify' | 'cancel') {
  if (!payload.guestEmail || !booking) {
    return
  }

  const data = {
    confirmationNumber: booking.confirmationNumber,
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    checkInDate: payload.checkInDate,
    checkOutDate: payload.checkOutDate,
    numberOfNights: booking.numberOfNights || 0,
    roomTypeName: payload.roomTypeName || booking.roomType?.name || 'Room',
    totalAmount: booking.totalAmount || 0,
    numberOfGuests: payload.numberOfGuests || booking.numberOfGuests || 1,
    specialRequests: payload.specialRequests,
  }

  if (type === 'new') {
    await sendBookingConfirmationEmail(data)
  } else if (type === 'cancel') {
    await sendReservationCancellationEmail(data)
  } else {
    await sendReservationModificationEmail(data)
  }
}

async function upsertChannelReservation(context: any, channel: any, payload: ChannelReservationPayload, eventType: string) {
  if (!payload.externalId) {
    throw new Error('Channel reservation payload missing externalId')
  }

  const existing = await context.sudo().query.ChannelReservation.findMany({
    where: {
      externalId: { equals: payload.externalId },
      channel: { id: { equals: channel.id } },
    },
    query: 'id checkInDate checkOutDate roomType { id name } reservation { id confirmationNumber numberOfGuests totalAmount numberOfNights roomType { id name } }',
    take: 1,
  })

  const reservation = existing[0]
  const roomTypeId = await resolveRoomTypeId(context, channel, payload)
  const roomCount = payload.roomCount && payload.roomCount > 0 ? payload.roomCount : 1

  if (!reservation) {
    const booking = await context.sudo().query.Booking.createOne({
      data: {
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        numberOfGuests: payload.numberOfGuests || 1,
        status: 'confirmed',
        source: 'ota',
        totalAmount: payload.totalAmount || 0,
        balanceDue: payload.totalAmount || 0,
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : undefined,
      },
      query: 'id confirmationNumber numberOfGuests totalAmount numberOfNights roomType { id name }',
    })

    await context.sudo().query.ChannelReservation.createOne({
      data: {
        channel: { connect: { id: channel.id } },
        externalId: payload.externalId,
        reservation: { connect: { id: booking.id } },
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : undefined,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
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

    await sendReservationEmail(payload, booking, 'new')

    return { action: 'created', booking }
  }

  if (eventType === 'cancel') {
    if (reservation.roomType?.id) {
      await adjustBookedRooms(context, reservation.roomType.id, reservation.checkInDate, reservation.checkOutDate, -roomCount)
    }

    if (reservation.reservation?.id) {
      await context.sudo().query.Booking.updateOne({
        where: { id: reservation.reservation.id },
        data: { status: 'cancelled' },
      })
    }

    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        channelStatus: 'cancelled',
        lastSyncedAt: new Date().toISOString(),
        syncErrors: [],
      },
    })

    await sendReservationEmail(payload, reservation.reservation, 'cancel')

    return { action: 'cancelled', booking: reservation.reservation }
  }

  if (eventType === 'modify') {
    if (reservation.roomType?.id) {
      await adjustBookedRooms(context, reservation.roomType.id, reservation.checkInDate, reservation.checkOutDate, -roomCount)
    }

    if (roomTypeId) {
      await adjustBookedRooms(context, roomTypeId, payload.checkInDate, payload.checkOutDate, roomCount)
    }

    const bookingUpdate: Record<string, unknown> = {
      guestName: payload.guestName,
      guestEmail: payload.guestEmail,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      numberOfGuests: payload.numberOfGuests || 1,
      totalAmount: payload.totalAmount || 0,
      balanceDue: payload.totalAmount || 0,
    }

    if (roomTypeId) {
      bookingUpdate.roomType = { connect: { id: roomTypeId } }
    }

    const updatedBooking = reservation.reservation?.id
      ? await context.sudo().query.Booking.updateOne({
          where: { id: reservation.reservation.id },
          data: bookingUpdate,
          query: 'id confirmationNumber numberOfGuests totalAmount numberOfNights roomType { id name }',
        })
      : null

    await context.sudo().query.ChannelReservation.updateOne({
      where: { id: reservation.id },
      data: {
        roomType: roomTypeId ? { connect: { id: roomTypeId } } : undefined,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        totalAmount: toCents(payload.totalAmount),
        commission: toCents(payload.commission),
        channelStatus: payload.status,
        rawData: payload.rawData || {},
        lastSyncedAt: new Date().toISOString(),
      },
    })

    if (updatedBooking) {
      await sendReservationEmail(payload, updatedBooking, 'modify')
    }

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
  if (normalized.includes('modify') || normalized.includes('update')) return 'modify'
  if (normalized.includes('create') || normalized.includes('new')) return 'create'
  return 'create'
}

async function postToChannel(endpoint: string, payload: Record<string, unknown>, headers?: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`Channel request failed: ${response.status} ${responseText}`)
  }

  return response.json().catch(() => ({}))
}

function resolveInventoryEndpoint(channel: any) {
  const credentials = channel?.credentials || {}
  if (credentials.inventoryEndpoint) return credentials.inventoryEndpoint
  if (credentials.syncEndpoint) return credentials.syncEndpoint
  if (credentials.apiBaseUrl) return `${credentials.apiBaseUrl}/inventory/sync`
  return null
}

function resolveReservationEndpoint(channel: any) {
  const credentials = channel?.credentials || {}
  if (credentials.reservationEndpoint) return credentials.reservationEndpoint
  if (credentials.pullReservationsEndpoint) return credentials.pullReservationsEndpoint
  if (credentials.apiBaseUrl) return `${credentials.apiBaseUrl}/reservations/pull`
  return null
}

export async function pushInventoryToChannel(context: any, channelId: string, dateRange?: DateRangeInput): Promise<ChannelSyncResult> {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: 'id name isActive syncStatus credentials mappingRules',
  })

  if (!channel) {
    throw new Error('Channel not found')
  }

  if (!channel.isActive) {
    return {
      channelId: channel.id,
      status: 'failed',
      syncedAt: new Date().toISOString(),
      details: { message: 'Channel is inactive' },
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
    const endpoint = resolveInventoryEndpoint(channel)
    if (endpoint) {
      await postToChannel(endpoint, payload, {
        'X-OpenFront-Channel': channel.id,
      })
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
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: 'inventory_push',
      status: 'failed',
      message: 'Inventory push failed',
      payload,
      errorMessage: error.message,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DEFAULT_RETRY_DELAY_MS),
    })

    await appendChannelSyncError(context, channel.id, error.message)

    return {
      channelId: channel.id,
      status: 'failed',
      syncedAt: new Date().toISOString(),
      details: { error: error.message },
    }
  }
}

export async function pullReservationsFromChannel(context: any, channelId: string): Promise<ChannelSyncResult> {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: 'id name isActive syncStatus credentials mappingRules',
  })

  if (!channel) {
    throw new Error('Channel not found')
  }

  if (!channel.isActive) {
    return {
      channelId: channel.id,
      status: 'failed',
      syncedAt: new Date().toISOString(),
      details: { message: 'Channel is inactive' },
    }
  }

  const endpoint = resolveReservationEndpoint(channel)
  const payload = {
    channelId: channel.id,
    channelName: channel.name,
  }

  try {
    const reservationsResponse = endpoint ? await postToChannel(endpoint, payload, {
      'X-OpenFront-Channel': channel.id,
    }) : { reservations: [] }

    const reservations = Array.isArray(reservationsResponse?.reservations)
      ? reservationsResponse.reservations
      : []

    for (const reservation of reservations) {
      const mapped = mapReservationPayload(reservation)
      const eventType = resolveEventType(mapped.status)
      await upsertChannelReservation(context, channel, mapped, eventType)
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
    await logChannelSyncEvent(context, {
      channelId: channel.id,
      action: 'reservation_pull',
      status: 'failed',
      message: 'Reservation pull failed',
      payload,
      errorMessage: error.message,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DEFAULT_RETRY_DELAY_MS),
    })

    await appendChannelSyncError(context, channel.id, error.message)

    return {
      channelId: channel.id,
      status: 'failed',
      syncedAt: new Date().toISOString(),
      details: { error: error.message },
    }
  }
}

export async function handleChannelWebhook(
  context: any,
  channelId: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
) {
  const channel = await context.sudo().query.Channel.findOne({
    where: { id: channelId },
    query: 'id name credentials mappingRules',
  })

  if (!channel) {
    throw new Error('Channel not found')
  }

  const secret = channel.credentials?.webhookSecret
  if (!secret) {
    throw new Error('Channel webhook secret not configured')
  }

  const signatureHeader =
    getStringHeader(headers, 'x-openfront-webhook-signature') ||
    getStringHeader(headers, 'x-channel-signature')

  const signature = normalizeSignature(signatureHeader)
  const expected = buildSignature(secret, rawBody)

  if (signature !== expected) {
    throw new Error('Invalid webhook signature')
  }

  const payload = JSON.parse(rawBody)
  const eventType = payload?.eventType || payload?.event || payload?.type || 'reservation.created'
  const mappedReservation = mapReservationPayload(payload)
  const action = resolveEventType(eventType)

  const reservationResult = await upsertChannelReservation(context, channel, mappedReservation, action)

  await logChannelSyncEvent(context, {
    channelId: channel.id,
    action: 'webhook_event',
    status: 'success',
    message: `Webhook handled: ${eventType}`,
    payload: {
      eventType,
      externalId: mappedReservation.externalId,
      action: reservationResult.action,
    },
  })

  return {
    success: true,
    action: reservationResult.action,
  }
}

export async function retryFailedChannelSyncs(context: any) {
  const now = new Date().toISOString()
  const failedEvents = await context.sudo().query.ChannelSyncEvent.findMany({
    where: {
      status: { equals: 'failed' },
      nextAttemptAt: { lte: now },
    },
    query: 'id channel { id } action attempts payload',
    take: 25,
  })

  for (const event of failedEvents) {
    const attempts = (event.attempts || 0) + 1
    try {
      if (event.action === 'inventory_push') {
        await pushInventoryToChannel(context, event.channel.id, event.payload?.dateRange as DateRangeInput)
      } else if (event.action === 'reservation_pull') {
        await pullReservationsFromChannel(context, event.channel.id)
      }

      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: {
          status: 'success',
          attempts,
          nextAttemptAt: null,
          message: 'Retry succeeded',
        },
      })
    } catch (error: any) {
      await context.sudo().query.ChannelSyncEvent.updateOne({
        where: { id: event.id },
        data: {
          status: 'failed',
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * DEFAULT_RETRY_DELAY_MS).toISOString(),
          errorMessage: error.message,
          message: 'Retry failed',
        },
      })

      await appendChannelSyncError(context, event.channel.id, error.message)
    }
  }
}
