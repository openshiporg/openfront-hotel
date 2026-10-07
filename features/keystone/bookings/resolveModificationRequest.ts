import { permissions } from '../access';
import { amendUnpaidBooking } from './amendment';
import { changeUnpricedBookingStayDatesInTransaction } from './stayDates';
import { calculateHotelPrice } from '../rates/pricing';
import { hashLifecycleRequest, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { queueBookingCommunication } from '../communications/commands';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';

const MAX_STAY_DAYS = 365;
const MAX_NOTE_LENGTH = 2_000;

function must<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

function parseBoundedDate(value: string | null | undefined, fallback: Date, name: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} is invalid.`);
  return date;
}

function resultFromSnapshot(snapshot: any, replayed: boolean) {
  return {
    requestId: String(snapshot.requestId), bookingId: String(snapshot.bookingId),
    status: String(snapshot.status), decision: String(snapshot.decision),
    checkInDate: snapshot.checkInDate ? new Date(snapshot.checkInDate) : null,
    checkOutDate: snapshot.checkOutDate ? new Date(snapshot.checkOutDate) : null,
    pricingRevision: Number.isInteger(snapshot.pricingRevision) ? snapshot.pricingRevision : null,
    replayed,
  };
}

async function serializableWithRetry(context: any, operation: (tx: any) => Promise<any>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await context.transaction(operation, { maxWait: 5_000, timeout: 30_000, isolationLevel: 'Serializable' });
    } catch (error: any) {
      const detail = `${error?.message || ''} ${error?.extensions?.debug?.message || ''}`;
      const retryable = error?.code === 'P2034' || error?.code === '40001' || error?.extensions?.prisma?.code === 'P2034' || /could not serialize|write conflict|deadlock/i.test(detail);
      if (!retryable || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 20));
    }
  }
  throw new Error('Modification resolution could not be serialized.');
}

export default async function resolveBookingModificationRequest(
  root: unknown,
  { bookingId, decision, checkInDate, checkOutDate, staffNote, idempotencyKey }: {
    bookingId: string; decision: string; checkInDate?: string | null; checkOutDate?: string | null;
    staffNote?: string | null; idempotencyKey: string;
  },
  context: any,
) {
  if (!permissions.canManageBookings({ session: context.session })) throw new Error('Not authorized to resolve booking modification requests.');
  if (!['approved', 'declined'].includes(decision)) throw new Error('Decision must be approved or declined.');
  const eventKey = String(idempotencyKey || '').trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A bounded idempotency key is required.');
  const note = String(staffNote || '').trim();
  if (note.length > MAX_NOTE_LENGTH) throw new Error('Staff note is too long.');

  return serializableWithRetry(context, async (tx: any) => {
    const prisma = tx.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await lockHotelBusinessDate(prisma);
    await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
    const request: any = must(await prisma.bookingModificationRequest.findFirst({
      where: { bookingId, OR: [{ status: 'pending' }, { resolutionKey: eventKey }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    if (!request) throw new Error('No pending modification request exists for this booking.');
    const booking: any = must(await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { roomAssignments: true, lineItems: { where: { snapshotStatus: 'active' } }, payments: true },
    }));
    if (!booking || request.bookingId !== booking.id) throw new Error('Modification request booking binding is invalid.');
    const nextCheckIn = parseBoundedDate(checkInDate, request.requestedCheckInDate || booking.checkInDate, 'Approved check-in');
    const nextCheckOut = parseBoundedDate(checkOutDate, request.requestedCheckOutDate || booking.checkOutDate, 'Approved check-out');
    const stayDays = (nextCheckOut.getTime() - nextCheckIn.getTime()) / 86_400_000;
    if (decision === 'approved' && (stayDays <= 0 || stayDays > MAX_STAY_DAYS)) throw new Error('Approved stay dates are outside the supported range.');
    const resolutionInput = {
      requestId: request.id, bookingId, decision,
      checkInDate: decision === 'approved' ? nextCheckIn.toISOString() : null,
      checkOutDate: decision === 'approved' ? nextCheckOut.toISOString() : null,
      staffNote: note || null,
    };
    const resolutionHash = hashLifecycleRequest(resolutionInput);
    if (request.status !== 'pending') {
      if (request.resolutionKey !== eventKey || request.resolutionRequestHash !== resolutionHash) throw new Error('Modification request is stale or the idempotency key was reused with different evidence.');
      return resultFromSnapshot(request.resultSnapshot, true);
    }
    if (!['pending', 'confirmed'].includes(booking.status)) throw new Error('Modification request is stale because the booking is no longer open and pre-arrival.');

    let updated = booking;
    if (decision === 'approved') {
      if (booking.lineItems.length === 0) {
        updated = (await changeUnpricedBookingStayDatesInTransaction({ prisma, bookingId, checkIn: nextCheckIn, checkOut: nextCheckOut })).updated;
      } else {
        const assignment = booking.roomAssignments[0];
        if (!assignment?.roomTypeId || !booking.ratePlanId) throw new Error('Priced reservation is missing an authoritative room type or rate plan.');
        const ratePlan = await prisma.ratePlan.findUnique({ where: { id: booking.ratePlanId }, select: { isPromotional: true, promoCode: true } });
        if (!ratePlan) throw new Error('Priced reservation rate plan was not found.');
        const quote = await calculateHotelPrice(tx, {
          roomTypeId: assignment.roomTypeId, ratePlanId: booking.ratePlanId,
          checkInDate: nextCheckIn.toISOString(), checkOutDate: nextCheckOut.toISOString(),
          numberOfAdults: Number(booking.numberOfAdults || booking.numberOfGuests || 1),
          numberOfChildren: Number(booking.numberOfChildren || 0),
          promoCode: ratePlan.isPromotional ? ratePlan.promoCode : null,
        });
        updated = await amendUnpaidBooking({
          context: tx, bookingId, checkInDate: nextCheckIn.toISOString(), checkOutDate: nextCheckOut.toISOString(),
          roomTypeId: assignment.roomTypeId, guestName: booking.guestName, guestEmail: booking.guestEmail,
          guestProfileId: booking.guestProfileId, numberOfGuests: quote.numberOfGuests,
          totalAmountMinor: quote.totalMinor, currencyCode: quote.currencyCode,
          idempotencyKey: `${eventKey}:commercial-amendment`, source: 'staff-modification', withinTransaction: true,
          actorId: context.session.itemId, queueCommunication: false,
          commercialPricing: {
            ratePlanId: quote.ratePlan.id, pricingVersion: quote.pricingVersion,
            roomSubtotalMinor: quote.roomSubtotalMinor, taxMinor: quote.taxMinor, feesMinor: quote.feesMinor,
            totalMinor: quote.totalMinor, taxRateBasisPoints: quote.taxRateBasisPoints, nightlyRates: quote.nightlyRates,
          },
        });
      }
    }

    const snapshot = {
      requestId: request.id, bookingId, status: decision, decision,
      checkInDate: decision === 'approved' ? updated.checkInDate.toISOString() : booking.checkInDate.toISOString(),
      checkOutDate: decision === 'approved' ? updated.checkOutDate.toISOString() : booking.checkOutDate.toISOString(),
      pricingRevision: Number(updated.pricingRevision || booking.pricingRevision || 1),
    };
    const resolvedAt = new Date();
    const changed = must(await prisma.$executeRawUnsafe(
      'UPDATE "BookingModificationRequest" SET "status"=$1, "resolutionKey"=$2, "resolutionRequestHash"=$3, "resolvedBy"=$4, "resolvedAt"=$5, "staffNote"=$6, "resultSnapshot"=$7::jsonb, "updatedAt"=$5 WHERE "id"=$8 AND "status"=\'pending\'',
      decision, eventKey, resolutionHash, context.session.itemId, resolvedAt, note || '', JSON.stringify(snapshot), request.id,
    ));
    if (Number(changed) !== 1) throw new Error('Modification request was resolved concurrently.');
    await recordHotelLifecycleEvent({
      prisma, eventKey, actorId: context.session.itemId,
      identity: { request: resolutionInput, aggregateType: 'booking_modification_request', aggregateId: request.id, action: `modification_${decision}` },
      beforeSnapshot: { status: 'pending', bookingId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, pricingRevision: booking.pricingRevision },
      afterSnapshot: snapshot,
      metadata: { commercialAmendmentEventKey: decision === 'approved' && booking.lineItems.length ? `${eventKey}:commercial-amendment` : null },
    });
    await queueBookingCommunication(prisma, {
      bookingId,
      kind: 'booking_modification_response',
      eventKey,
      modification: { decision: decision as 'approved' | 'declined', staffNote: note || null },
    });
    return resultFromSnapshot(snapshot, false);
  });
}
