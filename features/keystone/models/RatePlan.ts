import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  float,
  integer,
  select,
  checkbox,
  timestamp,
  relationship,
  json,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const RatePlan = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageRooms,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'roomType', 'baseRate', 'status', 'minimumStay'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
  },
  fields: {
    // Basic information
    name: text({
      validation: { isRequired: true },
      isIndexed: 'unique',
      label: 'Rate Plan Name',
      ui: {
        description: 'e.g., Standard Rate, Weekend Special, Corporate Rate',
      },
    }),
    description: text({
      ui: {
        displayMode: 'textarea',
        description: 'Description of this rate plan',
      },
      label: 'Description',
    }),

    // Room type relationship
    roomType: relationship({
      ref: 'RoomType.ratePlans',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Base rate
    baseRate: float({
      validation: { isRequired: true, min: 0 },
      label: 'Base Rate',
      ui: {
        description: 'Base nightly rate for this plan',
      },
    }),

    // Seasonal adjustments stored as JSON
    seasonalAdjustments: json({
      label: 'Seasonal Adjustments',
      ui: {
        description: 'JSON object with seasonal rate adjustments (e.g., { "summer": 1.2, "winter": 0.9 })',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: {
        peak: 1.25,
        high: 1.15,
        regular: 1.0,
        low: 0.85,
      },
    }),

    // Stay requirements
    minimumStay: integer({
      validation: { min: 1 },
      defaultValue: 1,
      label: 'Minimum Stay',
      ui: {
        description: 'Minimum number of nights required',
      },
    }),
    maximumStay: integer({
      validation: { min: 1 },
      label: 'Maximum Stay',
      ui: {
        description: 'Maximum number of nights allowed (leave empty for no limit)',
      },
    }),

    // Booking window
    advanceBookingMin: integer({
      validation: { min: 0 },
      defaultValue: 0,
      label: 'Advance Booking Minimum (days)',
      ui: {
        description: 'Minimum days in advance required to book',
      },
    }),
    advanceBookingMax: integer({
      validation: { min: 0 },
      label: 'Advance Booking Maximum (days)',
      ui: {
        description: 'Maximum days in advance allowed to book',
      },
    }),

    // Cancellation policy
    cancellationPolicy: select({
      type: 'string',
      options: [
        { label: 'Flexible', value: 'flexible' },
        { label: 'Moderate', value: 'moderate' },
        { label: 'Strict', value: 'strict' },
        { label: 'Non-refundable', value: 'non_refundable' },
      ],
      defaultValue: 'moderate',
      label: 'Cancellation Policy',
      ui: {
        description: 'Cancellation policy for this rate',
      },
    }),

    // Meal plan
    mealPlan: select({
      type: 'string',
      options: [
        { label: 'Room Only', value: 'room_only' },
        { label: 'Breakfast Included', value: 'breakfast' },
        { label: 'Half Board', value: 'half_board' },
        { label: 'Full Board', value: 'full_board' },
        { label: 'All Inclusive', value: 'all_inclusive' },
      ],
      defaultValue: 'room_only',
      label: 'Meal Plan',
      ui: {
        description: 'Included meal plan',
      },
    }),

    // Validity period
    validFrom: timestamp({
      label: 'Valid From',
      ui: {
        description: 'Start date for this rate plan',
      },
    }),
    validTo: timestamp({
      label: 'Valid To',
      ui: {
        description: 'End date for this rate plan',
      },
    }),

    // Day restrictions
    applicableDays: json({
      label: 'Applicable Days',
      ui: {
        description: 'Days of week when this rate applies',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: true,
      },
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Draft', value: 'draft' },
      ],
      defaultValue: 'draft',
      label: 'Status',
      ui: {
        description: 'Rate plan status',
      },
    }),

    // Flags
    isPublic: checkbox({
      defaultValue: true,
      label: 'Public Rate',
      ui: {
        description: 'Available to all guests',
      },
    }),
    isPromotional: checkbox({
      defaultValue: false,
      label: 'Promotional Rate',
      ui: {
        description: 'Mark as promotional/special offer',
      },
    }),

    // Promo code
    promoCode: text({
      label: 'Promo Code',
      ui: {
        description: 'Required promo code to access this rate (if applicable)',
      },
    }),

    // Priority for rate selection
    priority: integer({
      defaultValue: 0,
      label: 'Priority',
      ui: {
        description: 'Higher priority rates are shown first (0 = default)',
      },
    }),

    ...trackingFields,
  },
})
