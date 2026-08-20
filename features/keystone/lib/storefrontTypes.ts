export type StorefrontRoomImage = {
  id: string;
  image?: { url?: string | null } | null;
  imagePath?: string | null;
  altText?: string | null;
  caption?: string | null;
  order?: number | null;
  isPrimary?: boolean | null;
};

export type StorefrontRatePlan = {
  id: string;
  name: string;
  description?: string | null;
  baseRate: number;
  minimumStay?: number | null;
  cancellationPolicy?: string | null;
  mealPlan?: string | null;
};

export type StorefrontRoomType = {
  id: string;
  name: string;
  shortDescription?: string | null;
  eyebrow?: string | null;
  viewDescription?: string | null;
  thumbnail?: string | null;
  baseRate: number;
  maxOccupancy: number;
  bedConfiguration?: string | null;
  amenities: string[];
  squareFeet?: number | null;
  roomsCount?: number | null;
  availableCount?: number | null;
  roomImages: StorefrontRoomImage[];
  ratePlans?: StorefrontRatePlan[];
};

export type StorefrontRoomAssignment = {
  id: string;
  ratePerNight?: number | null;
  guestName?: string | null;
  roomType?: StorefrontRoomType | null;
  room?: { roomNumber?: string | null } | null;
};

export type GuestBookingRecord = {
  id: string;
  confirmationNumber?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  numberOfNights?: number | null;
  numberOfGuests?: number | null;
  numberOfAdults?: number | null;
  numberOfChildren?: number | null;
  roomRate?: number | null;
  taxAmount?: number | null;
  feesAmount?: number | null;
  totalAmount?: number | null;
  depositAmount?: number | null;
  balanceDue?: number | null;
  status?: string | null;
  paymentStatus?: string | null;
  specialRequests?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  roomAssignments: StorefrontRoomAssignment[];
};
