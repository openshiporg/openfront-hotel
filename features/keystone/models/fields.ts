import { checkbox } from "@keystone-6/core/fields"

export const permissionFields = {
  canAccessDashboard: checkbox({
    defaultValue: false,
    label: "User can access the dashboard"
  }),
  canManageRooms: checkbox({
    defaultValue: false,
    label: "User can manage rooms and room types"
  }),
  canManageBookings: checkbox({
    defaultValue: false,
    label: "User can create and manage bookings"
  }),
  canManageHousekeeping: checkbox({
    defaultValue: false,
    label: "User can manage housekeeping tasks"
  }),
  canManageGuests: checkbox({
    defaultValue: false,
    label: "User can manage guest information"
  }),
  canManagePayments: checkbox({
    defaultValue: false,
    label: "User can process payments and refunds"
  }),
  canSeeOtherPeople: checkbox({
    defaultValue: false,
    label: "User can see other users"
  }),
  canEditOtherPeople: checkbox({
    defaultValue: false,
    label: "User can edit other users"
  }),
  canManagePeople: checkbox({
    defaultValue: false,
    label: "User can create and delete users"
  }),
  canManageRoles: checkbox({
    defaultValue: false,
    label: "User can CRUD roles"
  }),
  canManageOnboarding: checkbox({
    defaultValue: false,
    label: "User can access onboarding and hotel setup"
  }),
}

export const permissionsList = Object.keys(permissionFields)
