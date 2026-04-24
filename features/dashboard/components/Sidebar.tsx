'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Home, ChevronRight, Package } from 'lucide-react'
import { AdminMeta } from '../hooks/useAdminMeta'
import { Logo, LogoIcon } from '@/features/dashboard/components/Logo'
import { UserProfileClient } from './UserProfileClient'
import { OnboardingCards } from '@/features/platform/onboarding/components/OnboardingCards'
import { dismissOnboarding } from '@/features/platform/onboarding/actions/onboarding'
import {
  getPlatformNavItemsWithBasePath,
  platformNavGroups,
  platformStandaloneItems,
} from '@/features/platform/lib/navigation'
import { useDashboard } from '../context/DashboardProvider'

interface User {
  id: string;
  email: string;
  name?: string;
  onboardingStatus?: string;
  role?: {
    canAccessDashboard?: boolean;
    canManageOnboarding?: boolean;
  };
}

interface SidebarProps {
  adminMeta: AdminMeta | null
  user?: User | null
  onOpenDialog?: () => void
}

export function Sidebar({ adminMeta, user, onOpenDialog }: SidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const pathname = usePathname()
  const { basePath } = useDashboard()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isLinkActive = React.useCallback(
    (href: string) => {
      if (!pathname) return false
      if (href === '/dashboard' && pathname === '/dashboard') return true
      if (href !== '/dashboard') return pathname.startsWith(href)
      return false
    },
    [pathname]
  )

  const lists = adminMeta?.lists || {}
  const listsArray = Object.values(lists)

  const modelLinks = listsArray.map((list: any) => ({
    title: list.label,
    href: `/dashboard/${list.path}`,
  }))

  const standaloneItems = platformStandaloneItems.map((item) => ({
    ...item,
    href: `${basePath}${item.href}`,
  }))

  const groupedItems = platformNavGroups.map((group) => ({
    title: group.title,
    icon: group.icon,
    items: getPlatformNavItemsWithBasePath(basePath)
      .filter((item) => item.group === group.id)
      .map((item) => ({
        title: item.title,
        href: item.href,
        icon: item.icon,
      })),
    isActive: getPlatformNavItemsWithBasePath(basePath)
      .filter((item) => item.group === group.id)
      .some((item) => isLinkActive(item.href)),
  }))

  if (!mounted) {
    return (
      <SidebarComponent collapsible="icon">
        <SidebarHeader>
          <div className="p-2 opacity-0"><Logo /></div>
        </SidebarHeader>
        <SidebarContent />
        <SidebarFooter />
      </SidebarComponent>
    )
  }

  return (
    <SidebarComponent collapsible="icon">
      <SidebarHeader>
        <SidebarMenuButton asChild>
          <div className="group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden p-2">
            <Logo />
          </div>
        </SidebarMenuButton>
        <SidebarMenuButton asChild>
          <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
            <LogoIcon />
          </div>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className="no-scrollbar gap-0.5">
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isLinkActive('/dashboard')}>
                <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                  <Home className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu className="group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden gap-0">
            {standaloneItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isLinkActive(item.href)}>
                  <Link href={item.href} onClick={() => setOpenMobile(false)}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {groupedItems.map((group) => (
              <Collapsible
                key={group.title}
                asChild
                defaultOpen={group.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <group.icon className="h-4 w-4" />
                      <span>{group.title}</span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {group.items.map((item) => (
                        <SidebarMenuSubItem key={item.href}>
                          <SidebarMenuSubButton asChild isActive={isLinkActive(item.href)}>
                            <Link href={item.href} onClick={() => setOpenMobile(false)}>
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}
          </SidebarMenu>

          <SidebarMenu className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
            {standaloneItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isLinkActive(item.href)}>
                  <Link href={item.href} onClick={() => setOpenMobile(false)}>
                    <item.icon className="h-4 w-4" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {groupedItems.map((group) => (
              <DropdownMenu key={group.title}>
                <SidebarMenuItem>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                      <group.icon className="h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side={isMobile ? 'bottom' : 'right'}
                    align={isMobile ? 'end' : 'start'}
                    className="min-w-56"
                  >
                    <div className="max-h-[calc(100vh-16rem)] overflow-y-auto py-1">
                      {group.items.map((item) => (
                        <DropdownMenuItem
                          asChild
                          key={item.href}
                          className={isLinkActive(item.href) ? 'bg-primary/10 text-primary font-medium' : ''}
                        >
                          <Link href={item.href} onClick={() => setOpenMobile(false)}>
                            <span>{item.title}</span>
                            {isLinkActive(item.href) && (
                              <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
                            )}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </SidebarMenuItem>
              </DropdownMenu>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Models</SidebarGroupLabel>
          <SidebarMenu className="group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden">
            <Collapsible
              asChild
              defaultOpen={modelLinks.some((link) => isLinkActive(link.href))}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton>
                    <Package className="h-4 w-4" />
                    <span>Models</span>
                    <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {modelLinks.map((link) => (
                      <SidebarMenuSubItem key={link.href}>
                        <SidebarMenuSubButton asChild isActive={isLinkActive(link.href)}>
                          <Link href={link.href} onClick={() => setOpenMobile(false)}>
                            <span>{link.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>

          <SidebarMenu className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
            <DropdownMenu>
              <SidebarMenuItem>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                    <Package className="h-4 w-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side={isMobile ? 'bottom' : 'right'}
                  align={isMobile ? 'end' : 'start'}
                  className="min-w-56"
                >
                  <div className="max-h-[calc(100vh-16rem)] overflow-y-auto py-1">
                    {modelLinks.map((link) => (
                      <DropdownMenuItem
                        asChild
                        key={link.href}
                        className={isLinkActive(link.href) ? 'bg-primary/10 text-primary font-medium' : ''}
                      >
                        <Link href={link.href} onClick={() => setOpenMobile(false)}>
                          <span>{link.title}</span>
                          {isLinkActive(link.href) && (
                            <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
                          )}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </SidebarMenuItem>
            </DropdownMenu>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="w-full mb-2 overflow-visible">
          <OnboardingCards
            steps={[
              {
                href: '#onboarding',
                title: 'Welcome to Openfront Hotel',
                description: 'Set up room types, rooms, rates, guests, and sample reservations to make the PMS and booking engine usable.',
              },
            ]}
            onboardingStatus={user?.onboardingStatus}
            userRole={user?.role}
            onDismiss={async () => {
              try {
                await dismissOnboarding()
              } catch (error) {
                console.error('Error dismissing onboarding:', error)
              }
            }}
            onOpenDialog={() => onOpenDialog?.()}
          />
        </div>
        {user && <UserProfileClient user={user} />}
      </SidebarFooter>

      <SidebarRail />
    </SidebarComponent>
  )
}
