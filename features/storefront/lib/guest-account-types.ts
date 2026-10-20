export type GuestAccount = { id: string; name: string; email: string; phone?: string | null };
export type GuestAccountStatus = { account: GuestAccount | null; passwordResetAvailable: boolean };
export type GuestAccountBooking = {
  id: string; confirmationNumber: string; checkInDate: string; checkOutDate: string; numberOfNights: number; numberOfGuests: number;
  status: string; paymentStatus?: string | null; totalAmountMinor?: number | null; balanceDueMinor?: number | null; currencyCode?: string | null;
  roomAssignments?: Array<{ id: string; roomType?: { id: string; name: string } | null; roomNumber?: string | null }>;
};
