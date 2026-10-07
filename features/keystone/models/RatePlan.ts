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
import { requiredRelationshipDb } from './requiredRelationship'

export const RatePlan = list({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
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
      db: requiredRelationshipDb,
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Room Type',
    }),

    // Integer minor units are authoritative; baseRate is legacy display compatibility.
    baseRateMinor: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: 'Base Rate (minor units)' }),
    currencyCode: text({ validation: { isRequired: true }, defaultValue: 'USD' }),
    baseRate: float({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: 'Legacy Base Rate',
      ui: { itemView: { fieldMode: 'read' }, description: 'Derived compatibility value; minor units are authoritative.' },
    }),

    bookings: relationship({ access: { create: () => false, update: () => false }, ref: 'Booking.ratePlan', many: true, ui: { displayMode: 'count' } }),

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
      access: { update: () => false },
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
      access: { update: () => false },
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
  hooks: {
    resolveInput: ({ resolvedData }) => ({
      ...resolvedData,
      ...(Number.isSafeInteger(resolvedData.baseRateMinor) ? { baseRate: resolvedData.baseRateMinor / 100 } : {}),
    }),
    validateInput: ({ resolvedData, item, addValidationError }) => {
      if (!item && resolvedData.status === 'active') addValidationError('Create a draft, then publish it through the approved rate lifecycle.');
      const economic = ['baseRateMinor', 'roomType', 'currencyCode', 'seasonalAdjustments', 'minimumStay', 'maximumStay', 'advanceBookingMin', 'advanceBookingMax', 'cancellationPolicy', 'mealPlan', 'validFrom', 'validTo', 'applicableDays', 'isPromotional', 'promoCode'];
      if (item?.status === 'active' && economic.some(field => resolvedData[field] !== undefined && JSON.stringify(resolvedData[field]) !== JSON.stringify(item[field]))) addValidationError('Unpublish the rate through the approved lifecycle before editing its economics, then publish the reviewed terms.');
      const promotional = resolvedData.isPromotional ?? item?.isPromotional ?? false;
      const promoCode = String(resolvedData.promoCode ?? item?.promoCode ?? '').trim();
      const currencyCode = String(resolvedData.currencyCode ?? item?.currencyCode ?? 'USD').trim().toUpperCase();
      const minimumStay = Number(resolvedData.minimumStay ?? item?.minimumStay ?? 1);
      const maximumStay = resolvedData.maximumStay ?? item?.maximumStay;
      if (currencyCode !== 'USD') {
        addValidationError('The bounded initial release supports USD rate plans only.');
      }
      if (promotional && !promoCode) {
        addValidationError('Promotional rate plans require a promo code. Public packages without a code should not be marked promotional.');
      }
      if (maximumStay !== null && maximumStay !== undefined && Number(maximumStay) < minimumStay) {
        addValidationError('Maximum stay cannot be shorter than minimum stay.');
      }
      const validFrom = resolvedData.validFrom ?? item?.validFrom;
      const validTo = resolvedData.validTo ?? item?.validTo;
      if (validFrom && validTo && new Date(validTo) < new Date(validFrom)) {
        addValidationError('Rate-plan validity end cannot precede its start.');
      }
    },
  },
})
