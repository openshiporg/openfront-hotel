export const GET_ANALYTICS_DATA = String.raw`
  query GetOperationalReport($start: DateTime!, $end: DateTime!) {
    hotelAnalyticsOperations(propertyKey: "the-alder-house", start: $start, end: $end) {
      summary {
        start end businessDate currencyCode availableRoomNights occupiedRoomNights occupancyRate
        roomRevenueMinor taxMinor feeMinor totalRevenueMinor adrMinor revparMinor
        arrivals departures newReservations cancellations noShows paymentsMinor refundsMinor
        openFolioBalanceMinor openFolioCount
      }
      days {
        date availableRoomNights occupiedRoomNights occupancyRate
        roomRevenueMinor taxMinor feeMinor totalRevenueMinor adrMinor revparMinor
        arrivals departures newReservations cancellations noShows paymentsMinor refundsMinor
      }
      channels { source bookings revenueMinor }
      roomTypes { id name availableRoomNights occupiedRoomNights occupancyRate roomRevenueMinor adrMinor }
    }
  }
`;
