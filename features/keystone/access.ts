export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
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
    }
  }
}

type AccessArgs = {
  session?: Session
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

export const permissions = {
  canAccessDashboard: ({ session }: AccessArgs) => session?.data.role?.canAccessDashboard ?? false,
  canManageRooms: ({ session }: AccessArgs) => session?.data.role?.canManageRooms ?? false,
  canManageBookings: ({ session }: AccessArgs) => session?.data.role?.canManageBookings ?? false,
  canManageHousekeeping: ({ session }: AccessArgs) => session?.data.role?.canManageHousekeeping ?? false,
  canManageGuests: ({ session }: AccessArgs) => session?.data.role?.canManageGuests ?? false,
  canManagePayments: ({ session }: AccessArgs) => session?.data.role?.canManagePayments ?? false,
  canManagePeople: ({ session }: AccessArgs) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }: AccessArgs) => session?.data.role?.canManageRoles ?? false,
  canManageOnboarding: ({ session }: AccessArgs) => session?.data.role?.canManageOnboarding ?? false,
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