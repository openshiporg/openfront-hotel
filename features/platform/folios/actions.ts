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
        id folioNumber status currencyCode openedAt debitMinor creditMinor balanceMinor settlementBookingId groupBlock { id name }
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
const POST_ENTRY = String.raw`mutation($bookingId:ID!,$key:String!,$type:String!,$direction:String!,$amount:Int!,$description:String!,$approvalId:ID){postFolioEntry(bookingId:$bookingId,postingKey:$key,entryType:$type,direction:$direction,amountMinor:$amount,currencyCode:"USD",description:$description,approvalId:$approvalId){folioId entryId balanceMinor replayed}}`;
const RECORD_PAYMENT = String.raw`mutation($bookingId:ID!,$key:String!,$amount:Int!,$method:String!,$description:String!){recordBookingPayment(bookingId:$bookingId,postingKey:$key,amountMinor:$amount,currencyCode:"USD",paymentMethod:$method,description:$description){folioId entryId balanceMinor replayed}}`;
const CLOSE_FOLIO = String.raw`mutation($bookingId:ID!,$key:String!){closeReconciledFolio(bookingId:$bookingId,idempotencyKey:$key){folioId status balanceMinor replayed}}`;
const REVERSE_ENTRY = String.raw`mutation($entryId:ID!,$key:String!,$reason:String!,$approvalId:ID){reverseFolioEntry(entryId:$entryId,postingKey:$key,reason:$reason,approvalId:$approvalId){folioId entryId balanceMinor replayed}}`;
const RESOLVE_OVERDUE = String.raw`mutation($bookingId:ID!,$key:String!,$reason:String!,$approvalId:ID){resolveOverdueCheckedInBooking(bookingId:$bookingId,idempotencyKey:$key,reason:$reason,approvalId:$approvalId){bookingId folioId status folioStatus writtenOffMinor replayed}}`;

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
  idempotencyKey: string; bookingId: string; amountMinor: number; method: string; description: string;
}) {
  const response = await keystoneClient<any>(RECORD_PAYMENT, {
    bookingId: boundedId(input.bookingId, 'Booking ID'),
    key: `operator:payment:${boundedText(input.idempotencyKey, 'Attempt key', 100, true)}`,
    amount: boundedInteger(input.amountMinor, 'Amount', { min: 1 }),
    method: boundedEnum(input.method, 'Payment method', ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check'] as const),
    description: boundedText(input.description, 'Description', 500, true),
  });
  return requireActionData(response).recordBookingPayment;
}

export async function postFolioEntryAction(input: {
  approvalId?: string; idempotencyKey: string; bookingId: string; amountMinor: number; direction: string; description: string;
}) {
  const direction = boundedEnum(input.direction, 'Direction', ['debit', 'credit'] as const);
  const response = await keystoneClient<any>(POST_ENTRY, {
    bookingId: boundedId(input.bookingId, 'Booking ID'),
    key: `operator:entry:${boundedText(input.idempotencyKey, 'Attempt key', 100, true)}`,
    amount: boundedInteger(input.amountMinor, 'Amount', { min: 1 }),
    type: direction === 'debit' ? 'addon' : 'adjustment',
    direction,
    approvalId: input.approvalId?.trim() ? boundedId(input.approvalId, 'Approval ID') : null,
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

export async function reverseFolioEntryAction(entryId: string, reason: string, idempotencyKey: string, approvalId?: string) {
  try {
    const response = await keystoneClient<any>(REVERSE_ENTRY, {
      entryId: boundedId(entryId, 'Entry ID'),
      key: `operator:reverse:${boundedText(idempotencyKey, 'Attempt key', 100, true)}`,
      reason: boundedText(reason, 'Reason', 500, true),
    approvalId: approvalId?.trim() ? boundedId(approvalId, 'Approval ID') : null,
    });
    return { ok: true as const, data: requireActionData(response).reverseFolioEntry };
  } catch {
    return {
      ok: false as const,
      message: 'The entry was not reversed. Refresh the folio; it may already have a compensating entry.',
    };
  }
}

export async function resolveOverdueStayAction(bookingId: string, reason: string, idempotencyKey: string, approvalId?: string) {
  const response = await keystoneClient<any>(RESOLVE_OVERDUE, {
    bookingId: boundedId(bookingId, 'Booking ID'),
    key: `operator:overdue:${boundedText(idempotencyKey, 'Attempt key', 100, true)}`,
    reason: boundedText(reason, 'Reason', 500, true),
    approvalId: approvalId?.trim() ? boundedId(approvalId, 'Approval ID') : null,
  });
  return requireActionData(response).resolveOverdueCheckedInBooking;
}
