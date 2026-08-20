'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  boundedDateRange,
  boundedEnum,
  boundedId,
  boundedInteger,
  boundedText,
  requireActionData,
} from '@/features/platform/lib/actionResult';

const RESERVATION_CALENDAR = String.raw`
  query ReservationCalendar($start: DateTime!, $end: DateTime!) {
    hotelReservationCalendar(propertyKey: "the-alder-house", start: $start, end: $end) {
      reservations {
        id confirmationNumber guestName checkInDate checkOutDate status source
        numberOfGuests totalAmount balanceDue room { id roomNumber } roomType { id name }
      }
      rooms { id roomNumber status roomType { id name } }
    }
  }
`;
const AMEND_BOOKING = String.raw`mutation($bookingId:ID!,$checkInDate:DateTime!,$checkOutDate:DateTime!,$key:String!){amendStaffBooking(bookingId:$bookingId,checkInDate:$checkInDate,checkOutDate:$checkOutDate,idempotencyKey:$key){id checkInDate checkOutDate totalAmount pricingRevision}}`;
const UPDATE_STATUS = String.raw`mutation($bookingId:ID!,$status:String!,$key:String!){updateBookingStatus(bookingId:$bookingId,status:$status,idempotencyKey:$key){id status}}`;
const CANCEL_BOOKING = String.raw`mutation($bookingId:ID!,$reason:String,$key:String!){cancelBooking(bookingId:$bookingId,refundReason:$reason,idempotencyKey:$key){id status paymentStatus}}`;
const STAFF_OPTIONS = String.raw`
  query StaffReservationOptions {
    roomTypes: storefrontRoomTypes {
      id name maxOccupancy
      ratePlans { id name baseRate currencyCode cancellationPolicy mealPlan isPromotional }
    }
  }
`;
const STAFF_GUEST = String.raw`query($guestId:ID!){guest(where:{id:$guestId}){id firstName lastName email phone}}`;
const STAFF_QUOTE = String.raw`
  query($roomTypeId:ID!,$ratePlanId:ID!,$checkInDate:DateTime!,$checkOutDate:DateTime!,$numberOfAdults:Int!,$numberOfChildren:Int,$promoCode:String){
    storefrontQuote(roomTypeId:$roomTypeId,ratePlanId:$ratePlanId,checkInDate:$checkInDate,checkOutDate:$checkOutDate,numberOfAdults:$numberOfAdults,numberOfChildren:$numberOfChildren,promoCode:$promoCode){
      ratePlanName nights roomSubtotalMinor taxAmountMinor feesAmountMinor totalAmountMinor currencyCode cancellationPolicy
    }
  }
`;
const CREATE_STAFF_BOOKING = String.raw`
  mutation($data:StaffBookingCreateInput!){
    createStaffBooking(data:$data){id confirmationNumber status totalAmount currencyCode guestName}
  }
`;

const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'cancellation_pending', 'no_show'] as const;

function quoteInput(input: Record<string, unknown>) {
  const range = boundedDateRange(input.checkInDate, input.checkOutDate, 365);
  return {
    roomTypeId: boundedId(input.roomTypeId, 'Room type ID'),
    ratePlanId: boundedId(input.ratePlanId, 'Rate plan ID'),
    checkInDate: range.start,
    checkOutDate: range.end,
    numberOfAdults: boundedInteger(input.numberOfAdults, 'Number of adults', { min: 1, max: 20 }),
    numberOfChildren: boundedInteger(input.numberOfChildren ?? 0, 'Number of children', { min: 0, max: 20 }),
    promoCode: input.promoCode ? boundedText(input.promoCode, 'Promo code', 100) : null,
  };
}

export async function getReservationCalendarWorkspace(start: string, end: string) {
  const range = boundedDateRange(start, end, 92);
  const response = await keystoneClient<any>(RESERVATION_CALENDAR, range);
  return requireActionData(response).hotelReservationCalendar;
}

export async function amendReservationStayAction(bookingId: string, checkInDate: string, checkOutDate: string) {
  const range = boundedDateRange(checkInDate, checkOutDate, 365);
  const response = await keystoneClient<any>(AMEND_BOOKING, {
    bookingId: boundedId(bookingId, 'Booking ID'),
    checkInDate: range.start,
    checkOutDate: range.end,
    key: randomUUID(),
  });
  return requireActionData(response).amendStaffBooking;
}

export async function updateReservationStatusAction(bookingId: string, status: string) {
  const response = await keystoneClient<any>(UPDATE_STATUS, {
    bookingId: boundedId(bookingId, 'Booking ID'),
    status: boundedEnum(status, 'Booking status', BOOKING_STATUSES),
    key: randomUUID(),
  });
  return requireActionData(response).updateBookingStatus;
}

export async function cancelReservationAction(bookingId: string) {
  const response = await keystoneClient<any>(CANCEL_BOOKING, {
    bookingId: boundedId(bookingId, 'Booking ID'), reason: 'Cancelled by front desk', key: randomUUID(),
  });
  return requireActionData(response).cancelBooking;
}

export async function getStaffReservationOptions(initialGuestId?: string | null) {
  const optionsResponse = await keystoneClient<any>(STAFF_OPTIONS);
  const roomTypes = requireActionData(optionsResponse).roomTypes || [];
  if (!initialGuestId) return { roomTypes, guest: null };
  const guestResponse = await keystoneClient<any>(STAFF_GUEST, { guestId: boundedId(initialGuestId, 'Guest ID') });
  return { roomTypes, guest: requireActionData(guestResponse).guest || null };
}

export async function getStaffReservationQuote(input: Record<string, unknown>) {
  const response = await keystoneClient<any>(STAFF_QUOTE, quoteInput(input));
  return requireActionData(response).storefrontQuote;
}

export async function createStaffReservationAction(input: Record<string, unknown>) {
  const data = {
    ...quoteInput(input),
    guestName: boundedText(input.guestName, 'Guest name', 200, true),
    guestEmail: boundedText(input.guestEmail, 'Guest email', 320, true).toLowerCase(),
    guestPhone: input.guestPhone ? boundedText(input.guestPhone, 'Guest phone', 80) : null,
    specialRequests: input.specialRequests ? boundedText(input.specialRequests, 'Special requests', 1000) : null,
    internalNotes: input.internalNotes ? boundedText(input.internalNotes, 'Internal notes', 2000) : null,
    source: boundedEnum(input.source, 'Source', ['phone', 'walk_in', 'direct'] as const),
    status: boundedEnum(input.status, 'Initial status', ['pending', 'confirmed'] as const),
    idempotencyKey: randomUUID(),
  };
  const response = await keystoneClient<any>(CREATE_STAFF_BOOKING, { data });
  return requireActionData(response).createStaffBooking;
}
