export interface RoomImage {
  id: string;
  image?: { url?: string | null } | null;
  url?: string | null;
  imagePath?: string | null;
  altText?: string | null;
  caption?: string | null;
  order?: number | null;
  isPrimary?: boolean | null;
}

export interface RoomType {
  id: string;
  name: string;
  shortDescription?: string | null;
  eyebrow?: string | null;
  viewDescription?: string | null;
  thumbnail?: string | null;
  baseRate: number;
  baseRateMinor?: number;
  maxOccupancy: number;
  bedConfiguration: string | null;
  amenities: string[];
  squareFeet: number | null;
  roomsCount: number;
  roomImages?: RoomImage[];
  rooms?: Room[];
  ratePlans?: RatePlan[];
}

export interface RatePlan {
  id: string;
  name: string;
  description: string | null;
  baseRate: number;
  baseRateMinor?: number;
  currencyCode?: string;
  minimumStay: number;
  cancellationPolicy: string;
  mealPlan: string;
  isPromotional?: boolean;
}

export interface Room {
  id: string;
  roomNumber: string;
  roomType: RoomType;
  floor: number | null;
  status: string | null;
}

export interface Booking {
  id: string;
  confirmationNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: number;
  numberOfGuests: number;
  numberOfAdults: number | null;
  numberOfChildren: number | null;
  roomRate: number | null;
  taxAmount: number | null;
  feesAmount: number | null;
  totalAmount: number | null;
  depositAmount: number | null;
  balanceDue: number | null;
  status: string | null;
  paymentStatus: string | null;
  source: string | null;
  specialRequests: string;
  roomAssignments: RoomAssignment[];
  createdAt: string | null;
  confirmedAt: string | null;
}

export interface RoomAssignment {
  id: string;
  roomType: RoomType;
  room: Room | null;
  ratePerNight: number | null;
  guestName: string;
  specialRequests: string;
}

export interface SearchParams {
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
}

export interface AvailableRoom {
  roomType: RoomType;
  availableCount: number;
  totalNights: number;
  totalPrice: number;
}
