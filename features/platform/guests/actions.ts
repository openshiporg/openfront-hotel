'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { boundedId, boundedText, requireActionData } from '@/features/platform/lib/actionResult';

const GUESTS = String.raw`
  query HotelGuests($search: String) {
    hotelGuestOperations(propertyKey: "the-alder-house", search: $search) {
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
    }
  }
`;

export async function getGuestWorkspace(search?: string | null) {
  const normalized = search ? boundedText(search, 'Search', 160) : null;
  const response = await keystoneClient<any>(GUESTS, { search: normalized || null });
  return requireActionData(response).hotelGuestOperations?.guests || [];
}

export async function getGuestProfile(guestId: string) {
  const response = await keystoneClient<any>(GUEST_PROFILE, { id: boundedId(guestId, 'Guest ID') });
  const guest = requireActionData(response).guest;
  if (!guest) return null;
  return {
    ...guest,
    bookings: (guest.bookings || []).map((booking: any) => {
      const { roomAssignments, ...projection } = booking;
      return { ...projection, roomType: roomAssignments?.[0]?.roomType?.name };
    }),
  };
}
