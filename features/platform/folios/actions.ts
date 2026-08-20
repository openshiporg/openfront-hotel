'use server';

import { randomUUID } from 'node:crypto';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  boundedEnum,
  boundedId,
  boundedInteger,
  boundedIsoDate,
  boundedText,
  requireActionData,
} from '@/features/platform/lib/actionResult';

const FOLIO_WORKSPACE = String.raw`
  query GetFolioWorkspace {
    hotelNightAuditOperations(propertyKey: "the-alder-house") {
      currentBusinessDate
      runs { id businessDate status postedEntryCount existingEntryCount debitMinor completedAt }
    }
    hotelFolioOperations(propertyKey: "the-alder-house") {
      overdueExceptions { id confirmationNumber guestName checkOutDate status balanceDue }
      folios {
        id folioNumber status currencyCode openedAt debitMinor creditMinor balanceMinor
        booking { id confirmationNumber guestName checkInDate checkOutDate status }
        entries {
          id postingKey entryType direction amountMinor currencyCode description
          serviceDate postedAt sourceType taxCategorySnapshot reversesId reversedById
        }
      }
    }
  }
`;

const RUN_NIGHT_AUDIT = String.raw`
  mutation RunHotelNightAudit($businessDate: DateTime!, $idempotencyKey: String!) {
    runHotelNightAudit(propertyKey: "the-alder-house", businessDate: $businessDate, idempotencyKey: $idempotencyKey) {
      id businessDate status postedEntryCount existingEntryCount debitMinor completedAt
    }
  }
`;
const POST_ENTRY = String.raw`mutation($bookingId:ID!,$key:String!,$type:String!,$direction:String!,$amount:Int!,$description:String!){postFolioEntry(bookingId:$bookingId,postingKey:$key,entryType:$type,direction:$direction,amountMinor:$amount,currencyCode:"USD",description:$description){folioId entryId balanceMinor replayed}}`;
const RECORD_PAYMENT = String.raw`mutation($bookingId:ID!,$key:String!,$amount:Int!,$method:String!,$description:String!){recordBookingPayment(bookingId:$bookingId,postingKey:$key,amountMinor:$amount,currencyCode:"USD",paymentMethod:$method,description:$description){folioId entryId balanceMinor replayed}}`;
const CLOSE_FOLIO = String.raw`mutation($bookingId:ID!,$key:String!){closeReconciledFolio(bookingId:$bookingId,idempotencyKey:$key){folioId status balanceMinor replayed}}`;
const REVERSE_ENTRY = String.raw`mutation($entryId:ID!,$key:String!,$reason:String!){reverseFolioEntry(entryId:$entryId,postingKey:$key,reason:$reason){folioId entryId balanceMinor replayed}}`;
const RESOLVE_OVERDUE = String.raw`mutation($bookingId:ID!,$key:String!,$reason:String!){resolveOverdueCheckedInBooking(bookingId:$bookingId,idempotencyKey:$key,reason:$reason){bookingId folioId status folioStatus writtenOffMinor replayed}}`;

export async function getFolioWorkspace() {
  const response = await keystoneClient<any>(FOLIO_WORKSPACE);
  return requireActionData(response);
}

export async function runNightAuditAction(businessDate: string) {
  const response = await keystoneClient<any>(RUN_NIGHT_AUDIT, {
    businessDate: boundedIsoDate(businessDate, 'Business date'),
    idempotencyKey: randomUUID(),
  });
  return requireActionData(response).runHotelNightAudit;
}

export async function recordFolioPaymentAction(input: {
  bookingId: string; amountMinor: number; method: string; description: string;
}) {
  const response = await keystoneClient<any>(RECORD_PAYMENT, {
    bookingId: boundedId(input.bookingId, 'Booking ID'),
    key: `operator:payment:${randomUUID()}`,
    amount: boundedInteger(input.amountMinor, 'Amount', { min: 1 }),
    method: boundedEnum(input.method, 'Payment method', ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check'] as const),
    description: boundedText(input.description, 'Description', 500, true),
  });
  return requireActionData(response).recordBookingPayment;
}

export async function postFolioEntryAction(input: {
  bookingId: string; amountMinor: number; direction: string; description: string;
}) {
  const direction = boundedEnum(input.direction, 'Direction', ['debit', 'credit'] as const);
  const response = await keystoneClient<any>(POST_ENTRY, {
    bookingId: boundedId(input.bookingId, 'Booking ID'),
    key: `operator:entry:${randomUUID()}`,
    amount: boundedInteger(input.amountMinor, 'Amount', { min: 1 }),
    type: direction === 'debit' ? 'addon' : 'adjustment',
    direction,
    description: boundedText(input.description, 'Description', 500, true),
  });
  return requireActionData(response).postFolioEntry;
}

export async function closeReconciledFolioAction(bookingId: string) {
  const response = await keystoneClient<any>(CLOSE_FOLIO, {
    bookingId: boundedId(bookingId, 'Booking ID'), key: randomUUID(),
  });
  return requireActionData(response).closeReconciledFolio;
}

export async function reverseFolioEntryAction(entryId: string, reason: string) {
  const response = await keystoneClient<any>(REVERSE_ENTRY, {
    entryId: boundedId(entryId, 'Entry ID'),
    key: `operator:reverse:${randomUUID()}`,
    reason: boundedText(reason, 'Reason', 500, true),
  });
  return requireActionData(response).reverseFolioEntry;
}

export async function resolveOverdueStayAction(bookingId: string, reason: string) {
  const response = await keystoneClient<any>(RESOLVE_OVERDUE, {
    bookingId: boundedId(bookingId, 'Booking ID'),
    key: `operator:overdue:${randomUUID()}`,
    reason: boundedText(reason, 'Reason', 500, true),
  });
  return requireActionData(response).resolveOverdueCheckedInBooking;
}
