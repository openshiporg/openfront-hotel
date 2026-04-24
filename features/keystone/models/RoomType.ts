import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  float,
  integer,
  select,
  multiselect,
  relationship,
} from '@keystone-6/core/fields'
import { document } from '@keystone-6/fields-document'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const RoomType = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManageRooms,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'baseRate', 'maxOccupancy', 'bedConfiguration'],
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
      label: 'Room Type Name',
      ui: {
        description: 'e.g., King Suite, Double Queen, Standard Single',
      },
    }),
    description: document({
      formatting: true,
      links: true,
      dividers: true,
      layouts: [
        [1, 1],
        [1, 1, 1],
      ],
      label: 'Description',
      ui: {
        description: 'Detailed description of the room type',
      },
    }),

    // Pricing
    baseRate: float({
      validation: { isRequired: true, min: 0 },
      label: 'Base Rate',
      ui: {
        description: 'Nightly rate in default currency',
      },
    }),

    // Capacity
    maxOccupancy: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 2,
      label: 'Max Occupancy',
      ui: {
        description: 'Maximum number of guests',
      },
    }),

    // Bed configuration
    bedConfiguration: select({
      type: 'string',
      options: [
        { label: 'King', value: 'king' },
        { label: 'Queen', value: 'queen' },
        { label: 'Double Queen', value: 'double_queen' },
        { label: 'Twin', value: 'twin' },
        { label: 'Double Twin', value: 'double_twin' },
        { label: 'King + Sofa', value: 'king_sofa' },
        { label: 'Queen + Sofa', value: 'queen_sofa' },
        { label: 'Suite', value: 'suite' },
      ],
      label: 'Bed Configuration',
      ui: {
        description: 'Type of bed(s) in the room',
      },
    }),

    // Amenities
    amenities: multiselect({
      type: 'string',
      options: [
        { label: 'WiFi', value: 'wifi' },
        { label: 'TV', value: 'tv' },
        { label: 'Minibar', value: 'minibar' },
        { label: 'Balcony', value: 'balcony' },
        { label: 'Coffee Maker', value: 'coffee_maker' },
        { label: 'Safe', value: 'safe' },
        { label: 'Bathtub', value: 'bathtub' },
        { label: 'Shower', value: 'shower' },
        { label: 'Air Conditioning', value: 'ac' },
        { label: 'Heating', value: 'heating' },
        { label: 'Desk', value: 'desk' },
        { label: 'Iron', value: 'iron' },
        { label: 'Hair Dryer', value: 'hair_dryer' },
        { label: 'Room Service', value: 'room_service' },
        { label: 'Ocean View', value: 'ocean_view' },
        { label: 'City View', value: 'city_view' },
        { label: 'Garden View', value: 'garden_view' },
        { label: 'Kitchenette', value: 'kitchenette' },
        { label: 'Jacuzzi', value: 'jacuzzi' },
        { label: 'Fireplace', value: 'fireplace' },
      ],
      label: 'Amenities',
      ui: {
        description: 'Available room amenities',
      },
    }),

    // Size
    squareFeet: integer({
      validation: { min: 0 },
      label: 'Square Feet',
      ui: {
        description: 'Room size in square feet',
      },
    }),

    // Relationships
    rooms: relationship({
      ref: 'Room.roomType',
      many: true,
      ui: {
        displayMode: 'count',
      },
      label: 'Rooms',
    }),
    roomAssignments: relationship({
      ref: 'RoomAssignment.roomType',
      many: true,
      ui: {
        displayMode: 'count',
      },
      label: 'Room Assignments',
    }),
    ratePlans: relationship({
      ref: 'RatePlan.roomType',
      many: true,
      ui: {
        displayMode: 'count',
      },
      label: 'Rate Plans',
    }),
    ...trackingFields,
  },
})
