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
import { requiredRelationshipDb } from './requiredRelationship'

export const SeasonalRate = list({
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
      db: requiredRelationshipDb,
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
  hooks: {
    // An active season changes the price of live rates. When the property requires approval
    // to publish rates, such a change is made while the room type's public rates are paused;
    // publishing them again needs an approval that covers the new seasons.
    beforeOperation: async ({ operation, item, resolvedData, context }) => {
      if (context.graphql.schema === context.sudo().graphql.schema) return;
      const settings = await context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { ratePublicationRequiresApproval: true } });
      if (settings?.ratePublicationRequiresApproval === false) return;
      const before: any = item || null;
      const after: any = operation === 'delete' ? null : { ...(before || {}), ...(resolvedData || {}) };
      const wasLive = Boolean(before?.isActive);
      const willBeLive = Boolean(after?.isActive);
      if (!wasLive && !willBeLive) return;
      const nextRoomTypeId = (resolvedData as any)?.roomType?.connect?.id ?? before?.roomTypeId;
      const roomTypeIds = [before?.roomTypeId, after ? nextRoomTypeId : null].filter(Boolean);
      const live = roomTypeIds.length
        ? await context.prisma.ratePlan.findFirst({ where: { roomTypeId: { in: roomTypeIds }, status: 'active', isPublic: true }, select: { name: true } })
        : null;
      if (live) {
        throw new Error(`An active season changes the price of the live rate "${live.name}". Pause that room type's public rates first; publishing them again needs approval.`);
      }
    },
  },
})
