import { checkbox } from "@keystone-6/core/fields"

export const permissionFields = {
  canManageGuestPrivacy: checkbox({ defaultValue: false, label: "User can manage guest privacy requests and identity evidence" }),
  canApproveHotelExceptions: checkbox({ defaultValue: false, label: "User can independently approve hotel financial and revenue exceptions" }),
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
  canManageAudit: checkbox({
    defaultValue: false,
    label: "User can review immutable audit and delivery evidence"
  }),
  canManageIntegrations: checkbox({
    defaultValue: false,
    label: "User can manage integrations, outbox replay, and channel delivery"
  }),
}

export const permissionsList = Object.keys(permissionFields)
