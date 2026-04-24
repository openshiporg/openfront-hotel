import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  integer,
  float,
  timestamp,
  checkbox,
  relationship,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const SeasonalRate = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageRooms,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'startDate', 'endDate', 'roomType', 'priceMultiplier', 'priority', 'isActive'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Name for this seasonal rate period
    name: text({
      validation: { isRequired: true },
      label: 'Name',
      ui: {
        description: 'e.g., Christmas Week, New Years, Summer Festival',
      },
    }),

    // Date range
    startDate: timestamp({
      validation: { isRequired: true },
      label: 'Start Date',
      ui: {
        description: 'First date this rate applies',
      },
    }),

    endDate: timestamp({
      validation: { isRequired: true },
      label: 'End Date',
      ui: {
        description: 'Last date this rate applies',
      },
    }),

    // Optional room type filter (null = applies to all room types)
    roomType: relationship({
      ref: 'RoomType',
      ui: {
        displayMode: 'select',
        labelField: 'name',
        description: 'Leave empty to apply to all room types',
      },
      label: 'Room Type',
    }),

    // Price adjustment options (use one or the other)
    priceAdjustment: integer({
      label: 'Price Adjustment (cents)',
      ui: {
        description: 'Fixed amount to add/subtract from base price (can be positive or negative)',
      },
    }),

    priceMultiplier: float({
      validation: { min: 0 },
      label: 'Price Multiplier',
      ui: {
        description: 'Multiply base price by this factor (e.g., 1.25 for 25% increase, 0.85 for 15% discount)',
      },
    }),

    // Minimum stay requirement for this period
    minimumStay: integer({
      validation: { min: 1 },
      defaultValue: 1,
      label: 'Minimum Stay',
      ui: {
        description: 'Minimum number of nights required during this period',
      },
    }),

    // Priority for handling overlapping seasonal rates
    priority: integer({
      validation: { isRequired: true },
      defaultValue: 0,
      label: 'Priority',
      ui: {
        description: 'Higher priority wins when multiple seasonal rates overlap (0 = default)',
      },
    }),

    // Active status
    isActive: checkbox({
      defaultValue: true,
      label: 'Active',
      ui: {
        description: 'Whether this seasonal rate is currently active',
      },
    }),

    ...trackingFields,
  },
})
