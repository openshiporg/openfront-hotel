'use server';


import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  boundedDateRange,
  boundedEnum,
  boundedId,
  boundedIsoDate,
  boundedText,
  requireActionData,
} from '@/features/platform/lib/actionResult';

const FRONT_DESK = String.raw`
  query FrontDeskReservations($start: DateTime!, $end: DateTime!) {
    hotelFrontDesk(propertyKey: "the-alder-house", start: $start, end: $end) {
      businessDate
      reservations {
        id confirmationNumber guestName checkInDate checkOutDate status numberOfGuests
        totalAmount balanceDue source internalNotes hasPendingModificationRequest
        pendingModificationRequest { id requestedCheckInDate requestedCheckOutDate guestMessage }
        room { id roomNumber status }
        roomType { id name }
      }
      rooms { id roomNumber status roomType { id name } }
    }
  }
`;
const UPDATE_STATUS = String.raw`mutation($bookingId:ID!,$status:String!,$key:String!){updateBookingStatus(bookingId:$bookingId,status:$status,idempotencyKey:$key){id status}}`;
const CANCEL_BOOKING = String.raw`mutation($bookingId:ID!,$reason:String,$key:String!){cancelBooking(bookingId:$bookingId,refundReason:$reason,idempotencyKey:$key){id status paymentStatus}}`;
const RESOLVE_MODIFICATION = String.raw`
  mutation($bookingId:ID!,$decision:String!,$checkInDate:DateTime,$checkOutDate:DateTime,$staffNote:String,$key:String!){
    resolveBookingModificationRequest(bookingId:$bookingId,decision:$decision,checkInDate:$checkInDate,checkOutDate:$checkOutDate,staffNote:$staffNote,idempotencyKey:$key){
      requestId bookingId status checkInDate checkOutDate pricingRevision replayed
    }
  }
`;
const ASSIGN_ROOM = String.raw`mutation($bookingId:ID!,$roomId:ID!,$key:String!){assignRoomToBooking(bookingId:$bookingId,roomId:$roomId,idempotencyKey:$key){id roomAssignments{room{id roomNumber status} roomType{id name}}}}`;

const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'cancellation_pending', 'no_show'] as const;

type FrontDeskMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function safeFrontDeskMutation<T>(
  operation: () => Promise<T>,
  message: string,
): Promise<FrontDeskMutationResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch {
    return { ok: false, message };
  }
}

export async function getFrontDeskWorkspace(start: string, end: string) {
  const range = boundedDateRange(start, end, 31);
  const response = await keystoneClient<any>(FRONT_DESK, range);
  return requireActionData(response).hotelFrontDesk;
}

export async function updateFrontDeskBookingStatus(bookingId: string, status: string, idempotencyKey: string) {
  return safeFrontDeskMutation(async () => {
    const response = await keystoneClient<any>(UPDATE_STATUS, {
      bookingId: boundedId(bookingId, 'Booking ID'),
      status: boundedEnum(status, 'Booking status', BOOKING_STATUSES),
      key: boundedText(idempotencyKey, 'Idempotency key', 200, true),
    });
    return requireActionData(response).updateBookingStatus;
  }, 'The reservation was not updated. Refresh and review its status, room readiness, business date, and folio requirements.');
}

export async function cancelFrontDeskBooking(bookingId: string, idempotencyKey: string) {
  return safeFrontDeskMutation(async () => {
    const response = await keystoneClient<any>(CANCEL_BOOKING, {
      bookingId: boundedId(bookingId, 'Booking ID'),
      reason: 'Cancelled by front desk',
      key: boundedText(idempotencyKey, 'Idempotency key', 200, true),
    });
    return requireActionData(response).cancelBooking;
  }, 'Cancellation was not recorded. Refresh and review the reservation cancellation, payment, and folio state.');
}

export async function resolveFrontDeskModification(input: {
  bookingId: string;
  decision: 'approved' | 'declined';
  checkInDate?: string | null;
  checkOutDate?: string | null;
  staffNote?: string | null;
  idempotencyKey: string;
}) {
  return safeFrontDeskMutation(async () => {
    const response = await keystoneClient<any>(RESOLVE_MODIFICATION, {
      bookingId: boundedId(input.bookingId, 'Booking ID'),
      decision: boundedEnum(input.decision, 'Decision', ['approved', 'declined'] as const),
      checkInDate: input.checkInDate ? boundedIsoDate(input.checkInDate, 'Check-in date') : null,
      checkOutDate: input.checkOutDate ? boundedIsoDate(input.checkOutDate, 'Check-out date') : null,
      staffNote: input.staffNote ? boundedText(input.staffNote, 'Staff note', 1000) : null,
      key: boundedText(input.idempotencyKey, 'Idempotency key', 200, true),
    });
    return requireActionData(response).resolveBookingModificationRequest;
  }, 'The change request was not resolved. Refresh and review its dates, inventory, and current status.');
}

export async function assignFrontDeskRoom(bookingId: string, roomId: string, idempotencyKey: string) {
  return safeFrontDeskMutation(async () => {
    const response = await keystoneClient<any>(ASSIGN_ROOM, {
      bookingId: boundedId(bookingId, 'Booking ID'),
      roomId: boundedId(roomId, 'Room ID'),
      key: boundedText(idempotencyKey, 'Idempotency key', 200, true),
    });
    return requireActionData(response).assignRoomToBooking;
  }, 'The room was not assigned. Refresh and choose a compatible ready, unassigned room.');
}
