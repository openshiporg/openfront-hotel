import { gql } from 'graphql-request';

export const GET_BOOKING_PAYMENT_PROVIDERS = gql`
  query GetBookingPaymentProviders {
    bookingPaymentProviders {
      id
      name
      code
      metadata
    }
  }
`;

export const INITIATE_BOOKING_PAYMENT_SESSION = gql`
  mutation InitiateBookingPaymentSession(
    $bookingId: ID!
    $paymentProviderCode: String!
    $amount: Float
    $currency: String
    $returnUrl: String
    $cancelUrl: String
  ) {
    initiateBookingPaymentSession(
      bookingId: $bookingId
      paymentProviderCode: $paymentProviderCode
      amount: $amount
      currency: $currency
      returnUrl: $returnUrl
      cancelUrl: $cancelUrl
    ) {
      id
      amount
      isSelected
      isInitiated
      data
      paymentProvider {
        id
        name
        code
        metadata
      }
    }
  }
`;

export const GET_ACTIVE_BOOKING_PAYMENT_SESSION = gql`
  query GetActiveBookingPaymentSession($bookingId: ID!) {
    activeBookingPaymentSession(bookingId: $bookingId) {
      id
      isSelected
      isInitiated
      paymentProvider {
        id
        code
        name
      }
    }
  }
`;

export const COMPLETE_BOOKING_PAYMENT = gql`
  mutation CompleteBookingPayment(
    $bookingId: ID!
    $paymentSessionId: ID!
    $providerPaymentId: String
  ) {
    completeBookingPayment(
      bookingId: $bookingId
      paymentSessionId: $paymentSessionId
      providerPaymentId: $providerPaymentId
    ) {
      id
      status
      amount
      providerPaymentId
      stripePaymentIntentId
      paymentProvider {
        id
        name
        code
      }
    }
  }
`;

// Query to get all room types with their details
export const GET_ROOM_TYPES = gql`
  query GetRoomTypes {
    roomTypes {
      id
      name
      description
      baseRate
      maxOccupancy
      bedConfiguration
      amenities
      squareFeet
      roomsCount
    }
  }
`;

// Query to get available rooms for a date range
export const GET_AVAILABLE_ROOMS = gql`
  query GetAvailableRooms($checkInDate: DateTime!, $checkOutDate: DateTime!) {
    roomTypes {
      id
      name
      description
      baseRate
      maxOccupancy
      bedConfiguration
      amenities
      squareFeet
      rooms(where: {
        status: { equals: "vacant" }
      }) {
        id
        roomNumber
        status
      }
    }
    bookings(where: {
      OR: [
        {
          AND: [
            { checkInDate: { lte: $checkOutDate } },
            { checkOutDate: { gte: $checkInDate } }
          ]
        }
      ],
      status: {
        notIn: ["cancelled", "no_show"]
      }
    }) {
      id
      checkInDate
      checkOutDate
      roomAssignments {
        id
        room {
          id
        }
        roomType {
          id
        }
      }
    }
  }
`;

// Query to get a single room type with full details
export const GET_ROOM_TYPE = gql`
  query GetRoomType($id: ID!) {
    roomType(where: { id: $id }) {
      id
      name
      description
      baseRate
      maxOccupancy
      bedConfiguration
      amenities
      squareFeet
      rooms {
        id
        roomNumber
        floor
        status
      }
      ratePlans(where: { status: { equals: "active" } }) {
        id
        name
        description
        baseRate
        minimumStay
        cancellationPolicy
        mealPlan
      }
    }
  }
`;

// Query to get active rate plans
export const GET_RATE_PLANS = gql`
  query GetRatePlans {
    ratePlans(where: { status: { equals: "active" }, isPublic: { equals: true } }) {
      id
      name
      description
      baseRate
      minimumStay
      cancellationPolicy
      mealPlan
      roomType {
        id
        name
      }
    }
  }
`;

// Mutation to create a storefront booking placeholder before payment completion
export const CREATE_STOREFRONT_BOOKING = gql`
  mutation CreateStorefrontBooking($data: BookingCreateInput!) {
    createStorefrontBooking(data: $data) {
      id
      confirmationNumber
      guestName
      guestEmail
      guestPhone
      checkInDate
      checkOutDate
      numberOfGuests
      totalAmount
      balanceDue
      status
      paymentStatus
      createdAt
    }
  }
`;

export const CANCEL_BOOKING = gql`
  mutation CancelBooking($bookingId: ID!, $refundAmount: Float, $refundReason: String) {
    cancelBooking(bookingId: $bookingId, refundAmount: $refundAmount, refundReason: $refundReason) {
      id
      status
      paymentStatus
      cancelledAt
    }
  }
`;

// Query to get booking by confirmation number
export const GET_BOOKING_BY_CONFIRMATION = gql`
  query GetBookingByConfirmation($confirmationNumber: String!) {
    bookings(where: { confirmationNumber: { equals: $confirmationNumber } }) {
      id
      confirmationNumber
      guestName
      guestEmail
      guestPhone
      checkInDate
      checkOutDate
      numberOfNights
      numberOfGuests
      numberOfAdults
      numberOfChildren
      roomRate
      taxAmount
      feesAmount
      totalAmount
      depositAmount
      balanceDue
      status
      paymentStatus
      specialRequests
      roomAssignments {
        id
        roomType {
          id
          name
        }
        room {
          id
          roomNumber
        }
        ratePerNight
        guestName
      }
      createdAt
      confirmedAt
    }
  }
`;

// Query to get bookings by email
export const GET_BOOKINGS_BY_EMAIL = gql`
  query GetBookingsByEmail($email: String!) {
    bookings(where: { guestEmail: { equals: $email } }, orderBy: { createdAt: desc }) {
      id
      confirmationNumber
      guestName
      checkInDate
      checkOutDate
      numberOfNights
      totalAmount
      status
      createdAt
    }
  }
`;
