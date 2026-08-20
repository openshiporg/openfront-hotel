import { enforceAbuseLimit } from '../lib/abuseControl';
import { queueContactCommunication } from '../lib/hotelCommunications';

export default async function submitHotelContactMessage(
  _root: unknown,
  {
    name,
    email,
    phone,
    subject,
    message,
    idempotencyKey,
  }: {
    name: string;
    email: string;
    phone?: string | null;
    subject: string;
    message: string;
    idempotencyKey: string;
  },
  context: any,
) {
  await enforceAbuseLimit(context, {
    scope: 'hotel-contact-message',
    identity: String(email || '').trim().toLowerCase(),
    limit: 5,
    windowMs: 60 * 60_000,
  });
  return queueContactCommunication(context.prisma, {
    name,
    email,
    phone,
    subject,
    message,
    idempotencyKey,
  });
}
