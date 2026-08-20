'use client';

import Link from 'next/link';
import { Blocks, CalendarPlus, LockKeyhole, ReceiptText, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/features/dashboard/components/PageContainer';

export default function GroupsPage() {
  return <PageContainer title="Group blocks" header={<div><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold md:text-2xl">Group blocks</h1><Badge variant="secondary">Deferred / locked</Badge></div><p className="text-muted-foreground">A truthful provider-blocked workspace for group inventory, rooming lists, and master billing.</p></div>} breadcrumbs={[{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Group blocks' }]}>
    <div className="space-y-5 p-4 md:p-6">
      <Card className="border-amber-300 bg-amber-50/50"><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />Not enabled for the bounded launch</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>Group write contracts intentionally reject operations. Inventory commitment, pickup release, rooming-list identity, payer routing, deposit handling, and master-folio close must become one reviewed lifecycle before this surface can accept data.</p><p className="text-muted-foreground">No inactive records, sample metrics, or generic model actions are shown as operational capability.</p></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><Blocks className="h-5 w-5 text-muted-foreground" /><p className="mt-3 font-medium">Inventory allocation</p><p className="mt-1 text-sm text-muted-foreground">Blocked until dated allotments, cutoff/release, pickup, and concurrency are authoritative.</p></CardContent></Card>
        <Card><CardContent className="pt-6"><Users className="h-5 w-5 text-muted-foreground" /><p className="mt-3 font-medium">Rooming lists</p><p className="mt-1 text-sm text-muted-foreground">Blocked until booker, occupant, guest, and payer identities are safely distinct.</p></CardContent></Card>
        <Card><CardContent className="pt-6"><ReceiptText className="h-5 w-5 text-muted-foreground" /><p className="mt-3 font-medium">Master billing</p><p className="mt-1 text-sm text-muted-foreground">Blocked until routing, payer windows, deposits, settlement, and immutable correction are complete.</p></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Supported alternatives</CardTitle></CardHeader><CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><p className="max-w-2xl text-sm text-muted-foreground">Create individually authoritative desk reservations and settle each reservation folio. This preserves inventory and economic evidence without implying group-contract support.</p><div className="flex flex-wrap gap-2"><Button asChild><Link href="/dashboard/platform/front-desk"><CalendarPlus className="mr-2 h-4 w-4" />Front desk</Link></Button><Button asChild variant="outline"><Link href="/dashboard/platform/folios">Reservation folios</Link></Button></div></CardContent></Card>
    </div>
  </PageContainer>;
}
