import { permissions } from '../access';
import { getOutboxDispatchConfig } from '../lib/integrationConfig';
import { hotelMailInfrastructureConfigured } from '../lib/mail';

export const hotelGuestMessagesTypeDefs = String.raw`
  extend type Query { hotelGuestMessages: JSON! }
`;

function deliveryConfigured() {
  try {
    return hotelMailInfrastructureConfigured() || getOutboxDispatchConfig().enabled;
  } catch {
    return false;
  }
}

/**
 * Contact inquiries for the front desk. Each one is the durable record written when a
 * guest submits the storefront contact form; delivery status is reported as it is, and
 * never as sent unless the delivery worker recorded it.
 */
export async function hotelGuestMessages(_root: unknown, _args: unknown, context: any) {
  if (!permissions.canManageBookings({ session: context.session }) && !permissions.canManageGuests({ session: context.session })) {
    throw new Error('Not authorized to read guest messages.');
  }
  const [events, settings] = await Promise.all([
    context.prisma.hotelOutboxEvent.findMany({
      where: { topic: 'hotel.communication.contact_received' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true, aggregateId: true, payloadSnapshot: true, status: true, attempts: true, createdAt: true, deliveredAt: true },
    }),
    context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { contactEmail: true } }),
  ]);
  return {
    deliveryConfigured: deliveryConfigured(),
    notifyAddress: settings?.contactEmail || null,
    messages: events.map((event: any) => {
      const payload = event.payloadSnapshot && typeof event.payloadSnapshot === 'object' ? event.payloadSnapshot : {};
      return {
        id: event.id,
        reference: event.aggregateId,
        receivedAt: event.createdAt,
        guestName: String(payload.guestName || ''),
        replyTo: String(payload.replyTo || ''),
        phone: String(payload.contactPhone || ''),
        subject: String(payload.contactSubject || ''),
        message: String(payload.contactMessage || ''),
        deliveryStatus: event.status,
        deliveredAt: event.deliveredAt,
        attempts: event.attempts,
      };
    }),
  };
}
