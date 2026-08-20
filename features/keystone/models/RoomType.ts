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
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
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
    shortDescription: text({
      label: 'Short storefront description',
      ui: {
        displayMode: 'textarea',
        description: 'Concise editorial copy for room cards and booking summaries.',
      },
    }),
    eyebrow: text({
      label: 'Storefront eyebrow',
      ui: {
        description: 'Small editorial label such as Heritage Suite or Courtyard Calm.',
      },
    }),
    viewDescription: text({
      label: 'View / setting description',
      ui: {
        description: 'Short context such as courtyard-facing, skyline view, or garden terrace.',
      },
    }),
    thumbnail: text({
      ui: {
        description: 'Optional storefront thumbnail override. If blank, the storefront uses the first room image.',
      },
    }),

    // Pricing
    baseRateMinor: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0, label: 'Base Rate (minor units)' }),
    currencyCode: text({ validation: { isRequired: true }, defaultValue: 'USD' }),
    baseRate: float({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: 'Legacy Base Rate',
      ui: { itemView: { fieldMode: 'read' }, description: 'Derived compatibility value; minor units are authoritative.' },
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
        { label: 'Rain shower', value: 'rain_shower' },
        { label: 'Premium linens', value: 'premium_linens' },
        { label: 'Blackout drapes', value: 'blackout_drapes' },
        { label: 'Sitting area', value: 'sitting_area' },
        { label: 'Breakfast available', value: 'breakfast_available' },
        { label: 'Accessible', value: 'accessible' },
        { label: 'Courtyard view', value: 'courtyard_view' },
        { label: 'Heritage details', value: 'heritage_details' },
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
    roomImages: relationship({
      ref: 'RoomImage.roomType',
      many: true,
      ui: {
        displayMode: 'cards',
        cardFields: ['image', 'imagePath', 'altText', 'caption', 'order', 'isPrimary'],
        inlineCreate: { fields: ['image', 'imagePath', 'altText', 'caption', 'order', 'isPrimary'] },
        inlineEdit: { fields: ['image', 'imagePath', 'altText', 'caption', 'order', 'isPrimary'] },
        inlineConnect: true,
        removeMode: 'disconnect',
        linkToItem: false,
      },
      label: 'Storefront images',
    }),
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
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      ...(typeof resolvedData.name === 'string' ? { name: resolvedData.name.trim() } : {}),
      ...(Number.isSafeInteger(resolvedData.baseRateMinor) ? { baseRate: resolvedData.baseRateMinor / 100 } : {}),
    }),
    beforeOperation: async ({ operation, item, context }) => {
      if (operation !== 'delete' || !item?.id) return;
      const roomTypeId = String(item.id);
      const [rooms, assignments, rates, inventory, channelReservations] = await Promise.all([
        context.prisma.room.count({ where: { roomTypeId } }),
        context.prisma.roomAssignment.count({ where: { roomTypeId } }),
        context.prisma.ratePlan.count({ where: { roomTypeId } }),
        context.prisma.roomInventory.count({ where: { roomTypeId } }),
        context.prisma.channelReservation.count({ where: { roomTypeId } }),
      ]);
      if (rooms || assignments || rates || inventory || channelReservations) {
        throw new Error('Room type has operational history and cannot be deleted.');
      }
    },
  },
})
