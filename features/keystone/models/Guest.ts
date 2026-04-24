import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import {
  text,
  select,
  checkbox,
  relationship,
  json,
  timestamp,
} from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const Guest = list({
  access: {
    operation: {
      query: permissions.canManageGuests,
      create: permissions.canManageGuests,
      update: permissions.canManageGuests,
      delete: permissions.canManageBookings,
    },
  },
  ui: {
    listView: {
      initialColumns: ['firstName', 'lastName', 'email', 'phone', 'loyaltyNumber'],
    },
    itemView: {
      defaultFieldMode: 'edit',
    },
    labelField: 'email',
  },
  fields: {
    // Basic info
    firstName: text({
      validation: { isRequired: true },
      label: 'First Name',
    }),
    lastName: text({
      validation: { isRequired: true },
      label: 'Last Name',
    }),
    email: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      label: 'Email',
      ui: {
        description: 'Primary contact email',
      },
    }),
    phone: text({
      label: 'Phone Number',
      ui: {
        description: 'Primary contact phone number',
      },
    }),

    // Guest preferences
    preferences: json({
      label: 'Guest Preferences',
      ui: {
        description: 'JSON object storing guest preferences (pillow type, floor preference, etc.)',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: {
        pillowType: 'standard',
        floorPreference: 'any',
        smokingPreference: 'non-smoking',
        bedType: 'any',
        earlyCheckIn: false,
        lateCheckOut: false,
        specialDiet: '',
        accessibility: [],
      },
    }),

    // Loyalty program
    loyaltyNumber: text({
      isIndexed: 'unique',
      label: 'Loyalty Number',
      ui: {
        description: 'Guest loyalty program number',
      },
    }),
    loyaltyTier: select({
      type: 'string',
      options: [
        { label: 'Bronze', value: 'bronze' },
        { label: 'Silver', value: 'silver' },
        { label: 'Gold', value: 'gold' },
        { label: 'Platinum', value: 'platinum' },
        { label: 'Diamond', value: 'diamond' },
      ],
      defaultValue: 'bronze',
      label: 'Loyalty Tier',
      ui: {
        description: 'Current loyalty program tier',
      },
    }),
    loyaltyPoints: text({
      label: 'Loyalty Points',
      ui: {
        description: 'Current accumulated loyalty points',
      },
    }),

    // Communication preferences
    communicationPreferences: json({
      label: 'Communication Preferences',
      ui: {
        description: 'How the guest prefers to be contacted',
        views: './features/keystone/models/fields',
        createView: { fieldMode: 'edit' },
        itemView: { fieldMode: 'edit' },
      },
      defaultValue: {
        emailMarketing: true,
        smsNotifications: false,
        phoneNotifications: false,
        preferredLanguage: 'en',
        newsletterSubscribed: false,
      },
    }),

    // Identity verification
    idType: select({
      type: 'string',
      options: [
        { label: 'Passport', value: 'passport' },
        { label: "Driver's License", value: 'drivers_license' },
        { label: 'National ID', value: 'national_id' },
        { label: 'Other', value: 'other' },
      ],
      label: 'ID Type',
      ui: {
        description: 'Type of identification on file',
      },
    }),
    idNumber: text({
      label: 'ID Number',
      ui: {
        description: 'Identification document number (encrypted)',
      },
    }),
    nationality: text({
      label: 'Nationality',
      ui: {
        description: 'Guest nationality/country',
      },
    }),

    // Address
    address1: text({
      label: 'Address Line 1',
    }),
    address2: text({
      label: 'Address Line 2',
    }),
    city: text({
      label: 'City',
    }),
    state: text({
      label: 'State/Province',
    }),
    postalCode: text({
      label: 'Postal Code',
    }),
    country: text({
      label: 'Country',
    }),

    // Company info (for business travelers)
    company: text({
      label: 'Company',
      ui: {
        description: 'Company name for business travelers',
      },
    }),

    // Notes and flags
    specialNotes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Special notes about this guest',
      },
      label: 'Special Notes',
    }),
    isVip: checkbox({
      defaultValue: false,
      label: 'VIP Guest',
      ui: {
        description: 'Mark as VIP for special treatment',
      },
    }),
    isBlacklisted: checkbox({
      defaultValue: false,
      label: 'Blacklisted',
      ui: {
        description: 'Guest is not allowed to book',
      },
    }),

    // Relationships
    bookings: relationship({
      ref: 'Booking.guestProfile',
      many: true,
      ui: {
        displayMode: 'count',
        description: 'All bookings made by this guest',
      },
      label: 'Bookings',
    }),

    // Linked user account (optional - for guests who create accounts)
    userAccount: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        labelField: 'email',
        description: 'Linked user account if guest has registered',
      },
      label: 'User Account',
    }),

    // Tracking
    lastStayAt: timestamp({
      label: 'Last Stay',
      ui: {
        description: 'Date of last completed stay',
        itemView: { fieldMode: 'read' },
      },
    }),
    totalStays: text({
      label: 'Total Stays',
      ui: {
        description: 'Number of completed stays',
        itemView: { fieldMode: 'read' },
      },
    }),
    totalSpent: text({
      label: 'Total Spent',
      ui: {
        description: 'Total amount spent across all stays',
        itemView: { fieldMode: 'read' },
      },
    }),

    ...trackingFields,
  },
})
