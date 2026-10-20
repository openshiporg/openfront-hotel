import { PrismaClient } from '@prisma/client';

import { HotelOutboxReceiptConflictError, persistAuthenticatedHotelOutboxReceipt } from '@/features/keystone/communications/outbox';
import { readBoundedRequestText, RequestBodyRejectedError } from '@/features/keystone/lib/boundedRequestBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalForPrisma = globalThis as unknown as { hotelOutboxReceiverPrisma?: PrismaClient };
const prisma = globalForPrisma.hotelOutboxReceiverPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.hotelOutboxReceiverPrisma = prisma;

const MAX_BODY_BYTES = 1_000_000;

function header(request: Request, name: string) {
  return request.headers.get(name)?.trim() || '';
}

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ accepted: false, error: 'Invalid receiver request.' }, { status: 415 });
  }
  // Configuration is checked before any body is read.
  const expectedCredentialKeyId = process.env.HOTEL_OUTBOX_RECEIVER_CREDENTIAL_KEY_ID || '';
  const secret = process.env.HOTEL_OUTBOX_RECEIVER_SECRET || '';
  if (!expectedCredentialKeyId || !secret) {
    return Response.json({ accepted: false, error: 'Receiver unavailable.' }, { status: 503 });
  }
  let body: string;
  try {
    body = await readBoundedRequestText(request, MAX_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyRejectedError ? error.status : 400;
    return Response.json({ accepted: false, error: 'Invalid receiver request.' }, { status });
  }

  try {
    const receipt = await persistAuthenticatedHotelOutboxReceipt(prisma, {
      body,
      eventKeyHeader: header(request, 'x-openfront-outbox-event-key'),
      credentialKeyId: header(request, 'x-openfront-outbox-credential-key-id'),
      sentAt: header(request, 'x-openfront-outbox-sent-at'),
      signature: header(request, 'x-openfront-outbox-signature'),
      expectedCredentialKeyId,
      secret,
    });
    return Response.json(receipt, {
      status: receipt.replayed ? 200 : 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const conflict = error instanceof HotelOutboxReceiptConflictError;
    return Response.json(
      { accepted: false, error: conflict ? 'Receiver evidence conflict.' : 'Receiver authentication failed.' },
      { status: conflict ? 409 : 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
