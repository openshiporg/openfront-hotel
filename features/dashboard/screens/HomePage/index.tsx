/**
 * HomePage for Dashboard 2 - Server Component
 * Follows Dashboard1's server-side rendering approach
 */

import React from 'react'
import Link from 'next/link'
import { PlusIcon, Database, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer } from '../../components/PageContainer'
import { getAdminMetaAction, getAuthenticatedUser, getListCounts } from '../../actions'
import { platformNavGroups, platformStandaloneItems, type PlatformNavItem } from '@/features/platform/lib/navigation'
import { visiblePlatformItems } from '../../lib/sidebarAccess'
import { cn } from '@/lib/utils'

interface ListCardProps {
  list: any
  count?: number | null
  hideCreate?: boolean
}

function ListCard({ list, count, hideCreate = false }: ListCardProps) {
  const isSingleton = list.isSingleton || false
  const href = `/dashboard/${list.path}${isSingleton ? '/1' : ''}`

  return (
    <Card className={cn(
      'relative bg-gradient-to-bl from-background to-muted/80 shadow-xs hover:bg-muted transition-colors'
    )}>
      <Link href={href}>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {list.label}
          </h3>
          <p className="mt-1 min-h-4 text-xs text-muted-foreground">
            {isSingleton 
              ? 'Singleton' 
              : typeof count === 'number'
                ? `${count} item${count !== 1 ? 's' : ''}`
                : null
            }
          </p>
        </CardContent>
      </Link>
      
      {!hideCreate && !isSingleton && (
        <Link 
          href={`/dashboard/${list.path}/create`}
          className="absolute top-3 right-3"
        >
          <Button
            variant="outline" 
            size="icon"
            className="h-7 w-7"
            title={`Add ${list.singular?.toLowerCase() || 'item'}`}
          >
            <PlusIcon className="h-4 w-4" />
            <span className="sr-only">Create new {list.label}</span>
          </Button>
        </Link>
      )}
    </Card>
  )
}

/** One staff workspace: what it is called and what you do there. The whole card is the link. */
function WorkspaceCard({ item }: { item: PlatformNavItem }) {
  const Icon = item.icon
  return (
    <Link
      href={`/dashboard${item.href}`}
      className="flex min-h-16 items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-md bg-muted text-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{item.title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{item.description}</span>
      </span>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Database className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Nothing to show yet</h3>
      <p className="text-muted-foreground">
        Your account has no pages assigned. Ask the property manager to check your role.
      </p>
    </div>
  )
}

export async function HomePage() {
  // Fetch admin meta and the signed-in staff member server-side
  const [adminMetaResponse, userResponse] = await Promise.all([getAdminMetaAction(), getAuthenticatedUser()])
  const user = userResponse.success ? userResponse.data?.authenticatedItem : null
  
  if (!adminMetaResponse.success) {
    console.error('Failed to fetch admin meta:', adminMetaResponse.error)
    return (
      <PageContainer 
        title="Dashboard" 
        header={<h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>}
        breadcrumbs={[{ type: 'page' as const, label: 'Dashboard' }]}
      >
        <EmptyState />
      </PageContainer>
    )
  }

  const adminMeta = adminMetaResponse.data
  const lists = adminMeta?.lists || []
  // Lists are already enhanced with gqlNames from getAdminMetaAction
  const enhancedLists = lists.filter((list: any) => !list.isHidden)

  // Fetch list counts server-side
  let countData: Record<string, number> = {}
  if (enhancedLists.length > 0) {
    const countResponse = await getListCounts(enhancedLists)
    if (countResponse.success && countResponse.data) {
      countData = countResponse.data
    }
  }

  // The pages this role can use, in the same groups as the sidebar.
  const sections = [
    { id: 'today', title: 'Today', items: visiblePlatformItems(platformStandaloneItems, lists, user) },
    ...platformNavGroups.map((group) => ({ id: group.id, title: group.title, items: visiblePlatformItems(group.items, lists, user) })),
  ].filter((section) => section.items.length > 0)
  const firstName = typeof user?.name === 'string' ? user.name.trim().split(/\s+/)[0] : ''

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">{firstName ? `Welcome, ${firstName}` : 'Dashboard'}</h1>
      <p className="text-muted-foreground">Choose where to work.</p>
    </div>
  )

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard' }
  ]

  if (enhancedLists.length === 0 && sections.length === 0) {
    return (
      <PageContainer title="Dashboard" header={header} breadcrumbs={breadcrumbs}>
        <EmptyState />
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Dashboard" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-5xl p-4 md:p-6 flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`home-${section.id}`}>
            <h2 id={`home-${section.id}`} className="mb-3 text-sm font-medium text-muted-foreground">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
              {section.items.map((item) => <WorkspaceCard key={item.href} item={item} />)}
            </div>
          </section>
        ))}

        {enhancedLists.length > 0 && (
          <details className="group border-t pt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              <span>All records ({enhancedLists.length})</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-4">
              {enhancedLists.map((list: any) => (
                <ListCard
                  key={list.key}
                  list={list}
                  count={countData[list.key] ?? null}
                  hideCreate={list.hideCreate ?? false}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </PageContainer>
  )
}

export default HomePage