'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedId, boundedText, requireActionData, toActionResult } from '@/features/platform/lib/actionResult';

const GUESTS = String.raw`
  query HotelGuests($search: String, $segment: String, $sort: String, $take: Int, $skip: Int) {
    hotelGuestOperations(propertyKey: "the-alder-house", search: $search, segment: $segment, sort: $sort, take: $take, skip: $skip) {
      total
      segmentCounts { all vip standard restricted }
      guests {
        id firstName lastName email phone loyaltyNumber loyaltyTier loyaltyPoints
        isVip isBlacklisted lastStayAt totalStays totalSpent createdAt
      }
    }
  }
`;

const GUEST_PROFILE = String.raw`
  query GetGuest($id: ID!) {
    guest(where: { id: $id }) {
      id firstName lastName email phone company address1 address2 city state postalCode country
      loyaltyNumber loyaltyTier loyaltyPoints preferences idType nationality isVip isBlacklisted
      specialNotes createdAt
      bookings(orderBy: { checkInDate: desc }, take: 100) {
        id confirmationNumber checkInDate checkOutDate status totalAmount specialRequests
        roomAssignments { roomType { name } }
      }
      lastCompletedStay: bookings(where: { status: { equals: "checked_out" } }, orderBy: { checkOutDate: desc }, take: 1) {
        checkOutDate
      }
    }
  }
`;

const GUEST_PAGE_SIZE = 50;
export type GuestListView = { search: string; segment: string; sort: string; page: number; pageSize?: number };
export type GuestListPage = { guests: any[]; total: number; pageSize: number; segmentCounts: { all: number; vip: number; standard: number; restricted: number } };

/** One page of guest profiles for the given search, segment and sort, with totals. */
export async function getGuestWorkspace(view: GuestListView): Promise<GuestListPage> {
  const search = view.search ? boundedText(view.search, 'Search', 160) : null;
  const page = Math.max(1, Math.trunc(view.page) || 1);
  const pageSize = Math.min(Math.max(Math.trunc(Number(view.pageSize)) || GUEST_PAGE_SIZE, 1), 100);
  const response = await keystoneClient<any>(GUESTS, {
    search: search || null,
    segment: ['vip', 'standard', 'restricted'].includes(view.segment) ? view.segment : null,
    sort: ['name', 'reservations'].includes(view.sort) ? view.sort : null,
    take: pageSize,
    skip: (page - 1) * pageSize,
  });
  const operations = requireActionData(response).hotelGuestOperations;
  return { guests: operations?.guests || [], total: operations?.total || 0, pageSize, segmentCounts: operations?.segmentCounts || { all: 0, vip: 0, standard: 0, restricted: 0 } };
}

export async function getGuestProfile(guestId: string) {
  const response = await keystoneClient<any>(GUEST_PROFILE, { id: boundedId(guestId, 'Guest ID') });
  const guest = requireActionData(response).guest;
  if (!guest) return null;
  const { lastCompletedStay, ...profile } = guest;
  return {
    ...profile,
    // Same definition as the guest list: the latest completed checkout.
    lastStayAt: lastCompletedStay?.[0]?.checkOutDate || null,
    bookings: (profile.bookings || []).map((booking: any) => {
      const { roomAssignments, ...projection } = booking;
      return { ...projection, roomType: roomAssignments?.[0]?.roomType?.name };
    }),
  };
}

const UPDATE_GUEST = String.raw`
  mutation UpdateGuestProfile($id: ID!, $data: GuestUpdateInput!) {
    updateGuest(where: { id: $id }, data: $data) { id }
  }
`;

const EDITABLE_GUEST_FIELDS = {
  firstName: 120, lastName: 120, email: 254, phone: 40, company: 200,
  address1: 200, address2: 200, city: 120, state: 120, postalCode: 32, country: 120, specialNotes: 4000,
} as const;
const GUEST_FIELD_LABELS: Record<keyof typeof EDITABLE_GUEST_FIELDS, string> = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', company: 'Company',
  address1: 'Address', address2: 'Address line 2', city: 'City', state: 'State or region', postalCode: 'Postal code', country: 'Country', specialNotes: 'Notes',
};

/** Staff edit of a guest's contact details and service notes. Governance-protected identity fields stay in Guest governance. */
export async function updateGuestProfileAction(guestId: string, input: Partial<Record<keyof typeof EDITABLE_GUEST_FIELDS, string>>) {
  return toActionResult(async () => {
    const data: Record<string, string> = {};
    for (const [field, max] of Object.entries(EDITABLE_GUEST_FIELDS) as Array<[keyof typeof EDITABLE_GUEST_FIELDS, number]>) {
      if (input[field] !== undefined) data[field] = boundedText(input[field], GUEST_FIELD_LABELS[field], max, field === 'firstName' || field === 'lastName' || field === 'email');
    }
    const response = await keystoneClient<any>(UPDATE_GUEST, { id: boundedId(guestId, 'Guest ID'), data });
    return requireActionData(response).updateGuest;
  }, 'The guest record was not saved. Refresh the profile and try again.');
}
