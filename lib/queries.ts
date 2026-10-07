import { gql } from 'graphql-request';

export const GET_BOOKING_PAYMENT_PROVIDERS = gql`
  query GetBookingPaymentProviders {
    bookingPaymentProviders {
      id
      name
      code
      displayName
      publicClientKey
    }
  }
`;

export const INITIATE_BOOKING_PAYMENT_SESSION = gql`
  mutation InitiateBookingPaymentSession(
    $bookingId: ID!
    $paymentProviderCode: String!
    $returnUrl: String
    $cancelUrl: String
  ) {
    initiateBookingPaymentSession(
      bookingId: $bookingId
      paymentProviderCode: $paymentProviderCode
      returnUrl: $returnUrl
      cancelUrl: $cancelUrl
    ) {
      id
      amount
      isSelected
      isInitiated
      clientSecret
      paymentIntentId
      orderId
      approveLink
      paymentProvider {
        id
        name
        code
        displayName
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
    roomTypes: storefrontRoomTypes {
      id
      name
      shortDescription
      eyebrow
      viewDescription
      thumbnail
      baseRate
      maxOccupancy
      bedConfiguration
      amenities
      squareFeet
      roomsCount
      ratePlans { id name description baseRate baseRateMinor currencyCode minimumStay cancellationPolicy mealPlan isPromotional }
      roomImages {
        id
        url
        imagePath
        altText
        caption
        order
        isPrimary
      }
    }
  }
`;

// Query to get available rooms for a date range
export const GET_AVAILABLE_ROOMS = gql`
  query GetAvailableRooms($checkInDate: DateTime!, $checkOutDate: DateTime!) {
    roomTypes: storefrontAvailability(checkInDate: $checkInDate, checkOutDate: $checkOutDate) {
      id
      name
      shortDescription
      eyebrow
      viewDescription
      thumbnail
      baseRate
      maxOccupancy
      bedConfiguration
      amenities
      squareFeet
      availableCount
      roomImages {
        id
        url
        imagePath
        altText
        caption
        order
        isPrimary
      }
    }
  }
`;

export const GET_STOREFRONT_QUOTE = gql`
  query GetStorefrontQuote(
    $roomTypeId: ID!
    $ratePlanId: ID!
    $checkInDate: DateTime!
    $checkOutDate: DateTime!
    $numberOfAdults: Int!
    $numberOfChildren: Int
    $promoCode: String
  ) {
    storefrontQuote(
      roomTypeId: $roomTypeId
      ratePlanId: $ratePlanId
      checkInDate: $checkInDate
      checkOutDate: $checkOutDate
      numberOfAdults: $numberOfAdults
      numberOfChildren: $numberOfChildren
      promoCode: $promoCode
    ) {
      roomTypeId roomTypeName ratePlanId ratePlanName cancellationPolicy mealPlan
      checkInDate checkOutDate nights numberOfGuests ratePerNight roomSubtotal taxAmount feesAmount totalAmount
      roomSubtotalMinor taxAmountMinor feesAmountMinor totalAmountMinor currencyCode pricingVersion depositPercent securityDepositMinor quoteToken
    }
  }
`;

// Query to get a single room type with full details
export const GET_ROOM_TYPE = gql`
  query GetRoomType($id: ID!) {
    roomType: storefrontRoomType(id: $id) {
      id
      name
      shortDescription
      eyebrow
      viewDescription
      thumbnail
      baseRate
      baseRateMinor
      maxOccupancy
      bedConfiguration
      amenities
      squareFeet
      roomImages {
        id
        url
        imagePath
        altText
        caption
        order
        isPrimary
      }
      ratePlans {
        id
        name
        description
        baseRate
        baseRateMinor
        currencyCode
        minimumStay
        cancellationPolicy
        mealPlan
        isPromotional
      }
    }
  }
`;

// Query to get active rate plans
export const GET_RATE_PLANS = gql`
  query GetRatePlans {
    roomTypes: storefrontRoomTypes {
      id
      name
      ratePlans {
        id
        name
        description
        baseRate
        minimumStay
        cancellationPolicy
        mealPlan
        isPromotional
      }
    }
  }
`;

// Mutation to create a storefront booking placeholder before payment completion
export const CREATE_STOREFRONT_BOOKING = gql`
  mutation CreateStorefrontBooking($data: StorefrontBookingCreateInput!) {
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
      bookedStayTerms
    }
  }
`;

export const CANCEL_BOOKING = gql`
  mutation CancelBooking($bookingId: ID!, $refundReason: String, $idempotencyKey: String!) {
    cancelBooking(bookingId: $bookingId, refundReason: $refundReason, idempotencyKey: $idempotencyKey) {
      id
      status
      paymentStatus
      cancelledAt
    }
  }
`;

export const VERIFY_GUEST_BOOKING = gql`
  mutation VerifyGuestBooking($confirmationNumber: String!, $email: String!) {
    booking: verifyGuestBooking(confirmationNumber: $confirmationNumber, email: $email) {
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
        roomNumber
        ratePerNight
        guestName
      }
      createdAt
      confirmedAt
    }
  }
`;

export const GET_GUEST_BOOKING = gql`
  query GetGuestBooking($bookingId: ID!) {
    booking: guestBooking(bookingId: $bookingId) {
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
      roomRateMinor
      taxAmountMinor
      feesAmountMinor
      totalAmountMinor
      balanceDueMinor
      currencyCode
      status
      paymentStatus
      refundPendingMinor
      bookedStayTerms
      specialRequests
      confirmationDeliveryStatus
      updateDeliveryStatus
      cancellationDeliveryStatus
      roomAssignments {
        id
        roomType {
          id
          name
          thumbnail
          roomImages {
            id
            url
            imagePath
            altText
            caption
            order
            isPrimary
          }
        }
        roomNumber
        ratePerNight
      }
      createdAt
      confirmedAt
      cancelledAt
    }
  }
`;

export const GET_BOOKINGS_BY_EMAIL = gql`
  query GetBookingsByEmail($email: String!) {
    bookings: guestBookings(email: $email) {
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
