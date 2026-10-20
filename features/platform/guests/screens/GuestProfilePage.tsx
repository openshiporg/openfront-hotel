'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarPlus, MessageSquare, Pencil, Send, UserRoundX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { GuestProfile, type Guest } from '@/features/platform/guests/components/GuestProfile';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { WorkspaceEmpty, WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { getGuestProfile } from '../actions';
import { GuestRecordDialog } from '../components/GuestRecordDialog';

const GUESTS_CRUMB = [{ label: 'Guests', href: '/dashboard/platform/guests' }];

export default function GuestProfilePage() {
  const router = useRouter();
  const params = useParams();
  const guestId = params?.id as string;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [guest, setGuest] = React.useState<Guest | null>(null);
  const search = useSearchParams();
  const [editing, setEditing] = React.useState<'record' | 'notes' | null>(search?.get('focus') === 'specialNotes' ? 'notes' : null);

  const load = React.useCallback(async () => {
    if (!guestId) return;
    try {
      setError(null);
      setGuest(await getGuestProfile(guestId) as Guest | null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to load guest profile.';
      setError(message);
      toast.error('Guest profile unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, [guestId]);
  React.useEffect(() => { void load(); }, [load]);

  const backButton = <Button variant="ghost" size="sm" asChild><Link href="/dashboard/platform/guests"><ArrowLeft aria-hidden="true" />All guests</Link></Button>;

  if (loading) {
    return <PlatformPage title="Guest Profile" crumbs={GUESTS_CRUMB} actions={backButton}><WorkspaceLoading label="Loading guest profile" rows={4} /></PlatformPage>;
  }
  if (error) {
    return <PlatformPage title="Guest Profile" crumbs={GUESTS_CRUMB} actions={backButton}><WorkspaceError message={error} onRetry={() => window.location.reload()} title="Guest Profile Unavailable" /></PlatformPage>;
  }
  if (!guest) {
    return (
      <PlatformPage title="Guest not found" crumbs={GUESTS_CRUMB}>
        <div className="rounded-lg border bg-card">
          <WorkspaceEmpty
            icon={UserRoundX}
            title="This guest profile isn't available"
            description="It may be outside your authority, merged into another profile or no longer retained."
            action={<Button size="sm" variant="outline" onClick={() => router.push('/dashboard/platform/guests')}><ArrowLeft aria-hidden="true" />Back to guests</Button>}
          />
        </div>
      </PlatformPage>
    );
  }

  const name = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest profile';
  const addNote = () => setEditing('notes');

  return (
    <PlatformPage
      title={name}
      crumbs={GUESTS_CRUMB}
      description="Profile, stay history and service context."
      actions={(
        <>
          <Button size="sm" variant="ghost" onClick={addNote}><MessageSquare aria-hidden="true" />Add note</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing('record')}><Pencil aria-hidden="true" />Edit record</Button>
          {guest.email ? <Button size="sm" variant="outline" onClick={() => { window.location.href = `mailto:${guest.email}`; }}><Send aria-hidden="true" />Email</Button> : null}
          <Button size="sm" onClick={() => router.push(`/dashboard/platform/reservations?guestId=${guestId}&new=1`)}><CalendarPlus aria-hidden="true" />New reservation</Button>
        </>
      )}
    >
      <GuestProfile guest={guest} onAddNote={addNote} />
      <GuestRecordDialog guest={guest} mode={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast.success('Guest record saved'); void load(); }} />
    </PlatformPage>
  );
}
