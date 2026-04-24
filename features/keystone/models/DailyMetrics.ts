import { list, graphql } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  timestamp,
  integer,
  float,
  json,
  virtual,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const DailyMetrics = list({
  graphql: {
    plural: 'DailyMetricsRecords',
  },
  access: {
    operation: {
      query: permissions.canManageBookings,
      create: permissions.canManageBookings,
      update: permissions.canManageBookings,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['date', 'occupancyRate', 'totalRevenue', 'averageDailyRate', 'revenuePerAvailableRoom'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Date for these metrics
    date: timestamp({
      validation: { isRequired: true },
      isIndexed: 'unique',
      label: 'Date',
      ui: {
        description: 'Date for this metrics snapshot',
      },
    }),

    // Room inventory metrics
    totalRooms: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: 'Total Rooms',
      ui: {
        description: 'Total number of available rooms',
      },
    }),

    occupiedRooms: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      label: 'Occupied Rooms',
      ui: {
        description: 'Number of rooms occupied',
      },
    }),

    // Occupancy rate (percentage)
    occupancyRate: float({
      validation: { min: 0, max: 100 },
      defaultValue: 0,
      label: 'Occupancy Rate (%)',
      ui: {
        description: 'Percentage of rooms occupied',
      },
    }),

    // ADR - Average Daily Rate (in cents)
    averageDailyRate: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'ADR (cents)',
      ui: {
        description: 'Average Daily Rate in cents',
      },
    }),

    // RevPAR - Revenue Per Available Room (in cents)
    revenuePerAvailableRoom: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'RevPAR (cents)',
      ui: {
        description: 'Revenue Per Available Room in cents',
      },
    }),

    // Total revenue (in cents)
    totalRevenue: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Total Revenue (cents)',
      ui: {
        description: 'Total revenue for the day in cents',
      },
    }),

    // Revenue by channel
    channelRevenue: json({
      label: 'Channel Revenue',
      ui: {
        description: 'Revenue breakdown by channel (e.g., { "booking_com": 50000, "direct": 30000 })',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: {},
    }),

    // Booking activity metrics
    newReservations: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'New Reservations',
      ui: {
        description: 'Number of new reservations created',
      },
    }),

    cancellations: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Cancellations',
      ui: {
        description: 'Number of reservations cancelled',
      },
    }),

    checkIns: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Check-Ins',
      ui: {
        description: 'Number of guest check-ins',
      },
    }),

    checkOuts: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Check-Outs',
      ui: {
        description: 'Number of guest check-outs',
      },
    }),

    // Virtual field for formatted ADR
    formattedADR: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item: any) {
          const adr = item.averageDailyRate || 0
          return `$${(adr / 100).toFixed(2)}`
        },
      }),
      ui: {
        description: 'Formatted Average Daily Rate',
      },
    }),

    // Virtual field for formatted RevPAR
    formattedRevPAR: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item: any) {
          const revpar = item.revenuePerAvailableRoom || 0
          return `$${(revpar / 100).toFixed(2)}`
        },
      }),
      ui: {
        description: 'Formatted Revenue Per Available Room',
      },
    }),

    // Virtual field for formatted total revenue
    formattedRevenue: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item: any) {
          const revenue = item.totalRevenue || 0
          return `$${(revenue / 100).toFixed(2)}`
        },
      }),
      ui: {
        description: 'Formatted Total Revenue',
      },
    }),
    ...trackingFields,
  },
})
