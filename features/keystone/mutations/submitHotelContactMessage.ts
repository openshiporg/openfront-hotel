import { randomUUID } from 'node:crypto';

import { enforceAbuseLimit } from '../lib/abuseControl';

function bounded(value: unknown, label: string, max: number) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return normalized;
}

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
  const replyTo = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) || replyTo.length > 320) throw new Error('Contact email must be a valid email address.');
  const reference = String(idempotencyKey || randomUUID()).trim();
  if (!reference || reference.length > 200) throw new Error('Contact message reference is invalid.');
  const data = {
    reference,
    guestName: bounded(name, 'Name', 160),
    replyTo,
    phone: phone ? bounded(phone, 'Phone', 80) : '',
    subject: bounded(subject, 'Subject', 160),
    message: bounded(message, 'Message', 4_000),
  };
  const prisma = context.prisma;
  const existing = await prisma.hotelContactMessage.findUnique({ where: { reference } });
  if (existing instanceof Error) throw existing;
  if (existing) {
    if (existing.replyTo !== data.replyTo || existing.subject !== data.subject || existing.message !== data.message) {
      throw new Error('Contact message reference is already bound to different content.');
    }
    return { reference, status: 'received', replayed: true };
  }
  const created = await prisma.hotelContactMessage.create({ data });
  if (created instanceof Error) throw created;
  return { reference, status: 'received', replayed: false };
}
