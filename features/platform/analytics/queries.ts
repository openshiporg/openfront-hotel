import { gql } from 'graphql-request';

export const GET_ANALYTICS_DATA = gql`
  query GetAnalyticsData {
    dailyMetrics(orderBy: { date: desc }, take: 30) {
      id
      date
      occupancyRate
      averageDailyRate
      revenuePerAvailableRoom
      totalRevenue
      newReservations
      checkIns
      checkOuts
      cancellations
    }
    roomTypes {
      id
      name
      rooms {
        id
        status
      }
    }
    bookings(where: { status: { equals: "confirmed" } }) {
      id
      source
      totalAmount
    }
  }
`;
