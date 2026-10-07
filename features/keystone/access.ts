export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    isActive: boolean
    authVersion: number
    role: {
      id: string
      name: string
      canAccessDashboard: boolean
      canManageRooms: boolean
      canManageBookings: boolean
      canManageHousekeeping: boolean
      canManageGuests: boolean
      canManagePayments: boolean
      canSeeOtherPeople: boolean
      canEditOtherPeople: boolean
      canManagePeople: boolean
      canManageRoles: boolean
      canManageOnboarding: boolean
      canManageAudit: boolean
      canManageGuestPrivacy: boolean
      canApproveHotelExceptions: boolean
      canManageIntegrations: boolean
    }
  }
}

type AccessArgs = {
  session?: Session
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session?.itemId && session.data?.isActive === true)
}

export const permissions = {
  canManageGuestPrivacy: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageGuestPrivacy ?? false),
  canApproveHotelExceptions: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canApproveHotelExceptions ?? false),
  canAccessDashboard: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canAccessDashboard ?? false),
  canManageRooms: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageRooms ?? false),
  canManageBookings: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageBookings ?? false),
  canManageHousekeeping: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageHousekeeping ?? false),
  canManageGuests: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageGuests ?? false),
  canManagePayments: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManagePayments ?? false),
  canManagePeople: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManagePeople ?? false),
  canManageRoles: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageRoles ?? false),
  canManageOnboarding: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageOnboarding ?? false),
  canManageAudit: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageAudit ?? false),
  canManageIntegrations: ({ session }: AccessArgs) => isSignedIn({ session }) && (session?.data.role?.canManageIntegrations ?? false),
}

export const rules = {
  canReadPeople: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canSeeOtherPeople) return true

    return { id: { equals: session.itemId } }
  },
  canUpdatePeople: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canEditOtherPeople) return true

    return { id: { equals: session.itemId } }
  },
}