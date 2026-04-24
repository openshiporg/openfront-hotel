import React from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '../../components/PageContainer'
import { getAdminMetaAction, getListCounts } from '../../actions'
import { platformNavGroups, platformStandaloneItems } from '@/features/platform/lib/navigation'

function QuickLinkCard({ title, description, href, icon: Icon }: { title: string; description: string; href: string; icon: any }) {
  return (
    <Link href={`/dashboard${href}`}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border bg-background p-2">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

function ModelCard({ title, count, href }: { title: string; count?: number | null; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {count === null || count === undefined ? 'Unknown' : `${count} item${count !== 1 ? 's' : ''}`}
              </p>
            </div>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export async function HomePage() {
  const adminMetaResponse = await getAdminMetaAction()

  if (!adminMetaResponse.success) {
    return (
      <PageContainer
        title="Dashboard"
        header={<h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>}
        breadcrumbs={[{ type: 'page' as const, label: 'Dashboard' }]}
      >
        <div className="p-6 text-sm text-muted-foreground">Unable to load dashboard metadata.</div>
      </PageContainer>
    )
  }

  const adminMeta = adminMetaResponse.data
  const lists = adminMeta?.lists || []
  const visibleLists = lists.filter((list: any) => !list.isHidden)

  let countData: Record<string, number> = {}
  if (visibleLists.length > 0) {
    const countResponse = await getListCounts(visibleLists)
    if (countResponse.success && countResponse.data) {
      countData = countResponse.data
    }
  }

  const highlightedPlatformItems = [
    ...platformStandaloneItems,
    ...platformNavGroups.flatMap((group) => group.items),
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Hotel Dashboard</h1>
      <p className="text-muted-foreground">Openfront Hotel operator workspace and system models</p>
    </div>
  )

  return (
    <PageContainer title="Dashboard" header={header} breadcrumbs={[{ type: 'page' as const, label: 'Dashboard' }]}>
      <div className="w-full max-w-6xl space-y-8 p-4 md:p-6">
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold">Hotel Operations</h2>
              <p className="text-sm text-muted-foreground">Primary workflows for front desk, reservations, housekeeping, and hotel management.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {highlightedPlatformItems.map((item) => (
              <QuickLinkCard
                key={item.href}
                title={item.title}
                description={item.description}
                href={item.href}
                icon={item.icon}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Underlying Models</h2>
            <p className="text-sm text-muted-foreground">Fallback CRUD access for Keystone lists while hotel-specific platform surfaces continue to expand.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleLists.map((list: any) => (
              <ModelCard
                key={list.key}
                title={list.label}
                count={countData[list.key] ?? null}
                href={`/dashboard/${list.path}`}
              />
            ))}
          </div>
        </section>
      </div>
    </PageContainer>
  )
}

export default HomePage
