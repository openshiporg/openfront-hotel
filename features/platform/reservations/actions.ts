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
const AMEND_BOOKING = String.raw`mutation($bookingId:ID!,$checkInDate:DateTime!,$checkOutDate:DateTime!,$earlyDepartureApprovalId:ID,$earlyDepartureReason:String,$targetRoomId:ID,$roomTypeId:ID,$ratePlanId:ID,$key:String!){amendStaffBooking(bookingId:$bookingId,checkInDate:$checkInDate,checkOutDate:$checkOutDate,earlyDepartureApprovalId:$earlyDepartureApprovalId,earlyDepartureReason:$earlyDepartureReason,targetRoomId:$targetRoomId,roomTypeId:$roomTypeId,ratePlanId:$ratePlanId,idempotencyKey:$key){id checkInDate checkOutDate totalAmount pricingRevision}}`;
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
      ratePlanName nights roomSubtotalMinor taxAmountMinor feesAmountMinor totalAmountMinor currencyCode cancellationPolicy quoteToken
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

export async function amendReservationStayAction(bookingId: string, checkInDate: string, checkOutDate: string, idempotencyKey?: string, earlyDepartureApprovalId?: string, earlyDepartureReason?: string, upgrade?: { targetRoomId: string; roomTypeId: string; ratePlanId: string }) {
  const range = boundedDateRange(checkInDate, checkOutDate, 365);
  const response = await keystoneClient<any>(AMEND_BOOKING, {
    bookingId: boundedId(bookingId, 'Booking ID'),
    ...(upgrade ? { targetRoomId: boundedId(upgrade.targetRoomId, 'Target room ID'), roomTypeId: boundedId(upgrade.roomTypeId, 'Room type ID'), ratePlanId: boundedId(upgrade.ratePlanId, 'Rate plan ID') } : {}),
    checkInDate: range.start,
    checkOutDate: range.end,
    earlyDepartureApprovalId: earlyDepartureApprovalId ? boundedId(earlyDepartureApprovalId, 'Approval ID') : null,
    earlyDepartureReason: earlyDepartureReason ? boundedText(earlyDepartureReason, 'Waiver reason', 1000, true) : null,
    key: idempotencyKey ? boundedText(idempotencyKey, 'Idempotency key', 200, true) : randomUUID(),
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
    quoteToken: boundedText(input.quoteToken, 'Quote token', 4096, true),
    idempotencyKey: boundedText(input.idempotencyKey, 'Idempotency key', 200, true),
  };
  const response = await keystoneClient<any>(CREATE_STAFF_BOOKING, { data });
  return requireActionData(response).createStaffBooking;
}

export async function getStayRegisterAction(bookingId: string) {
  const response = await keystoneClient<any>('query($bookingId:ID!){hotelStayRegister(bookingId:$bookingId)}', { bookingId: boundedId(bookingId, 'Booking ID') });
  return JSON.parse(requireActionData(response).hotelStayRegister);
}

export async function updateStayRegisterAction(input: { bookingId: string; action: string; name?: string; occupantId?: string; keyReference?: string; idempotencyKey: string }) {
  const response = await keystoneClient<any>('mutation($bookingId:ID!,$action:String!,$name:String,$occupantId:ID,$keyReference:String,$idempotencyKey:String!){updateHotelStayRegister(bookingId:$bookingId,action:$action,name:$name,occupantId:$occupantId,keyReference:$keyReference,idempotencyKey:$idempotencyKey)}', {
    bookingId: boundedId(input.bookingId, 'Booking ID'), action: boundedEnum(input.action, 'Action', ['add_occupant', 'remove_occupant', 'issue_key', 'return_key', 'retire_key'] as const),
    name: input.name ? boundedText(input.name, 'Occupant name', 200, true) : null,
    occupantId: input.occupantId ? boundedId(input.occupantId, 'Occupant ID') : null,
    keyReference: input.keyReference ? boundedText(input.keyReference, 'Key reference', 80, true) : null,
    idempotencyKey: boundedText(input.idempotencyKey, 'Idempotency key', 200, true),
  });
  return JSON.parse(requireActionData(response).updateHotelStayRegister);
}

export async function getInHouseUpgradeOptions(checkInDate: string, checkOutDate: string) {
  const [workspace, options] = await Promise.all([getReservationCalendarWorkspace(checkInDate, checkOutDate), getStaffReservationOptions()]);
  return { rooms: workspace.rooms, roomTypes: options.roomTypes };
}
