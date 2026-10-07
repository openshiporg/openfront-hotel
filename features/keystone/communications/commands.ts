import { randomUUID } from 'node:crypto';

import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';

export const HOTEL_COMMUNICATION_TOPICS = [
  'hotel.communication.booking_confirmation',
  'hotel.communication.booking_prearrival',
  'hotel.communication.booking_updated',
  'hotel.communication.booking_cancelled',
  'hotel.communication.booking_no_show',
  'hotel.communication.booking_refund',
  'hotel.communication.booking_modification_response',
  'hotel.communication.contact_received',
] as const;

export type HotelCommunicationTopic = (typeof HOTEL_COMMUNICATION_TOPICS)[number];
export type BookingCommunicationKind = 'booking_prearrival' | 'booking_confirmation' | 'booking_updated' | 'booking_cancelled' | 'booking_no_show' | 'booking_refund' | 'booking_modification_response';

export type HotelCommunicationPayload = {
  kind: BookingCommunicationKind | 'contact_received';
  to: string;
  replyTo?: string | null;
  propertyName: string;
  contactEmail: string;
  guestName?: string;
  confirmationNumber?: string;
  bookingId?: string;
  checkInDate?: string;
  checkOutDate?: string;
  numberOfGuests?: number;
  roomTypeName?: string;
  totalAmountMinor?: number;
  currencyCode?: string;
  cancellationPolicy?: string | null;
  cancellationSummary?: string | null;
  refundableMinor?: number | null;
  cancellationFeeMinor?: number | null;
  modificationDecision?: 'approved' | 'declined' | null;
  staffNote?: string | null;
  contactSubject?: string;
  contactMessage?: string;
  contactPhone?: string | null;
};

function requirePrismaResult<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

function email(value: unknown, label: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new Error(`${label} must be a valid email address.`);
  }
  return normalized;
}

function bounded(value: unknown, label: string, max: number) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}

function topicFor(kind: HotelCommunicationPayload['kind']): HotelCommunicationTopic {
  return `hotel.communication.${kind}` as HotelCommunicationTopic;
}

export function isHotelCommunicationTopic(value: string): value is HotelCommunicationTopic {
  return (HOTEL_COMMUNICATION_TOPICS as readonly string[]).includes(value);
}

async function enqueueCommunication(prisma: any, {
  eventKey,
  aggregateType,
  aggregateId,
  payload,
}: {
  eventKey: string;
  aggregateType: string;
  aggregateId: string;
  payload: HotelCommunicationPayload;
}) {
  const key = `hotel-communication:${eventKey}`;
  const requestHash = hashLifecycleRequest(payload);
  const existing = requirePrismaResult(await prisma.hotelOutboxEvent.findUnique({ where: { eventKey: key } }));
  if (existing) {
    if (
      existing.requestHash !== requestHash ||
      existing.topic !== topicFor(payload.kind) ||
      existing.aggregateType !== aggregateType ||
      existing.aggregateId !== aggregateId
    ) {
      throw new Error('Communication idempotency key is already bound to different evidence.');
    }
    return { event: existing, replayed: true };
  }
  const event = requirePrismaResult(await prisma.hotelOutboxEvent.create({
    data: {
      eventKey: key,
      requestHash,
      propertyKey: HOTEL_PROPERTY_KEY,
      topic: topicFor(payload.kind),
      aggregateType,
      aggregateId,
      payloadSnapshot: payload,
      status: 'pending',
      attempts: 0,
      availableAt: new Date(),
    },
  }));
  return { event, replayed: false };
}

