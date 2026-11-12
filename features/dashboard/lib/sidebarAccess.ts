/**
 * Sidebar filtering from capabilities the session already has: the role's
 * canAccessDashboard flag and Keystone's per-session list `isHidden` from admin meta.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */

type SidebarList = { path: string; isHidden?: boolean | null }
type SidebarUser = { role?: ({ canAccessDashboard?: boolean | null } & Record<string, unknown>) | null } | null | undefined
type PermissionedItem = { permission?: string; permissions?: string[]; anyPermissions?: string[] }

/** A platform page is open to a role holding its permission flags (all of `permission`/`permissions`, any of `anyPermissions`). */
export function roleCanUsePlatformItem(item: PermissionedItem, user: SidebarUser) {
  const role = user?.role
  if (!role) return false
  const has = (flag: string) => role[flag] === true
  const required = [...(item.permission ? [item.permission] : []), ...(item.permissions ?? [])]
  if (!required.every(has)) return false
  return !item.anyPermissions?.length || item.anyPermissions.some(has)
}

/** Only an explicit false hides navigation; an unknown user is left to the middleware. */
export function canUseDashboardNav(user: SidebarUser) {
  return user?.role?.canAccessDashboard !== false
}

export function visibleSidebarLists<T extends SidebarList>(lists: T[], user: SidebarUser): T[] {
  if (!canUseDashboardNav(user)) return []
  return lists.filter((list) => !list.isHidden)
}

/**
 * A platform page whose first segment is a list path follows that list's visibility;
 * pages that are not tied to one list stay visible to dashboard users.
 */
export function visiblePlatformItems<T extends { href: string } & PermissionedItem>(
  items: T[],
  lists: SidebarList[],
  user: SidebarUser
): T[] {
  if (!canUseDashboardNav(user)) return []
  const hiddenPaths = new Set(lists.filter((list) => list.isHidden).map((list) => list.path))
  return items.filter((item) => {
    const slug = item.href.split('/platform/')[1]?.split(/[/?#]/)[0]
    if (slug && hiddenPaths.has(slug)) return false
    return roleCanUsePlatformItem(item, user)
  })
}
