import 'server-only';

import { storefrontServerGraphql } from './storefront-server-graphql';
import type { GuestAccount, GuestAccountBooking, GuestAccountStatus } from './guest-account-types';

const STATUS = `query GuestAccountStatus { guestAccountStatus { account { id name email phone } passwordResetAvailable } }`;
export const GUEST_STAYS_PAGE_SIZE = 50;
const BOOKINGS = `query GuestAccountBookings($take: Int, $skip: Int) {
  guestAccountBookingsCount
  guestAccountBookings(take: $take, skip: $skip) {
    id confirmationNumber checkInDate checkOutDate numberOfNights numberOfGuests status paymentStatus
    totalAmountMinor balanceDueMinor currencyCode
    roomAssignments { id roomType { id name } roomNumber }
  }
}`;

/** The signed-in guest account, or a signed-out status when there is none or it can't be read. */
export async function getGuestAccountStatus(): Promise<GuestAccountStatus> {
  try {
    const result = await storefrontServerGraphql<{ guestAccountStatus: GuestAccountStatus }>(STATUS);
    if (result.ok && result.data) return result.data.guestAccountStatus;
  } catch {
    // Treat an unreadable session as signed out; protected data is still enforced server-side.
  }
  return { account: null, passwordResetAvailable: false };
}

export type GuestAccountStaysPage = { bookings: GuestAccountBooking[]; total: number };

/** One page of the signed-in guest's stays, newest first, with the total for "load more". */
export async function getGuestAccountBookings(skip = 0): Promise<GuestAccountStaysPage | null> {
  try {
    const result = await storefrontServerGraphql<{ guestAccountBookings: GuestAccountBooking[]; guestAccountBookingsCount: number }>(
      BOOKINGS, { take: GUEST_STAYS_PAGE_SIZE, skip: Math.max(0, Math.trunc(skip) || 0) },
    );
    return result.ok && result.data
      ? { bookings: result.data.guestAccountBookings, total: result.data.guestAccountBookingsCount }
      : null;
  } catch {
    return null;
  }
}

export type { GuestAccount, GuestAccountBooking, GuestAccountStatus };