export async function queueBookingCommunication(prisma: any, {
  bookingId,
  kind,
  eventKey,
  cancellation,
  modification,
}: {
  bookingId: string;
  kind: BookingCommunicationKind;
  eventKey: string;
  cancellation?: {
    summary: string;
    refundableMinor: number;
    cancellationFeeMinor: number;
  } | null;
  modification?: {
    decision: 'approved' | 'declined';
    staffNote?: string | null;
  } | null;
}) {
  const [bookingResult, settingsResult] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ratePlan: true,
        roomAssignments: { take: 1, include: { roomType: true } },
        lineItems: {
          where: { snapshotStatus: 'active' },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          take: 1,
        },
      },
    }),
    prisma.hotelSettings.findUnique({ where: { id: 1 } }),
  ]);
  const booking = requirePrismaResult(bookingResult);
  const settings = requirePrismaResult(settingsResult);
  if (!booking) throw new Error('Booking communication target was not found.');
  if (!settings) throw new Error('Hotel communication settings are not configured.');
  const policy = booking.lineItems[0]?.cancellationPolicySnapshot ||
    (booking.pricingSnapshot as any)?.cancellationPolicy || booking.ratePlan?.cancellationPolicy || null;
  const payload: HotelCommunicationPayload = {
    kind,
    to: email(booking.guestEmail, 'Guest email'),
    propertyName: bounded(settings.propertyName, 'Property name', 200),
    contactEmail: email(settings.contactEmail, 'Property contact email'),
    guestName: bounded(booking.guestName, 'Guest name', 255),
    confirmationNumber: bounded(booking.confirmationNumber, 'Confirmation number', 100),
    bookingId: booking.id,
    checkInDate: booking.checkInDate.toISOString(),
    checkOutDate: booking.checkOutDate.toISOString(),
    numberOfGuests: Number(booking.numberOfGuests || 1),
    roomTypeName: booking.roomAssignments[0]?.roomType?.name || 'Reserved room',
    totalAmountMinor: Number(booking.totalAmountMinor || 0),
    currencyCode: String(booking.currencyCode || 'USD').toUpperCase(),
    cancellationPolicy: policy,
    cancellationSummary: cancellation?.summary || null,
    refundableMinor: cancellation?.refundableMinor ?? null,
    cancellationFeeMinor: cancellation?.cancellationFeeMinor ?? null,
    modificationDecision: modification?.decision || null,
    staffNote: modification?.staffNote || null,
  };
  return enqueueCommunication(prisma, {
    eventKey: `${kind}:${eventKey}`,
    aggregateType: 'booking',
    aggregateId: bookingId,
    payload,
  });
}

export async function queueContactCommunication(prisma: any, input: {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  idempotencyKey?: string | null;
}) {
  const settings = requirePrismaResult(await prisma.hotelSettings.findUnique({ where: { id: 1 } }));
  if (!settings) throw new Error('Hotel contact settings are not configured.');
  const reference = String(input.idempotencyKey || randomUUID()).trim();
  if (!reference || reference.length > 200) throw new Error('Contact message reference is invalid.');
  const payload: HotelCommunicationPayload = {
    kind: 'contact_received',
    to: email(settings.contactEmail, 'Property contact email'),
    replyTo: email(input.email, 'Contact email'),
    propertyName: bounded(settings.propertyName, 'Property name', 200),
    contactEmail: email(settings.contactEmail, 'Property contact email'),
    guestName: bounded(input.name, 'Name', 160),
    contactPhone: input.phone ? bounded(input.phone, 'Phone', 80) : null,
    contactSubject: bounded(input.subject, 'Subject', 160),
    contactMessage: bounded(input.message, 'Message', 4_000),
  };
  const queued = await enqueueCommunication(prisma, {
    eventKey: `contact_received:${reference}`,
    aggregateType: 'contact_message',
    aggregateId: reference,
    payload,
  });
  return { reference, status: queued.event.status, replayed: queued.replayed };
}

export async function bookingCommunicationStatus(prisma: any, bookingId: string) {
  const events = await prisma.hotelOutboxEvent.findMany({
    where: {
      aggregateType: 'booking',
      aggregateId: bookingId,
      topic: { in: HOTEL_COMMUNICATION_TOPICS.filter(topic => topic !== 'hotel.communication.contact_received') },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 10,
    select: { topic: true, status: true, deliveredAt: true, lastError: true },
  });
  const latest = new Map<string, any>();
  for (const event of events) if (!latest.has(event.topic)) latest.set(event.topic, event);
  return {
    prearrival: latest.get('hotel.communication.booking_prearrival') || null,
    confirmation: latest.get('hotel.communication.booking_confirmation') || null,
    update: latest.get('hotel.communication.booking_updated') || null,
    cancellation: latest.get('hotel.communication.booking_cancelled') || null,
    modification: latest.get('hotel.communication.booking_modification_response') || null,
  };
}
